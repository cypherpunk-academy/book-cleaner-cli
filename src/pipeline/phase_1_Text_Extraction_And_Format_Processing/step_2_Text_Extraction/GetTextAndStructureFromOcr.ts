import {
    CENTERING_TOLERANCE,
    ERROR_CODES,
    FOOTNOTE_FORMATS,
    GERMAN_ORDINALS,
    LOG_COMPONENTS,
    OCR_PAGE_WIDTH,
    PAGE_METRICS_TYPES,
    PARAGRAPH_END_MARKERS,
    ROMAN_NUMERALS,
    TEXT_LAYOUT_TOLERANCES,
} from '@/constants';
import type { ConfigService } from '@/services/ConfigService';
import type { LoggerService } from '@/services/LoggerService';
import type { BookManifestInfo, PageMetricsConfig, PageMetricsData } from '@/types';
import { AppError } from '@/utils/AppError';
import type pino from 'pino';

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
    newHeaderIndex: number;
    newLineIndex: number;
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

        let totalLines = 0;
        let processedParagraphs = 0;

        for (const paragraph of ocrData.paragraphs) {
            if (paragraph.lines && paragraph.lines.length > 0) {
                for (const line of paragraph.lines) {
                    allLines.push(line);
                    totalLines++;
                }
                processedParagraphs++;
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
            const headerResult = this.detectAndProcessHeaders(
                lineIndex,
                allLines,
                bookConfig,
                pageMetrics,
            );

            if (headerResult) {
                // Update processed line index to skip processed header lines
                lineIndex = headerResult.newLineIndex;
                textWithHeaders += headerResult.headerText;

                continue;
            }

            const lineX0 = line.bbox.x0;
            const lineText = line.text.trim();

            if (lineText.length === 0) {
                continue;
            }

            // Determine line type based on page metrics
            const lineType = this.determineLineType(lineX0, pageMetrics);

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
                    textWithHeaders = this.processParagraphTextLine(lineText, textWithHeaders);
                    break;

                case PAGE_METRICS_TYPES.FOOTNOTE_TEXT:
                    footnoteText = this.processFootnoteTextLine(lineText, footnoteText);
                    break;

                default:
                    // Unknown type - treat as paragraph text
                    textWithHeaders = this.processParagraphTextLine(lineText, textWithHeaders);
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
                        group.values.reduce((sum, val) => sum + val, 0) / group.values.length;
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
                    ? group.widths.reduce((sum, width) => sum + width, 0) / group.widths.length
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
        tolerance = 15,
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
     * Determine line type based on x0 position and page metrics
     */
    private determineLineType(
        lineX0: number,
        pageMetrics: Record<string, PageMetricsData>,
    ): string {
        for (const [type, range] of Object.entries(pageMetrics)) {
            if (lineX0 >= range.minX0 && lineX0 <= range.maxX0) {
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
        textWithHeaders: string,
        footnoteText: string,
    ): { textWithHeaders: string; footnoteText: string } {
        // Extract footnote number or asterisks from line start
        const correctedLineText = this.getReplacementText(lineText) ?? lineText;
        const footnoteMatch = correctedLineText.match(/^(\d+|[*]+)\s*(.+)$/);
        if (!footnoteMatch) {
            // If no match, treat as regular text
            return {
                textWithHeaders: this.processParagraphTextLine(lineText, textWithHeaders),
                footnoteText,
            };
        }

        const footnoteRef = footnoteMatch[1] || '';
        const footnoteContent = footnoteMatch[2] || '';
        const footnoteMarker = FOOTNOTE_FORMATS.MARKDOWN.replace('%d', footnoteRef);

        // Search for footnote reference in paragraph text from back to front
        const updatedTextWithHeaders = this.replaceFootnoteReference(
            textWithHeaders,
            footnoteRef,
            footnoteMarker,
        );

        // Add footnote content to footnote text
        const updatedFootnoteText = `${footnoteText}\n\n${footnoteMarker}: ${footnoteContent}`;

        return {
            textWithHeaders: updatedTextWithHeaders,
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
            pattern = new RegExp(`${footnoteRef}`, 'g');
        }

        const correctedText = this.getReplacementText(text) ?? text;

        // Find all matches
        const matches: RegExpExecArray[] = [];
        let match: RegExpExecArray | null;
        while ((match = pattern.exec(correctedText)) !== null) {
            matches.push(match);
        }

        this.logger.info(
            {
                matches,
                correctedText,
                footnoteRef,
                footnoteMarker,
            },
            'FOOTNOTE REFERENCE:replaceFootnoteReference',
        );

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
            const processedText = this.processLinesOfPage(allLines, bookConfig, pageMetrics);

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
     * Handles multi-line headers by building headerText across consecutive lines
     */
    private detectAndProcessHeaders(
        lineIndex: number,
        lines: OCRLine[],
        bookConfig: BookTypeConfig,
        pageMetrics: Record<string, PageMetricsData>,
    ): HeaderResult | null {
        // Try to match against header patterns (level1 → level2 → level3)
        const headerLevels = [
            { level: 1, config: bookConfig.headerTypes?.level1 },
            { level: 2, config: bookConfig.headerTypes?.level2 },
            { level: 3, config: bookConfig.headerTypes?.level3 },
        ];

        let headerIndex: number | null = null;
        let headerText = '';
        let foundLevel: number | null = null;
        let newLineIndex: number = lineIndex;
        const line = lines[lineIndex];

        if (!line || !line.text) {
            return null;
        }

        let headerFound = false;
        let foundConfig: HeaderTypeDefinition | null = null;
        for (const { level, config } of headerLevels) {
            if (!config || !config.formats) {
                continue;
            }

            for (const format of config.formats) {
                let patternMatch = this.matchHeaderPattern(line.text, format.pattern);
                let replacedText: string | null = null;

                if (!patternMatch.matched) {
                    replacedText = this.getReplacementText(line.text);

                    if (replacedText) {
                        patternMatch = this.matchHeaderPattern(replacedText, format.pattern);

                        this.logger.debug(
                            {
                                lineText: line.text,
                                replacedText,
                                patternMatch,
                                pattern: format.pattern,
                            },
                            'Header-Fragment found (0b)',
                        );
                    }

                    if (!replacedText || !patternMatch.matched) {
                        continue;
                    }
                } else {
                    this.logger.debug(
                        {
                            lineText: line.text,
                            pattern: format.pattern,
                        },
                        'Header-Fragment found! (0a)',
                    );
                }

                // Check if header is centered and has appropriate width
                if (!this.isLineCentered(line, pageMetrics) && !replacedText) {
                    continue;
                }

                headerIndex = this.extractOrdinalValue(patternMatch.extractedValues);
                headerText = patternMatch.fullMatch.trim();
                foundLevel = level;
                foundConfig = config;
                headerFound = true;

                this.logger.debug(
                    {
                        headerText,
                        level,
                        headerIndex,
                        lineIndex,
                        alignment: format.alignment,
                    },
                    'Header-Fragment found (1)',
                );

                break;
            }

            if (headerFound) {
                break;
            }
        }

        if (!foundConfig) {
            return null;
        }

        for (newLineIndex = lineIndex + 1; newLineIndex < lines.length; newLineIndex++) {
            const line = lines[newLineIndex];

            if (!line || !line.text) {
                break;
            }

            const isCentered = this.isLineCentered(line, pageMetrics);

            this.logger.debug(
                {
                    lineText: line.text,
                    isCentered,
                },
                'Header-Fragment found! (2a)',
            );

            if (!isCentered) {
                break;
            }

            const potentialHeaderText = `${headerText} ${line.text.trim()}`;

            let patternMatch: PatternMatch | null = null;
            for (const format of foundConfig.formats) {
                patternMatch = this.matchHeaderPattern(potentialHeaderText, format.pattern);

                if (patternMatch.matched) {
                    break;
                }
            }

            this.logger.debug(
                {
                    potentialHeaderText,
                    patternMatch,
                },
                'Header-Fragment found! (2b)',
            );

            if (patternMatch?.matched) {
                headerText = potentialHeaderText;

                this.logger.debug(
                    {
                        headerText,
                        foundLevel,
                        headerIndex,
                        newLineIndex,
                        isCentered,
                    },
                    'Header-Fragment found! (3)',
                );
            } else {
                break;
            }
        }

        const hashes = '#'.repeat(foundLevel ?? 0);
        const correctedHeaderText = this.getReplacementText(headerText);
        const headerTextWithNewlines = `\n\n${hashes} ${correctedHeaderText ?? headerText}\n\n`;

        this.logger.debug(
            {
                headerTextWithNewlines,
                foundLevel,
                headerIndex,
            },
            'Header-Fragment found!!! (4)',
        );

        if (!foundLevel || !headerIndex) {
            return null;
        }

        return {
            headerText: headerTextWithNewlines,
            level: foundLevel,
            newHeaderIndex: headerIndex,
            newLineIndex: newLineIndex - 1,
        };
    }

    /**
     * Get replacement text from OCR misreadings
     * Now handles regex patterns in misreading.ocr instead of simple strings
     * Supports both delimited patterns (e.g., /pattern/) and raw patterns
     */
    private getReplacementText(text: string): string | null {
        if (!this.bookManifest?.ocrMisreadings || this.bookManifest.ocrMisreadings.length === 0) {
            return null;
        }

        const trimmedText = text.trim();

        for (const misreading of this.bookManifest.ocrMisreadings) {
            try {
                let regexPattern = misreading.ocr;
                let flags = 'g';

                // Check if the pattern is delimited with forward slashes (e.g., /pattern/)
                const delimitedMatch = regexPattern.match(/^\/(.*)\/([gimsuy]*)$/);

                if (delimitedMatch) {
                    regexPattern = delimitedMatch[1] || '';
                    flags = delimitedMatch[2] || 'g';
                    // Ensure 'g' flag is present for global replacement
                    if (!flags.includes('g')) {
                        flags += 'g';
                    }
                }

                // Create regex from the pattern
                const regex = new RegExp(regexPattern, flags);

                // Test if the pattern matches anywhere in the text (partial match)
                if (regex.test(trimmedText)) {
                    // Reset regex state for replacement
                    regex.lastIndex = 0;
                    const replacedText = text.replace(regex, misreading.correct).trim();

                    this.logger.info(
                        {
                            originalText: text,
                            replacedText,
                            pattern: misreading.ocr,
                            correct: misreading.correct,
                        },
                        'OCR misreading replacement applied',
                    );

                    return replacedText;
                }
            } catch (error) {
                this.logger.warn(
                    {
                        ocrPattern: misreading.ocr,
                        correctText: misreading.correct,
                        error: error instanceof Error ? error.message : String(error),
                    },
                    'Invalid regex pattern in OCR misreading',
                );

                // Continue with next misreading instead of throwing
                continue;
            }
        }

        return null;
    }

    /**
     * Match text against header pattern with placeholder replacement
     */
    private matchHeaderPattern(text: string, pattern: string): PatternMatch {
        try {
            const regex = this.buildPlaceholderRegex(pattern);
            const match = text.trim().match(new RegExp(regex));

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
                // Must be ONLY capital letters and spaces, no mixed case or numbers
                // Use word boundaries to ensure we don't match partial words
                return '([A-ZÄÖÜ][A-ZÄÖÜ «»-]{2,})';

            case 'decimal-number':
                // Match one or more digits
                return '(\\d+)';

            case 'title':
                // Match title text: must start with capital letter, be at least 3 characters long
                // Non-greedy, stops at common punctuation or end patterns
                return '([A-ZÄÖÜ«»-][^.]{2,}?)';

            case 'german-ordinal':
                // Match German ordinals from constants
                return `(${Object.keys(GERMAN_ORDINALS).join('|')})`;

            case 'place':
                // Match German place names (capitalized words)
                return '([A-ZÄÖÜ][a-zäöüß]+(?:\\s+[A-ZÄÖÜ][a-zäöüß]+)*)';

            case 'long-date':
                // Match German date format: "12. September 1921"
                return '(\\d{1,2}\\.\\s+(?:Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)\\s+\\d{4})';

            case 'no-paragraph-end-marker': {
                // Match any characters for a title (non-greedy, stops before punctuation)
                // This placeholder should not match any of the defined PARAGRAPH_END_MARKERS.
                // Also should not match if followed by numbers or lowercase letters (which indicate new content)
                const escapedMarkers = PARAGRAPH_END_MARKERS.map((marker) =>
                    marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
                );
                // Negative lookahead for all paragraph end markers at the end of the string
                // Also negative lookahead for numbers or lowercase letters that would indicate new content
                return `((?:(?!(${escapedMarkers.join('|')})$)(?![0-9a-z])[\\s\\S])+?)`;
            }

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
    private buildPlaceholderRegex(pattern: string): string {
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

        regex = `^${regex}$`;

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
            const decimalValue = Number.parseInt(extractedValues['decimal-number'], 10);
            if (!Number.isNaN(decimalValue)) {
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
     * Check if text is centered on the page
     * Uses OCR_PAGE_WIDTH and CENTERING_TOLERANCE to determine if text is centered
     */
    private isTextCentered(bbox: { x0: number; y0: number; x1: number; y1: number }): boolean {
        if (!bbox || typeof bbox.x0 !== 'number' || typeof bbox.x1 !== 'number') {
            return false;
        }

        // Calculate the center of the text element
        const textCenter = (bbox.x0 + bbox.x1) / 2;

        // Calculate the center of the page
        const pageCenter = OCR_PAGE_WIDTH / 2;

        // Check if the text center is within the centering tolerance of the page center
        const distanceFromCenter = Math.abs(textCenter - pageCenter);

        return distanceFromCenter <= CENTERING_TOLERANCE;
    }

    /**
     * Check if a line is centered on the page and has appropriate width
     * Convenience method for checking individual lines
     */
    private isLineCentered(line: OCRLine, pageMetrics: Record<string, PageMetricsData>): boolean {
        if (!line?.bbox) {
            return false;
        }

        // First check if the line is centered
        if (!this.isTextCentered(line.bbox)) {
            return false;
        }

        // Calculate line width
        const lineWidth = line.bbox.x1 - line.bbox.x0;

        // Get paragraph-text averageWidth from page metrics
        const paragraphTextMetrics = pageMetrics[PAGE_METRICS_TYPES.PARAGRAPH_TEXT];
        if (!paragraphTextMetrics?.maxWidth) {
            // If no paragraph-text metrics available, just check centering
            return true;
        }

        // Check if line width is within the centered line width factor of paragraph-text averageWidth
        const maxAllowedWidth =
            paragraphTextMetrics.maxWidth * TEXT_LAYOUT_TOLERANCES.CENTERED_LINE_WIDTH_FACTOR;

        return lineWidth <= maxAllowedWidth;
    }
}
