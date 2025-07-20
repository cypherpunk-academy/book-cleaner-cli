import type { LoggerService } from '@/services/LoggerService';
import type { ConfigService } from '@/services/ConfigService';
import {
    ERROR_CODES,
    LOG_COMPONENTS,
    OCR_PAGE_WIDTH,
    ROMAN_NUMERALS,
    GERMAN_ORDINALS,
    PARAGRAPH_END_MARKERS,
} from '@/constants';
import { AppError } from '@/utils/AppError';
import pino from 'pino';

/**
 * OCR Paragraph structure from Tesseract
 */
interface OCRParagraph {
    text: string;
    confidence: number;
    bbox: { x0: number; y0: number; x1: number; y1: number };
    lines?: OCRLine[];
}

/**
 * OCR Line structure from Tesseract
 */
interface OCRLine {
    text: string;
    confidence: number;
    bbox: { x0: number; y0: number; x1: number; y1: number };
    words?: OCRWord[];
}

/**
 * OCR Word structure from Tesseract
 */
interface OCRWord {
    text: string;
    confidence: number;
    bbox: { x0: number; y0: number; x1: number; y1: number };
}

/**
 * Generic OCR data structure for analysis
 */
interface OCRData {
    text: string;
    confidence: number;
    paragraphs?: OCRParagraph[];
    lines?: OCRLine[];
    words?: OCRWord[];
}

/**
 * Scan results structure for tracking progress across pages
 */
interface ScanResults {
    textWithHeaders: string;
    footnoteText: string;
    level1HeadingsIndex: number;
    level2HeadingsIndex: number;
    level3HeadingsIndex: number;
}

/**
 * Book type configuration structure
 */
interface BookTypeConfig {
    description: string;
    headerTypes?: {
        level1?: HeaderTypeDefinition;
        level2?: HeaderTypeDefinition;
        level3?: HeaderTypeDefinition;
    };
    textRemovalPatterns: string[];
}

/**
 * Header type definition
 */
interface HeaderTypeDefinition {
    formats: HeaderFormat[];
}

/**
 * Header format configuration
 */
interface HeaderFormat {
    pattern: string;
    alignment?: string;
    example?: string;
}

/**
 * Pattern match result
 */
interface PatternMatch {
    matched: boolean;
    extractedValues: Record<string, string>;
    fullMatch: string;
}

/**
 * Header detection result
 */
interface HeaderResult {
    level: number;
    text: string;
    ordinalValue: number;
    matchedPattern: string;
    confidence: number;
}

/**
 * Processed text result
 */
interface ProcessedTextResult {
    success: boolean;
    processedParagraphs: number;
    detectedHeaders: number;
    removedPatterns: number;
    errors: string[];
}

/**
 * Class for extracting structured text and headers from OCR data
 * based on book-type configurations
 */
export class GetTextAndStructureFromOcr {
    private readonly logger: pino.Logger;
    private readonly configService: ConfigService;
    private bookTypeConfigCache: Map<string, BookTypeConfig> = new Map();

    // Centering tolerance (pixels from center)
    private readonly CENTERING_TOLERANCE = 100;

    constructor(logger: LoggerService, configService: ConfigService) {
        this.logger = logger.getTaggedLogger(
            LOG_COMPONENTS.PIPELINE_MANAGER,
            'GET_TEXT_AND_STRUCTURE_FROM_OCR',
        );
        this.configService = configService;
    }

    /**
     * Returns a tagged logger for header detection within the pipeline manager.
     */

    /**
     * Main method to process OCR data for a single page
     */
    async processOCRData(
        ocrData: OCRData,
        bookType: string,
        scanResults: ScanResults,
    ): Promise<ProcessedTextResult> {
        this.logger.info(
            {
                bookType,
                paragraphs: ocrData.paragraphs?.length ?? 0,
                currentLevel1Index: scanResults.level1HeadingsIndex,
                currentLevel2Index: scanResults.level2HeadingsIndex,
                currentLevel3Index: scanResults.level3HeadingsIndex,
            },
            'Processing OCR data for structured text extraction',
        );

        try {
            // Load book type configuration
            const bookConfig = await this.loadBookTypeConfig(bookType);

            let processedParagraphs = 0;
            let detectedHeaders = 0;
            let removedPatterns = 0;
            const errors: string[] = [];

            // Process each paragraph
            if (ocrData.paragraphs && ocrData.paragraphs.length > 0) {
                for (const paragraph of ocrData.paragraphs) {
                    try {
                        processedParagraphs++;

                        this.logger.info(
                            {
                                paragraphText: paragraph.text,
                                paragraphConfidence: paragraph.confidence,
                                paragraphBbox: paragraph.bbox,
                            },
                            'Processing paragraph',
                        );

                        // Skip empty paragraphs
                        if (!paragraph.text || paragraph.text.trim().length === 0) {
                            continue;
                        }

                        // Check if this paragraph is a header
                        const headerResult = await this.detectAndProcessHeaders(
                            paragraph,
                            bookConfig,
                            scanResults,
                        );

                        this.logger.info(
                            {
                                headerResult,
                            },
                            'Header result',
                        );

                        if (headerResult) {
                            // Successfully processed as header
                            detectedHeaders++;
                            this.logger.debug(
                                {
                                    level: headerResult.level,
                                    text: headerResult.text.substring(0, 50),
                                    ordinal: headerResult.ordinalValue,
                                },
                                'Header detected and processed',
                            );
                        } else {
                            // Process as regular paragraph
                            const cleanedText = this.applyTextRemovalPatterns(
                                paragraph.text,
                                bookConfig.textRemovalPatterns,
                            );

                            if (cleanedText.length !== paragraph.text.length) {
                                removedPatterns++;
                            }

                            // Add paragraph to results if not empty after cleaning
                            if (cleanedText.trim().length > 0) {
                                scanResults.textWithHeaders += `${cleanedText.trim()}\n\n`;
                            }
                        }
                    } catch (paragraphError) {
                        const errorMsg = `Failed to process paragraph: ${
                            paragraphError instanceof Error
                                ? paragraphError.message
                                : String(paragraphError)
                        }`;
                        errors.push(errorMsg);
                        this.logger.warn(
                            {
                                paragraphText: paragraph.text?.substring(0, 100),
                                error: errorMsg,
                            },
                            'Error processing individual paragraph',
                        );
                    }
                }
            }

            this.logger.info(
                {
                    bookType,
                    processedParagraphs,
                    detectedHeaders,
                    removedPatterns,
                    errorCount: errors.length,
                    finalLevel1Index: scanResults.level1HeadingsIndex,
                    finalLevel2Index: scanResults.level2HeadingsIndex,
                    finalLevel3Index: scanResults.level3HeadingsIndex,
                },
                'OCR data processing completed',
            );

            return {
                success: errors.length === 0,
                processedParagraphs,
                detectedHeaders,
                removedPatterns,
                errors,
            };
        } catch (error) {
            const errorMsg = `OCR data processing failed: ${
                error instanceof Error ? error.message : String(error)
            }`;
            this.logger.error({ bookType, error: errorMsg }, 'Fatal error in OCR data processing');

            return {
                success: false,
                processedParagraphs: 0,
                detectedHeaders: 0,
                removedPatterns: 0,
                errors: [errorMsg],
            };
        }
    }

    /**
     * Load book type configuration from book-types.yaml
     */
    private async loadBookTypeConfig(bookType: string): Promise<BookTypeConfig> {
        // Check cache first
        if (this.bookTypeConfigCache.has(bookType)) {
            return this.bookTypeConfigCache.get(bookType)!;
        }

        try {
            // Load configuration through ConfigService
            const bookTypesConfig = await this.configService.loadBookTypesConfig();

            if (!bookTypesConfig || typeof bookTypesConfig !== 'object') {
                throw new AppError(
                    ERROR_CODES.CONFIG_INVALID,
                    LOG_COMPONENTS.PIPELINE_MANAGER,
                    'loadBookTypeConfig',
                    'Book types configuration is invalid or missing',
                    { bookType },
                );
            }

            const config = bookTypesConfig[bookType] as Record<string, unknown>;
            if (!config) {
                this.logger.warn(
                    { bookType, availableTypes: Object.keys(bookTypesConfig) },
                    'Book type not found, using default configuration',
                );

                // Return default configuration
                const defaultConfig: BookTypeConfig = {
                    description: `Default configuration for ${bookType}`,
                    textRemovalPatterns: [],
                };
                this.bookTypeConfigCache.set(bookType, defaultConfig);
                return defaultConfig;
            }

            // Validate and normalize configuration
            const normalizedConfig: BookTypeConfig = {
                description: (config.description as string) || `Configuration for ${bookType}`,
                headerTypes:
                    (config.headerTypes as BookTypeConfig['headerTypes']) ||
                    (config['header-types'] as BookTypeConfig['headerTypes']), // Support both naming conventions
                textRemovalPatterns:
                    (config.textRemovalPatterns as string[]) ||
                    (config['text-removal-patterns'] as string[]) ||
                    [],
            };

            // Cache the configuration
            this.bookTypeConfigCache.set(bookType, normalizedConfig);

            this.logger.info(
                {
                    bookType,
                    hasLevel1Headers: !!normalizedConfig.headerTypes?.level1,
                    hasLevel2Headers: !!normalizedConfig.headerTypes?.level2,
                    hasLevel3Headers: !!normalizedConfig.headerTypes?.level3,
                    removalPatternsCount: normalizedConfig.textRemovalPatterns.length,
                },
                'Book type configuration loaded successfully',
            );

            return normalizedConfig;
        } catch (error) {
            const errorMsg = `Failed to load book type configuration for ${bookType}: ${
                error instanceof Error ? error.message : String(error)
            }`;
            this.logger.error({ bookType, error: errorMsg }, 'Configuration loading failed');

            // Return default configuration as fallback
            const defaultConfig: BookTypeConfig = {
                description: `Fallback configuration for ${bookType}`,
                textRemovalPatterns: [],
            };
            this.bookTypeConfigCache.set(bookType, defaultConfig);
            return defaultConfig;
        }
    }

    /**
     * Detect and process headers from paragraph
     */
    private async detectAndProcessHeaders(
        paragraph: OCRParagraph,
        bookConfig: BookTypeConfig,
        scanResults: ScanResults,
    ): Promise<HeaderResult | null> {
        // Check if paragraph is centered
        if (!this.isTextCentered(paragraph)) {
            return null;
        }

        // Normalize text for pattern matching (all whitespace and newlines become single spaces)
        const normalizedText = paragraph.text.replace(/[\s\n\r\t]+/g, ' ').trim();

        // For level 1 and 2 headers, ensure they start at the beginning of the text
        const startsAtBeginning = this.checkHeaderStartsAtBeginning(paragraph.text, normalizedText);

        this.logger.info(
            {
                originalText: paragraph.text,
                normalizedText,
                isCentered: true,
            },
            'Processing centered paragraph for header detection',
        );

        // Try to match against header patterns (level1 → level2 → level3)
        const headerLevels = [
            { level: 1, config: bookConfig.headerTypes?.level1 },
            { level: 2, config: bookConfig.headerTypes?.level2 },
            { level: 3, config: bookConfig.headerTypes?.level3 },
        ];

        for (const { level, config } of headerLevels) {
            if (!config || !config.formats) {
                continue;
            }

            // For level 1 and 2 headers, require they start at the beginning
            if ((level === 1 || level === 2) && !startsAtBeginning) {
                this.logger.debug(
                    {
                        level,
                        normalizedText,
                        startsAtBeginning,
                    },
                    'Skipping level 1/2 header check - does not start at beginning of text',
                );
                continue;
            }

            for (const format of config.formats) {
                // For level 1 and 2 headers, anchor pattern to start of string
                const isStartAnchored = level === 1 || level === 2;
                const patternMatch = this.matchHeaderPattern(
                    normalizedText,
                    format.pattern,
                    isStartAnchored,
                );

                this.logger.info(
                    {
                        normalizedText,
                        pattern: format.pattern,
                        patternMatch,
                        isStartAnchored,
                    },
                    'Pattern match result',
                );

                if (patternMatch && patternMatch.matched) {
                    this.logger.info(
                        {
                            level,
                            pattern: format.pattern,
                            extractedValues: patternMatch.extractedValues,
                        },
                        'Header pattern matched',
                    );

                    // Extract ordinal value for sequence validation
                    const ordinalValue = this.extractOrdinalValue(patternMatch.extractedValues);

                    if (ordinalValue !== null) {
                        // Validate header sequence
                        if (this.validateHeaderSequence(level, ordinalValue, scanResults)) {
                            // Add header to results with double newlines before and after
                            const markdownLevel = '#'.repeat(level);
                            const headerText = `\n\n${markdownLevel} ${normalizedText}\n\n`;
                            scanResults.textWithHeaders += headerText;

                            this.logger.info(
                                {
                                    level,
                                    ordinalValue,
                                    text: normalizedText,
                                    currentLevel1Index: scanResults.level1HeadingsIndex,
                                    currentLevel2Index: scanResults.level2HeadingsIndex,
                                    currentLevel3Index: scanResults.level3HeadingsIndex,
                                },
                                'Header successfully processed and added',
                            );

                            return {
                                level,
                                text: normalizedText,
                                ordinalValue,
                                matchedPattern: format.pattern,
                                confidence: paragraph.confidence,
                            };
                        }
                    }
                }
            }
        }

        return null;
    }

    /**
     * Check if paragraph is centered based on bounding box
     */
    private isTextCentered(paragraph: OCRParagraph): boolean {
        const { bbox } = paragraph;
        if (!bbox) {
            return false;
        }

        const paragraphCenter = (bbox.x0 + bbox.x1) / 2;
        const pageCenter = OCR_PAGE_WIDTH / 2;
        const distance = Math.abs(paragraphCenter - pageCenter);

        return distance <= this.CENTERING_TOLERANCE;
    }

    /**
     * Check if header text starts at the beginning of the paragraph
     * Level 1 and 2 headers must start at the very beginning
     */
    private checkHeaderStartsAtBeginning(originalText: string, normalizedText: string): boolean {
        // Remove leading whitespace from original text
        const trimmedOriginal = originalText.trimStart();

        // Check if the normalized text matches the beginning of the trimmed original
        // This ensures the header content appears at the start of the paragraph
        return (
            trimmedOriginal.startsWith(normalizedText) ||
            trimmedOriginal
                .replace(/[\s\n\r\t]+/g, ' ')
                .trimStart()
                .startsWith(normalizedText)
        );
    }

    /**
     * Match text against header pattern with placeholder replacement
     */
    private matchHeaderPattern(
        text: string,
        pattern: string,
        isStartAnchored: boolean = false,
    ): PatternMatch {
        try {
            const regex = this.buildPlaceholderRegex(pattern, isStartAnchored);
            const match = text.match(new RegExp(regex, 'i'));

            this.logger.info(
                {
                    text,
                    pattern,
                    generatedRegex: regex,
                    match,
                },
                'Match result with generated regex',
            );

            if (match) {
                // Extract named groups and values
                const extractedValues: Record<string, string> = {};

                // Map match groups to placeholder names
                const placeholders = this.extractPlaceholderNames(pattern);
                for (let i = 1; i < match.length && i <= placeholders.length; i++) {
                    const placeholderName = placeholders[i - 1];
                    const matchValue = match[i];
                    if (placeholderName && matchValue !== undefined) {
                        extractedValues[placeholderName] = matchValue;
                    }
                }

                return {
                    matched: true,
                    extractedValues,
                    fullMatch: match[0],
                };
            }

            return { matched: false, extractedValues: {}, fullMatch: '' };
        } catch (error) {
            this.logger.warn(
                {
                    pattern,
                    text,
                    error: error instanceof Error ? error.message : String(error),
                },
                'Error in pattern matching',
            );
            return { matched: false, extractedValues: {}, fullMatch: '' };
        }
    }

    /**
     * Get regex pattern for a specific placeholder type
     */
    private getPlaceholderRegex(placeholderType: string): string {
        switch (placeholderType) {
            case 'roman-number':
                // Match Roman numerals from constants as full words at word boundaries
                return `\\b(${Object.keys(ROMAN_NUMERALS).join('|')})\\b`;

            case 'title-in-capital-letters':
                // Match title in capital letters: must be at least 3 chars, start with letter, may contain spaces
                // Ensures meaningful title text, not single letters
                return '([A-ZÄÖÜ][A-ZÄÖÜ ]{2,}?)';

            case 'decimal-number':
                // Match one or more digits
                return '(\\d+)';

            case 'title':
                // Match title text: must start with capital letter, be at least 3 characters long
                // Non-greedy, stops at common punctuation or end patterns
                return '([A-ZÄÖÜ][^.]{2,}?)';

            case 'german-ordinal':
                // Match German ordinals from constants
                return `(${Object.keys(GERMAN_ORDINALS).join('|')})`;

            case 'place':
                // Match German place names (capitalized words)
                return '([A-ZÄÖÜ][a-zäöüß]+(?:\\s+[A-ZÄÖÜ][a-zäöüß]+)*)';

            case 'long-date':
                // Match German date format: "12. September 1921"
                return '(\\d{1,2}\\.\\s+(?:Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)\\s+\\d{4})';

            case 'no-paragraph-end-marker':
                // Match any characters for a title (non-greedy, stops before punctuation)
                // This placeholder should not match any of the defined PARAGRAPH_END_MARKERS.
                const escapedMarkers = PARAGRAPH_END_MARKERS.map((marker) =>
                    marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
                );
                // Negative lookahead for all paragraph end markers at the end of the string
                return `((?:(?!(${escapedMarkers.join('|')})$)[\\s\\S])+?)`;

            default:
                throw new AppError(
                    ERROR_CODES.VALIDATION_ERROR,
                    LOG_COMPONENTS.PIPELINE_MANAGER,
                    'getPlaceholderRegex',
                    `Unknown placeholder type: ${placeholderType}`,
                    { placeholderType },
                );
        }
    }

    /**
     * Build regex pattern from placeholder pattern
     */
    private buildPlaceholderRegex(pattern: string, isStartAnchored: boolean = false): string {
        let regex = pattern;

        // First, escape any literal regex characters in the original pattern
        // but preserve placeholders for replacement
        regex = regex.replace(/[.*+?^$\\]/g, '\\$&');

        // Replace each placeholder type with its regex pattern
        const placeholderTypes = [
            'roman-number',
            'title-in-capital-letters',
            'decimal-number',
            'title',
            'german-ordinal',
            'place',
            'long-date',
            'no-paragraph-end-marker',
        ];

        for (const placeholderType of placeholderTypes) {
            const placeholderPattern = `{${placeholderType}}`;
            if (regex.includes(placeholderPattern)) {
                const regexPattern = this.getPlaceholderRegex(placeholderType);
                regex = regex.replace(placeholderPattern, regexPattern);
            }
        }

        // Anchor to start of string for level 1 and 2 headers
        if (isStartAnchored) {
            regex = `^${regex}`;
        }

        return regex;
    }

    /**
     * Extract placeholder names from pattern
     */
    private extractPlaceholderNames(pattern: string): string[] {
        const placeholderRegex = /{([^}]+)}/g;
        const placeholders: string[] = [];
        let match: RegExpExecArray | null;

        while ((match = placeholderRegex.exec(pattern)) !== null) {
            if (match[1] !== undefined) {
                placeholders.push(match[1]);
            }
        }

        return placeholders;
    }

    /**
     * Extract ordinal value from matched pattern
     */
    private extractOrdinalValue(extractedValues: Record<string, string>): number | null {
        // Check for roman numbers
        if (extractedValues['roman-number']) {
            const romanValue =
                ROMAN_NUMERALS[extractedValues['roman-number'] as keyof typeof ROMAN_NUMERALS];
            if (romanValue) {
                return romanValue;
            }
        }

        // Check for decimal numbers
        if (extractedValues['decimal-number']) {
            const decimalValue = parseInt(extractedValues['decimal-number'], 10);
            if (!isNaN(decimalValue)) {
                return decimalValue;
            }
        }

        // Check for German ordinals
        if (extractedValues['german-ordinal']) {
            const ordinalKey = extractedValues['german-ordinal'].toLowerCase();
            const ordinalValue = GERMAN_ORDINALS[ordinalKey as keyof typeof GERMAN_ORDINALS];
            if (ordinalValue) {
                return ordinalValue;
            }
        }

        return null;
    }

    /**
     * Validate header sequence and update counters
     */
    private validateHeaderSequence(
        headerLevel: number,
        extractedNumber: number,
        scanResults: ScanResults,
    ): boolean {
        let currentIndex: number;
        let expectedNumber: number;

        switch (headerLevel) {
            case 1:
                currentIndex = scanResults.level1HeadingsIndex;
                expectedNumber = currentIndex + 1;
                break;
            case 2:
                currentIndex = scanResults.level2HeadingsIndex;
                expectedNumber = currentIndex + 1;
                break;
            case 3:
                currentIndex = scanResults.level3HeadingsIndex;
                expectedNumber = currentIndex + 1;
                break;
            default:
                throw new AppError(
                    ERROR_CODES.VALIDATION_ERROR,
                    LOG_COMPONENTS.PIPELINE_MANAGER,
                    'processHeader',
                    `Invalid header level: ${headerLevel}`,
                    { headerLevel },
                );
        }

        if (extractedNumber !== expectedNumber) {
            const errorMsg = `Header sequence validation failed: Level ${headerLevel} expected ${expectedNumber}, got ${extractedNumber}`;
            this.logger.error(
                {
                    headerLevel,
                    extractedNumber,
                    expectedNumber,
                    currentIndex,
                    level1Index: scanResults.level1HeadingsIndex,
                    level2Index: scanResults.level2HeadingsIndex,
                    level3Index: scanResults.level3HeadingsIndex,
                },
                errorMsg,
            );

            // Exit process as requested for sequence violations
            throw new AppError(
                ERROR_CODES.VALIDATION_ERROR,
                LOG_COMPONENTS.PIPELINE_MANAGER,
                'validateHeaderSequence',
                errorMsg,
                {
                    headerLevel,
                    extractedNumber,
                    expectedNumber,
                    scanResults,
                },
            );
        }

        // Update the appropriate counter
        switch (headerLevel) {
            case 1:
                scanResults.level1HeadingsIndex = extractedNumber;
                break;
            case 2:
                scanResults.level2HeadingsIndex = extractedNumber;
                break;
            case 3:
                scanResults.level3HeadingsIndex = extractedNumber;
                break;
        }

        this.logger.debug(
            {
                headerLevel,
                extractedNumber,
                newLevel1Index: scanResults.level1HeadingsIndex,
                newLevel2Index: scanResults.level2HeadingsIndex,
                newLevel3Index: scanResults.level3HeadingsIndex,
            },
            'Header sequence validated and updated',
        );

        return true;
    }

    /**
     * Apply text removal patterns to clean text
     */
    private applyTextRemovalPatterns(text: string, patterns: string[]): string {
        let cleanedText = text;

        for (const pattern of patterns) {
            try {
                // Handle both string patterns and regex patterns
                const regexPattern =
                    pattern.startsWith('/') && pattern.endsWith('/')
                        ? new RegExp(pattern.slice(1, -1), 'g')
                        : new RegExp(pattern, 'g');

                cleanedText = cleanedText.replace(regexPattern, '');
            } catch (error) {
                this.logger.warn(
                    {
                        pattern,
                        error: error instanceof Error ? error.message : String(error),
                    },
                    'Failed to apply text removal pattern',
                );
            }
        }

        return cleanedText;
    }
}
