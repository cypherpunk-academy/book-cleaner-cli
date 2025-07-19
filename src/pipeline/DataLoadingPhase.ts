import { ERROR_CODES, LOG_COMPONENTS } from "../constants";
import type { ConfigService } from "../services/ConfigService";
import type { LoggerService } from "../services/LoggerService";
import type {
  FileFormatResult,
  FileInfo,
  PipelineState,
  ProgressCallback,
} from "../types";
import { AppError } from "../utils/AppError";
import { FileUtils } from "../utils/FileUtils";
import { AbstractPhase } from "./AbstractPhase";
import { FileFormatDetector } from "./phase_1_Text_Extraction_And_Format_Processing/step_1_File_Format_Detection_And_Validation/FileFormatDetector";
import { TextExtractor } from "./phase_1_Text_Extraction_And_Format_Processing/step_2_Text_Extraction/TextExtractor";

/**
 * Phase 1: Data Loading & Format Detection
 *
 * This phase handles:
 * - File format detection and validation
 * - Basic metadata extraction
 * - Text extraction based on book structure
 */
export class DataLoadingPhase extends AbstractPhase {
  private formatDetector: FileFormatDetector;
  private textExtractor: TextExtractor;
  private fileUtils: FileUtils;

  constructor(logger: LoggerService, configService: ConfigService) {
    super(logger);
    this.formatDetector = new FileFormatDetector(logger);
    this.textExtractor = new TextExtractor(logger, configService, "./book-artifacts");
    this.fileUtils = new FileUtils(logger);
  }

  public override getName(): string {
    return "Data Loading & Format Detection";
  }

  public override getDescription(): string {
    return "Detects file format, validates structure, and extracts text based on book structure";
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
          current: 50,
          total: 100,
          percentage: 50,
          message: "File format detected successfully",
        });
      }

      // Step 1.2: Text Extraction Based on Book Structure
      pipelineLogger.info(
        {
          pipelineId: state.id,
          format: formatResult.format,
        },
        "Starting text extraction based on book structure",
      );

      // Update progress
      if (progressCallback) {
        progressCallback({
          phase: this.getName(),
          step: "text-extraction",
          current: 60,
          total: 100,
          percentage: 60,
          message: "Extracting text based on book structure...",
        });
      }

      // Parse filename metadata
      const metadata = this.fileUtils.parseFilename(state.inputFile);

      // Determine file type
      const fileType = this.determineFileType(formatResult);

      // Extract text using TextExtractor
      const textExtractionResult = await this.textExtractor.extractText(
        fileInfo,
        {
          hasTextBoundaries: true,
          boundaries: {}, // Will be populated by TextExtractor from book structure
          fileType,
          // No outputDir - TextExtractor always uses book-artifacts directory for intermediate results
        },
        metadata,
      );

      // Update progress
      if (progressCallback) {
        progressCallback({
          phase: this.getName(),
          step: "text-extraction",
          current: 100,
          total: 100,
          percentage: 100,
          message: "Text extraction completed successfully",
        });
      }

      // Store processing results in pipeline state
      const result = {
        phase: "data_loading",
        success: true,
        data: {
          formatResult,
          textExtractionResult,
          metadata,
        },
        timestamp: new Date(),
      };

      pipelineLogger.info(
        {
          pipelineId: state.id,
          format: formatResult.format,
          confidence: formatResult.confidence,
          extractedTextLength: textExtractionResult.extractedText.length,
          textFiles: textExtractionResult.textFiles,
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

  /**
   * Determine file type based on format detection result
   */
  private determineFileType(formatResult: FileFormatResult): string {
    if (formatResult.format === "pdf") {
      // Use content type from format detection
      switch (formatResult.metadata?.contentType) {
        case "text_based":
          return "pdf-text";
        case "image_based":
          return "pdf-ocr";
        case "hybrid":
          return "pdf-text-ocr";
        default:
          return "pdf-text-ocr"; // Default to hybrid
      }
    }
    if (formatResult.format === "epub") {
      return "epub";
    }
    return "text";
  }
}
