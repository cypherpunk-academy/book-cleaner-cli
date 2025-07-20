/**
 * Format handlers for extracting text from different file formats
 */

export { PDFHandler } from './PDFHandler';
export { EPUBHandler } from './EPUBHandler';
export { TextHandler } from './TextHandler';

// Re-export types for convenience
export type {
    TextExtractionResult,
    TextMetadata,
    TextQuality,
    QualityIssue,
    FileInfo,
} from '@/types';
