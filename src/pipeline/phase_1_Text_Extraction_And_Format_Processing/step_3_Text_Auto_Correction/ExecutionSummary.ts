import { LOG_COMPONENTS } from "../../../constants";
import type { LoggerService } from "../../../services/LoggerService";
import type { QualityValidationResult } from "./QualityValidator";
import type { TextQualityAnalysisResult } from "./TextComparator";
import type { TextEnhancementResult } from "./TextEnhancer";

/**
 * Pipeline step result interface
 */
interface PipelineStepResult {
  stepName: string;
  status: "pending" | "running" | "completed" | "failed";
  startTime: Date;
  endTime?: Date;
  duration?: number;
  inputFiles: string[];
  outputFiles: string[];
  metrics: Record<string, unknown>;
  errors: Array<{
    component: string;
    message: string;
    timestamp: Date;
  }>;
}

/**
 * Text Quality Enhancement Step execution summary
 */
export interface TextQualityEnhancementSummary {
  stepName: string;
  status: "pending" | "running" | "completed" | "failed";
  startTime: Date;
  endTime?: Date;
  duration?: number;

  // Input metrics
  inputMetrics: {
    textLength: number;
    wordCount: number;
    sentenceCount: number;
    paragraphCount: number;
    sourceFiles: string[];
  };

  // Quality analysis results
  qualityAnalysis: {
    overallQuality: number;
    issuesFound: number;
    issueTypes: Record<string, number>;
    processingTime: number;
    comparisonMethod: string;
  };

  // Enhancement results
  enhancement: {
    improvementsMade: number;
    issuesFixed: number;
    issuesRemaining: number;
    confidence: number;
    enhancementSummary: {
      spellingCorrections: number;
      debrisRemoved: number;
      wordsReconstructed: number;
      charactersFixed: number;
    };
    processingTime: number;
  };

  // Validation results
  validation: {
    isValid: boolean;
    overallScore: number;
    validationIssues: number;
    recommendationsGenerated: number;
    processingTime: number;
  };

  // Output metrics
  outputMetrics: {
    enhancedTextLength: number;
    qualityImprovement: number;
    textChangePercentage: number;
    outputFiles: string[];
  };

  // Error information
  errors: Array<{
    component: string;
    message: string;
    timestamp: Date;
  }>;
}

/**
 * Execution summary for Text Quality Enhancement step
 */
export class TextQualityEnhancementExecutionSummary {
  private summary: TextQualityEnhancementSummary;
  private readonly logger: LoggerService;

  constructor(logger: LoggerService) {
    this.logger = logger;
    this.summary = {
      stepName: "Text Quality Enhancement",
      status: "pending",
      startTime: new Date(),
      inputMetrics: {
        textLength: 0,
        wordCount: 0,
        sentenceCount: 0,
        paragraphCount: 0,
        sourceFiles: [],
      },
      qualityAnalysis: {
        overallQuality: 0,
        issuesFound: 0,
        issueTypes: {},
        processingTime: 0,
        comparisonMethod: "",
      },
      enhancement: {
        improvementsMade: 0,
        issuesFixed: 0,
        issuesRemaining: 0,
        confidence: 0,
        enhancementSummary: {
          spellingCorrections: 0,
          debrisRemoved: 0,
          wordsReconstructed: 0,
          charactersFixed: 0,
        },
        processingTime: 0,
      },
      validation: {
        isValid: false,
        overallScore: 0,
        validationIssues: 0,
        recommendationsGenerated: 0,
        processingTime: 0,
      },
      outputMetrics: {
        enhancedTextLength: 0,
        qualityImprovement: 0,
        textChangePercentage: 0,
        outputFiles: [],
      },
      errors: [],
    };
  }

  /**
   * Mark the step as started
   */
  markStarted(): void {
    this.summary.status = "running";
    this.summary.startTime = new Date();

    const summaryLogger = this.logger.getTextExtractionLogger(
      LOG_COMPONENTS.PIPELINE_MANAGER,
    );

    summaryLogger.info("Text Quality Enhancement step started");
  }

  /**
   * Record input metrics
   */
  recordInputMetrics(text: string, sourceFiles: string[]): void {
    this.summary.inputMetrics = {
      textLength: text.length,
      wordCount: text
        .trim()
        .split(/\s+/)
        .filter((word) => word.length > 0).length,
      sentenceCount: text
        .split(/[.!?]+/)
        .filter((sentence) => sentence.trim().length > 0).length,
      paragraphCount: text
        .split(/\n\s*\n/)
        .filter((paragraph) => paragraph.trim().length > 0).length,
      sourceFiles,
    };
  }

  /**
   * Record quality analysis results
   */
  recordQualityAnalysis(analysisResult: TextQualityAnalysisResult): void {
    // Count issues by type
    const issueTypes: Record<string, number> = {};
    analysisResult.issues.forEach((issue) => {
      issueTypes[issue.type] = (issueTypes[issue.type] || 0) + 1;
    });

    this.summary.qualityAnalysis = {
      overallQuality: analysisResult.overallQuality,
      issuesFound: analysisResult.issues.length,
      issueTypes,
      processingTime: analysisResult.processingTime,
      comparisonMethod: analysisResult.comparisonMethod,
    };
  }

  /**
   * Record enhancement results
   */
  recordEnhancement(enhancementResult: TextEnhancementResult): void {
    this.summary.enhancement = {
      improvementsMade: enhancementResult.improvementsMade.length,
      issuesFixed: enhancementResult.issuesFixed,
      issuesRemaining: enhancementResult.issuesRemaining,
      confidence: enhancementResult.confidence,
      enhancementSummary: enhancementResult.enhancementSummary,
      processingTime: enhancementResult.processingTime,
    };
  }

  /**
   * Record validation results
   */
  recordValidation(validationResult: QualityValidationResult): void {
    this.summary.validation = {
      isValid: validationResult.isValid,
      overallScore: validationResult.overallScore,
      validationIssues: validationResult.validationIssues.length,
      recommendationsGenerated: validationResult.recommendations.length,
      processingTime: validationResult.processingTime,
    };
  }

  /**
   * Record output metrics
   */
  recordOutputMetrics(
    originalText: string,
    enhancedText: string,
    outputFiles: string[],
  ): void {
    const qualityImprovement =
      this.summary.qualityAnalysis.overallQuality > 0
        ? this.summary.validation.overallScore -
          this.summary.qualityAnalysis.overallQuality
        : 0;

    const textChangePercentage =
      originalText.length > 0
        ? Math.abs(enhancedText.length - originalText.length) / originalText.length
        : 0;

    this.summary.outputMetrics = {
      enhancedTextLength: enhancedText.length,
      qualityImprovement,
      textChangePercentage,
      outputFiles,
    };
  }

  /**
   * Record an error
   */
  recordError(component: string, error: Error): void {
    this.summary.errors.push({
      component,
      message: error.message,
      timestamp: new Date(),
    });
  }

  /**
   * Mark the step as completed
   */
  markCompleted(): void {
    this.summary.status = "completed";
    this.summary.endTime = new Date();
    this.summary.duration =
      this.summary.endTime.getTime() - this.summary.startTime.getTime();

    const summaryLogger = this.logger.getTextExtractionLogger(
      LOG_COMPONENTS.PIPELINE_MANAGER,
    );

    summaryLogger.info(
      {
        duration: this.summary.duration,
        enhancementsMade: this.summary.enhancement.improvementsMade,
        qualityScore: this.summary.validation.overallScore,
        isValid: this.summary.validation.isValid,
      },
      "Text Quality Enhancement step completed",
    );
  }

  /**
   * Mark the step as failed
   */
  markFailed(error: Error): void {
    this.summary.status = "failed";
    this.summary.endTime = new Date();
    this.summary.duration =
      this.summary.endTime.getTime() - this.summary.startTime.getTime();

    this.recordError("step_execution", error);

    const summaryLogger = this.logger.getTextExtractionLogger(
      LOG_COMPONENTS.PIPELINE_MANAGER,
    );

    summaryLogger.error(
      {
        duration: this.summary.duration,
        error: error.message,
        errorsRecorded: this.summary.errors.length,
      },
      "Text Quality Enhancement step failed",
    );
  }

  /**
   * Get the current summary
   */
  getSummary(): TextQualityEnhancementSummary {
    return { ...this.summary };
  }

  /**
   * Get summary as pipeline step result
   */
  toPipelineStepResult(): PipelineStepResult {
    return {
      stepName: this.summary.stepName,
      status: this.summary.status,
      startTime: this.summary.startTime,
      endTime: this.summary.endTime,
      duration: this.summary.duration,
      inputFiles: this.summary.inputMetrics.sourceFiles,
      outputFiles: this.summary.outputMetrics.outputFiles,
      metrics: {
        inputTextLength: this.summary.inputMetrics.textLength,
        outputTextLength: this.summary.outputMetrics.enhancedTextLength,
        wordsProcessed: this.summary.inputMetrics.wordCount,
        enhancementsMade: this.summary.enhancement.improvementsMade,
        qualityScore: this.summary.validation.overallScore,
        validationPassed: this.summary.validation.isValid,
        processingTime: {
          analysis: this.summary.qualityAnalysis.processingTime,
          enhancement: this.summary.enhancement.processingTime,
          validation: this.summary.validation.processingTime,
        },
      },
      errors: this.summary.errors,
    };
  }

  /**
   * Get formatted summary report
   */
  getFormattedSummary(): string {
    const lines = [
      "=== TEXT QUALITY ENHANCEMENT STEP SUMMARY ===",
      `Status: ${this.summary.status.toUpperCase()}`,
      `Duration: ${this.summary.duration || 0}ms`,
      "",
      "Input Metrics:",
      `  - Text Length: ${this.summary.inputMetrics.textLength.toLocaleString()} characters`,
      `  - Word Count: ${this.summary.inputMetrics.wordCount.toLocaleString()} words`,
      `  - Sentence Count: ${this.summary.inputMetrics.sentenceCount.toLocaleString()} sentences`,
      `  - Paragraph Count: ${this.summary.inputMetrics.paragraphCount.toLocaleString()} paragraphs`,
      `  - Source Files: ${this.summary.inputMetrics.sourceFiles.length}`,
      "",
      "Quality Analysis:",
      `  - Overall Quality: ${(this.summary.qualityAnalysis.overallQuality * 100).toFixed(1)}%`,
      `  - Issues Found: ${this.summary.qualityAnalysis.issuesFound}`,
      `  - Issue Types: ${Object.entries(this.summary.qualityAnalysis.issueTypes)
        .map(([type, count]) => `${type}(${count})`)
        .join(", ")}`,
      `  - Processing Time: ${this.summary.qualityAnalysis.processingTime}ms`,
      "",
      "Enhancement Results:",
      `  - Improvements Made: ${this.summary.enhancement.improvementsMade}`,
      `  - Issues Fixed: ${this.summary.enhancement.issuesFixed}`,
      `  - Issues Remaining: ${this.summary.enhancement.issuesRemaining}`,
      `  - Confidence: ${(this.summary.enhancement.confidence * 100).toFixed(1)}%`,
      `  - Spelling Corrections: ${this.summary.enhancement.enhancementSummary.spellingCorrections}`,
      `  - Debris Removed: ${this.summary.enhancement.enhancementSummary.debrisRemoved}`,
      `  - Words Reconstructed: ${this.summary.enhancement.enhancementSummary.wordsReconstructed}`,
      `  - Characters Fixed: ${this.summary.enhancement.enhancementSummary.charactersFixed}`,
      "",
      "Validation Results:",
      `  - Valid: ${this.summary.validation.isValid ? "YES" : "NO"}`,
      `  - Overall Score: ${(this.summary.validation.overallScore * 100).toFixed(1)}%`,
      `  - Validation Issues: ${this.summary.validation.validationIssues}`,
      `  - Recommendations: ${this.summary.validation.recommendationsGenerated}`,
      "",
      "Output Metrics:",
      `  - Enhanced Text Length: ${this.summary.outputMetrics.enhancedTextLength.toLocaleString()} characters`,
      `  - Quality Improvement: ${(this.summary.outputMetrics.qualityImprovement * 100).toFixed(1)}%`,
      `  - Text Change: ${(this.summary.outputMetrics.textChangePercentage * 100).toFixed(1)}%`,
      `  - Output Files: ${this.summary.outputMetrics.outputFiles.length}`,
    ];

    if (this.summary.errors.length > 0) {
      lines.push("", `Errors (${this.summary.errors.length}):`);
      this.summary.errors.forEach((error, index) => {
        lines.push(`  ${index + 1}. [${error.component}] ${error.message}`);
      });
    }

    return lines.join("\n");
  }
}

// Type alias for consistency with phase execution summary
export type Step1_3ExecutionSummary = TextQualityEnhancementExecutionSummary;
