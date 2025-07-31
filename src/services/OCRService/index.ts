export { OCRService } from './OCRService';
export type { OCRResult, OCROptions } from './OCRService';
export { GetTextAndStructureFromOcr } from './GetTextAndStructureFromOcr';
export { detectFootnoteStartFromOcr } from './detectFootnotesFromOcr';
export {
    checkForBookTextStartMarker,
    checkForBookTextEndMarker,
    checkForBookTextMarker,
    type BookTextMarkerType,
} from './checkForBookTextMarkers';
export {
    detectAndProcessHeaders,
    extractOrdinalValue,
    matchHeaderPattern,
} from './detectHeadersFromOcr';
