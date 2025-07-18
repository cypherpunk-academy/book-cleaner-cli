import { v4 as uuidv4 } from "uuid";
import type { TextExtractionResult } from "./TextExtractor";

/**
 * Step 1.2 Execution Summary
 */
export interface Step1_2ExecutionSummary {
  stepName: string;
  stepId: string;
  startTime: Date;
  endTime?: Date;
  duration?: number;
  status: "pending" | "running" | "completed" | "failed";
  input: {
    filePath: string;
    fileSize: number;
    fileType: string;
    hasPages: boolean;
    boundaries: {
      firstPage?: number;
      lastPage?: number;
      textBefore?: string;
      textAfter?: string;
    };
  };
  output?: {
    extractedTextLength: number;
    pagesExtracted?: number;
    textFiles: string[];
    ocrFiles?: string[];
    boundaries: {
      startFound: boolean;
      endFound: boolean;
    };
  };
  metrics?: {
    extractionTimeMs: number;
    charactersProcessed: number;
    compressionRatio: number;
  };
  error?: string;
}

/**
 * Create a step execution summary
 */
export function createStep1_2ExecutionSummary(
  filePath: string,
  fileSize: number,
  fileType: string,
  hasPages: boolean,
  boundaries: {
    firstPage?: number;
    lastPage?: number;
    textBefore?: string;
    textAfter?: string;
  },
): Step1_2ExecutionSummary {
  return {
    stepName: "Text Extraction Based on Book Structure",
    stepId: uuidv4(),
    startTime: new Date(),
    status: "pending",
    input: {
      filePath,
      fileSize,
      fileType,
      hasPages,
      boundaries,
    },
  };
}

/**
 * Update execution summary with results
 */
export function updateStep1_2ExecutionSummary(
  summary: Step1_2ExecutionSummary,
  result: TextExtractionResult,
  extractionTimeMs: number,
): Step1_2ExecutionSummary {
  const endTime = new Date();
  const duration = endTime.getTime() - summary.startTime.getTime();

  // Build output object conditionally to respect exactOptionalPropertyTypes
  const output: Step1_2ExecutionSummary["output"] = {
    extractedTextLength: result.extractedText.length,
    textFiles: result.textFiles,
    boundaries: {
      startFound: result.boundaries.startFound,
      endFound: result.boundaries.endFound,
    },
  };

  // Only include optional properties if they have values
  if (result.pagesExtracted !== undefined) {
    output.pagesExtracted = result.pagesExtracted;
  }
  if (result.ocrFiles !== undefined) {
    output.ocrFiles = result.ocrFiles;
  }

  return {
    ...summary,
    endTime,
    duration,
    status: "completed",
    output,
    metrics: {
      extractionTimeMs,
      charactersProcessed: result.extractedText.length,
      compressionRatio: result.extractedText.length / summary.input.fileSize,
    },
  };
}

/**
 * Update execution summary with error
 */
export function updateStep1_2ExecutionSummaryWithError(
  summary: Step1_2ExecutionSummary,
  error: Error,
): Step1_2ExecutionSummary {
  const endTime = new Date();
  const duration = endTime.getTime() - summary.startTime.getTime();

  return {
    ...summary,
    endTime,
    duration,
    status: "failed",
    error: error.message,
  };
}
