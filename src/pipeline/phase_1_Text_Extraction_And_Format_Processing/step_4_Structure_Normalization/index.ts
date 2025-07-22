/**
 * Step 1.4: Structure Recognition & Analysis
 *
 * This step analyzes document structure and identifies chapters, sections, and hierarchy:
 * - Chapter detection and recognition
 * - Heading hierarchy analysis
 * - Document structure mapping
 * - Metadata extraction from structure
 *
 * TODO: Full implementation coming in Phase 2 of development
 */

// Export the main processing classes
export { ChapterRecognizer } from "./ChapterRecognizer";

// Export interfaces
export type {
  ChapterRecognitionResult,
  Chapter,
  ChapterRecognitionOptions,
} from "./ChapterRecognizer";

// Export execution summary types and functions
export type { Step1_4ExecutionSummary } from "./ExecutionSummary";
export {
  createStep1_4ExecutionSummary,
  updateStep1_4ExecutionSummary,
  updateStep1_4ExecutionSummaryWithError,
} from "./ExecutionSummary";
