import type { LoggerService } from '@/services/LoggerService';
import type { ConfigService } from '@/services/ConfigService';
import type { PageMetricsConfig } from '@/types';
import {
    ERROR_CODES,
    LOG_COMPONENTS,
    OCR_PAGE_WIDTH,
    ROMAN_NUMERALS,
    GERMAN_ORDINALS,
    PARAGRAPH_END_MARKERS,
    PAGE_METRICS_TYPES,
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
    metrics?: PageMetricsConfig;
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
    headerText: string;
    level: number;
    newIndex: number;
}

/**
 * Processed text result
 */
interface ProcessedTextResult extends ScanResults {
    success: boolean;
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
     * Analyze page metrics and return structured metrics object
     */
    private analyzePageMetrics(
        pageOcrData: OCRData,
        bookConfig: BookTypeConfig,
    ): Record<string, { min: number; max: number }> {
        if (!pageOcrData.paragraphs || pageOcrData.paragraphs.length === 0) {
            this.logger.warn('No paragraphs available for page metrics analysis');
            return {};
        }

        // Collect all x0 values from lines within all paragraphs
        const x0Values: number[] = [];
        let totalLines = 0;
        let linesWithBbox = 0;

        for (const paragraph of pageOcrData.paragraphs) {
            if (paragraph.lines && paragraph.lines.length > 0) {
                for (const line of paragraph.lines) {
                    totalLines++;
                    if (line.bbox && typeof line.bbox.x0 === 'number') {
                        linesWithBbox++;
                        x0Values.push(line.bbox.x0);
                    }
                }
            }
        }

        if (x0Values.length === 0) {
            this.logger.warn('No valid line bbox.x0 values found for metrics analysis');
            return {};
        }

        // Sort x0 values for grouping
        x0Values.sort((a, b) => a - b);

        // Group x0 values using clustering algorithm with ±7 tolerance
        const groups = this.groupX0ValuesWithTolerance(x0Values, 7);

        // Load page metrics from book-types.yaml for the specific book-type
        const bookTypeMetrics = bookConfig.metrics;

        if (!bookTypeMetrics) {
            this.logger.error(
                {
                    bookConfig,
                },
                'Book type does not have required metrics configuration',
            );
            process.exit(1);
        }

        // Build the result metrics object
        const result = this.buildPageMetricsResult(groups, bookTypeMetrics);

        return result;
    }

    /**
     * Group x0 values with tolerance-based clustering algorithm
     */
    private groupX0ValuesWithTolerance(
        sortedX0Values: number[],
        tolerance: number,
    ): Array<{ average: number; values: number[]; min: number; max: number }> {
        const groups: Array<{ average: number; values: number[]; min: number; max: number }> = [];

        for (const x0 of sortedX0Values) {
            let foundGroup = false;

            // Try to find an existing group that fits within tolerance
            for (const group of groups) {
                if (Math.abs(x0 - group.average) <= tolerance) {
                    group.values.push(x0);
                    group.min = Math.min(group.min, x0);
                    group.max = Math.max(group.max, x0);
                    // Recalculate average
                    group.average =
                        group.values.reduce((sum, val) => sum + val, 0) / group.values.length;
                    foundGroup = true;
                    break;
                }
            }

            // If no group fits, start a new group
            if (!foundGroup) {
                groups.push({
                    average: x0,
                    values: [x0],
                    min: x0,
                    max: x0,
                });
            }
        }

        // Sort groups by average x0 position
        groups.sort((a, b) => a.average - b.average);

        return groups;
    }

    /**
     * Build the structured page metrics result object
     */
    private buildPageMetricsResult(
        groups: Array<{ average: number; values: number[]; min: number; max: number }>,
        bookTypeMetrics: PageMetricsConfig,
    ): Record<string, { min: number; max: number }> {
        const result: Record<string, { min: number; max: number }> = {};

        if (groups.length === 0) {
            return result;
        }

        // Find the largest group (by number of values) - this is paragraph-text
        let largestGroupIndex = 0;
        let maxValueCount = groups[0]?.values.length ?? 0;

        for (let i = 1; i < groups.length; i++) {
            const currentGroup = groups[i];
            if (currentGroup && currentGroup.values.length > maxValueCount) {
                maxValueCount = currentGroup.values.length;
                largestGroupIndex = i;
            }
        }

        const largestGroup = groups[largestGroupIndex];
        if (!largestGroup) {
            return result;
        }

        // Mark the largest group as paragraph-text
        result[PAGE_METRICS_TYPES.PARAGRAPH_TEXT] = {
            min: largestGroup.min,
            max: largestGroup.max,
        };

        // Get the paragraph-text baseline for calculating relative positions
        const paragraphTextBaseline = largestGroup.average;

        // Process other groups to match with expected metrics (using relative offsets)
        const usedGroups = new Set([largestGroupIndex]);
        const availableTypes = [
            PAGE_METRICS_TYPES.PARAGRAPH_START,
            PAGE_METRICS_TYPES.FOOTNOTE_TEXT,
            PAGE_METRICS_TYPES.FOOTNOTE_START,
            PAGE_METRICS_TYPES.QUOTE_TEXT,
        ];

        for (const type of availableTypes) {
            // Handle simple YAML structure where metrics are just numbers
            const metricValue = bookTypeMetrics[type];
            const relativeOffset =
                typeof metricValue === 'number'
                    ? metricValue
                    : (metricValue as { expectedX0?: number })?.expectedX0;
            const tolerance = (metricValue as { tolerance?: number })?.tolerance || 15;

            if (relativeOffset !== undefined) {
                // Calculate expected absolute position: baseline + relative offset
                const expectedX0 = paragraphTextBaseline + relativeOffset;
                // Find the best matching group for this type
                let bestMatchIndex = -1;
                let bestDistance = Number.POSITIVE_INFINITY;

                for (let i = 0; i < groups.length; i++) {
                    if (usedGroups.has(i)) continue;

                    const group = groups[i];
                    if (!group) continue;

                    const distance = Math.abs(group.average - expectedX0);

                    if (distance <= tolerance && distance < bestDistance) {
                        bestMatchIndex = i;
                        bestDistance = distance;
                    }
                }

                if (bestMatchIndex >= 0) {
                    const bestGroup = groups[bestMatchIndex];
                    if (bestGroup) {
                        result[type] = {
                            min: bestGroup.min,
                            max: bestGroup.max,
                        };
                        usedGroups.add(bestMatchIndex);
                    }
                }
            }
        }

        // Add remaining groups as unknown
        let unknownCounter = 1;
        for (let i = 0; i < groups.length; i++) {
            if (!usedGroups.has(i)) {
                const group = groups[i];
                if (group) {
                    result[`unknown-${unknownCounter}`] = {
                        min: group.min,
                        max: group.max,
                    };
                    unknownCounter++;
                }
            }
        }

        return result;
    }

    /**
     * Classify page groups (legacy method for backward compatibility)
     */
    private classifyPageGroups(groups: Array<{ center: number; values: number[] }>): Array<{
        type: string;
        averageX0: number;
        values: number[];
        confidence: number;
    }> {
        return groups.map((group, index) => ({
            type: `group-${index}`,
            averageX0: group.center,
            values: group.values,
            confidence: 0.8,
        }));
    }

    /**
     * Legacy analyze page metrics method for logging (kept for backward compatibility)
     */
    private logPageMetrics(pageOcrData: OCRData, bookConfig: BookTypeConfig): void {
        if (!pageOcrData.paragraphs || pageOcrData.paragraphs.length === 0) {
            this.logger.warn('No paragraphs available for page metrics analysis');
            return;
        }

        // Collect all x0 values from lines within all paragraphs
        const x0Values: number[] = [];
        for (const paragraph of pageOcrData.paragraphs) {
            if (paragraph.lines && paragraph.lines.length > 0) {
                for (const line of paragraph.lines) {
                    if (line.bbox && typeof line.bbox.x0 === 'number') {
                        x0Values.push(line.bbox.x0);
                    }
                }
            }
        }

        if (x0Values.length === 0) {
            this.logger.warn('No valid line bbox.x0 values found for metrics analysis');
            return;
        }

        // Sort x0 values for grouping
        x0Values.sort((a, b) => a - b);

        // Group x0 values using clustering algorithm (tolerance-based grouping)
        const groups = this.groupX0Values(x0Values);

        // Load page metrics from configuration (no fallback - error if missing)
        const pageMetrics = bookConfig.metrics;

        if (!pageMetrics) {
            this.logger.error(
                {
                    bookConfig,
                },
                'Book type does not have required metrics configuration',
            );
            process.exit(1);
        }

        // Analyze groups and classify text types
        const classifiedGroups = this.classifyPageGroups(groups);

        // Print results in green using logger
        const results = {
            totalParagraphs: pageOcrData.paragraphs.length,
            totalLinesAnalyzed: x0Values.length,
            identifiedGroups: classifiedGroups.length,
            groups: classifiedGroups,
            rawX0Values: x0Values,
        };

        // Log with special formatting for green output
        this.logger.info(
            {
                ...results,
                _colorTag: 'GREEN_SUCCESS', // Special tag for green formatting
            },
            '🟢 PAGE METRICS ANALYSIS COMPLETED',
        );

        // Also log each group separately in green
        for (const group of classifiedGroups) {
            this.logger.info(
                {
                    groupType: group.type,
                    averageX0: group.averageX0,
                    valueCount: group.values.length,
                    confidence: group.confidence,
                    values: group.values,
                    _colorTag: 'GREEN_SUCCESS',
                },
                `🟢 TEXT TYPE: ${group.type.toUpperCase()}`,
            );
        }
    }

    /**
     * Group x0 values based on proximity (clustering)
     */
    private groupX0Values(
        sortedX0Values: number[],
        tolerance: number = 15,
    ): Array<{ center: number; values: number[] }> {
        const groups: Array<{ center: number; values: number[] }> = [];

        for (const x0 of sortedX0Values) {
            // Find existing group within tolerance
            let foundGroup = false;
            for (const group of groups) {
                if (Math.abs(x0 - group.center) <= tolerance) {
                    group.values.push(x0);
                    // Recalculate center as average
                    group.center =
                        group.values.reduce((sum, val) => sum + val, 0) / group.values.length;
                    foundGroup = true;
                    break;
                }
            }

            // Create new group if no suitable group found
            if (!foundGroup) {
                groups.push({ center: x0, values: [x0] });
            }
        }

        return groups;
    }

    /**
     * Classify grouped x0 values into text types based on page metrics
     */

    /**
     * Process paragraph text based on page metrics and line positioning
     */
    private processParagraphText(
        paragraph: OCRParagraph,
        bookConfig: BookTypeConfig,
        scanResultsThisPage: ScanResults,
        pageMetrics: Record<string, { min: number; max: number }>,
        isFirstParagraph: boolean,
    ): { paragraphText: string; footnoteText: string } {
        let paragraphText = '';
        let footnoteText = '';

        if (!paragraph.lines || paragraph.lines.length === 0) {
            return { paragraphText, footnoteText };
        }

        for (let lineIndex = 0; lineIndex < paragraph.lines.length; lineIndex++) {
            const line = paragraph.lines[lineIndex];
            if (!line || !line.bbox) {
                continue;
            }

            const lineX0 = line.bbox.x0;
            const lineText = line.text.trim();

            if (lineText.length === 0) {
                continue;
            }

            // Determine line type based on page metrics
            const lineType = this.determineLineType(lineX0, pageMetrics);

            // Handle first paragraph on page
            if (isFirstParagraph && lineIndex === 0) {
                if (lineType === PAGE_METRICS_TYPES.PARAGRAPH_TEXT) {
                    paragraphText += lineText;
                } else {
                    paragraphText += `\n\n${lineText}`;
                }
                continue;
            }

            // Handle subsequent lines and paragraphs
            switch (lineType) {
                case PAGE_METRICS_TYPES.PARAGRAPH_START:
                    paragraphText += `\n\n${lineText}`;
                    break;

                case PAGE_METRICS_TYPES.FOOTNOTE_START:
                    const footnoteResult = this.processFootnoteStart(
                        lineText,
                        paragraphText,
                        footnoteText,
                    );
                    paragraphText = footnoteResult.paragraphText;
                    footnoteText = footnoteResult.footnoteText;
                    break;

                case PAGE_METRICS_TYPES.PARAGRAPH_TEXT:
                    paragraphText = this.processParagraphTextLine(lineText, paragraphText);
                    break;

                case PAGE_METRICS_TYPES.FOOTNOTE_TEXT:
                    footnoteText = this.processFootnoteTextLine(lineText, footnoteText);
                    break;

                default:
                    // Unknown type - treat as paragraph text
                    paragraphText = this.processParagraphTextLine(lineText, paragraphText);
                    break;
            }
        }

        return { paragraphText, footnoteText };
    }

    /**
     * Determine line type based on x0 position and page metrics
     */
    private determineLineType(
        lineX0: number,
        pageMetrics: Record<string, { min: number; max: number }>,
    ): string {
        for (const [type, range] of Object.entries(pageMetrics)) {
            if (lineX0 >= range.min && lineX0 <= range.max) {
                return type;
            }
        }
        return PAGE_METRICS_TYPES.PARAGRAPH_TEXT; // Default fallback
    }

    /**
     * Process footnote start line - find and replace reference in text
     */
    private processFootnoteStart(
        lineText: string,
        paragraphText: string,
        footnoteText: string,
    ): { paragraphText: string; footnoteText: string } {
        // Extract footnote number or asterisks from line start
        const footnoteMatch = lineText.match(/^(\d+|[*]+)\s*(.+)$/);
        if (!footnoteMatch) {
            // If no match, treat as regular text
            return {
                paragraphText: this.processParagraphTextLine(lineText, paragraphText),
                footnoteText,
            };
        }

        const footnoteRef = footnoteMatch[1] || '';
        const footnoteContent = footnoteMatch[2] || '';
        const footnoteMarker = `[${footnoteRef}]`;

        // Search for footnote reference in paragraph text from back to front
        const updatedParagraphText = this.replaceFootnoteReference(
            paragraphText,
            footnoteRef,
            footnoteMarker,
        );

        // Add footnote content to footnote text
        const updatedFootnoteText = footnoteText + `\n\n${footnoteMarker} ${footnoteContent}`;

        return {
            paragraphText: updatedParagraphText,
            footnoteText: updatedFootnoteText,
        };
    }

    /**
     * Replace footnote reference in text from back to front
     */
    private replaceFootnoteReference(
        text: string,
        footnoteRef: string,
        footnoteMarker: string,
    ): string {
        // Create regex pattern for the footnote reference
        let pattern: RegExp;
        if (footnoteRef === '*') {
            pattern = /\*/g;
        } else if (footnoteRef === '**') {
            pattern = /\*\*/g;
        } else if (footnoteRef === '***') {
            pattern = /\*\*\*/g;
        } else {
            // Numeric reference
            pattern = new RegExp(`\\b${footnoteRef}\\b`, 'g');
        }

        // Find all matches
        const matches: RegExpExecArray[] = [];
        let match: RegExpExecArray | null;
        while ((match = pattern.exec(text)) !== null) {
            matches.push(match);
        }

        // Replace the last occurrence (from back to front)
        if (matches.length > 0) {
            const lastMatch = matches[matches.length - 1];
            if (lastMatch && lastMatch.index !== undefined && lastMatch[0]) {
                const beforeMatch = text.substring(0, lastMatch.index);
                const afterMatch = text.substring(lastMatch.index + lastMatch[0].length);
                return beforeMatch + footnoteMarker + afterMatch;
            }
        }

        return text;
    }

    /**
     * Process paragraph text line with hyphenation handling
     */
    private processParagraphTextLine(lineText: string, paragraphText: string): string {
        if (paragraphText.length === 0) {
            return lineText;
        }

        // Check for hyphenation at end of current paragraph text
        const endsWithHyphen = paragraphText.endsWith('-');
        const firstCharIsCapital = lineText.length > 0 && /^[A-ZÄÖÜ]/.test(lineText);

        if (endsWithHyphen && !firstCharIsCapital) {
            // Connect hyphenated word
            return paragraphText.slice(0, -1) + lineText;
        } else {
            // Add space and new line text
            return paragraphText + ' ' + lineText;
        }
    }

    /**
     * Process footnote text line with hyphenation handling
     */
    private processFootnoteTextLine(lineText: string, footnoteText: string): string {
        if (footnoteText.length === 0) {
            return lineText;
        }

        // Check for hyphenation at end of current footnote text
        const endsWithHyphen = footnoteText.endsWith('-');
        const firstCharIsCapital = lineText.length > 0 && /^[A-ZÄÖÜ]/.test(lineText);

        if (endsWithHyphen && !firstCharIsCapital) {
            // Connect hyphenated word
            return footnoteText.slice(0, -1) + lineText;
        } else {
            // Add space and new line text
            return footnoteText + ' ' + lineText;
        }
    }

    /**
     * Main method to process OCR data for a single page
     */
    async processOCRData(
        ocrData: OCRData,
        bookType: string,
        scanResults: ScanResults,
    ): Promise<ProcessedTextResult> {
        try {
            // Initialize scanResultsThisPage with the current header indices from scanResults
            const scanResultsThisPage: ScanResults = {
                textWithHeaders: '',
                footnoteText: '',
                level1HeadingsIndex: scanResults.level1HeadingsIndex,
                level2HeadingsIndex: scanResults.level2HeadingsIndex,
                level3HeadingsIndex: scanResults.level3HeadingsIndex,
            };

            // Load book type configuration
            const bookConfig = await this.loadBookTypeConfig(bookType);

            // Analyze page metrics based on bbox.x0 values and classify text types
            const pageMetrics = this.analyzePageMetrics(ocrData, bookConfig);

            // Debug: Log the page metrics result
            this.logger.debug({ pageMetrics }, 'Page Metrics Result');

            let processedParagraphs = 0;
            let detectedHeaders = 0;
            let removedPatterns = 0;
            const errors: string[] = [];

            // Process each paragraph
            if (ocrData.paragraphs && ocrData.paragraphs.length > 0) {
                for (const paragraph of ocrData.paragraphs) {
                    try {
                        processedParagraphs++;

                        // Skip empty paragraphs
                        if (!paragraph.text || paragraph.text.trim().length === 0) {
                            continue;
                        }

                        // Check if this paragraph is a header
                        const headerResult = await this.detectAndProcessHeaders(
                            paragraph,
                            bookConfig,
                            scanResultsThisPage,
                        );

                        if (headerResult) {
                            // Successfully processed as header
                            detectedHeaders++;

                            scanResultsThisPage.textWithHeaders += headerResult?.headerText ?? '';

                            switch (headerResult.level) {
                                case 1:
                                    scanResultsThisPage.level1HeadingsIndex = headerResult.newIndex;
                                    break;
                                case 2:
                                    scanResultsThisPage.level2HeadingsIndex = headerResult.newIndex;
                                    break;
                                case 3:
                                    scanResultsThisPage.level3HeadingsIndex = headerResult.newIndex;
                                    break;
                            }

                            continue; // Headers are supposed to be alone in a paragraph
                        }

                        // Process paragraph text based on page metrics
                        const isFirstParagraph = processedParagraphs === 1;
                        const processedText = this.processParagraphText(
                            paragraph,
                            bookConfig,
                            scanResultsThisPage,
                            pageMetrics,
                            isFirstParagraph,
                        );

                        // Apply text removal patterns to paragraph text
                        const cleanedParagraphText = this.applyTextRemovalPatterns(
                            processedText.paragraphText,
                            bookConfig.textRemovalPatterns,
                        );

                        if (cleanedParagraphText.length !== processedText.paragraphText.length) {
                            removedPatterns++;
                        }

                        // Add processed paragraph text to results if not empty after cleaning
                        if (cleanedParagraphText.trim().length > 0) {
                            scanResultsThisPage.textWithHeaders += cleanedParagraphText;
                        }

                        // Add footnote text to scan results
                        if (processedText.footnoteText.trim().length > 0) {
                            scanResultsThisPage.footnoteText += processedText.footnoteText;
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

            return {
                success: errors.length === 0,
                textWithHeaders: scanResultsThisPage.textWithHeaders,
                footnoteText: scanResultsThisPage.footnoteText,
                level1HeadingsIndex: scanResultsThisPage.level1HeadingsIndex,
                level2HeadingsIndex: scanResultsThisPage.level2HeadingsIndex,
                level3HeadingsIndex: scanResultsThisPage.level3HeadingsIndex,
            };
        } catch (error) {
            const errorMsg = `OCR data processing failed: ${
                error instanceof Error ? error.message : String(error)
            }`;
            this.logger.error({ bookType, error: errorMsg }, 'Fatal error in OCR data processing');

            return {
                success: false,
                textWithHeaders: '',
                footnoteText: '',
                level1HeadingsIndex: scanResults.level1HeadingsIndex,
                level2HeadingsIndex: scanResults.level2HeadingsIndex,
                level3HeadingsIndex: scanResults.level3HeadingsIndex,
            };
        }
    }

    /**
     * Load book type configuration from book-types.yaml
     */
    private async loadBookTypeConfig(bookType: string): Promise<BookTypeConfig> {
        // Check cache first
        const cachedConfig = this.bookTypeConfigCache.get(bookType);
        if (cachedConfig) {
            return cachedConfig;
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
                metrics: (config.metrics as PageMetricsConfig) || undefined,
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
        scanResultsThisPage: ScanResults,
    ): Promise<HeaderResult | null> {
        // Check if paragraph is centered
        if (!this.isTextCentered(paragraph)) {
            return null;
        }

        // Normalize text for pattern matching (all whitespace and newlines become single spaces)
        const normalizedText = paragraph.text.replace(/[\s\n\r\t]+/g, ' ').trim();

        // For level 1 and 2 headers, ensure they start at the beginning of the text
        const startsAtBeginning = this.checkHeaderStartsAtBeginning(paragraph.text, normalizedText);

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

            // For level 1 and 2 headers, require they start at the beginning of the paragraph
            if ((level === 1 || level === 2) && !startsAtBeginning) {
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

                if (patternMatch && patternMatch.matched) {
                    // Extract ordinal value for sequence validation
                    const newIndex = this.extractOrdinalValue(patternMatch.extractedValues);

                    if (newIndex !== null) {
                        // Validate header sequence
                        if (this.validateHeaderSequence(level, newIndex, scanResultsThisPage)) {
                            // Add header to results with double newlines before and after
                            const markdownLevel = '#'.repeat(level);
                            const headerText = `\n\n${markdownLevel} ${normalizedText}\n\n`;

                            this.logger.info(
                                {
                                    headerText,
                                    level,
                                    newIndex,
                                },
                                'Header successfully processed and added',
                            );

                            return {
                                headerText,
                                level,
                                newIndex,
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
        scanResultsThisPage: ScanResults,
    ): boolean {
        let currentIndex: number;
        let expectedNumber: number;

        switch (headerLevel) {
            case 1:
                currentIndex = scanResultsThisPage.level1HeadingsIndex;
                expectedNumber = currentIndex + 1;
                break;
            case 2:
                currentIndex = scanResultsThisPage.level2HeadingsIndex;
                expectedNumber = currentIndex + 1;
                break;
            case 3:
                currentIndex = scanResultsThisPage.level3HeadingsIndex;
                expectedNumber = currentIndex + 1;
                break;
            default:
                this.logger.error(
                    {
                        headerLevel,
                        extractedNumber,
                        scanResultsThisPage,
                    },
                    'Invalid header level',
                );
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
                    level1Index: scanResultsThisPage.level1HeadingsIndex,
                    level2Index: scanResultsThisPage.level2HeadingsIndex,
                    level3Index: scanResultsThisPage.level3HeadingsIndex,
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
                    scanResultsThisPage,
                },
            );
        }

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
