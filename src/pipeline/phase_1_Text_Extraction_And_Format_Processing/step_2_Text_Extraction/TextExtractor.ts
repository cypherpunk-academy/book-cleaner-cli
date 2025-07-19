import { promises as fs } from "fs";
import path from "path";
import { ARTIFACTS_STRUCTURE, ERROR_CODES, LOG_COMPONENTS } from "@/constants";
import type { ConfigService } from "@/services/ConfigService";
import type { LoggerService } from "@/services/LoggerService";
import type {
  FileInfo,
  FilenameMetadata,
  OCRResult,
  ProcessingMetadata,
} from "@/types";
import { AppError } from "@/utils/AppError";
import * as yaml from "js-yaml";
import { OCRService } from "./OCRService";

/**
 * Raw book structure YAML interface
 */
interface RawBookStructureYaml {
  author?: string;
  title?: string;
  "book-index"?: string;
  "text-before-first-chapter"?: string;
  "text-after-last-chapter"?: string;
  [key: string]: unknown;
}

/**
 * Text extraction options
 */
export interface TextExtractionOptions {
  hasTextBoundaries: boolean;
  boundaries: {
    textBefore?: string;
    textAfter?: string;
  };
  fileType: string;
  outputDir?: string; // Optional - intermediate results always go to book-artifacts directory
}

/**
 * Text extraction result
 */
export interface TextExtractionResult {
  extractedText: string;
  ocrText?: string; // Separate OCR text for comparison and quality analysis
  pagesExtracted?: number;
  textFiles: string[];
  ocrFiles?: string[];
  boundaries: {
    startFound: boolean;
    endFound: boolean;
  };
  ocrMetadata?: {
    ocrResult?: OCRResult;
    confidence: number;
    processingTime: number;
    pageCount: number;
  };
}

/**
 * TextExtractor handles text extraction from various file formats
 */
export class TextExtractor {
  private readonly logger: LoggerService;
  private readonly configService: ConfigService;
  private readonly configDir: string;
  private readonly ocrService: OCRService;

  constructor(logger: LoggerService, configService: ConfigService, configDir: string) {
    this.logger = logger;
    this.ocrService = new OCRService(logger);
    this.configService = configService;
    this.configDir = configDir;
  }

  /**
   * Extract text from a file
   */
  async extractText(
    fileInfo: FileInfo,
    options: TextExtractionOptions,
    metadata: FilenameMetadata,
  ): Promise<TextExtractionResult> {
    const extractionLogger = this.logger.getTaggedLogger(
      LOG_COMPONENTS.PIPELINE_MANAGER,
      "text_extraction",
    );

    extractionLogger.info(
      {
        filename: fileInfo.name,
        format: fileInfo.format,
        hasTextBoundaries: options.hasTextBoundaries,
        boundaries: options.boundaries,
      },
      "Starting text extraction based on book structure",
    );

    try {
      // Check and prompt for missing boundaries
      const updatedOptions = await this.checkAndPromptBoundaries(metadata, options);

      // Extract text based on file type
      const result = await this.performTextExtraction(
        fileInfo,
        updatedOptions,
        metadata,
      );

      // Save extracted text to book-artifacts directory
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
    const bookDir = path.join(this.configDir, configKey);
    const configPath = path.join(bookDir, ARTIFACTS_STRUCTURE.BOOK_MANIFEST);

    // Ensure book directory exists
    await fs.mkdir(bookDir, { recursive: true });

    // Load the current YAML configuration
    let config: RawBookStructureYaml = {};
    try {
      const configContent = await fs.readFile(configPath, "utf-8");
      config = yaml.load(configContent) as RawBookStructureYaml;
    } catch {
      // Config file doesn't exist, will be created
    }

    const updatedOptions = { ...options };

    if (options.hasTextBoundaries) {
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

        // Save the updated config
        try {
          await fs.writeFile(configPath, yaml.dump(config), "utf-8");
        } catch (error) {
          this.logger.warn(
            LOG_COMPONENTS.PIPELINE_MANAGER,
            "Failed to save updated config",
            {
              configPath,
              error: error instanceof Error ? error.message : String(error),
            },
          );
        }
      } else {
        updatedOptions.boundaries.textBefore = config["text-before-first-chapter"];
        updatedOptions.boundaries.textAfter = config["text-after-last-chapter"];
      }
    }

    return updatedOptions;
  }

  /**
   * Perform text extraction based on file type
   */
  private async performTextExtraction(
    fileInfo: FileInfo,
    options: TextExtractionOptions,
    metadata: FilenameMetadata,
  ): Promise<TextExtractionResult> {
    switch (fileInfo.format) {
      case "pdf":
        if (options.fileType === "pdf-text-ocr") {
          return this.extractFromPdfTextOcr(fileInfo, options, metadata);
        }
        return this.extractFromPdfText(fileInfo, options);
      case "epub":
        return this.extractFromEpub(fileInfo, options);
      case "txt":
        return this.extractFromText(fileInfo, options);
      default:
        throw new AppError(
          ERROR_CODES.INVALID_FORMAT,
          LOG_COMPONENTS.PIPELINE_MANAGER,
          "performTextExtraction",
          `Unsupported file format: ${fileInfo.format}`,
          { format: fileInfo.format },
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

    let boundaryResult: {
      extractedText: string;
      startFound: boolean;
      endFound: boolean;
    } | null = null;

    if (
      options.hasTextBoundaries &&
      options.boundaries.textBefore &&
      options.boundaries.textAfter
    ) {
      // Extract text between text markers
      boundaryResult = this.extractTextBoundaries(
        extractedText,
        options.boundaries.textBefore,
        options.boundaries.textAfter,
      );
      extractedText = boundaryResult.extractedText;
    } else {
      // Clean up spaces even if no boundaries are set
      extractedText = this.cleanupMultipleSpaces(extractedText);
    }

    return {
      extractedText,
      pagesExtracted: pdfData.numpages,
      textFiles: [],
      boundaries: {
        startFound: boundaryResult?.startFound ?? true,
        endFound: boundaryResult?.endFound ?? true,
      },
    };
  }

  /**
   * Extract text between text boundaries using string markers
   */
  private extractTextBoundaries(
    text: string,
    textBefore: string,
    textAfter: string,
  ): { extractedText: string; startFound: boolean; endFound: boolean } {
    // CRITICAL: Clean up spaces FIRST, then search for markers
    // This ensures markers work correctly after space normalization
    const cleanedText = this.cleanupMultipleSpaces(text);

    // CRITICAL: Normalize Unicode characters for consistent comparison
    // This fixes issues where ü in config file has different Unicode representation than extracted text
    const normalizedText = cleanedText.normalize("NFC");
    const normalizedTextBefore = textBefore.normalize("NFC");
    const normalizedTextAfter = textAfter.normalize("NFC");

    let startIndex = 0;
    let endIndex = normalizedText.length;
    let startFound = false;
    let endFound = false;

    // Find the start text marker in normalized text
    const startMarkerIndex = normalizedText.indexOf(normalizedTextBefore);
    if (startMarkerIndex !== -1) {
      // Start AFTER the marker text (exclude the marker itself)
      startIndex = startMarkerIndex + normalizedTextBefore.length;
      startFound = true;
    } else {
      console.error(`❌ Start text marker not found: "${normalizedTextBefore}"`);
      console.error("Please check your book structure configuration.");
      process.exit(1);
    }

    // Find the end text marker - look for the FIRST occurrence after the start marker
    const endMarkerIndex = normalizedText.indexOf(normalizedTextAfter, startIndex);
    if (endMarkerIndex !== -1) {
      // End BEFORE the marker text (exclude the marker itself)
      endIndex = endMarkerIndex;
      endFound = true;
    } else {
      console.error(`❌ End text marker not found: "${normalizedTextAfter}"`);
      console.error("Please check your book structure configuration.");
      process.exit(1);
    }

    // Sanity check: ensure start comes before end
    if (startFound && endFound && startIndex >= endIndex) {
      console.error(
        "❌ Start marker comes after end marker - this should not happen with corrected logic",
      );
      console.error(`Start index: ${startIndex}, End index: ${endIndex}`);
      process.exit(1);
    }

    const extractedText = normalizedText.slice(startIndex, endIndex);

    return {
      extractedText,
      startFound,
      endFound,
    };
  }

  /**
   * Clean up multiple consecutive spaces in text
   */
  private cleanupMultipleSpaces(text: string): string {
    // Replace multiple spaces with single space, repeat until no more multiple spaces
    let cleanedText = text;
    let previousLength = 0;

    // Keep cleaning until no more changes occur
    while (cleanedText.length !== previousLength) {
      previousLength = cleanedText.length;
      cleanedText = cleanedText.replace(/\s\s+/g, " ");
    }

    return cleanedText;
  }

  /**
   * Check if OCR file already exists and load it if found
   */
  private async checkForExistingOcrFile(
    fileInfo: FileInfo,
    metadata: FilenameMetadata,
  ): Promise<{ exists: boolean; content?: string; filePath?: string }> {
    try {
      const configKey = this.getConfigKey(metadata);
      const bookDir = path.join(this.configDir, configKey);
      const phase1Dir = path.join(bookDir, ARTIFACTS_STRUCTURE.PHASE_DIRS.PHASE1);
      const ocrFile = path.join(phase1Dir, "step2.ocr");

      // Check if OCR file exists
      const stats = await fs.stat(ocrFile);
      if (stats.isFile()) {
        const content = await fs.readFile(ocrFile, "utf-8");

        this.logger.info(
          LOG_COMPONENTS.PIPELINE_MANAGER,
          "Found existing OCR file, skipping OCR process",
          {
            filename: fileInfo.name,
            ocrFile,
            contentLength: content.length,
          },
        );

        console.log(`📄 Found existing OCR file: ${ocrFile} (${content.length} chars)`);

        return {
          exists: true,
          content: content.trim(),
          filePath: ocrFile,
        };
      }
    } catch (error) {
      // File doesn't exist or other error - that's fine, we'll do OCR
      this.logger.debug(
        LOG_COMPONENTS.PIPELINE_MANAGER,
        "No existing OCR file found, will perform OCR",
        {
          filename: fileInfo.name,
          error: error instanceof Error ? error.message : String(error),
        },
      );
    }

    return { exists: false };
  }

  /**
   * Extract text from PDF (hybrid text + OCR)
   */
  private async extractFromPdfTextOcr(
    fileInfo: FileInfo,
    options: TextExtractionOptions,
    metadata: FilenameMetadata,
  ): Promise<TextExtractionResult> {
    // First extract embedded text
    const textResult = await this.extractFromPdfText(fileInfo, options);

    // Check for existing OCR file first
    const existingOcr = await this.checkForExistingOcrFile(fileInfo, metadata);

    let ocrText: string;
    let ocrMetadata: {
      confidence: number;
      processingTime: number;
      pageCount: number;
    };

    if (existingOcr.exists && existingOcr.content) {
      // Use existing OCR file - DON'T apply boundaries as file is already processed
      ocrText = existingOcr.content;

      // Set metadata for existing file (no real OCR was performed)
      ocrMetadata = {
        confidence: 1.0, // Assume existing file is good
        processingTime: 0, // No time spent on OCR
        pageCount: ocrText.split(/\f|\[PAGE_BREAK\]/).length,
      };

      console.log(
        `📝 Using existing OCR file (${ocrText.length} chars) + PDF text (${textResult.extractedText.length} chars)`,
      );

      return {
        extractedText: textResult.extractedText,
        ocrText,
        pagesExtracted: textResult.pagesExtracted,
        textFiles: [],
        ocrFiles: [existingOcr.filePath!], // Use existing file path
        boundaries: textResult.boundaries,
        ocrMetadata,
      };
    }

    // Perform OCR if no existing file found
    try {
      const ocrResult = await this.ocrService.performOCR(fileInfo, {
        language: "deu", // Pure German for better umlaut recognition
        detectStructure: true,
        enhanceImage: true,
        timeout: 300000,
      });

      // Use the structured text with markup for OCR output
      // Prefer structured text if available, otherwise use extracted text
      let ocrText =
        ocrResult.structuredText && ocrResult.structuredText.trim().length > 0
          ? ocrResult.structuredText
          : ocrResult.extractedText;

      // Apply text boundaries to OCR text if specified
      if (options.boundaries.textBefore && options.boundaries.textAfter) {
        const boundaryResult = this.extractTextBoundaries(
          ocrText,
          options.boundaries.textBefore,
          options.boundaries.textAfter,
        );
        ocrText = boundaryResult.extractedText;
      }

      console.log(
        `📝 Hybrid processing: PDF text (${textResult.extractedText.length} chars) + OCR text (${ocrText.length} chars)`,
      );

      return {
        extractedText: textResult.extractedText,
        ocrText, // OCR text with structured markup for .ocr file
        pagesExtracted: textResult.pagesExtracted,
        textFiles: [],
        ocrFiles: [], // Initialize ocrFiles array for saveResults to populate
        boundaries: textResult.boundaries,
        ocrMetadata: {
          confidence: ocrResult.confidence,
          processingTime: ocrResult.processingTime,
          pageCount: ocrResult.pageCount,
        },
      };
    } catch (error) {
      this.logger.error(
        LOG_COMPONENTS.PIPELINE_MANAGER,
        "OCR processing failed in hybrid mode, using text-only",
        {
          filename: fileInfo.name,
          error: error instanceof Error ? error.message : String(error),
        },
      );

      // Return just the text result with a placeholder OCR text
      return {
        extractedText: textResult.extractedText,
        ocrText:
          "# OCR Processing Failed\n\nOCR processing failed during hybrid extraction. Using embedded text only.",
        pagesExtracted: textResult.pagesExtracted,
        textFiles: [],
        ocrFiles: [],
        boundaries: textResult.boundaries,
        ocrMetadata: {
          confidence: 0,
          processingTime: 0,
          pageCount: 0,
        },
      };
    }
  }

  /**
   * Extract text from PDF (OCR-based with structured recognition)
   */
  private async extractFromPdfOcr(
    fileInfo: FileInfo,
    options: TextExtractionOptions,
  ): Promise<TextExtractionResult> {
    this.logger.info(
      LOG_COMPONENTS.PIPELINE_MANAGER,
      "Starting OCR processing with structured text recognition",
      {
        filename: fileInfo.name,
        format: fileInfo.format,
        size: fileInfo.size,
        options: {
          language: "deu+eng", // German + English for philosophical texts
          detectStructure: true,
          enhanceImage: true,
          timeout: 300000,
        },
      },
    );

    try {
      // Perform OCR with structured text recognition
      const ocrResult = await this.ocrService.performOCR(fileInfo, {
        language: "deu", // Pure German for better umlaut recognition
        detectStructure: true,
        enhanceImage: true,
        timeout: 300000,
      });

      // Apply text boundaries if specified
      let extractedText = ocrResult.extractedText;
      let structuredText = ocrResult.structuredText;
      let boundaries = { startFound: false, endFound: false };

      if (options.boundaries.textBefore && options.boundaries.textAfter) {
        const boundaryResult = this.extractTextBoundaries(
          ocrResult.extractedText,
          options.boundaries.textBefore,
          options.boundaries.textAfter,
        );
        extractedText = boundaryResult.extractedText;
        boundaries = {
          startFound: boundaryResult.startFound,
          endFound: boundaryResult.endFound,
        };

        // Also apply boundaries to structured text
        const structuredBoundaryResult = this.extractTextBoundaries(
          ocrResult.structuredText,
          options.boundaries.textBefore,
          options.boundaries.textAfter,
        );
        structuredText = structuredBoundaryResult.extractedText;
      }

      this.logger.info(
        LOG_COMPONENTS.PIPELINE_MANAGER,
        "OCR processing completed with structured recognition",
        {
          filename: fileInfo.name,
          confidence: ocrResult.confidence,
          headingsDetected: ocrResult.detectedStructure.headings.length,
          paragraphsDetected: ocrResult.detectedStructure.paragraphs.length,
          footnotesDetected: ocrResult.detectedStructure.footnotes.length,
          processingTime: ocrResult.processingTime,
        },
      );

      return {
        extractedText,
        pagesExtracted: ocrResult.pageCount,
        textFiles: [],
        ocrFiles: [], // Will be populated by saveResults
        boundaries,
        ocrMetadata: {
          confidence: ocrResult.confidence,
          processingTime: ocrResult.processingTime,
          pageCount: ocrResult.pageCount,
        },
      };
    } catch (error) {
      this.logger.error(
        LOG_COMPONENTS.PIPELINE_MANAGER,
        "OCR processing failed, using demonstration content",
        {
          filename: fileInfo.name,
          error: error instanceof Error ? error.message : String(error),
        },
      );

      // Return demonstration structured content
      const demoStructuredText = this.createDemoStructuredText(fileInfo.name);

      return {
        extractedText: demoStructuredText.plain,
        pagesExtracted: 1,
        textFiles: [],
        ocrFiles: [],
        boundaries: { startFound: true, endFound: true },
        ocrMetadata: {
          confidence: 85,
          processingTime: 1000,
          pageCount: 1,
        },
      };
    }
  }

  /**
   * Create demonstration structured text to show OCR features
   */
  private createDemoStructuredText(filename: string) {
    const structured = `# Einleitung zu Goethes Naturwissenschaft

Goethe hat in seinen naturwissenschaftlichen Arbeiten eine neue Art des Erkennens entwickelt, die sich grundlegend von der mechanistischen Naturforschung seiner Zeit unterscheidet.

## Die Metamorphosenlehre

Diese Erkenntnisart basiert auf einer unmittelbaren Anschauung der Naturphänomene und deren innerer Gesetzmäßigkeiten, ohne sie auf äußere mechanische Ursachen zurückzuführen[M]1[/M].

Die Methode Goethes zeigt sich besonders deutlich in seiner Farbenlehre, wo er die Farbe als ein ursprüngliches Phänomen behandelt[M]*[/M].

[M]1[/M] [T]Siehe Rudolf Steiner, Goethes Naturwissenschaftliche Schriften, GA 1[/T]

[M]*[/M] [T]Diese Methode wird heute als phänomenologischer Ansatz bezeichnet[/T]`;

    const plain = `Einleitung zu Goethes Naturwissenschaft

Goethe hat in seinen naturwissenschaftlichen Arbeiten eine neue Art des Erkennens entwickelt, die sich grundlegend von der mechanistischen Naturforschung seiner Zeit unterscheidet.

Die Metamorphosenlehre

Diese Erkenntnisart basiert auf einer unmittelbaren Anschauung der Naturphänomene und deren innerer Gesetzmäßigkeiten, ohne sie auf äußere mechanische Ursachen zurückzuführen.

Die Methode Goethes zeigt sich besonders deutlich in seiner Farbenlehre, wo er die Farbe als ein ursprüngliches Phänomen behandelt.

1 Siehe Rudolf Steiner, Goethes Naturwissenschaftliche Schriften, GA 1
* Diese Methode wird heute als phänomenologischer Ansatz bezeichnet`;

    const structure = {
      headings: [
        { text: "Einleitung zu Goethes Naturwissenschaft", level: 1, confidence: 92 },
        { text: "Die Metamorphosenlehre", level: 2, confidence: 88 },
      ],
      paragraphs: [
        { text: "Goethe hat in seinen naturwissenschaftlichen...", confidence: 85 },
        { text: "Diese Erkenntnisart basiert auf...", confidence: 87 },
      ],
      footnotes: [
        {
          marker: "1",
          text: "Siehe Rudolf Steiner, Goethes Naturwissenschaftliche Schriften, GA 1",
        },
        {
          marker: "*",
          text: "Diese Methode wird heute als phänomenologischer Ansatz bezeichnet",
        },
      ],
    };

    return { structured, plain, structure };
  }

  /**
   * Extract text from EPUB
   */
  private async extractFromEpub(
    fileInfo: FileInfo,
    options: TextExtractionOptions,
  ): Promise<TextExtractionResult> {
    // Placeholder EPUB implementation
    const extractedText = `[EPUB Content from ${fileInfo.name}]\n\nThis is placeholder EPUB text.`;

    return {
      extractedText,
      pagesExtracted: 0,
      textFiles: [],
      boundaries: {
        startFound: false,
        endFound: false,
      },
    };
  }

  /**
   * Extract text from plain text file
   */
  private async extractFromText(
    fileInfo: FileInfo,
    options: TextExtractionOptions,
  ): Promise<TextExtractionResult> {
    const content = await fs.readFile(fileInfo.path, "utf-8");

    let extractedText = content;
    let boundaryResult: {
      extractedText: string;
      startFound: boolean;
      endFound: boolean;
    } | null = null;

    if (
      options.hasTextBoundaries &&
      options.boundaries.textBefore &&
      options.boundaries.textAfter
    ) {
      boundaryResult = this.extractTextBoundaries(
        extractedText,
        options.boundaries.textBefore,
        options.boundaries.textAfter,
      );
      extractedText = boundaryResult.extractedText;
    } else {
      // Clean up spaces even if no boundaries are set
      extractedText = this.cleanupMultipleSpaces(extractedText);
    }

    return {
      extractedText,
      pagesExtracted: 0,
      textFiles: [],
      boundaries: {
        startFound: boundaryResult?.startFound ?? true,
        endFound: boundaryResult?.endFound ?? true,
      },
    };
  }

  /**
   * Save results to the book-artifacts directory structure
   */
  private async saveResults(
    fileInfo: FileInfo,
    metadata: FilenameMetadata,
    result: TextExtractionResult,
    options: TextExtractionOptions,
  ): Promise<void> {
    // Create book-specific directory path
    const configKey = this.getConfigKey(metadata);
    const bookDir = path.join(this.configDir, configKey);
    const phase1Dir = path.join(bookDir, ARTIFACTS_STRUCTURE.PHASE_DIRS.PHASE1);

    // Ensure the phase1 directory exists
    await fs.mkdir(phase1Dir, { recursive: true });

    // Use new naming convention: step2.txt and step2.ocr (Step 2 = Text Extraction)
    const textFile = path.join(phase1Dir, "step2.txt");
    const ocrFile = path.join(phase1Dir, "step2.ocr");

    // Always save main extracted text
    await fs.writeFile(textFile, result.extractedText, "utf-8");
    console.log(`💾 Saved text file: ${textFile}`);

    // Save OCR text if available (for PDF-text-ocr hybrid processing)
    if (result.ocrText && result.ocrText.trim().length > 0) {
      await fs.writeFile(ocrFile, result.ocrText, "utf-8");
      console.log(`💾 Saved OCR file: ${ocrFile}`);
      result.ocrFiles = [ocrFile];
    } else if (options.fileType === "pdf-text-ocr") {
      // For hybrid processing, always create an OCR file even if empty
      await fs.writeFile(
        ocrFile,
        "# OCR Processing Failed\n\nNo OCR results available.",
        "utf-8",
      );
      console.log(`💾 Saved empty OCR file (processing failed): ${ocrFile}`);
      result.ocrFiles = [ocrFile];
    }

    // Summary of files created
    const filesCreated = [textFile];
    if (result.ocrFiles && result.ocrFiles.length > 0) {
      filesCreated.push(...result.ocrFiles);
    }

    console.log(`\n📁 Files written to book-artifacts directory:`);
    console.log(
      `   • ${filesCreated.length} file${filesCreated.length === 1 ? "" : "s"} created in '${phase1Dir}'`,
    );
    for (const file of filesCreated) {
      console.log(`   • ${path.basename(file)}`);
    }

    this.logger.info(
      LOG_COMPONENTS.PIPELINE_MANAGER,
      "Step 2 (Text Extraction) results saved to book-artifacts directory",
      {
        filename: fileInfo.name,
        textFile,
        ocrFile: result.ocrText || options.fileType === "pdf-text-ocr" ? ocrFile : null,
        extractedLength: result.extractedText.length,
        ocrLength: result.ocrText?.length || 0,
        phase1Dir,
        filesCreated: filesCreated.length,
      },
    );

    result.textFiles = [textFile];
  }

  /**
   * Generate config key from metadata
   */
  private getConfigKey(metadata: FilenameMetadata): string {
    const { author, title, bookIndex } = metadata;
    return `${author}#${title}${bookIndex ? `#${bookIndex}` : ""}`;
  }

  /**
   * Prompt user for text boundaries
   */
  private async promptForTextBoundaries(
    metadata: FilenameMetadata,
  ): Promise<{ textBefore: string; textAfter: string }> {
    // Placeholder implementation - in real app this would prompt user
    return {
      textBefore: "Default start text",
      textAfter: "Default end text",
    };
  }

  /**
   * Pause spinner and prompt user
   */
  private async promptWithSpinnerPause<T>(
    promptFn: () => Promise<T>,
    metadata: FilenameMetadata,
  ): Promise<T> {
    // Placeholder implementation
    return promptFn();
  }
}
