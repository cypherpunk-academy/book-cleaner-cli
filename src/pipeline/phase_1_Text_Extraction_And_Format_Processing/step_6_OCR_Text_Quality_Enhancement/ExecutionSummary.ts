import type { Logger } from 'pino';
import { LOG_COMPONENTS } from '../../../constants';
import type { LoggerService } from '../../../services/LoggerService';

/**
 * Pipeline step result interface
 */
interface PipelineStepResult {
    stepName: string;
    status: 'pending' | 'running' | 'completed' | 'failed';
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
 * OCR Text Quality Enhancement Step execution summary
 */
export interface OCRQualityEnhancementSummary {
    stepName: string;
    status: 'pending' | 'running' | 'completed' | 'failed';
    startTime: Date;
    endTime?: Date;
    duration?: number;

    // Input metrics
    inputMetrics: {
        textLength: number;
        wordCount: number;
        paragraphCount: number;
        sourceFiles: string[];
    };

    // OCR quality enhancement results
    enhancementResults: {
        ocrErrorsDetected: number;
        ocrErrorsCorrected: number;
        characterAccuracyImprovement: number;
        wordAccuracyImprovement: number;
        processingTime: number;
    };

    // Output metrics
    outputMetrics: {
        textLength: number;
        wordCount: number;
        paragraphCount: number;
        qualityScore: number;
        outputFiles: string[];
    };

    // Processing details
    processingDetails: {
        correctionStrategies: string[];
        confidenceThreshold: number;
        dictionaryValidation: boolean;
        contextualCorrection: boolean;
    };
}

/**
 * Step 1.6 execution summary - manages lifecycle and reporting
 */
export class Step1_6ExecutionSummary implements PipelineStepResult {
    private readonly logger: Logger;

    public readonly stepName = 'Phase 1 - Step 6: OCR Text Quality Enhancement';
    public status: 'pending' | 'running' | 'completed' | 'failed' = 'pending';
    public startTime: Date = new Date();
    public endTime?: Date;
    public duration?: number;
    public inputFiles: string[] = [];
    public outputFiles: string[] = [];
    public metrics: Record<string, unknown> = {};
    public errors: Array<{
        component: string;
        message: string;
        timestamp: Date;
    }> = [];

    // Step-specific summary data
    private summary: Partial<OCRQualityEnhancementSummary> = {};

    constructor(logger: LoggerService) {
        this.logger = logger.getPipelineLogger(LOG_COMPONENTS.PIPELINE_MANAGER);
    }

    /**
     * Mark step as started
     */
    start(inputFiles: string[]): void {
        this.status = 'running';
        this.startTime = new Date();
        this.inputFiles = inputFiles;
        this.summary = {
            stepName: this.stepName,
            status: this.status,
            startTime: this.startTime,
            inputMetrics: {
                textLength: 0,
                wordCount: 0,
                paragraphCount: 0,
                sourceFiles: inputFiles,
            },
            enhancementResults: {
                ocrErrorsDetected: 0,
                ocrErrorsCorrected: 0,
                characterAccuracyImprovement: 0,
                wordAccuracyImprovement: 0,
                processingTime: 0,
            },
            outputMetrics: {
                textLength: 0,
                wordCount: 0,
                paragraphCount: 0,
                qualityScore: 0,
                outputFiles: [],
            },
            processingDetails: {
                correctionStrategies: [],
                confidenceThreshold: 0.85,
                dictionaryValidation: true,
                contextualCorrection: true,
            },
        };

        this.logger.info(
            {
                inputFiles: inputFiles.length,
                startTime: this.startTime,
            },
            'Step 6 started: OCR Text Quality Enhancement',
        );
    }

    /**
     * Mark step as completed successfully
     */
    complete(outputFiles: string[], finalSummary: OCRQualityEnhancementSummary): void {
        this.status = 'completed';
        this.endTime = new Date();
        this.duration = this.endTime.getTime() - this.startTime.getTime();
        this.outputFiles = outputFiles;
        this.summary = { ...finalSummary };

        this.logger.info(
            {
                outputFiles: outputFiles.length,
                duration: this.duration,
                errorsCorreted: finalSummary.enhancementResults?.ocrErrorsCorrected || 0,
                accuracyImprovement:
                    finalSummary.enhancementResults?.characterAccuracyImprovement || 0,
            },
            'Step 6 completed successfully',
        );
    }

    /**
     * Mark step as failed
     */
    fail(error: Error, context?: Record<string, unknown>): void {
        this.status = 'failed';
        this.endTime = new Date();
        this.duration = this.endTime.getTime() - this.startTime.getTime();

        const errorInfo = {
            component: 'OCRQualityEnhancer',
            message: error.message,
            timestamp: new Date(),
        };

        this.errors.push(errorInfo);

        this.logger.error(
            {
                error: error.message,
                duration: this.duration,
                context,
            },
            'Step 6 failed',
        );
    }

    /**
     * Update enhancement metrics
     */
    updateEnhancementMetrics(
        metrics: Partial<OCRQualityEnhancementSummary['enhancementResults']>,
    ): void {
        if (this.summary.enhancementResults) {
            this.summary.enhancementResults = {
                ...this.summary.enhancementResults,
                ...metrics,
            };
        }
    }

    /**
     * Update input metrics
     */
    updateInputMetrics(metrics: Partial<OCRQualityEnhancementSummary['inputMetrics']>): void {
        if (this.summary.inputMetrics) {
            this.summary.inputMetrics = {
                ...this.summary.inputMetrics,
                ...metrics,
            };
        }
    }

    /**
     * Update output metrics
     */
    updateOutputMetrics(metrics: Partial<OCRQualityEnhancementSummary['outputMetrics']>): void {
        if (this.summary.outputMetrics) {
            this.summary.outputMetrics = {
                ...this.summary.outputMetrics,
                ...metrics,
            };
        }
    }

    /**
     * Get current execution summary
     */
    getSummary(): OCRQualityEnhancementSummary {
        return {
            stepName: this.stepName,
            status: this.status,
            startTime: this.startTime,
            endTime: this.endTime,
            duration: this.duration,
            ...this.summary,
        } as OCRQualityEnhancementSummary;
    }

    /**
     * Get pipeline-compatible result
     */
    getResult(): PipelineStepResult {
        return {
            stepName: this.stepName,
            status: this.status,
            startTime: this.startTime,
            endTime: this.endTime,
            duration: this.duration,
            inputFiles: this.inputFiles,
            outputFiles: this.outputFiles,
            metrics: this.summary as Record<string, unknown>,
            errors: this.errors,
        };
    }
}

/**
 * Type alias for external use
 */
export type OCRQualityEnhancementExecutionSummary = Step1_6ExecutionSummary;
