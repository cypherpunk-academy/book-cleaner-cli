import { ERROR_CODES, LOG_COMPONENTS } from "../../../constants";
import type { LoggerService } from "../../../services/LoggerService";
import { AppError } from "../../../utils/AppError";

/**
 * Text quality analysis result interface
 */
export interface TextQualityAnalysisResult {
  overallQuality: number; // 0-1 score
  confidence: number;
  issues: QualityIssue[];
  suggestions: QualityImprovement[];
  processingTime: number;
  comparisonMethod: string;
}

/**
 * Quality issue interface
 */
export interface QualityIssue {
  type:
    | "spelling_error"
    | "ocr_debris"
    | "broken_word"
    | "weird_character"
    | "formatting_issue";
  position: number;
  length: number;
  problematicText: string;
  suggestedFix?: string;
  confidence: number;
  severity: "low" | "medium" | "high";
}

/**
 * Quality improvement interface
 */
export interface QualityImprovement {
  type:
    | "spelling_correction"
    | "debris_removal"
    | "word_reconstruction"
    | "character_cleaning";
  originalText: string;
  improvedText: string;
  position: number;
  confidence: number;
  source: "embedded_text" | "pattern_matching" | "dictionary";
}

/**
 * Quality analysis options
 */
export interface QualityAnalysisOptions {
  compareWithEmbedded?: boolean;
  detectSpellingErrors?: boolean;
  detectOCRDebris?: boolean;
  detectBrokenWords?: boolean;
  ignoreWhitespace?: boolean;
  language?: string;
  strictMode?: boolean;
}

/**
 * Text Quality Analyzer for detecting and fixing OCR-related text issues
 *
 * This analyzer compares OCR text with embedded text (when available) to identify:
 * - Spelling mistakes introduced by OCR
 * - OCR debris (weird characters, symbols)
 * - Broken words that should be joined
 * - Formatting issues caused by OCR processing
 */
export class TextQualityAnalyzer {
  private readonly logger: LoggerService;

  constructor(logger: LoggerService) {
    this.logger = logger;
  }

  /**
   * Analyze text quality by comparing OCR text with embedded text
   *
   * @param ocrText - Text extracted via OCR
   * @param embeddedText - Text extracted from embedded content (optional)
   * @param options - Analysis options
   * @returns Quality analysis result with issues and suggestions
   */
  async analyzeTextQuality(
    ocrText: string,
    embeddedText?: string,
    options: QualityAnalysisOptions = {},
  ): Promise<TextQualityAnalysisResult> {
    const analysisLogger = this.logger.getTextExtractionLogger(
      LOG_COMPONENTS.PIPELINE_MANAGER,
    );

    const startTime = Date.now();

    try {
      analysisLogger.info(
        {
          ocrTextLength: ocrText.length,
          hasEmbeddedText: !!embeddedText,
          embeddedTextLength: embeddedText?.length || 0,
          options,
        },
        "Starting text quality analysis",
      );

      const issues: QualityIssue[] = [];
      const suggestions: QualityImprovement[] = [];

      // Analyze OCR-specific issues
      if (options.detectOCRDebris !== false) {
        const debrisIssues = this.detectOCRDebris(ocrText);
        issues.push(...debrisIssues);
      }

      if (options.detectBrokenWords !== false) {
        const brokenWordIssues = this.detectBrokenWords(ocrText);
        issues.push(...brokenWordIssues);
      }

      // Compare with embedded text if available
      if (embeddedText && options.compareWithEmbedded !== false) {
        const comparisonIssues = this.compareWithEmbeddedText(
          ocrText,
          embeddedText,
          options,
        );
        issues.push(...comparisonIssues);

        const comparisonSuggestions = this.generateComparisonSuggestions(
          ocrText,
          embeddedText,
        );
        suggestions.push(...comparisonSuggestions);
      }

      // Detect spelling errors (placeholder for now)
      if (options.detectSpellingErrors !== false) {
        const spellingIssues = this.detectSpellingErrors(ocrText, options);
        issues.push(...spellingIssues);
      }

      const processingTime = Date.now() - startTime;
      const overallQuality = this.calculateOverallQuality(issues);

      const result: TextQualityAnalysisResult = {
        overallQuality,
        confidence: this.calculateConfidence(issues, suggestions),
        issues,
        suggestions,
        processingTime,
        comparisonMethod: embeddedText ? "embedded_comparison" : "standalone_analysis",
      };

      analysisLogger.info(
        {
          overallQuality,
          issuesFound: issues.length,
          suggestionsGenerated: suggestions.length,
          processingTime,
        },
        "Text quality analysis completed",
      );

      return result;
    } catch (error) {
      const processingTime = Date.now() - startTime;

      analysisLogger.error(
        {
          error: error instanceof Error ? error.message : String(error),
          processingTime,
        },
        "Text quality analysis failed",
      );

      throw new AppError(
        ERROR_CODES.PIPELINE_FAILED,
        LOG_COMPONENTS.PIPELINE_MANAGER,
        "TextQualityAnalyzer.analyzeTextQuality",
        "Text quality analysis failed",
        {
          ocrTextLength: ocrText.length,
          hasEmbeddedText: !!embeddedText,
        },
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  /**
   * Detect OCR debris (weird characters, symbols, artifacts)
   */
  private detectOCRDebris(text: string): QualityIssue[] {
    const issues: QualityIssue[] = [];

    // Common OCR debris patterns
    const debrisPatterns = [
      /[^\w\s\p{P}\p{S}\n\r\t]/gu, // Non-standard characters
      /[|]{2,}/g, // Multiple pipe characters
      /[~]{2,}/g, // Multiple tilde characters
      /[`]{2,}/g, // Multiple backticks
      /[_]{3,}/g, // Multiple underscores
      /[.]{4,}/g, // Multiple dots (not ellipsis)
    ];

    debrisPatterns.forEach((pattern) => {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        issues.push({
          type: "ocr_debris",
          position: match.index,
          length: match[0].length,
          problematicText: match[0],
          confidence: 0.8,
          severity: "medium",
        });
      }
    });

    return issues;
  }

  /**
   * Detect broken words that should be joined
   */
  private detectBrokenWords(text: string): QualityIssue[] {
    const issues: QualityIssue[] = [];

    // Pattern for potential broken words (single letters or short fragments)
    const brokenWordPattern = /\b[a-z]\s+[a-z]{2,}\b/gi;

    let match;
    while ((match = brokenWordPattern.exec(text)) !== null) {
      issues.push({
        type: "broken_word",
        position: match.index,
        length: match[0].length,
        problematicText: match[0],
        suggestedFix: match[0].replace(/\s+/g, ""),
        confidence: 0.7,
        severity: "medium",
      });
    }

    return issues;
  }

  /**
   * Compare OCR text with embedded text to find differences
   */
  private compareWithEmbeddedText(
    ocrText: string,
    embeddedText: string,
    _options: QualityAnalysisOptions,
  ): QualityIssue[] {
    const issues: QualityIssue[] = [];

    // Simple word-by-word comparison (placeholder for more sophisticated algorithms)
    const ocrWords = ocrText.toLowerCase().split(/\s+/);
    const embeddedWords = embeddedText.toLowerCase().split(/\s+/);

    // Find words that exist in embedded but not in OCR (potential OCR errors)
    const missingWords = embeddedWords.filter(
      (word) => word.length > 3 && !ocrWords.includes(word),
    );

    missingWords.forEach((word) => {
      const position = embeddedText.toLowerCase().indexOf(word);
      if (position >= 0) {
        issues.push({
          type: "spelling_error",
          position,
          length: word.length,
          problematicText: word,
          suggestedFix: word,
          confidence: 0.6,
          severity: "low",
        });
      }
    });

    return issues;
  }

  /**
   * Generate improvement suggestions based on comparison
   */
  private generateComparisonSuggestions(
    _ocrText: string,
    _embeddedText: string,
  ): QualityImprovement[] {
    const suggestions: QualityImprovement[] = [];

    // Placeholder for sophisticated comparison algorithms
    // In a full implementation, this would use edit distance, fuzzy matching, etc.

    return suggestions;
  }

  /**
   * Detect spelling errors (placeholder implementation)
   */
  private detectSpellingErrors(
    _text: string,
    _options: QualityAnalysisOptions,
  ): QualityIssue[] {
    const issues: QualityIssue[] = [];

    // Placeholder for spelling error detection
    // In a full implementation, this would use a dictionary or spelling checker

    return issues;
  }

  /**
   * Calculate overall quality score based on issues found
   */
  private calculateOverallQuality(issues: QualityIssue[]): number {
    if (issues.length === 0) return 1.0;

    const severityWeights = {
      low: 0.1,
      medium: 0.3,
      high: 0.5,
    };

    const totalPenalty = issues.reduce((sum, issue) => {
      return sum + severityWeights[issue.severity];
    }, 0);

    // Normalize to 0-1 scale
    return Math.max(0, 1 - totalPenalty / 10);
  }

  /**
   * Calculate confidence in the analysis results
   */
  private calculateConfidence(
    issues: QualityIssue[],
    _suggestions: QualityImprovement[],
  ): number {
    const baseConfidence = 0.8;
    const issueConfidenceAvg =
      issues.length > 0
        ? issues.reduce((sum, issue) => sum + issue.confidence, 0) / issues.length
        : 1.0;

    return Math.min(1.0, (baseConfidence + issueConfidenceAvg) / 2);
  }
}
