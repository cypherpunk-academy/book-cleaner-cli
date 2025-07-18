/**
 * Step 1.2: Text Extraction Based on Book Structure
 *
 * This step extracts author content from files based on configured boundaries:
 * - For files with pages: uses first-author-content-page and last-author-content-page
 * - For files without pages: uses text-before-first-chapter and text-after-last-chapter
 * - Prompts user for missing boundary values
 * - Handles different file types: pdf-text, pdf-ocr, pdf-text-ocr, text, epub
 */

// Export the main text extractor class
export { TextExtractor } from "./TextExtractor";

// Export step configuration and interfaces
export { STEP_1_2_CONFIG } from "./TextExtractor";
export type { TextExtractionOptions, TextExtractionResult } from "./TextExtractor";
export type { Step1_2ExecutionSummary } from "./ExecutionSummary";

// Export utility functions
export {
  createStep1_2ExecutionSummary,
  updateStep1_2ExecutionSummary,
  updateStep1_2ExecutionSummaryWithError,
} from "./ExecutionSummary";
