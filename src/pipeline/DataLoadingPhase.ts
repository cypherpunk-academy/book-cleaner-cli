import { ERROR_CODES, LOG_COMPONENTS } from "../constants";
import type { BookStructureService } from "../services/BookStructureService";
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
import { TextEnhancer } from "./phase_1_Text_Extraction_And_Format_Processing/step_3_Text_Auto_Correction/TextEnhancer";

/**
 * Phase 1: Data Loading & Format Detection
 *
 * This phase handles:
 * - Step 1: File format detection and validation
 * - Step 2: Text extraction based on book structure
 * - Step 3: Text quality enhancement
 */
export class DataLoadingPhase extends AbstractPhase {
  private formatDetector: FileFormatDetector;
  private textExtractor: TextExtractor;
  private textEnhancer: TextEnhancer;
  private fileUtils: FileUtils;
  private bookStructureService: BookStructureService;

  constructor(
    logger: LoggerService,
    configService: ConfigService,
    bookStructureService: BookStructureService,
  ) {
    super(logger);
    this.formatDetector = new FileFormatDetector(logger);
    this.textExtractor = new TextExtractor(
      logger,
      configService,
      "./book-artifacts",
      bookStructureService,
    );
    this.textEnhancer = new TextEnhancer(logger, configService);
    this.fileUtils = new FileUtils(logger);
    this.bookStructureService = bookStructureService;
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
          step: "step-1-format-detection",
          current: 0,
          total: 100,
          percentage: 0,
          message: "Step 1: Detecting file format...",
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
          step: "step-1-format-detection",
          current: 50,
          total: 100,
          percentage: 50,
          message: "Step 1: File format detected successfully",
        });
      }

      // Step 2: Text Extraction Based on Book Structure
      pipelineLogger.info(
        {
          pipelineId: state.id,
          format: formatResult.format,
        },
        "Starting Step 2: Text extraction based on book structure",
      );

      // Update progress
      if (progressCallback) {
        progressCallback({
          phase: this.getName(),
          step: "step-2-text-extraction",
          current: 60,
          total: 100,
          percentage: 60,
          message: "Step 2: Extracting text based on book structure...",
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
        state.bookType,
      );

      // Update progress
      if (progressCallback) {
        progressCallback({
          phase: this.getName(),
          step: "step-2-text-extraction",
          current: 80,
          total: 100,
          percentage: 80,
          message: "Step 2: Text extraction completed successfully",
        });
      }

      // Step 3: Text Quality Enhancement
      pipelineLogger.info(
        {
          pipelineId: state.id,
        },
        "Starting Step 3: Text Quality Enhancement",
      );

      // Update progress
      if (progressCallback) {
        progressCallback({
          phase: this.getName(),
          step: "step-3-text-quality-enhancement",
          current: 85,
          total: 100,
          percentage: 85,
          message: "Step 3: Enhancing text quality...",
        });
      }

      // Get manifest path for text enhancement
      const manifestPath = this.bookStructureService.getManifestPath(metadata);

      // Read the extracted text files
      const configKey = this.getConfigKey(metadata);
      const bookArtifactsDir = "./book-artifacts";
      const bookDir = `${bookArtifactsDir}/${configKey}`;
      const phase1Dir = `${bookDir}/phase1`;
      const step2TxtPath = `${phase1Dir}/step2.txt`;
      const step2OcrPath = `${phase1Dir}/step2.ocr`;

      let txtContent = "";
      let ocrContent = "";

      try {
        txtContent = await fs.readFile(step2TxtPath, "utf-8");
      } catch (_error) {
        pipelineLogger.warn(
          { pipelineId: state.id, path: step2TxtPath },
          "Could not read step2.txt file",
        );
      }

      try {
        ocrContent = await fs.readFile(step2OcrPath, "utf-8");
      } catch (_error) {
        pipelineLogger.debug(
          { pipelineId: state.id, path: step2OcrPath },
          "No step2.ocr file found (this is normal for non-OCR texts)",
        );
      }

      // Process text with Text Quality Enhancement
      let enhancedTextResult:
        | import(
            "./phase_1_Text_Extraction_And_Format_Processing/step_3_Text_Auto_Correction/TextEnhancer",
          ).TextPreprocessingResult
        | null = null;
      let enhancedOcrResult:
        | import(
            "./phase_1_Text_Extraction_And_Format_Processing/step_3_Text_Auto_Correction/TextEnhancer",
          ).TextPreprocessingResult
        | null = null;

      if (txtContent) {
        enhancedTextResult = await this.textEnhancer.preprocessText(
          txtContent,
          manifestPath,
        );

        // Save enhanced text
        const step3TxtPath = `${phase1Dir}/step3.txt`;
        await fs.writeFile(step3TxtPath, enhancedTextResult.processedText, "utf-8");
        pipelineLogger.info(
          {
            pipelineId: state.id,
            path: step3TxtPath,
            length: enhancedTextResult.processedText.length,
          },
          "Saved enhanced text to step3.txt",
        );
      }

      if (ocrContent) {
        enhancedOcrResult = await this.textEnhancer.preprocessText(
          ocrContent,
          manifestPath,
        );

        // Save enhanced OCR
        const step3OcrPath = `${phase1Dir}/step3.ocr`;
        await fs.writeFile(step3OcrPath, enhancedOcrResult.processedText, "utf-8");
        pipelineLogger.info(
          {
            pipelineId: state.id,
            path: step3OcrPath,
            length: enhancedOcrResult.processedText.length,
          },
          "Saved enhanced OCR to step3.ocr",
        );
      }

      // Update progress
      if (progressCallback) {
        progressCallback({
          phase: this.getName(),
          step: "step-3-text-quality-enhancement",
          current: 100,
          total: 100,
          percentage: 100,
          message: "Step 3: Text quality enhancement completed successfully",
        });
      }

      pipelineLogger.info(
        {
          pipelineId: state.id,
          txtEnhanced: !!enhancedTextResult,
          ocrEnhanced: !!enhancedOcrResult,
        },
        "Step 3: Text Quality Enhancement completed successfully",
      );

      // Store processing results in pipeline state
      const result = {
        phase: "data_loading",
        success: true,
        data: {
          formatResult,
          textExtractionResult,
          textEnhancementResult: {
            txtEnhanced: enhancedTextResult || null,
            ocrEnhanced: enhancedOcrResult || null,
          },
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
          ocrTextLength: textExtractionResult.ocrText?.length || 0,
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

  /**
   * Generate configuration key for book-specific directory
   */
  private getConfigKey(metadata: {
    author: string;
    title: string;
    bookIndex?: string;
  }): string {
    const { author, title, bookIndex } = metadata;
    return `${author}#${title}${bookIndex ? `#${bookIndex}` : ""}`;
  }
}
