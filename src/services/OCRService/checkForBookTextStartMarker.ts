import { LOG_COMPONENTS } from '@/constants';
import type { LoggerService } from '@/services/LoggerService';
import type { BookManifestInfo } from '@/types';
import { normalizeText } from '@/utils/TextUtils';

/**
 * Check if the given text contains the book text start marker
 * Uses the textBeforeFirstChapter from the book manifest
 */
export function checkForBookTextStartMarker(
    text: string,
    bookManifest?: BookManifestInfo,
    logger?: LoggerService,
): boolean {
    if (!bookManifest?.textBeforeFirstChapter) {
        return false;
    }

    const normalizedText = normalizeText(text);
    const normalizedMarker = normalizeText(bookManifest.textBeforeFirstChapter);

    const found = normalizedText.includes(normalizedMarker);

    if (logger) {
        logger.info(LOG_COMPONENTS.PIPELINE_MANAGER, 'Book text start marker check', {
            originalMarker: bookManifest.textBeforeFirstChapter,
            normalizedMarker,
            normalizedText: normalizedText.slice(-200),
            found,
        });
    }

    return found;
}
