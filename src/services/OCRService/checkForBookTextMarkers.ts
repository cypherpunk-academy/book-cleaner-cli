import { LOG_COMPONENTS } from '@/constants';
import type { LoggerService } from '@/services/LoggerService';
import type { BookManifestInfo } from '@/types';
import { normalizeText } from '@/utils/TextUtils';

/**
 * Marker type for book text boundaries
 */
export type BookTextMarkerType = 'start' | 'end';

/**
 * Check if the given text contains the specified book text marker
 *
 * @param text - The text to search in
 * @param markerType - Type of marker to check for ('start' or 'end')
 * @param bookManifest - Book manifest containing boundary markers
 * @param logger - Optional logger for debugging
 * @returns True if the marker is found, false otherwise
 */
export function checkForBookTextMarker(
    text: string,
    markerType: BookTextMarkerType,
    bookManifest?: BookManifestInfo,
    logger?: LoggerService,
): boolean {
    const markerField = markerType === 'start' ? 'textBeforeFirstChapter' : 'textAfterLastChapter';
    const markerText = bookManifest?.[markerField];

    if (!markerText) {
        return false;
    }

    const normalizedText = normalizeText(text);
    const normalizedMarker = normalizeText(markerText);

    const found = normalizedText.includes(normalizedMarker);

    if (logger) {
        logger.info(LOG_COMPONENTS.PIPELINE_MANAGER, `Book text ${markerType} marker check`, {
            originalMarker: markerText,
            normalizedMarker,
            normalizedText: normalizedText.slice(-200),
            found,
        });
    }

    return found;
}

/**
 * Check if the given text contains the book text start marker
 * Uses the textBeforeFirstChapter from the book manifest
 */
export function checkForBookTextStartMarker(
    text: string,
    bookManifest?: BookManifestInfo,
    logger?: LoggerService,
): boolean {
    return checkForBookTextMarker(text, 'start', bookManifest, logger);
}

/**
 * Check if the given text contains the book text end marker
 * Uses the textAfterLastChapter from the book manifest
 */
export function checkForBookTextEndMarker(
    text: string,
    bookManifest?: BookManifestInfo,
    logger?: LoggerService,
): boolean {
    return checkForBookTextMarker(text, 'end', bookManifest, logger);
}
