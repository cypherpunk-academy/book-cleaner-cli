import {
    CENTERING_TOLERANCE,
    ERROR_CODES,
    GERMAN_MONTHS,
    GERMAN_ORDINALS,
    LOG_COMPONENTS,
    OCR_PAGE_WIDTH,
    PAGE_METRICS_TYPES,
    PARAGRAPH_END_MARKERS,
    ROMAN_NUMERALS,
    TEXT_LAYOUT_TOLERANCES,
} from '@/constants';
import type {
    BookTypeConfig,
    HeaderFormat,
    HeaderResult,
    HeaderTypeDefinition,
    OCRLine,
    PageMetricsData,
    PatternMatch,
} from '@/types';
import { AppError } from '@/utils/AppError';
import type pino from 'pino';
import { removeOcrGarbage } from '../../utils/TextUtils';

/**
 * Get regex pattern for a specific placeholder type
 */
function getPlaceholderRegex(placeholderType: string): string {
    switch (placeholderType) {
        case 'roman-number':
            // Match Roman numerals from constants as full words at word boundaries
            return `\\b(${Object.keys(ROMAN_NUMERALS).join('|')})\\b`;

        case 'title-in-capital-letters':
            // Match title in capital letters: must be at least 3 chars, start with letter, may contain spaces
            // Must be ONLY capital letters and spaces, no mixed case or numbers
            // Use word boundaries to ensure we don't match partial words
            return '([A-ZÄÖÜ0-9][A-ZÄÖÜ «»-]*)';

        case 'decimal-number':
            // Match one or more digits
            return '(\\d+)';

        case 'title':
            // Match title text: must start with capital letter, be at least 3 characters long
            // Non-greedy, stops at common punctuation or end patterns

            return '([A-ZÄÖÜ«»-][^.]{2,}?)';

        case 'title-with-decimal-number':
            // Match title text: must start with capital letter, be at least 3 characters long
            // Non-greedy, stops at common punctuation or end patterns
            // Exclude German month names after the decimal number

            return `(\\d+\\.\\s+(?!(?:${GERMAN_MONTHS.join('|')})\\b)[A-ZÄÖÜ«»-][^.]{2,}?)`;

        case 'german-ordinal':
            // Match German ordinals from constants
            return `(${Object.keys(GERMAN_ORDINALS).join('|')})`;

        case 'place':
            // Match German place names (capitalized words)
            return '([A-ZÄÖÜ][a-zäöüß]+(?:\\s+[A-ZÄÖÜ][a-zäöüß]+)*)';

        case 'long-date':
            // Match German date format: "12. September 1921"
            return `(\\d{1,2}\\.\\s+(?:${GERMAN_MONTHS.join('|')})\\s+\\d{4})`;

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
 * Build regex pattern by replacing placeholders with their regex patterns
 */
function buildPlaceholderRegex(pattern: string): string {
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
        'title-with-decimal-number',
        'german-ordinal',
        'place',
        'long-date',
        'no-paragraph-end-marker',
    ];

    for (const placeholderType of placeholderTypes) {
        const placeholderPattern = `{${placeholderType}}`;
        if (regex.includes(placeholderPattern)) {
            const regexPattern = getPlaceholderRegex(placeholderType);
            regex = regex.replace(placeholderPattern, regexPattern);
        }
    }

    regex = `^${regex}$`;

    return regex;
}

/**
 * Extract placeholder names from pattern
 */
function extractPlaceholderNames(pattern: string): string[] {
    const placeholderRegex = /{([^}]+)}/g;
    const placeholders: string[] = [];
    let match: RegExpExecArray | null;

    while (true) {
        match = placeholderRegex.exec(pattern);
        if (match === null) {
            break;
        }
        if (match[1] !== undefined) {
            placeholders.push(match[1]);
        }
    }

    return placeholders;
}

/**
 * Check if text is centered on the page
 * Uses OCR_PAGE_WIDTH and CENTERING_TOLERANCE to determine if text is centered
 */
function isTextCentered(bbox: { x0: number; y0: number; x1: number; y1: number }): boolean {
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
function isLineCentered(line: OCRLine, pageMetrics: Record<string, PageMetricsData>): boolean {
    if (!line?.bbox) {
        return false;
    }

    // First check if the line is centered
    if (!isTextCentered(line.bbox)) {
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

/**
 * Match text against header pattern with placeholder replacement
 */
export function matchHeaderPattern(
    text: string,
    pattern: string,
    logger?: pino.Logger,
): PatternMatch {
    try {
        const regex = buildPlaceholderRegex(pattern);
        const match = text.trim().match(new RegExp(regex));

        logger?.info({ text, regex, match }, 'HEADER PATTERN MATCH');

        if (match) {
            // Extract named groups and values
            const extractedValues: Record<string, string> = {};

            // Map match groups to placeholder names
            const placeholders = extractPlaceholderNames(pattern);
            for (let i = 1; i < match.length && i <= placeholders.length; i++) {
                const placeholderName = placeholders[i - 1];
                const matchValue = match[i];
                if (placeholderName && matchValue !== undefined) {
                    extractedValues[placeholderName] = matchValue;
                }
            }

            logger?.info(
                {
                    extractedValues,
                    fullMatch: match[0],
                },
                'Header-Fragment found! (0a0)',
            );

            return {
                matched: true,
                extractedValues,
                fullMatch: match[0],
            };
        }

        return { matched: false, extractedValues: {}, fullMatch: '' };
    } catch (error) {
        logger?.warn(
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
 * Extract ordinal value from matched pattern
 */
export function extractOrdinalValue(extractedValues: Record<string, string>): number | null {
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
 * Detect and process headers from OCR lines
 * Analyzes lines to identify header patterns and extract structured header information
 */
export function detectAndProcessHeaders(
    lineIndex: number,
    lines: OCRLine[],
    bookConfig: BookTypeConfig,
    pageMetrics: Record<string, PageMetricsData>,
    logger?: pino.Logger,
): HeaderResult | null {
    // Try to match against header patterns (level1 → level2 → level3)
    const headerLevels = [
        { level: 1, config: bookConfig.headerTypes?.level1 },
        { level: 2, config: bookConfig.headerTypes?.level2 },
        { level: 3, config: bookConfig.headerTypes?.level3 },
    ];

    let headerText = '';
    let foundLevel: number | null = null;
    let newLineIndex: number = lineIndex;
    const line = lines[lineIndex];

    if (!line || !line.text) {
        return null;
    }

    let headerFound = false;
    let foundConfig: HeaderTypeDefinition | null = null;
    let matchedFormat: HeaderFormat | null = null;
    const cleanedLineText = removeOcrGarbage(line.text);

    for (const { level, config } of headerLevels) {
        if (!config || !config.formats) {
            continue;
        }

        for (const format of config.formats) {
            const patternMatch = matchHeaderPattern(cleanedLineText, format.pattern, logger);

            if (!patternMatch.matched) {
                logger?.info(
                    {
                        patternMatch,
                    },
                    'Header-Fragment found! (0a1)',
                );

                continue;
            } else {
                logger?.info(
                    {
                        lineText: cleanedLineText,
                        pattern: format.pattern,
                    },
                    'Header-Fragment found! (0a2)',
                );
            }

            headerText = patternMatch.fullMatch.trim();
            foundLevel = level;
            foundConfig = config;
            matchedFormat = format;
            headerFound = true;

            logger?.info(
                {
                    headerText,
                    level,
                    lineIndex,
                    multipleLines: format.multipleLines,
                },
                'Header-Fragment found (1)',
            );

            break;
        }

        if (headerFound) {
            break;
        }
    }

    if (!foundConfig || !matchedFormat) {
        return null;
    }

    // Only process multiple lines if the matched format has multipleLines enabled
    if (matchedFormat.multipleLines === true) {
        for (newLineIndex = lineIndex + 1; newLineIndex < lines.length; newLineIndex++) {
            const line = lines[newLineIndex];

            if (!line || !line.text) {
                break;
            }

            const isCentered = isLineCentered(line, pageMetrics);

            logger?.info(
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
                patternMatch = matchHeaderPattern(potentialHeaderText, format.pattern, logger);

                if (patternMatch.matched) {
                    break;
                }
            }

            logger?.info(
                {
                    potentialHeaderText,
                    patternMatch,
                },
                'Header-Fragment found! (2b)',
            );

            if (patternMatch?.matched) {
                headerText = potentialHeaderText;

                logger?.info(
                    {
                        headerText,
                        foundLevel,
                        newLineIndex,
                        isCentered,
                    },
                    'Header-Fragment found! (3)',
                );
            } else {
                break;
            }
        }
    } else {
        // If multiple-lines is disabled, advance to the next line
        newLineIndex = lineIndex + 1;
    }

    const hashes = '#'.repeat(foundLevel ?? 0);
    const headerTextWithNewlines = `\n\n${hashes} ${headerText ?? headerText}\n\n`;

    logger?.info(
        {
            headerTextWithNewlines,
            foundLevel,
        },
        'Header-Fragment found!!! (4)',
    );

    if (!foundLevel) {
        return null;
    }

    return {
        headerText: headerTextWithNewlines,
        level: foundLevel,
        newLineIndex: newLineIndex - 1,
    };
}
