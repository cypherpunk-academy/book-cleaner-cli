import { ERROR_CODES, LOG_COMPONENTS } from "@/constants";
import { AppError } from "@/utils/AppError";
import { FileFormatDetector } from "./phase_1_Text_Extraction_And_Format_Processing/step_1_File_Format_Detection_And_Validation/FileFormatDetector";
import { AbstractPhase } from "./AbstractPhase";
import type { LoggerService } from "@/services/LoggerService";
import type { PipelineState, ProgressCallback, FileInfo } from "@/types";

/**
 * Phase 1: Data Loading & Format Detection
 *
 * This phase handles:
 * - File format detection and validation
 * - Basic metadata extraction
 * - Initial text extraction
 */
export class DataLoadingPhase extends AbstractPhase {
  private formatDetector: FileFormatDetector;

  constructor(logger: LoggerService) {
    super(logger);
    this.formatDetector = new FileFormatDetector(logger);
  }

  public override getName(): string {
    return "Data Loading & Format Detection";
  }

  public override getDescription(): string {
    return "Detects file format, validates structure, and extracts basic metadata";
  }

  public override async execute(
    state: PipelineState,
    progressCallback?: ProgressCallback,
  ): Promise<unknown> {
    const pipelineLogger = this.logger.getPipelineLogger(
      LOG_COMPONENTS.PIPELINE_MANAGER,
    );

    try {
      pipelineLogger.info(
        {
          pipelineId: state.id,
          inputFile: state.inputFile,
        },
        "Starting data loading phase",
      );

      // Update progress
      if (progressCallback) {
        progressCallback({
          phase: this.getName(),
          step: "format-detection",
          current: 0,
          total: 100,
          percentage: 0,
          message: "Detecting file format...",
        });
      }

      // Create FileInfo object from input file path
      const fs = await import("node:fs/promises");
      const path = await import("node:path");
      const stats = await fs.stat(state.inputFile);

      const fileInfo: FileInfo = {
        path: state.inputFile,
        name: path.basename(state.inputFile),
        size: stats.size,
        format: path
          .extname(state.inputFile)
          .toLowerCase()
          .slice(1) as FileInfo["format"],
        mimeType: "application/octet-stream", // Will be detected properly
        lastModified: stats.mtime,
      };

      // Use the existing FileFormatDetector
      const formatResult = await this.formatDetector.detectFormat(fileInfo);

      // Update progress
      if (progressCallback) {
        progressCallback({
          phase: this.getName(),
          step: "format-detection",
          current: 100,
          total: 100,
          percentage: 100,
          message: "File format detected successfully",
        });
      }

      // Store results in pipeline state
      const result = {
        phase: "data_loading",
        success: true,
        data: formatResult,
        timestamp: new Date(),
      };

      pipelineLogger.info(
        {
          pipelineId: state.id,
          format: formatResult.format,
          confidence: formatResult.confidence,
        },
        "Data loading phase completed successfully",
      );

      return result;
    } catch (error) {
      pipelineLogger.error(
        {
          pipelineId: state.id,
          error: error instanceof Error ? error.message : String(error),
        },
        "Data loading phase failed",
      );

      throw new AppError(
        ERROR_CODES.PIPELINE_FAILED,
        LOG_COMPONENTS.PIPELINE_MANAGER,
        "DataLoadingPhase.execute",
        "Failed to load and process file",
        { inputFile: state.inputFile },
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }
}
