import { LOG_COMPONENTS, SUPERSCRIPT_DETECTION } from '@/constants';
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
 * Detect superscript symbols using custom bounding box analysis
 * Falls back to custom detection when Tesseract's built-in detection fails
 */
export function detectFootnoteStartFromOcr(line: OCRLine): string | null {
    // Footnote must be in the first word
    const word = line?.words?.[0] ?? null;
    if (!word) {
        return null;
    }

    // Calculate normal height for this line
    const lineHeight = line.bbox.y1 - line.bbox.y0;

    let footnoteText = '';
    // Process each symbol in the word
    for (
        let symbolIndex = 0;
        word.symbols && symbolIndex < word.symbols.length;
        symbolIndex++
    ) {
        const symbol = word.symbols[symbolIndex];
        if (!symbol) break;

        // Check if this symbol meets superscript criteria
        const symbolHeight = symbol.bbox.y1 - symbol.bbox.y0;
        const isSmaller =
            symbolHeight < lineHeight * SUPERSCRIPT_DETECTION.HEIGHT_RATIO_THRESHOLD;
        // Use symbol's own baseline if available, otherwise fall back to line baseline
        const isPositionHigher =
            symbol.baseline &&
            symbol.bbox.y1 <
                symbol.baseline?.y1 - SUPERSCRIPT_DETECTION.VERTICAL_OFFSET_THRESHOLD;
        const isNumberOrAsterisk = getNumberOrAsterisk(symbol.text);

        if (!isSmaller || !isPositionHigher || !isNumberOrAsterisk) {
            break;
        }

        footnoteText += symbol.text;
    }

    return footnoteText === '' ? null : footnoteText;
}

/**
 * Check if text is a number or asterisk (valid footnote reference)
 */
function getNumberOrAsterisk(text: string): boolean {
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
