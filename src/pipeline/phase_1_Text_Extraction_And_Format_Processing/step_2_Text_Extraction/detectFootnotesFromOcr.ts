import { FOOTNOTE_DETECTION, LOG_COMPONENTS, SUPERSCRIPT_DETECTION } from '@/constants';
import type { LoggerService } from '@/services/LoggerService';
import type pino from 'pino';

/**
 * OCR Symbol structure from Tesseract with superscript detection
 */
interface OCRSymbol {
    text: string;
    confidence: number;
    bbox: { x0: number; y0: number; x1: number; y1: number };
    baseline?: {
        x0: number;
        y0: number;
        x1: number;
        y1: number;
        has_baseline: boolean;
    };
    is_superscript: boolean;
    is_subscript: boolean;
    is_dropcap: boolean;
    is_custom_detected_superscript?: boolean;
    detection_confidence?: number;
}

/**
 * OCR Line structure
 */
interface OCRLine {
    text: string;
    confidence: number;
    bbox: { x0: number; y0: number; x1: number; y1: number };
    words?: OCRWord[];
}

/**
 * OCR Word structure
 */
interface OCRWord {
    text: string;
    confidence: number;
    bbox: { x0: number; y0: number; x1: number; y1: number };
    symbols?: OCRSymbol[];
}

/**
 * Bounding box type for footnote candidates
 */
interface BoundingBox {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
}

/**
 * Footnote candidate result
 */
interface FootnoteCandidate {
    footnoteText: string;
    bbox: BoundingBox;
    type: 'footnote' | 'footnote-reference';
    confidence: number;
    referenceNumber?: string;
    lineIndex?: number;
    symbolIndex?: number;
}

/**
 * Superscript detection result
 */
interface SuperscriptDetectionResult {
    symbol: OCRSymbol;
    text: string;
    lineIndex: number;
    wordIndex: number;
    fourWordsBefore: string[];
}

/**
 * Class for detecting footnotes and footnote references from OCR data
 * using superscript detection and pattern matching
 */
export class DetectFootnotesFromOcr {
    private readonly logger: pino.Logger;

    constructor(logger: LoggerService) {
        this.logger = logger.getTaggedLogger(
            LOG_COMPONENTS.PIPELINE_MANAGER,
            'DETECT_FOOTNOTES_FROM_OCR',
        );
    }

    /**
     * Main method to detect footnotes from OCR data
     * @param ocrData - The OCR data from Tesseract
     * @returns Array of footnote candidates
     */
    async detectFootnotes(allLines: OCRLine[]): Promise<FootnoteCandidate[]> {
        try {
            // Step 1: Detect superscripts using custom algorithm
            const superscriptResults = await this.detectSuperscriptsByBoundingBox(allLines);

            this.logger.info(
                {
                    superscriptResults,
                },
                'Superscript detection completed',
            );

            // Step 2: Extract footnote references from superscript results
            const [footnoteReferences, footnoteStarts] =
                this.divideReferencesAndStarts(superscriptResults);

            // Combine all candidates
            const candidates = [...footnoteReferences, ...footnoteStarts];

            return candidates;
        } catch (error) {
            this.logger.error(
                { error: error instanceof Error ? error.message : String(error) },
                'Error in footnote detection',
            );
            return [];
        }
    }

    /**
     * Detect superscript symbols using custom bounding box analysis
     * Falls back to custom detection when Tesseract's built-in detection fails
     */
    private async detectSuperscriptsByBoundingBox(
        allLines: OCRLine[],
    ): Promise<SuperscriptDetectionResult[]> {
        const results: SuperscriptDetectionResult[] = [];

        for (let lineIndex = 0; lineIndex < allLines.length; lineIndex++) {
            const line = allLines[lineIndex];
            if (!line || !line.words) continue;

            // Calculate normal height for this line
            const lineHeight = line.bbox.y1 - line.bbox.y0;

            // Process each word in the line
            for (let wordIndex = 0; wordIndex < line.words.length; wordIndex++) {
                const word = line.words[wordIndex];
                if (!word || !word.symbols) continue;

                // Process each symbol in the word
                for (let symbolIndex = 0; symbolIndex < word.symbols.length; symbolIndex++) {
                    const symbol = word.symbols[symbolIndex];
                    if (!symbol) continue;

                    // Check if this symbol meets superscript criteria
                    const symbolHeight = symbol.bbox.y1 - symbol.bbox.y0;
                    const isSmaller =
                        symbolHeight < lineHeight * SUPERSCRIPT_DETECTION.HEIGHT_RATIO_THRESHOLD;
                    // Use symbol's own baseline if available, otherwise fall back to line baseline
                    const isHigher =
                        symbol.baseline &&
                        symbol.bbox.y1 <
                            symbol.baseline?.y1 - SUPERSCRIPT_DETECTION.VERTICAL_OFFSET_THRESHOLD;
                    const isNumberOrAsterisk = this.isNumberOrAsterisk(symbol.text);

                    if (isSmaller && isHigher && isNumberOrAsterisk) {
                        // Get four words before this word (including the current word)
                        const fourWordsBefore = this.getFourWordsBefore(line, wordIndex);

                        results.push({
                            symbol,
                            lineIndex,
                            wordIndex,
                            fourWordsBefore,
                            text: symbol.text,
                        });
                    }
                }
            }
        }

        return results;
    }

    /**
     * Check if text is a number or asterisk (valid footnote reference)
     */
    private isNumberOrAsterisk(text: string): boolean {
        // Check for numbers (0-9)
        if (/^\d+$/.test(text)) {
            return true;
        }

        // Check for asterisks (*)
        if (/^\*+$/.test(text)) {
            return true;
        }

        return false;
    }

    /**
     * Get four words before the current word index (including the current word)
     */
    private getFourWordsBefore(line: OCRLine, currentWordIndex: number): string[] {
        if (!line.words) return [];

        const words: string[] = [];
        const startIndex = Math.max(0, currentWordIndex - 3); // Get up to 4 words (current + 3 before)

        for (let i = startIndex; i <= currentWordIndex && i < line.words.length; i++) {
            const word = line.words[i];
            if (word) {
                words.push(word.text);
            }
        }

        return words;
    }

    private divideReferencesAndStarts(
        superscriptResults: SuperscriptDetectionResult[],
    ): [FootnoteCandidate[], FootnoteCandidate[]] {
        // Divide superscriptResults into two arrays:
        // - The first array contains candidates where wordIndex === 0 and text === fourWordsBefore[0]
        // - The second array contains the rest
        const references: FootnoteCandidate[] = [];
        const starts: FootnoteCandidate[] = [];

        for (const candidate of superscriptResults) {
            if (candidate.wordIndex === 0 && candidate.text === candidate.fourWordsBefore[0]) {
                references.push(candidate);
            } else {
                starts.push(candidate);
            }
        }

        return [references, starts];
    }
}
