import { randomUUID } from 'node:crypto';
import {
    ERROR_CODES,
    ERROR_MESSAGES,
    LOG_COMPONENTS,
    MESSAGE_TEMPLATES,
    PIPELINE_PHASES,
    PIPELINE_PHASE_NAMES,
    PIPELINE_STATUS,
} from '@/constants';
import type { LoggerService } from '@/services/LoggerService';
import { formatLogMessage } from '@/services/LoggerService';
import {
    type FilenameMetadata,
    type PhaseResult,
    type PipelineConfig,
    type PipelineState,
    PipelineStatus,
    ProcessingMetadata,
    type ProgressCallback,
    type SupportedFormat,
} from '@/types';
import { AppError } from '@/utils/AppError';
import type { AbstractPhase } from './AbstractPhase';

/**
 * Main pipeline manager that orchestrates the entire book processing pipeline
 */
export class PipelineManager {
    private readonly logger: LoggerService;
    private readonly phases: Map<string, AbstractPhase> = new Map();
    private state: PipelineState | null = null;
    private progressCallback?: ProgressCallback;

    constructor(logger: LoggerService) {
        this.logger = logger;
    }

    /**
     * Register a processing phase
     */
    public registerPhase(phaseId: string, phase: AbstractPhase): void {
        this.phases.set(phaseId, phase);

        const pipelineLogger = this.logger.getPipelineLogger(
            LOG_COMPONENTS.PIPELINE_MANAGER,
        );
        pipelineLogger.debug(
            {
                phaseId,
                phaseName: phase.getName(),
            },
            'Phase registered',
        );
    }

    /**
     * Set progress callback
     */
    public setProgressCallback(callback: ProgressCallback): void {
        this.progressCallback = callback;
    }

    /**
     * Execute the complete pipeline
     */
    public async execute(
        config: PipelineConfig,
        metadata: FilenameMetadata,
    ): Promise<PipelineState> {
        const pipelineLogger = this.logger.getPipelineLogger(
            LOG_COMPONENTS.PIPELINE_MANAGER,
        );

        // Initialize pipeline state
        this.state = this.initializePipelineState(config, metadata);

        pipelineLogger.info(
            {
                pipelineId: this.state.id,
                inputFile: config.inputFile,
                phases: this.getEnabledPhases(config),
            },
            formatLogMessage(MESSAGE_TEMPLATES.PROCESSING_START, {
                filename: config.inputFile,
            }),
        );

        const startTime = Date.now();

        try {
            // Execute enabled phases in sequence
            await this.executePhases(config);

            // Mark pipeline as completed
            this.state.status = PIPELINE_STATUS.COMPLETED;
            this.state.endTime = new Date();

            const duration = Date.now() - startTime;
            pipelineLogger.info(
                {
                    pipelineId: this.state.id,
                    duration,
                    phases: this.state.results.length,
                },
                formatLogMessage(MESSAGE_TEMPLATES.PROCESSING_COMPLETE, { duration }),
            );

            return this.state;
        } catch (error) {
            // Handle pipeline failure
            this.state.status = PIPELINE_STATUS.FAILED;
            this.state.endTime = new Date();
            this.state.error = error instanceof Error ? error.message : String(error);

            const duration = Date.now() - startTime;
            pipelineLogger.error(
                {
                    pipelineId: this.state.id,
                    duration,
                    error: this.state.error,
                    phase: this.state.currentPhase,
                },
                formatLogMessage(MESSAGE_TEMPLATES.PROCESSING_ERROR, {
                    error: this.state.error,
                }),
            );

            throw error;
        }
    }

    /**
     * Cancel pipeline execution
     */
    public async cancel(): Promise<void> {
        if (!this.state || this.state.status !== PIPELINE_STATUS.RUNNING) {
            return;
        }

        const pipelineLogger = this.logger.getPipelineLogger(
            LOG_COMPONENTS.PIPELINE_MANAGER,
        );

        this.state.status = PIPELINE_STATUS.CANCELLED;
        this.state.endTime = new Date();

        pipelineLogger.info(
            {
                pipelineId: this.state.id,
                phase: this.state.currentPhase,
            },
            'Pipeline execution cancelled',
        );
    }

    /**
     * Get current pipeline state
     */
    public getState(): PipelineState | null {
        return this.state;
    }

    /**
     * Initialize pipeline state
     */
    private initializePipelineState(
        config: PipelineConfig,
        metadata: FilenameMetadata,
    ): PipelineState {
        const enabledPhases = this.getEnabledPhases(config);

        return {
            id: randomUUID(),
            inputFile: config.inputFile,
            outputDir: config.outputDir,
            bookType: config.bookType,
            skipStartMarker: config.skipStartMarker,
            currentPhase: 0,
            totalPhases: enabledPhases.length,
            status: PIPELINE_STATUS.PENDING,
            startTime: new Date(),
            metadata: {
                author: metadata.author,
                title: metadata.title,
                ...(metadata.bookIndex && { bookIndex: metadata.bookIndex }),
                originalFormat: this.getFileFormat(config.inputFile),
                fileSize: 0, // Will be populated during processing
            },
            results: [],
        };
    }

    /**
     * Execute all enabled phases
     */
    private async executePhases(config: PipelineConfig): Promise<void> {
        const enabledPhases = this.getEnabledPhases(config);

        if (!this.state) {
            throw new AppError(
                ERROR_CODES.PIPELINE_FAILED,
                LOG_COMPONENTS.PIPELINE_MANAGER,
                'executePhases',
                'Pipeline state not initialized',
                { config },
            );
        }

        this.state.status = PIPELINE_STATUS.RUNNING;

        for (let i = 0; i < enabledPhases.length; i++) {
            const phaseId = enabledPhases[i];
            if (!phaseId) {
                throw new AppError(
                    ERROR_CODES.PIPELINE_FAILED,
                    LOG_COMPONENTS.PIPELINE_MANAGER,
                    'executePhases',
                    `Phase ID is undefined at index ${i}`,
                    { enabledPhases, index: i },
                );
            }

            const phase = this.phases.get(phaseId);

            if (!phase) {
                throw new AppError(
                    ERROR_CODES.PIPELINE_FAILED,
                    LOG_COMPONENTS.PIPELINE_MANAGER,
                    'executePhases',
                    `Phase not found: ${phaseId}`,
                    { phaseId, availablePhases: Array.from(this.phases.keys()) },
                );
            }

            this.state.currentPhase = i + 1;

            // Execute phase
            await this.executePhase(phase, phaseId, i + 1);
        }
    }

    /**
     * Execute a single phase
     */
    private async executePhase(
        phase: AbstractPhase,
        _phaseId: string,
        phaseNumber: number,
    ): Promise<void> {
        const pipelineLogger = this.logger.getPipelineLogger(
            LOG_COMPONENTS.PIPELINE_MANAGER,
        );

        const phaseResult: PhaseResult = {
            phase: phaseNumber,
            name: phase.getName(),
            status: PIPELINE_STATUS.RUNNING,
            startTime: new Date(),
        };

        this.state?.results.push(phaseResult);

        pipelineLogger.info(
            {
                pipelineId: this.state?.id,
                phase: phaseNumber,
                phaseName: phase.getName(),
            },
            formatLogMessage(MESSAGE_TEMPLATES.PHASE_START, {
                phase: phaseNumber,
                name: phase.getName(),
            }),
        );

        // Report progress
        this.reportProgress(phaseNumber, phase.getName(), 'Starting phase');

        const startTime = Date.now();

        try {
            // Execute phase with progress callback
            if (!this.state) {
                throw new AppError(
                    ERROR_CODES.PIPELINE_FAILED,
                    LOG_COMPONENTS.PIPELINE_MANAGER,
                    'executePhase',
                    'Pipeline state not initialized',
                    { phase: phaseNumber, phaseName: phase.getName() },
                );
            }

            const output = await phase.execute(this.state, (progress) => {
                this.reportProgress(
                    phaseNumber,
                    phase.getName(),
                    progress.message,
                    progress.percentage,
                );
            });

            // Update phase result
            phaseResult.status = PIPELINE_STATUS.COMPLETED;
            phaseResult.endTime = new Date();
            phaseResult.duration = Date.now() - startTime;
            phaseResult.output = output;
            phaseResult.metrics = phase.getMetrics();

            pipelineLogger.info(
                {
                    pipelineId: this.state?.id,
                    phase: phaseNumber,
                    phaseName: phase.getName(),
                    duration: phaseResult.duration,
                    metrics: phaseResult.metrics,
                },
                formatLogMessage(MESSAGE_TEMPLATES.PHASE_COMPLETE, {
                    phase: phaseNumber,
                    duration: phaseResult.duration,
                }),
            );
        } catch (error) {
            // Handle phase failure
            phaseResult.status = PIPELINE_STATUS.FAILED;
            phaseResult.endTime = new Date();
            phaseResult.duration = Date.now() - startTime;
            phaseResult.error = error instanceof Error ? error.message : String(error);

            pipelineLogger.error(
                {
                    pipelineId: this.state?.id,
                    phase: phaseNumber,
                    phaseName: phase.getName(),
                    duration: phaseResult.duration,
                    error: phaseResult.error,
                },
                formatLogMessage(MESSAGE_TEMPLATES.PHASE_ERROR, {
                    phase: phaseNumber,
                    error: phaseResult.error,
                }),
            );

            throw error;
        }
    }

    /**
     * Report progress to callback
     */
    private reportProgress(
        phaseNumber: number,
        phaseName: string,
        message: string,
        percentage?: number,
    ): void {
        if (!this.progressCallback || !this.state) {
            return;
        }

        const current = phaseNumber;
        const total = this.state.totalPhases;
        const overallPercentage = percentage
            ? Math.round(((current - 1) / total) * 100 + percentage / total)
            : Math.round((current / total) * 100);

        this.progressCallback({
            current,
            total,
            percentage: overallPercentage,
            message,
            phase: phaseName,
            step: message,
        });
    }

    /**
     * Get enabled phases based on configuration
     */
    private getEnabledPhases(config: PipelineConfig): string[] {
        const enabled: string[] = [];

        if (config.phases.dataLoading) {
            enabled.push(PIPELINE_PHASES.DATA_LOADING);
        }

        if (config.phases.textNormalization) {
            enabled.push(PIPELINE_PHASES.TEXT_NORMALIZATION);
        }

        if (config.phases.evaluation) {
            enabled.push(PIPELINE_PHASES.EVALUATION);
        }

        if (config.phases.aiEnhancements) {
            enabled.push(PIPELINE_PHASES.AI_ENHANCEMENTS);
        }

        return enabled;
    }

    /**
     * Get file format from filename
     */
    private getFileFormat(filename: string): SupportedFormat {
        const ext = filename.toLowerCase().split('.').pop();

        switch (ext) {
            case 'pdf':
                return 'pdf';
            case 'epub':
                return 'epub';
            case 'txt':
                return 'txt';
            default:
                return 'txt'; // Default fallback
        }
    }

    /**
     * Clean up resources
     */
    public async cleanup(): Promise<void> {
        const pipelineLogger = this.logger.getPipelineLogger(
            LOG_COMPONENTS.PIPELINE_MANAGER,
        );

        try {
            // Clean up all phases
            for (const [_phaseId, phase] of this.phases) {
                if (typeof phase.cleanup === 'function') {
                    await phase.cleanup();
                }
            }

            pipelineLogger.debug(
                {
                    pipelineId: this.state?.id,
                    phases: this.phases.size,
                },
                'Pipeline cleanup completed',
            );
        } catch (error) {
            pipelineLogger.error(
                {
                    pipelineId: this.state?.id,
                    error: error instanceof Error ? error.message : String(error),
                },
                'Pipeline cleanup failed',
            );
        }
    }
}
