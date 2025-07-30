/**
 * Text utility functions for text processing and normalization
 */

import { LOG_COMPONENTS } from '@/constants';
import type { LoggerService } from '@/services/LoggerService';
import { umlautCorrections } from '@/services/OCRService/commonOcrUmlaufErrors';

/**
 * Normalize text by standardizing Unicode characters, line endings, whitespace,
 * and German umlaut representations for consistent text processing
 */
export function normalizeText(text: string): string {
    return (
        text
            // Unicode normalization (NFD -> NFC) to handle different umlaut representations
            .normalize('NFC')
            .replace(/\r\n/g, '\n')
            .replace(/\r/g, '\n')
            .replace(/\s+/g, ' ')
            // Handle different umlaut representations (composed vs decomposed)
            .replace(/a\u0308/g, 'ä') // a + combining diaeresis -> ä
            .replace(/o\u0308/g, 'ö') // o + combining diaeresis -> ö
            .replace(/u\u0308/g, 'ü') // u + combining diaeresis -> ü
            .replace(/A\u0308/g, 'Ä') // A + combining diaeresis -> Ä
            .replace(/O\u0308/g, 'Ö') // O + combining diaeresis -> Ö
            .replace(/U\u0308/g, 'Ü') // U + combining diaeresis -> Ü
            .replace(/s\u0323/g, 'ß') // s + combining dot below -> ß (less common)
            .trim()
    );
}

/**
 * Remove OCR garbage artifacts from text
 * - Removes multiple spaces (> 5 consecutive spaces)
 * - Removes single characters that border left or right to spaces that are not [a-zA-ZäöüÄÖÜß]
 */
export function removeOcrGarbage(text: string): string {
    if (!text || text.length === 0) {
        return text;
    }

    let cleanedText = text;

    // Step 1: Find and remove excessive spaces (> 5 consecutive spaces)
    // Also remove single characters that border these spaces if they're not valid letters
    cleanedText = cleanedText.replace(
        /([^a-zA-ZäöüÄÖÜß])\s{6,}([^a-zA-ZäöüÄÖÜß])/g,
        '$1 $2',
    );
    cleanedText = cleanedText.replace(/([^a-zA-ZäöüÄÖÜß])\s{6,}/g, '$1 ');
    cleanedText = cleanedText.replace(/\s{6,}([^a-zA-ZäöüÄÖÜß])/g, ' $1');
    cleanedText = cleanedText.replace(/\s{6,}/g, ' ');

    // Step 2: Remove single characters that are surrounded by spaces and are not valid letters
    cleanedText = cleanedText.replace(/\s([^a-zA-ZäöüÄÖÜß])\s/g, ' ');

    // Step 3: Remove single characters at the beginning or end of text that are not valid letters
    cleanedText = cleanedText.replace(/^([^a-zA-ZäöüÄÖÜß])\s/, '');
    cleanedText = cleanedText.replace(/\s([^a-zA-ZäöüÄÖÜß])$/, '');

    // Step 4: Clean up any remaining multiple spaces (2-5 spaces)
    cleanedText = cleanedText.replace(/\s{2,}/g, ' ');

    return cleanedText.trim();
}

/**
 * Fix common German umlaut recognition errors in OCR text
 * Only targets clear OCR errors, not valid German words
 */
export function fixGermanUmlautErrors(
    text: string,
    logger?: LoggerService,
): { correctedText: string; corrections: number } {
    let correctedText = text;
    let corrections = 0;

    for (const [pattern, replacement] of umlautCorrections) {
        correctedText = correctedText.replace(pattern, replacement);

        // Count actual replacements (not just length change)
        const matches = text.match(pattern);
        if (matches) {
            corrections += matches.length;
        }
    }

    if (corrections > 0 && logger) {
        logger.info(
            LOG_COMPONENTS.PIPELINE_MANAGER,
            `Applied ${corrections} German umlaut corrections`,
            {
                corrections,
                beforeLength: text.length,
                afterLength: correctedText.length,
            },
        );
        console.log(`🔤 Fixed ${corrections} German umlaut recognition errors`);
    }

    return { correctedText, corrections };
}
