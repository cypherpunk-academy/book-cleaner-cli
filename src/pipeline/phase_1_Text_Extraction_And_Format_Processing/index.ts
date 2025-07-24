/**
 * Phase 1: Text Extraction & Format Processing
 *
 * This phase handles all aspects of text extraction and format processing:
 * - File format detection and validation
 * - Text extraction based on book structure
 * - OCR integration for image-based content (Phase 2)
 * - Structure recognition and analysis (Phase 2)
 */

// Export phase-level types and utilities
export type { Phase1ExecutionSummary } from './PhaseExecutionSummary';
export {
    createPhase1ExecutionSummary,
    updatePhase1ExecutionSummary,
    updatePhase1ExecutionSummaryWithStep,
    updatePhase1ExecutionSummaryWithError,
} from './PhaseExecutionSummary';

// Export all step implementations
export * from './step_1_File_Format_Detection_And_Validation';
export * from './step_2_Text_Extraction';
export * from './step_3_Text_Auto_Correction';
export * from './step_4_Structure_Normalization';
export * from './step_5_Convert_Footnotes_To_Endnotes';
export * from './step_6_OCR_Text_Quality_Enhancement';
