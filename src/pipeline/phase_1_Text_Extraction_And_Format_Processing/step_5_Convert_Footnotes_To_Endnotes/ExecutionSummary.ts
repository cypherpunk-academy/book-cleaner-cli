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
 * Convert Footnotes to Endnotes Step execution summary
 */
export interface FootnoteConversionSummary {
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

    // Footnote conversion results
    conversionResults: {
        footnotesFound: number;
        footnotesConverted: number;
        endnotesGenerated: number;
        conversionErrors: number;
        processingTime: number;
    };

    // Output metrics
    outputMetrics: {
        textLength: number;
        wordCount: number;
        paragraphCount: number;
        endnotesCount: number;
        outputFiles: string[];
    };

    // Processing details
    processingDetails: {
        footnotePatterns: string[];
        conversionStrategy: string;
        preservedFormatting: boolean;
        qualityValidation: boolean;
    };
}

/**
 * Step 1.5 execution summary - manages lifecycle and reporting
 */
export class Step1_5ExecutionSummary implements PipelineStepResult {
    private readonly logger: Logger;

    public readonly stepName = 'Phase 1 - Step 5: Convert Footnotes to Endnotes';
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
    private summary: Partial<FootnoteConversionSummary> = {};

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
            conversionResults: {
                footnotesFound: 0,
                footnotesConverted: 0,
                endnotesGenerated: 0,
                conversionErrors: 0,
                processingTime: 0,
            },
            outputMetrics: {
                textLength: 0,
                wordCount: 0,
                paragraphCount: 0,
                endnotesCount: 0,
                outputFiles: [],
            },
            processingDetails: {
                footnotePatterns: [],
                conversionStrategy: 'standard',
                preservedFormatting: true,
                qualityValidation: true,
            },
        };

        this.logger.info(
            {
                inputFiles: inputFiles.length,
                startTime: this.startTime,
            },
            'Step 5 started: Convert Footnotes to Endnotes',
        );
    }

    /**
     * Mark step as completed successfully
     */
    complete(outputFiles: string[], finalSummary: FootnoteConversionSummary): void {
        this.status = 'completed';
        this.endTime = new Date();
        this.duration = this.endTime.getTime() - this.startTime.getTime();
        this.outputFiles = outputFiles;
        this.summary = { ...finalSummary };

        this.logger.info(
            {
                outputFiles: outputFiles.length,
                duration: this.duration,
                footnotesConverted: finalSummary.conversionResults?.footnotesConverted || 0,
            },
            'Step 5 completed successfully',
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
            component: 'FootnoteConverter',
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
            'Step 5 failed',
        );
    }

    /**
     * Update conversion metrics
     */
    updateConversionMetrics(
        metrics: Partial<FootnoteConversionSummary['conversionResults']>,
    ): void {
        if (this.summary.conversionResults) {
            this.summary.conversionResults = {
                ...this.summary.conversionResults,
                ...metrics,
            };
        }
    }

    /**
     * Update input metrics
     */
    updateInputMetrics(metrics: Partial<FootnoteConversionSummary['inputMetrics']>): void {
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
    updateOutputMetrics(metrics: Partial<FootnoteConversionSummary['outputMetrics']>): void {
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
    getSummary(): FootnoteConversionSummary {
        return {
            stepName: this.stepName,
            status: this.status,
            startTime: this.startTime,
            endTime: this.endTime,
            duration: this.duration,
            ...this.summary,
        } as FootnoteConversionSummary;
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
export type FootnoteConversionExecutionSummary = Step1_5ExecutionSummary;
