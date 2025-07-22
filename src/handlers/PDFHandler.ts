import { promises as fs } from "node:fs";
import { ERROR_CODES, LOG_COMPONENTS, MESSAGE_TEMPLATES } from "@/constants";
import type { LoggerService } from "@/services/LoggerService";
import { formatLogMessage } from "@/services/LoggerService";
import type {
  FileInfo,
  TextExtractionResult,
  TextMetadata,
  TextQuality,
} from "@/types";
import { AppError } from "@/utils/AppError";
import pdfParse from "pdf-parse";

/**
 * Handler for extracting text from PDF files
 */
export class PDFHandler {
  private readonly logger: LoggerService;

  constructor(logger: LoggerService) {
    this.logger = logger;
  }

  /**
   * Extract text from a PDF file
   */
  public async extractText(fileInfo: FileInfo): Promise<TextExtractionResult> {
    const pdfLogger = this.logger.getTextExtractionLogger(LOG_COMPONENTS.FILE_HANDLER);

    pdfLogger.info(
      {
        filePath: fileInfo.path,
        fileSize: fileInfo.size,
      },
      formatLogMessage(MESSAGE_TEMPLATES.PROCESSING_START, {
        filename: fileInfo.name,
      }),
    );

    try {
      // Read PDF file
      const pdfBuffer = await fs.readFile(fileInfo.path);

      // Parse PDF with options
      const pdfData = await pdfParse(pdfBuffer, {
        // Don't discard duplicate pages
        max: 0,
      });

      // Extract text and metadata
      const extractedText = pdfData.text;
      const pageCount = pdfData.numpages;
      const wordCount = this.countWords(extractedText);
      const characterCount = extractedText.length;

      // Assess text quality
      const quality = this.assessTextQuality(extractedText, pdfData);

      // Create metadata
      const metadata: TextMetadata = {
        pageCount,
        wordCount,
        characterCount,
        encoding: "utf-8",
        language: this.detectLanguage(extractedText),
        confidence: quality.confidence,
      };

      const result: TextExtractionResult = {
        text: extractedText,
        metadata,
        quality,
        source: "embedded",
      };

      pdfLogger.info(
        {
          filePath: fileInfo.path,
          pageCount,
          wordCount,
          characterCount,
          qualityScore: quality.score,
          confidence: quality.confidence,
        },
        formatLogMessage(MESSAGE_TEMPLATES.TEXT_EXTRACTED, {
          words: wordCount,
          characters: characterCount,
        }),
      );

      return result;
    } catch (error) {
      throw new AppError(
        ERROR_CODES.EXTRACTION_FAILED,
        LOG_COMPONENTS.FILE_HANDLER,
        "extractText",
        `Failed to extract text from PDF: ${fileInfo.path}`,
        {
          filePath: fileInfo.path,
          fileSize: fileInfo.size,
        },
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  /**
   * Check if the PDF has embedded text
   */
  public async hasEmbeddedText(fileInfo: FileInfo): Promise<boolean> {
    const pdfLogger = this.logger.getTextExtractionLogger(LOG_COMPONENTS.FILE_HANDLER);

    try {
      const pdfBuffer = await fs.readFile(fileInfo.path);
      const pdfData = await pdfParse(pdfBuffer, { max: 1 }); // Only check first page

      const hasText = pdfData.text.trim().length > 0;

      pdfLogger.debug(
        {
          filePath: fileInfo.path,
          hasEmbeddedText: hasText,
          firstPageTextLength: pdfData.text.trim().length,
        },
        "Embedded text check completed",
      );

      return hasText;
    } catch (error) {
      pdfLogger.warn(
        {
          filePath: fileInfo.path,
          error: error instanceof Error ? error.message : String(error),
        },
        "Failed to check for embedded text, assuming no embedded text",
      );

      return false;
    }
  }

  /**
   * Get PDF information
   */
  public async getPDFInfo(fileInfo: FileInfo): Promise<{
    pageCount: number;
    hasEmbeddedText: boolean;
    title?: string;
    author?: string;
    creator?: string;
    creationDate?: Date;
  }> {
    const pdfLogger = this.logger.getTextExtractionLogger(LOG_COMPONENTS.FILE_HANDLER);

    try {
      const pdfBuffer = await fs.readFile(fileInfo.path);
      const pdfData = await pdfParse(pdfBuffer, { max: 1 });

      const info: {
        pageCount: number;
        hasEmbeddedText: boolean;
        title?: string;
        author?: string;
        creator?: string;
        creationDate?: Date;
      } = {
        pageCount: pdfData.numpages,
        hasEmbeddedText: pdfData.text.trim().length > 0,
        ...(pdfData.info?.Title && { title: pdfData.info.Title }),
        ...(pdfData.info?.Author && { author: pdfData.info.Author }),
        ...(pdfData.info?.Creator && { creator: pdfData.info.Creator }),
        ...(pdfData.info?.CreationDate && {
          creationDate: new Date(pdfData.info.CreationDate),
        }),
      };

      pdfLogger.debug(
        {
          filePath: fileInfo.path,
          ...info,
        },
        "PDF information extracted",
      );

      return info;
    } catch (error) {
      throw new AppError(
        ERROR_CODES.EXTRACTION_FAILED,
        LOG_COMPONENTS.FILE_HANDLER,
        "getPDFInfo",
        `Failed to get PDF information: ${fileInfo.path}`,
        { filePath: fileInfo.path },
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  /**
   * Count words in text
   */
  private countWords(text: string): number {
    return text
      .trim()
      .split(/\s+/)
      .filter((word) => word.length > 0).length;
  }

  /**
   * Assess text quality
   */
  private assessTextQuality(text: string, _pdfData: pdfParse.Result): TextQuality {
    const issues = [];
    let score = 100;
    let confidence = 1.0;

    // Check for empty or very short text
    if (text.trim().length < 100) {
      issues.push({
        type: "missing_text" as const,
        description: "Very little text extracted",
        severity: "high" as const,
      });
      score -= 30;
      confidence -= 0.3;
    }

    // Check for encoding issues
    if (text.includes("�") || text.includes("\uFFFD")) {
      issues.push({
        type: "encoding" as const,
        description: "Text contains replacement characters, possible encoding issues",
        severity: "medium" as const,
      });
      score -= 20;
      confidence -= 0.2;
    }

    // Check for excessive repeated characters (might indicate OCR issues)
    const repeatedChars = text.match(/(.)\1{5,}/g);
    if (repeatedChars && repeatedChars.length > 0) {
      issues.push({
        type: "corruption" as const,
        description: "Text contains excessive repeated characters",
        severity: "medium" as const,
      });
      score -= 15;
      confidence -= 0.15;
    }

    // Check for proper text structure
    const hasProperSentences = /[.!?]\s+[A-Z]/.test(text);
    if (!hasProperSentences && text.length > 500) {
      issues.push({
        type: "formatting" as const,
        description: "Text lacks proper sentence structure",
        severity: "low" as const,
      });
      score -= 10;
      confidence -= 0.1;
    }

    return {
      score: Math.max(0, Math.min(100, score)),
      confidence: Math.max(0, Math.min(1, confidence)),
      issues,
      readability: this.calculateReadability(text),
    };
  }

  /**
   * Calculate basic readability score
   */
  private calculateReadability(text: string): number {
    const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0).length;
    const words = this.countWords(text);
    const syllables = this.countSyllables(text);

    if (sentences === 0 || words === 0) {
      return 0;
    }

    // Simple Flesch Reading Ease approximation
    const avgWordsPerSentence = words / sentences;
    const avgSyllablesPerWord = syllables / words;

    const readabilityScore =
      206.835 - 1.015 * avgWordsPerSentence - 84.6 * avgSyllablesPerWord;

    return Math.max(0, Math.min(100, readabilityScore));
  }

  /**
   * Count syllables in text (approximation)
   */
  private countSyllables(text: string): number {
    const words = text.toLowerCase().match(/\b\w+\b/g) || [];

    return words.reduce((total, word) => {
      // Simple syllable counting heuristic
      const vowels = word.match(/[aeiouäöüy]+/g) || [];
      let syllables = vowels.length;

      // Adjust for common patterns
      if (word.endsWith("e") && syllables > 1) {
        syllables--;
      }

      return total + Math.max(1, syllables);
    }, 0);
  }

  /**
   * Detect language (basic heuristic)
   */
  private detectLanguage(text: string): string {
    const sample = text.slice(0, 1000).toLowerCase();

    // German indicators
    const germanWords = [
      "der",
      "die",
      "das",
      "und",
      "ist",
      "ein",
      "eine",
      "von",
      "zu",
      "mit",
    ];
    const germanMatches = germanWords.filter((word) => sample.includes(word)).length;

    // English indicators
    const englishWords = [
      "the",
      "and",
      "is",
      "a",
      "an",
      "of",
      "to",
      "in",
      "for",
      "with",
    ];
    const englishMatches = englishWords.filter((word) => sample.includes(word)).length;

    if (germanMatches > englishMatches) {
      return "de";
    }
    if (englishMatches > germanMatches) {
      return "en";
    }

    return "auto";
  }
}
