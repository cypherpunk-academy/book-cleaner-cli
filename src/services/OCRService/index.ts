export { OCRService } from './OCRService';
export type { OCRResult, OCROptions } from './OCRService';
export { GetTextAndStructureFromOcr } from './GetTextAndStructureFromOcr';
export { detectFootnoteStartFromOcr } from './detectFootnotesFromOcr';
export { checkForBookTextStartMarker } from './checkForBookTextStartMarker';
export {
    detectAndProcessHeaders,
    extractOrdinalValue,
    matchHeaderPattern,
} from './detectHeadersFromOcr';
