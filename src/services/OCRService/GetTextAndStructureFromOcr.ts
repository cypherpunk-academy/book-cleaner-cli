import {
    ERROR_CODES,
    FOOTNOTE_FORMATS,
    LOG_COMPONENTS,
    PAGE_METRICS_TYPES,
} from '@/constants';
import type { ConfigService } from '@/services/ConfigService';
import type { LoggerService } from '@/services/LoggerService';
import type {
    BookManifestInfo,
    BookTypeConfig,
    OCRLine,
    OCRWord,
    PageMetricsConfig,
    PageMetricsData,
} from '@/types';
import { AppError } from '@/utils/AppError';
import { removeOcrGarbage } from '@/utils/TextUtils';
import type pino from 'pino';
import { detectFootnoteStartFromOcr } from './detectFootnotesFromOcr';
import { detectAndProcessHeaders } from './detectHeadersFromOcr';

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
 * Generic OCR data structure for analysis
 */
interface OCRData {
    text: string;
    confidence: number;
    paragraphs?: OCRParagraph[];
    lines?: OCRLine[];
    words?: OCRWord[];
    symbols?: Array<{
        text: string;
        confidence: number;
        bbox: { x0: number; y0: number; x1: number; y1: number };
        is_superscript: boolean;
        is_subscript: boolean;
        is_dropcap: boolean;
    }>;
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
    private readonly bookManifest?: BookManifestInfo;
    private bookTypeConfigCache: Map<string, BookTypeConfig> = new Map();

    constructor(
        logger: LoggerService,
        configService: ConfigService,
        bookManifest?: BookManifestInfo,
    ) {
        this.logger = logger.getTaggedLogger(
            LOG_COMPONENTS.PIPELINE_MANAGER,
            'GET_TEXT_AND_STRUCTURE_FROM_OCR',
        );
        this.configService = configService;
        this.bookManifest = bookManifest;
    }

    /**
     * Analyze page metrics and return structured metrics object
     */
    private analyzePageMetrics(
        pageOcrData: OCRData,
        bookConfig: BookTypeConfig,
    ): Record<string, PageMetricsData> {
        if (!pageOcrData.paragraphs || pageOcrData.paragraphs.length === 0) {
            this.logger.warn('No paragraphs available for page metrics analysis');
            return {};
        }

        // Collect all x0 values and widths from lines within all paragraphs
        const x0Values: number[] = [];
        const lineWidths: number[] = [];
        let _totalLines = 0;
        let _linesWithBbox = 0;

        for (const paragraph of pageOcrData.paragraphs) {
            if (paragraph.lines && paragraph.lines.length > 0) {
                for (const line of paragraph.lines) {
                    _totalLines++;
                    if (line.bbox && typeof line.bbox.x0 === 'number') {
                        _linesWithBbox++;
                        x0Values.push(line.bbox.x0);
                        // Calculate width (x1 - x0)
                        const width = line.bbox.x1 - line.bbox.x0;
                        lineWidths.push(width);
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
        const groups = this.groupX0ValuesWithTolerance(x0Values, 7, lineWidths);

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
     * Flatten all lines from all paragraphs into a single array
     * Phase 1 of the refactor: Data structure preparation
     */
    private flattenParagraphLines(ocrData: OCRData): OCRLine[] {
        const allLines: OCRLine[] = [];

        if (!ocrData.paragraphs || ocrData.paragraphs.length === 0) {
            this.logger.warn('No paragraphs available for line flattening');
            return allLines;
        }

        let _totalLines = 0;
        let _processedParagraphs = 0;

        for (const paragraph of ocrData.paragraphs) {
            if (paragraph.lines && paragraph.lines.length > 0) {
                for (const line of paragraph.lines) {
                    allLines.push(line);
                    _totalLines++;
                }
                _processedParagraphs++;
            }
        }

        return allLines;
    }

    /**
     * Process all lines of a page sequentially
     * Phase 2 of the refactor: Core line-based processing logic
     */
    private processLinesOfPage(
        allLines: OCRLine[],
        bookConfig: BookTypeConfig,
        pageMetrics: Record<string, PageMetricsData>,
    ): { textWithHeaders: string; footnoteText: string } {
        let textWithHeaders = '';
        let footnoteText = '';

        if (allLines.length === 0) {
            this.logger.warn('No lines available for processing');
            return { textWithHeaders, footnoteText };
        }

        for (let lineIndex = 0; lineIndex < allLines.length; lineIndex++) {
            const line = allLines[lineIndex];
            if (!line || !line.bbox) {
                continue;
            }

            // Check for headers starting from this line
            const headerResult = detectAndProcessHeaders(
                lineIndex,
                allLines,
                bookConfig,
                pageMetrics,
                this.logger,
            );

            if (headerResult) {
                // Update processed line index to skip processed header lines
                lineIndex = headerResult.newLineIndex;
                textWithHeaders += headerResult.headerText;

                continue;
            }

            const lineText = line.text.trim();

            if (lineText.length === 0) {
                continue;
            }

            // Determine line type based on page metrics and footnote detection
            const lineType = this.determineLineType(line, pageMetrics);

            // Handle first line of page
            if (lineIndex === 0) {
                if (lineType === PAGE_METRICS_TYPES.PARAGRAPH_TEXT) {
                    textWithHeaders += lineText;
                } else {
                    textWithHeaders += `\n\n${lineText}`;
                }
                continue;
            }

            // Handle subsequent lines
            switch (lineType) {
                case PAGE_METRICS_TYPES.PARAGRAPH_START:
                    textWithHeaders += `\n\n${lineText}`;
                    break;

                case PAGE_METRICS_TYPES.FOOTNOTE_START: {
                    const footnoteResult = this.processFootnoteStart(
                        lineText,
                        textWithHeaders,
                        footnoteText,
                    );
                    textWithHeaders = footnoteResult.textWithHeaders;
                    footnoteText = footnoteResult.footnoteText;
                    break;
                }

                case PAGE_METRICS_TYPES.PARAGRAPH_TEXT:
                    textWithHeaders = this.processParagraphTextLine(
                        lineText,
                        textWithHeaders,
                    );
                    break;

                case PAGE_METRICS_TYPES.FOOTNOTE_TEXT:
                    footnoteText = this.processFootnoteTextLine(lineText, footnoteText);
                    break;

                default:
                    // Unknown type - treat as paragraph text
                    textWithHeaders = this.processParagraphTextLine(
                        lineText,
                        textWithHeaders,
                    );
                    break;
            }
        }

        return { textWithHeaders, footnoteText };
    }

    /**
     * Group x0 values with tolerance-based clustering algorithm
     */
    private groupX0ValuesWithTolerance(
        sortedX0Values: number[],
        tolerance: number,
        lineWidths: number[],
    ): Array<{
        average: number;
        values: number[];
        min: number;
        max: number;
        averageWidth: number;
        maxWidth: number;
    }> {
        const groups: Array<{
            average: number;
            values: number[];
            min: number;
            max: number;
            widths: number[];
        }> = [];

        for (let i = 0; i < sortedX0Values.length; i++) {
            const x0 = sortedX0Values[i];
            if (x0 === undefined) continue;

            const width = lineWidths[i] || 0;
            let foundGroup = false;

            // Try to find an existing group that fits within tolerance
            for (const group of groups) {
                if (Math.abs(x0 - group.average) <= tolerance) {
                    group.values.push(x0);
                    group.min = Math.min(group.min, x0);
                    group.max = Math.max(group.max, x0);
                    // Recalculate average
                    group.average =
                        group.values.reduce((sum, val) => sum + val, 0) /
                        group.values.length;
                    // Add width to the group for later average calculation
                    group.widths.push(width);
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
                    widths: [width],
                });
            }
        }

        // Calculate averageWidth and maxWidth for each group
        const groupsWithAverageWidth = groups.map((group) => ({
            average: group.average,
            values: group.values,
            min: group.min,
            max: group.max,
            averageWidth:
                group.widths.length > 0
                    ? group.widths.reduce((sum, width) => sum + width, 0) /
                      group.widths.length
                    : 0,
            maxWidth: group.widths.length > 0 ? Math.max(...group.widths) : 0,
        }));

        // Sort groups by average x0 position
        groupsWithAverageWidth.sort((a, b) => a.average - b.average);

        return groupsWithAverageWidth;
    }

    /**
     * Build the structured page metrics result object
     */
    private buildPageMetricsResult(
        groups: Array<{
            average: number;
            values: number[];
            min: number;
            max: number;
            averageWidth: number;
            maxWidth: number;
        }>,
        bookTypeMetrics: PageMetricsConfig,
    ): Record<string, PageMetricsData> {
        const result: Record<string, PageMetricsData> = {};

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
            minX0: largestGroup.min,
            maxX0: largestGroup.max,
            averageWidth: largestGroup.averageWidth,
            maxWidth: largestGroup.maxWidth,
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
                            minX0: bestGroup.min,
                            maxX0: bestGroup.max,
                            averageWidth: bestGroup.averageWidth,
                            maxWidth: bestGroup.maxWidth,
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
                        minX0: group.min,
                        maxX0: group.max,
                        averageWidth: group.averageWidth,
                        maxWidth: group.maxWidth,
                    };
                    unknownCounter++;
                }
            }
        }

        return result;
    }

    /**
     * Determine line type based on x0 position, page metrics, and footnote detection
     */
    private determineLineType(
        line: OCRLine,
        pageMetrics: Record<string, PageMetricsData>,
    ): string {
        // Check if this line is a footnote start based on footnote detection
        const lineX0 = line.bbox.x0;
        const footnoteText = detectFootnoteStartFromOcr(line);

        if (footnoteText) {
            this.logger.info(
                {
                    lineText: line.text,
                    footnoteText,
                    lineX0,
                },
                'Footnote start detected in line',
            );

            return PAGE_METRICS_TYPES.FOOTNOTE_START;
        }

        for (const [type, range] of Object.entries(pageMetrics)) {
            if (lineX0 >= range.minX0 && lineX0 <= range.maxX0) {
                return type;
            }
        }

        return PAGE_METRICS_TYPES.PARAGRAPH_TEXT; // Default fallback
    }

    /**
     * Process footnote start line - find and replace reference in text
     * Enhanced with footnote detection results
     */
    private processFootnoteStart(
        lineText: string,
        textWithHeaders: string,
        footnoteText: string,
    ): { textWithHeaders: string; footnoteText: string } {
        // Extract footnote number or asterisks from line start
        const footnoteMatch = lineText.match(/^(\d+|[*]+)\s*(.+)$/);
        if (!footnoteMatch) {
            // If no match, treat as regular text
            return {
                textWithHeaders: this.processParagraphTextLine(
                    lineText,
                    textWithHeaders,
                ),
                footnoteText,
            };
        }

        const footnoteRef = footnoteMatch[1] || '';
        const footnoteContent = footnoteMatch[2] || '';
        const footnoteMarker = FOOTNOTE_FORMATS.MARKDOWN.replace('%d', footnoteRef);

        // Add footnote content to footnote text
        const updatedFootnoteText = `${footnoteText}\n\n${footnoteMarker}: ${footnoteContent}`;

        return {
            textWithHeaders,
            footnoteText: updatedFootnoteText,
        };
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
        }
        // Add space and new line text
        return `${paragraphText} ${lineText}`;
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
        }
        // Add space and new line text
        return `${footnoteText} ${lineText}`;
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

            // Phase 1: Flatten all lines from all paragraphs into a single array
            const allLines = this.flattenParagraphLines(ocrData);

            if (allLines.length === 0) {
                this.logger.warn('No lines available for processing');
                return {
                    success: true,
                    textWithHeaders: '',
                    footnoteText: '',
                    level1HeadingsIndex: scanResultsThisPage.level1HeadingsIndex,
                    level2HeadingsIndex: scanResultsThisPage.level2HeadingsIndex,
                    level3HeadingsIndex: scanResultsThisPage.level3HeadingsIndex,
                };
            }

            // Phase 2: Process all lines sequentially using line-based approach
            const processedText = this.processLinesOfPage(
                allLines,
                bookConfig,
                pageMetrics,
            );

            // Update scan results with processed text
            scanResultsThisPage.textWithHeaders = processedText.textWithHeaders;
            scanResultsThisPage.footnoteText = processedText.footnoteText;

            this.logger.info(
                {
                    totalLines: allLines.length,
                    textLength: processedText.textWithHeaders.length,
                    footnoteLength: processedText.footnoteText.length,
                },
                'Line-based OCR processing completed successfully',
            );

            return {
                success: true,
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
            this.logger.error(
                { bookType, error: errorMsg },
                'Fatal error in OCR data processing',
            );

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
                description:
                    (config.description as string) || `Configuration for ${bookType}`,
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
            this.logger.error(
                { bookType, error: errorMsg },
                'Configuration loading failed',
            );

            // Return default configuration as fallback
            const defaultConfig: BookTypeConfig = {
                description: `Fallback configuration for ${bookType}`,
                textRemovalPatterns: [],
            };
            this.bookTypeConfigCache.set(bookType, defaultConfig);
            return defaultConfig;
        }
    }
}
