/**
 * Step 1.2: Text Extraction + OCR Processing
 *
 * This step extracts clean text from files using any necessary method:
 * - For files with pages: uses first-author-content-page and last-author-content-page
 * - For files without pages: uses text-before-first-chapter and text-after-last-chapter
 * - Prompts user for missing boundary values
 * - Handles different file types: pdf-text, pdf-ocr, pdf-text-ocr, text, epub
 * - Performs OCR processing when needed using integrated OCR service
 * - Outputs clean text files ready for further processing
 */

// Export the main text extractor class
export { TextExtractor } from './TextExtractor';

// Export OCR service (now moved to services/OCRService)
export { OCRService } from '@/services/OCRService';

// Export step configuration and interfaces
export type { TextExtractionOptions, TextExtractionResult } from './TextExtractor';
export type { Step1_2ExecutionSummary } from './ExecutionSummary';

// Export OCR interfaces
export type { OCRResult, OCROptions } from '@/services/OCRService';

// Export utility functions
export {
    createStep1_2ExecutionSummary,
    updateStep1_2ExecutionSummary,
    updateStep1_2ExecutionSummaryWithError,
} from './ExecutionSummary';
