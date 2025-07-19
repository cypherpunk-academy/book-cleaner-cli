/**
 * Step 1.1: File Format Detection & Validation
 *
 * This step detects and validates file formats using comprehensive analysis:
 * - Magic number detection from file headers
 * - Extension validation and consistency checking
 * - Format-specific validation (PDF structure, EPUB integrity, etc.)
 * - File size validation and security checks
 * - Confidence scoring based on all validation results
 */

// Export the main format detector class
export { FileFormatDetector } from "./FileFormatDetector";

// Export step configuration and interfaces
export type { Step1_1ExecutionSummary } from "./ExecutionSummary";

// Export utility functions
export {
  createStep1_1ExecutionSummary,
  updateStep1_1ExecutionSummary,
  updateStep1_1ExecutionSummaryWithError,
} from "./ExecutionSummary";
