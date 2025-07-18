import { promises as fs } from "node:fs";
import * as path from "node:path";
import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline";
import * as readlinePromises from "node:readline/promises";
import * as yaml from "js-yaml";
import {
  DEFAULT_OUTPUT_DIR,
  ERROR_CODES,
  FILE_EXTENSIONS,
  LOG_COMPONENTS,
} from "../../../constants";
import { BookStructureService } from "../../../services/BookStructureService";
import type { LoggerService } from "../../../services/LoggerService";
import type { FileInfo, FilenameMetadata } from "../../../types";
import { AppError } from "../../../utils/AppError";
import { FileUtils } from "../../../utils/FileUtils";

/**
 * Step 1.2 Configuration
 */
export const STEP_1_2_CONFIG = {
  name: "Text Extraction Based on Book Structure",
  description: "Extract author content based on configured page/text boundaries",
  phase: 1,
  step: 2,
  priority: "high" as const,
  requirements: {
    formats: ["pdf", "epub", "txt"] as const,
    dependencies: ["pdf-parse", "tesseract.js"],
  },
} as const;

/**
 * Text extraction options
 */
export interface TextExtractionOptions {
  hasPages: boolean;
  boundaries: {
    firstPage?: number;
    lastPage?: number;
    textBefore?: string;
    textAfter?: string;
  };
  fileType: string;
  outputDir: string;
}

/**
 * Text extraction result
 */
export interface TextExtractionResult {
  extractedText: string;
  pagesExtracted?: number;
  textFiles: string[];
  ocrFiles?: string[];
  boundaries: {
    startFound: boolean;
    endFound: boolean;
  };
}

/**
 * Raw YAML structure for book configuration files
 */
interface RawBookStructureYaml {
  author?: string;
  title?: string;
  "book-index"?: string;
  "text-before-first-chapter"?: string;
  "text-after-last-chapter"?: string;
  "first-author-content-page"?: number;
  "last-author-content-page"?: number;
  original?: Array<{
    type?: string;
    size?: number;
    pages?: number;
  }>;
  [key: string]: unknown;
}

/**
 * Service for extracting text based on book structure configuration
 */
export class TextExtractor {
  private readonly logger: LoggerService;
  private readonly bookStructureService: BookStructureService;
  private readonly configDir: string;

  constructor(logger: LoggerService, configDir = "./book-structure") {
    this.logger = logger;
    this.configDir = configDir;
    this.bookStructureService = new BookStructureService(logger, configDir);
  }

  /**
   * Extract text from file based on book structure configuration
   */
  public async extractText(
    fileInfo: FileInfo,
    metadata: FilenameMetadata,
    options: TextExtractionOptions,
  ): Promise<TextExtractionResult> {
    const extractionLogger = this.logger.getTextExtractionLogger(
      LOG_COMPONENTS.PIPELINE_MANAGER,
    );

    extractionLogger.info(
      {
        filename: fileInfo.name,
        format: fileInfo.format,
        hasPages: options.hasPages,
        boundaries: options.boundaries,
      },
      "Starting text extraction based on book structure",
    );

    try {
      // Check and prompt for missing boundaries
      const updatedOptions = await this.checkAndPromptBoundaries(metadata, options);

      // Extract text based on file type
      const result = await this.performTextExtraction(fileInfo, updatedOptions);

      // Save extracted text to results directory
      await this.saveResults(fileInfo, metadata, result, updatedOptions);

      return result;
    } catch (error) {
      throw new AppError(
        ERROR_CODES.EXTRACTION_FAILED,
        LOG_COMPONENTS.PIPELINE_MANAGER,
        "extractText",
        `Failed to extract text from ${fileInfo.name}`,
        { filename: fileInfo.name, format: fileInfo.format },
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  /**
   * Check for missing boundaries and prompt user if needed
   */
  private async checkAndPromptBoundaries(
    metadata: FilenameMetadata,
    options: TextExtractionOptions,
  ): Promise<TextExtractionOptions> {
    const configKey = this.getConfigKey(metadata);
    const configPath = path.join(this.configDir, `${configKey}.yaml`);

    // Load the current YAML configuration
    let config: RawBookStructureYaml = {};
    try {
      const configContent = await fs.readFile(configPath, "utf-8");
      config = yaml.load(configContent) as RawBookStructureYaml;
    } catch {
      // Config file doesn't exist, will be created
    }

    let needsUpdate = false;
    const updatedOptions = { ...options };

    if (options.hasPages) {
      // Check for page-based boundaries
      if (!config["first-author-content-page"] || !config["last-author-content-page"]) {
        // Prompt for boundaries
        const { firstPage, lastPage } = await this.promptWithSpinnerPause(
          () => this.promptForPageBoundaries(metadata),
          metadata,
        );
        config["first-author-content-page"] = firstPage;
        config["last-author-content-page"] = lastPage;
        updatedOptions.boundaries.firstPage = firstPage;
        updatedOptions.boundaries.lastPage = lastPage;
        needsUpdate = true;
      } else {
        updatedOptions.boundaries.firstPage = config["first-author-content-page"];
        updatedOptions.boundaries.lastPage = config["last-author-content-page"];
      }
    } else {
      // Check for text-based boundaries
      if (!config["text-before-first-chapter"] || !config["text-after-last-chapter"]) {
        const { textBefore, textAfter } = await this.promptWithSpinnerPause(
          () => this.promptForTextBoundaries(metadata),
          metadata,
        );
        config["text-before-first-chapter"] = textBefore;
        config["text-after-last-chapter"] = textAfter;
        updatedOptions.boundaries.textBefore = textBefore;
        updatedOptions.boundaries.textAfter = textAfter;
        needsUpdate = true;
      } else {
        updatedOptions.boundaries.textBefore = config["text-before-first-chapter"];
        updatedOptions.boundaries.textAfter = config["text-after-last-chapter"];
      }
    }

    // Save updated configuration if needed
    if (needsUpdate) {
      await this.saveBookStructureConfig(configPath, config);
    }

    return updatedOptions;
  }

  /**
   * Execute interactive prompts now that spinner is removed
   */
  private async promptWithSpinnerPause<T>(
    promptFn: () => Promise<T>,
    _metadata: FilenameMetadata,
  ): Promise<T> {
    // Now that spinner is removed, we can use interactive prompts
    return await promptFn();
  }

  /**
   * Prompt user for page boundaries
   */
  private async promptForPageBoundaries(
    metadata: FilenameMetadata,
  ): Promise<{ firstPage: number; lastPage: number }> {
    // Flush any pending output and create a clean prompt environment
    await new Promise((resolve) => setTimeout(resolve, 100));

    console.log(`\n📖 Book: ${metadata.author} - ${metadata.title}`);
    console.log(
      "📄 This file has pages. Please specify the author content boundaries:",
    );

    const rl = readlinePromises.createInterface({
      input,
      output,
    });

    try {
      const firstPageStr = await rl.question("First author content page: ");
      const lastPageStr = await rl.question("Last author content page: ");

      const firstPage = Number.parseInt(firstPageStr, 10) || 1;
      const lastPage = Number.parseInt(lastPageStr, 10) || 100;

      return { firstPage, lastPage };
    } finally {
      rl.close();
    }
  }

  /**
   * Prompt user for text boundaries
   */
  private async promptForTextBoundaries(
    metadata: FilenameMetadata,
  ): Promise<{ textBefore: string; textAfter: string }> {
    // Flush any pending output and create a clean prompt environment
    await new Promise((resolve) => setTimeout(resolve, 100));

    console.log(`\n📖 Book: ${metadata.author} - ${metadata.title}`);
    console.log("📝 This file has no pages. Please specify the text boundaries:");

    const rl = readlinePromises.createInterface({
      input,
      output,
    });

    try {
      const textBefore = await rl.question("Text before first chapter: ");
      const textAfter = await rl.question("Text after last chapter: ");

      return { textBefore, textAfter };
    } finally {
      rl.close();
    }
  }

  /**
   * Perform text extraction based on file type and boundaries
   */
  private async performTextExtraction(
    fileInfo: FileInfo,
    options: TextExtractionOptions,
  ): Promise<TextExtractionResult> {
    const fileType = options.fileType;

    switch (fileType) {
      case "pdf-text":
        return this.extractFromPdfText(fileInfo, options);
      case "pdf-ocr":
        return this.extractFromPdfOcr(fileInfo, options);
      case "pdf-text-ocr":
        return this.extractFromPdfTextOcr(fileInfo, options);
      case "text":
        return this.extractFromText(fileInfo, options);
      case "epub":
        return this.extractFromEpub(fileInfo, options);
      default:
        throw new AppError(
          ERROR_CODES.EXTRACTION_FAILED,
          LOG_COMPONENTS.PIPELINE_MANAGER,
          "performTextExtraction",
          `Unsupported file type: ${fileType}`,
          {
            fileType,
            supportedTypes: ["pdf-text", "pdf-ocr", "pdf-text-ocr", "text", "epub"],
          },
        );
    }
  }

  /**
   * Extract text from PDF (text-based)
   */
  private async extractFromPdfText(
    fileInfo: FileInfo,
    options: TextExtractionOptions,
  ): Promise<TextExtractionResult> {
    const pdfParse = await import("pdf-parse");
    const buffer = await fs.readFile(fileInfo.path);
    const pdfData = await pdfParse.default(buffer);

    let extractedText = pdfData.text;

    if (
      options.hasPages &&
      options.boundaries.firstPage &&
      options.boundaries.lastPage
    ) {
      // Extract specific pages - simplified implementation
      const lines = extractedText.split("\n");
      const totalLines = lines.length;
      const startLine = Math.floor(
        ((options.boundaries.firstPage - 1) / pdfData.numpages) * totalLines,
      );
      const endLine = Math.floor(
        (options.boundaries.lastPage / pdfData.numpages) * totalLines,
      );
      extractedText = lines.slice(startLine, endLine).join("\n");
    }

    return {
      extractedText,
      pagesExtracted:
        options.boundaries.lastPage && options.boundaries.firstPage
          ? options.boundaries.lastPage - options.boundaries.firstPage + 1
          : pdfData.numpages,
      textFiles: [],
      boundaries: {
        startFound: true,
        endFound: true,
      },
    };
  }

  /**
   * Extract text from PDF (OCR-based)
   */
  private async extractFromPdfOcr(
    fileInfo: FileInfo,
    options: TextExtractionOptions,
  ): Promise<TextExtractionResult> {
    // Simplified OCR implementation - in production, would use Tesseract.js
    const extractedText = `[OCR Content from ${fileInfo.name}]\n\nThis is placeholder OCR text extracted from pages ${options.boundaries.firstPage || 1} to ${options.boundaries.lastPage || "end"}.`;

    const result: TextExtractionResult = {
      extractedText,
      textFiles: [],
      ocrFiles: [],
      boundaries: {
        startFound: true,
        endFound: true,
      },
    };

    if (options.boundaries.lastPage && options.boundaries.firstPage) {
      result.pagesExtracted =
        options.boundaries.lastPage - options.boundaries.firstPage + 1;
    }

    return result;
  }

  /**
   * Extract text from PDF (hybrid text + OCR)
   */
  private async extractFromPdfTextOcr(
    fileInfo: FileInfo,
    options: TextExtractionOptions,
  ): Promise<TextExtractionResult> {
    const textResult = await this.extractFromPdfText(fileInfo, options);
    const _ocrResult = await this.extractFromPdfOcr(fileInfo, options);

    const result: TextExtractionResult = {
      extractedText: textResult.extractedText,
      textFiles: [],
      ocrFiles: [],
      boundaries: {
        startFound: textResult.boundaries.startFound,
        endFound: textResult.boundaries.endFound,
      },
    };

    if (textResult.pagesExtracted !== undefined) {
      result.pagesExtracted = textResult.pagesExtracted;
    }

    return result;
  }

  /**
   * Extract text from text file
   */
  private async extractFromText(
    fileInfo: FileInfo,
    options: TextExtractionOptions,
  ): Promise<TextExtractionResult> {
    let extractedText = await fs.readFile(fileInfo.path, "utf-8");

    if (options.boundaries.textBefore || options.boundaries.textAfter) {
      const startMarker = options.boundaries.textBefore;
      const endMarker = options.boundaries.textAfter;

      let startIndex = 0;
      let endIndex = extractedText.length;

      if (startMarker) {
        const foundStart = extractedText.indexOf(startMarker);
        if (foundStart !== -1) {
          startIndex = foundStart + startMarker.length;
        }
      }

      if (endMarker) {
        const foundEnd = extractedText.indexOf(endMarker, startIndex);
        if (foundEnd !== -1) {
          endIndex = foundEnd;
        }
      }

      extractedText = extractedText.slice(startIndex, endIndex);
    }

    return {
      extractedText,
      textFiles: [],
      boundaries: {
        startFound:
          !options.boundaries.textBefore ||
          extractedText.includes(options.boundaries.textBefore),
        endFound:
          !options.boundaries.textAfter ||
          extractedText.includes(options.boundaries.textAfter),
      },
    };
  }

  /**
   * Extract text from EPUB file
   */
  private async extractFromEpub(
    fileInfo: FileInfo,
    options: TextExtractionOptions,
  ): Promise<TextExtractionResult> {
    // Simplified EPUB implementation - in production, would use epub parser
    const extractedText = `[EPUB Content from ${fileInfo.name}]\n\nThis is placeholder EPUB text extracted between "${options.boundaries.textBefore || "start"}" and "${options.boundaries.textAfter || "end"}".`;

    return {
      extractedText,
      textFiles: [],
      boundaries: {
        startFound: true,
        endFound: true,
      },
    };
  }

  /**
   * Save extraction results to files
   */
  private async saveResults(
    fileInfo: FileInfo,
    metadata: FilenameMetadata,
    result: TextExtractionResult,
    options: TextExtractionOptions,
  ): Promise<void> {
    const outputDir = options.outputDir || DEFAULT_OUTPUT_DIR;
    await fs.mkdir(outputDir, { recursive: true });

    const baseFilename = `${metadata.author}#${metadata.title}${metadata.bookIndex ? `#${metadata.bookIndex}` : ""}_phase1_step2`;

    // Save main text file
    const textFilePath = path.join(outputDir, `${baseFilename}.txt`);
    await fs.writeFile(textFilePath, result.extractedText, "utf-8");
    result.textFiles.push(textFilePath);

    // Save OCR file if applicable
    if (options.fileType === "pdf-text-ocr" && result.ocrFiles) {
      const ocrFilePath = path.join(outputDir, `${baseFilename}.ocr`);
      await fs.writeFile(ocrFilePath, result.extractedText, "utf-8");
      result.ocrFiles.push(ocrFilePath);
    }

    const extractionLogger = this.logger.getTextExtractionLogger(
      LOG_COMPONENTS.PIPELINE_MANAGER,
    );

    extractionLogger.info(
      {
        filename: fileInfo.name,
        textFile: textFilePath,
        ocrFile: result.ocrFiles?.[0],
        extractedLength: result.extractedText.length,
      },
      "Text extraction results saved",
    );
  }

  /**
   * Save book structure configuration
   */
  private async saveBookStructureConfig(
    configPath: string,
    config: RawBookStructureYaml,
  ): Promise<void> {
    const yamlContent = yaml.dump(config, {
      indent: 2,
      lineWidth: 120,
      noRefs: true,
    });

    await fs.writeFile(configPath, yamlContent, "utf-8");

    const configLogger = this.logger.getConfigLogger(LOG_COMPONENTS.CONFIG_SERVICE);
    configLogger.info(
      {
        configPath,
        author: config.author,
        title: config.title,
      },
      "Book structure configuration updated",
    );
  }

  /**
   * Get configuration key from metadata
   */
  private getConfigKey(metadata: FilenameMetadata): string {
    return FileUtils.generateConfigKey(metadata);
  }
}
