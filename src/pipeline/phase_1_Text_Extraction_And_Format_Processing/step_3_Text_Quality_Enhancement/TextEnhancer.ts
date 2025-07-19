import { ERROR_CODES, LOG_COMPONENTS } from "../../../constants";
import type { LoggerService } from "../../../services/LoggerService";
import { AppError } from "../../../utils/AppError";
import type {
  QualityImprovement,
  QualityIssue,
  TextQualityAnalysisResult,
} from "./TextComparator";

/**
 * Text enhancement result interface
 */
export interface TextEnhancementResult {
  enhancedText: string;
  improvementsMade: QualityImprovement[];
  issuesFixed: number;
  issuesRemaining: number;
  confidence: number;
  processingTime: number;
  enhancementSummary: {
    spellingCorrections: number;
    debrisRemoved: number;
    wordsReconstructed: number;
    charactersFixed: number;
  };
}

/**
 * Text enhancement options
 */
export interface TextEnhancementOptions {
  fixSpellingErrors?: boolean;
  removeOCRDebris?: boolean;
  reconstructBrokenWords?: boolean;
  cleanWeirdCharacters?: boolean;
  preserveFormatting?: boolean;
  aggressiveMode?: boolean;
  language?: string;
}

/**
 * Text Enhancer for fixing OCR-related text quality issues
 *
 * This enhancer applies fixes based on quality analysis results:
 * - Removes OCR debris (weird characters, symbols)
 * - Corrects spelling mistakes using embedded text comparison
 * - Reconstructs broken words
 * - Cleans up formatting issues
 */
export class TextEnhancer {
  private readonly logger: LoggerService;

  constructor(logger: LoggerService) {
    this.logger = logger;
  }

  /**
   * Enhance text quality based on analysis results
   *
   * @param originalText - Original text to enhance
   * @param analysisResult - Quality analysis result with issues and suggestions
   * @param options - Enhancement options
   * @returns Enhanced text with improvement details
   */
  async enhanceText(
    originalText: string,
    analysisResult: TextQualityAnalysisResult,
    options: TextEnhancementOptions = {},
  ): Promise<TextEnhancementResult> {
    const enhancementLogger = this.logger.getTextExtractionLogger(
      LOG_COMPONENTS.PIPELINE_MANAGER,
    );

    const startTime = Date.now();

    try {
      enhancementLogger.info(
        {
          originalLength: originalText.length,
          issuesFound: analysisResult.issues.length,
          suggestionsAvailable: analysisResult.suggestions.length,
          options,
        },
        "Starting text enhancement",
      );

      let enhancedText = originalText;
      const improvementsMade: QualityImprovement[] = [];
      const enhancementSummary = {
        spellingCorrections: 0,
        debrisRemoved: 0,
        wordsReconstructed: 0,
        charactersFixed: 0,
      };

      // Apply suggested improvements first
      if (analysisResult.suggestions.length > 0) {
        const suggestionResults = this.applySuggestions(
          enhancedText,
          analysisResult.suggestions,
          options,
        );
        enhancedText = suggestionResults.text;
        improvementsMade.push(...suggestionResults.improvements);
        this.updateSummary(enhancementSummary, suggestionResults.improvements);
      }

      // Fix issues based on type and options
      if (options.removeOCRDebris !== false) {
        const debrisResult = this.removeOCRDebris(
          enhancedText,
          analysisResult.issues,
          options,
        );
        enhancedText = debrisResult.text;
        improvementsMade.push(...debrisResult.improvements);
        this.updateSummary(enhancementSummary, debrisResult.improvements);
      }

      if (options.reconstructBrokenWords !== false) {
        const wordResult = this.reconstructBrokenWords(
          enhancedText,
          analysisResult.issues,
          options,
        );
        enhancedText = wordResult.text;
        improvementsMade.push(...wordResult.improvements);
        this.updateSummary(enhancementSummary, wordResult.improvements);
      }

      if (options.fixSpellingErrors !== false) {
        const spellingResult = this.fixSpellingErrors(
          enhancedText,
          analysisResult.issues,
          options,
        );
        enhancedText = spellingResult.text;
        improvementsMade.push(...spellingResult.improvements);
        this.updateSummary(enhancementSummary, spellingResult.improvements);
      }

      if (options.cleanWeirdCharacters !== false) {
        const characterResult = this.cleanWeirdCharacters(
          enhancedText,
          analysisResult.issues,
          options,
        );
        enhancedText = characterResult.text;
        improvementsMade.push(...characterResult.improvements);
        this.updateSummary(enhancementSummary, characterResult.improvements);
      }

      const processingTime = Date.now() - startTime;
      const issuesFixed = improvementsMade.length;
      const issuesRemaining = Math.max(0, analysisResult.issues.length - issuesFixed);

      const result: TextEnhancementResult = {
        enhancedText,
        improvementsMade,
        issuesFixed,
        issuesRemaining,
        confidence: this.calculateEnhancementConfidence(improvementsMade),
        processingTime,
        enhancementSummary,
      };

      enhancementLogger.info(
        {
          originalLength: originalText.length,
          enhancedLength: enhancedText.length,
          issuesFixed,
          issuesRemaining,
          confidence: result.confidence,
          processingTime,
          enhancementSummary,
        },
        "Text enhancement completed",
      );

      return result;
    } catch (error) {
      const processingTime = Date.now() - startTime;

      enhancementLogger.error(
        {
          error: error instanceof Error ? error.message : String(error),
          processingTime,
        },
        "Text enhancement failed",
      );

      throw new AppError(
        ERROR_CODES.PIPELINE_FAILED,
        LOG_COMPONENTS.PIPELINE_MANAGER,
        "TextEnhancer.enhanceText",
        "Text enhancement failed",
        {
          originalLength: originalText.length,
          issuesFound: analysisResult.issues.length,
        },
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  /**
   * Apply quality improvement suggestions
   */
  private applySuggestions(
    text: string,
    suggestions: QualityImprovement[],
    options: TextEnhancementOptions,
  ): { text: string; improvements: QualityImprovement[] } {
    let enhancedText = text;
    const improvements: QualityImprovement[] = [];

    // Sort suggestions by position (reverse order to maintain positions)
    const sortedSuggestions = [...suggestions].sort((a, b) => b.position - a.position);

    for (const suggestion of sortedSuggestions) {
      // Apply improvement based on type and options
      if (this.shouldApplySuggestion(suggestion, options)) {
        const before = enhancedText.slice(0, suggestion.position);
        const after = enhancedText.slice(
          suggestion.position + suggestion.originalText.length,
        );
        enhancedText = before + suggestion.improvedText + after;
        improvements.push(suggestion);
      }
    }

    return { text: enhancedText, improvements };
  }

  /**
   * Remove OCR debris (weird characters, symbols)
   */
  private removeOCRDebris(
    text: string,
    issues: QualityIssue[],
    options: TextEnhancementOptions,
  ): { text: string; improvements: QualityImprovement[] } {
    let enhancedText = text;
    const improvements: QualityImprovement[] = [];

    const debrisIssues = issues.filter((issue) => issue.type === "ocr_debris");

    // Sort by position (reverse order to maintain positions)
    const sortedIssues = [...debrisIssues].sort((a, b) => b.position - a.position);

    for (const issue of sortedIssues) {
      // Remove the problematic text
      const before = enhancedText.slice(0, issue.position);
      const after = enhancedText.slice(issue.position + issue.length);
      const replacement = this.getDebrisReplacement(issue.problematicText, options);

      enhancedText = before + replacement + after;

      improvements.push({
        type: "debris_removal",
        originalText: issue.problematicText,
        improvedText: replacement,
        position: issue.position,
        confidence: issue.confidence,
        source: "pattern_matching",
      });
    }

    return { text: enhancedText, improvements };
  }

  /**
   * Reconstruct broken words
   */
  private reconstructBrokenWords(
    text: string,
    issues: QualityIssue[],
    _options: TextEnhancementOptions,
  ): { text: string; improvements: QualityImprovement[] } {
    let enhancedText = text;
    const improvements: QualityImprovement[] = [];

    const brokenWordIssues = issues.filter((issue) => issue.type === "broken_word");

    // Sort by position (reverse order to maintain positions)
    const sortedIssues = [...brokenWordIssues].sort((a, b) => b.position - a.position);

    for (const issue of sortedIssues) {
      if (issue.suggestedFix) {
        const before = enhancedText.slice(0, issue.position);
        const after = enhancedText.slice(issue.position + issue.length);
        enhancedText = before + issue.suggestedFix + after;

        improvements.push({
          type: "word_reconstruction",
          originalText: issue.problematicText,
          improvedText: issue.suggestedFix,
          position: issue.position,
          confidence: issue.confidence,
          source: "pattern_matching",
        });
      }
    }

    return { text: enhancedText, improvements };
  }

  /**
   * Fix spelling errors using embedded text comparison
   */
  private fixSpellingErrors(
    text: string,
    issues: QualityIssue[],
    _options: TextEnhancementOptions,
  ): { text: string; improvements: QualityImprovement[] } {
    let enhancedText = text;
    const improvements: QualityImprovement[] = [];

    const spellingIssues = issues.filter((issue) => issue.type === "spelling_error");

    // Sort by position (reverse order to maintain positions)
    const sortedIssues = [...spellingIssues].sort((a, b) => b.position - a.position);

    for (const issue of sortedIssues) {
      if (issue.suggestedFix && issue.confidence > 0.5) {
        const before = enhancedText.slice(0, issue.position);
        const after = enhancedText.slice(issue.position + issue.length);
        enhancedText = before + issue.suggestedFix + after;

        improvements.push({
          type: "spelling_correction",
          originalText: issue.problematicText,
          improvedText: issue.suggestedFix,
          position: issue.position,
          confidence: issue.confidence,
          source: "embedded_text",
        });
      }
    }

    return { text: enhancedText, improvements };
  }

  /**
   * Clean weird characters
   */
  private cleanWeirdCharacters(
    text: string,
    issues: QualityIssue[],
    options: TextEnhancementOptions,
  ): { text: string; improvements: QualityImprovement[] } {
    let enhancedText = text;
    const improvements: QualityImprovement[] = [];

    const characterIssues = issues.filter((issue) => issue.type === "weird_character");

    // Sort by position (reverse order to maintain positions)
    const sortedIssues = [...characterIssues].sort((a, b) => b.position - a.position);

    for (const issue of sortedIssues) {
      const replacement = this.getCharacterReplacement(issue.problematicText, options);
      const before = enhancedText.slice(0, issue.position);
      const after = enhancedText.slice(issue.position + issue.length);
      enhancedText = before + replacement + after;

      improvements.push({
        type: "character_cleaning",
        originalText: issue.problematicText,
        improvedText: replacement,
        position: issue.position,
        confidence: 0.8,
        source: "pattern_matching",
      });
    }

    return { text: enhancedText, improvements };
  }

  /**
   * Check if a suggestion should be applied based on options
   */
  private shouldApplySuggestion(
    suggestion: QualityImprovement,
    options: TextEnhancementOptions,
  ): boolean {
    // Check confidence threshold
    if (suggestion.confidence < 0.5) return false;

    // Check type-specific options
    switch (suggestion.type) {
      case "spelling_correction":
        return options.fixSpellingErrors !== false;
      case "debris_removal":
        return options.removeOCRDebris !== false;
      case "word_reconstruction":
        return options.reconstructBrokenWords !== false;
      case "character_cleaning":
        return options.cleanWeirdCharacters !== false;
      default:
        return true;
    }
  }

  /**
   * Get replacement text for OCR debris
   */
  private getDebrisReplacement(
    debris: string,
    _options: TextEnhancementOptions,
  ): string {
    // Common OCR debris replacements
    const replacements = new Map([
      [/[|]+/g, " "],
      [/[~]+/g, " "],
      [/[`]+/g, "'"],
      [/[_]{3,}/g, " "],
      [/[.]{4,}/g, "..."],
    ]);

    let replacement = debris;
    for (const [pattern, replace] of replacements) {
      replacement = replacement.replace(pattern, replace);
    }

    return replacement.trim() || " ";
  }

  /**
   * Get replacement text for weird characters
   */
  private getCharacterReplacement(
    character: string,
    _options: TextEnhancementOptions,
  ): string {
    // Common character replacements for OCR artifacts
    const replacements = new Map<string, string>([
      ["\u00A0", " "], // Non-breaking space
      ["\u2019", "'"], // Right single quotation mark
      ["\u201C", '"'], // Left double quotation mark
      ["\u201D", '"'], // Right double quotation mark
      ["\u2013", "–"], // En dash
      ["\u2014", "—"], // Em dash
      ["\u00C2", "A"], // Latin capital letter A with circumflex
      ["\u00E9", "é"], // Latin small letter e with acute
      ["\u00E1", "á"], // Latin small letter a with acute
      ["\u00FC", "ü"], // Latin small letter u with diaeresis
    ]);

    return replacements.get(character) || "";
  }

  /**
   * Update enhancement summary with improvements
   */
  private updateSummary(
    summary: TextEnhancementResult["enhancementSummary"],
    improvements: QualityImprovement[],
  ): void {
    for (const improvement of improvements) {
      switch (improvement.type) {
        case "spelling_correction":
          summary.spellingCorrections++;
          break;
        case "debris_removal":
          summary.debrisRemoved++;
          break;
        case "word_reconstruction":
          summary.wordsReconstructed++;
          break;
        case "character_cleaning":
          summary.charactersFixed++;
          break;
      }
    }
  }

  /**
   * Calculate confidence in enhancement results
   */
  private calculateEnhancementConfidence(improvements: QualityImprovement[]): number {
    if (improvements.length === 0) return 1.0;

    const avgConfidence =
      improvements.reduce((sum, imp) => sum + imp.confidence, 0) / improvements.length;
    return Math.min(1.0, avgConfidence);
  }
}
