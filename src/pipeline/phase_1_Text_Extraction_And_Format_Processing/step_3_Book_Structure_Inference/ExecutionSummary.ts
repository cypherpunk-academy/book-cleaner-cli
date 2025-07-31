import { LOG_COMPONENTS } from '@/constants';
import type { LoggerService } from '@/services/LoggerService';
import type { StructureInferenceResult } from '@/services/BookStructureService/BookStructureService';

/**
 * Metrics for book structure inference
 */
export interface StructureInferenceMetrics {
    totalChunks: number;
    processedChunks: number;
    successfulChunks: number;
    failedChunks: number;
    totalEntries: number;
    matchedEntries: number;
    newEntries: number;
    correctedEntries: number;
    averageConfidence: number;
    processingTime: number;
    validationErrors: number;
    validationWarnings: number;
}

/**
 * Progress information for structure inference
 */
export interface StructureInferenceProgress {
    currentChunk: number;
    totalChunks: number;
    percentage: number;
    estimatedTimeRemaining: number;
    currentOperation: string;
}

/**
 * Execution summary for book structure inference step
 */
export class ExecutionSummary {
    private readonly logger: LoggerService;
    private startTime: number = 0;
    private endTime: number = 0;
    private metrics: StructureInferenceMetrics = {
        totalChunks: 0,
        processedChunks: 0,
        successfulChunks: 0,
        failedChunks: 0,
        totalEntries: 0,
        matchedEntries: 0,
        newEntries: 0,
        correctedEntries: 0,
        averageConfidence: 0,
        processingTime: 0,
        validationErrors: 0,
        validationWarnings: 0,
    };
    private progress: StructureInferenceProgress = {
        currentChunk: 0,
        totalChunks: 0,
        percentage: 0,
        estimatedTimeRemaining: 0,
        currentOperation: 'Initializing',
    };

    constructor(logger: LoggerService) {
        this.logger = logger;
    }

    /**
     * Start execution tracking
     */
    public startExecution(): void {
        this.startTime = Date.now();
        this.logger.info(LOG_COMPONENTS.CONFIG_SERVICE, 'Starting book structure inference execution');
    }

    /**
     * End execution tracking
     */
    public endExecution(): void {
        this.endTime = Date.now();
        this.metrics.processingTime = this.endTime - this.startTime;
        this.logger.info(LOG_COMPONENTS.CONFIG_SERVICE, 'Completed book structure inference execution', {
            processingTime: this.metrics.processingTime,
        });
    }

    /**
     * Update metrics from inference result
     */
    public updateFromResult(result: StructureInferenceResult): void {
        this.metrics.totalEntries = result.originalStructure.length;
        this.metrics.matchedEntries = result.corrections.length;
        this.metrics.newEntries = result.newEntries.length;
        this.metrics.correctedEntries = result.corrections.length;
        this.metrics.averageConfidence = result.confidence;
        this.metrics.validationErrors = result.errors.length;
        this.metrics.validationWarnings = 0; // Would be updated if warnings were tracked

        this.logger.debug(LOG_COMPONENTS.CONFIG_SERVICE, 'Updated metrics from inference result', {
            totalEntries: this.metrics.totalEntries,
            matchedEntries: this.metrics.matchedEntries,
            newEntries: this.metrics.newEntries,
            correctedEntries: this.metrics.correctedEntries,
            confidence: this.metrics.averageConfidence,
        });
    }

    /**
     * Update chunk processing metrics
     */
    public updateChunkMetrics(
        totalChunks: number,
        successfulChunks: number,
        failedChunks: number,
    ): void {
        this.metrics.totalChunks = totalChunks;
        this.metrics.successfulChunks = successfulChunks;
        this.metrics.failedChunks = failedChunks;
        this.metrics.processedChunks = successfulChunks + failedChunks;

        this.logger.debug(LOG_COMPONENTS.CONFIG_SERVICE, 'Updated chunk metrics', {
            totalChunks: this.metrics.totalChunks,
            successfulChunks: this.metrics.successfulChunks,
            failedChunks: this.metrics.failedChunks,
            processedChunks: this.metrics.processedChunks,
        });
    }

    /**
     * Update progress information
     */
    public updateProgress(
        currentChunk: number,
        totalChunks: number,
        currentOperation: string,
    ): void {
        this.progress.currentChunk = currentChunk;
        this.progress.totalChunks = totalChunks;
        this.progress.percentage = totalChunks > 0 ? (currentChunk / totalChunks) * 100 : 0;
        this.progress.currentOperation = currentOperation;

        // Calculate estimated time remaining
        if (currentChunk > 0) {
            const elapsedTime = Date.now() - this.startTime;
            const averageTimePerChunk = elapsedTime / currentChunk;
            const remainingChunks = totalChunks - currentChunk;
            this.progress.estimatedTimeRemaining = averageTimePerChunk * remainingChunks;
        }

        this.logger.debug(LOG_COMPONENTS.CONFIG_SERVICE, 'Updated progress', {
            currentChunk: this.progress.currentChunk,
            totalChunks: this.progress.totalChunks,
            percentage: this.progress.percentage.toFixed(1),
            currentOperation: this.progress.currentOperation,
            estimatedTimeRemaining: this.progress.estimatedTimeRemaining,
        });
    }

    /**
     * Get current metrics
     */
    public getMetrics(): StructureInferenceMetrics {
        return { ...this.metrics };
    }

    /**
     * Get current progress
     */
    public getProgress(): StructureInferenceProgress {
        return { ...this.progress };
    }

    /**
     * Generate detailed execution report
     */
    public generateReport(): string {
        const report = [
            '=== Book Structure Inference Execution Summary ===',
            '',
            `Processing Time: ${this.formatDuration(this.metrics.processingTime)}`,
            `Total Chunks: ${this.metrics.totalChunks}`,
            `Processed Chunks: ${this.metrics.processedChunks}`,
            `Successful Chunks: ${this.metrics.successfulChunks}`,
            `Failed Chunks: ${this.metrics.failedChunks}`,
            `Success Rate: ${this.metrics.totalChunks > 0 ? ((this.metrics.successfulChunks / this.metrics.totalChunks) * 100).toFixed(1) : 0}%`,
            '',
            'Structure Analysis:',
            `  Total Entries: ${this.metrics.totalEntries}`,
            `  Matched Entries: ${this.metrics.matchedEntries}`,
            `  New Entries: ${this.metrics.newEntries}`,
            `  Corrected Entries: ${this.metrics.correctedEntries}`,
            `  Average Confidence: ${(this.metrics.averageConfidence * 100).toFixed(1)}%`,
            '',
            'Validation:',
            `  Errors: ${this.metrics.validationErrors}`,
            `  Warnings: ${this.metrics.validationWarnings}`,
            '',
            'Progress:',
            `  Current Chunk: ${this.progress.currentChunk}/${this.progress.totalChunks}`,
            `  Completion: ${this.progress.percentage.toFixed(1)}%`,
            `  Current Operation: ${this.progress.currentOperation}`,
            `  Estimated Time Remaining: ${this.formatDuration(this.progress.estimatedTimeRemaining)}`,
            '',
            '=== End Summary ===',
        ];

        return report.join('\n');
    }

    /**
     * Log execution summary
     */
    public logSummary(): void {
        const report = this.generateReport();
        this.logger.info(LOG_COMPONENTS.CONFIG_SERVICE, 'Book structure inference execution summary', {
            report,
            metrics: this.metrics,
            progress: this.progress,
        });
    }

    /**
     * Format duration in milliseconds to human-readable string
     */
    private formatDuration(milliseconds: number): string {
        if (milliseconds < 1000) {
            return `${milliseconds}ms`;
        }

        const seconds = Math.floor(milliseconds / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);

        if (hours > 0) {
            return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
        } else if (minutes > 0) {
            return `${minutes}m ${seconds % 60}s`;
        } else {
            return `${seconds}s`;
        }
    }

    /**
     * Reset execution state
     */
    public reset(): void {
        this.startTime = 0;
        this.endTime = 0;
        this.metrics = {
            totalChunks: 0,
            processedChunks: 0,
            successfulChunks: 0,
            failedChunks: 0,
            totalEntries: 0,
            matchedEntries: 0,
            newEntries: 0,
            correctedEntries: 0,
            averageConfidence: 0,
            processingTime: 0,
            validationErrors: 0,
            validationWarnings: 0,
        };
        this.progress = {
            currentChunk: 0,
            totalChunks: 0,
            percentage: 0,
            estimatedTimeRemaining: 0,
            currentOperation: 'Initializing',
        };
    }

    /**
     * Check if execution is complete
     */
    public isComplete(): boolean {
        return this.endTime > 0;
    }

    /**
     * Check if execution was successful
     */
    public isSuccessful(): boolean {
        return this.isComplete() && this.metrics.failedChunks === 0;
    }

    /**
     * Get execution status
     */
    public getStatus(): {
        isComplete: boolean;
        isSuccessful: boolean;
        hasErrors: boolean;
        hasWarnings: boolean;
    } {
        return {
            isComplete: this.isComplete(),
            isSuccessful: this.isSuccessful(),
            hasErrors: this.metrics.validationErrors > 0 || this.metrics.failedChunks > 0,
            hasWarnings: this.metrics.validationWarnings > 0,
        };
    }
} 