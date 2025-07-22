import path from 'node:path';
import {
    APP_DESCRIPTION,
    APP_VERSION,
    BOOK_TYPES,
    CLI_ALIASES,
    CLI_OPTIONS,
    DEFAULT_LOG_LEVEL,
    DEFAULT_OUTPUT_DIR,
    ERROR_CODES,
    LOG_COMPONENTS,
    LOG_LEVELS,
    PIPELINE_PHASES,
    VALID_BOOK_TYPES,
} from '@/constants';
import { AIEnhancementsPhase } from '@/pipeline/AIEnhancementsPhase';
import { DataLoadingPhase } from '@/pipeline/DataLoadingPhase';
import { EvaluationPhase } from '@/pipeline/EvaluationPhase';
import { PipelineManager } from '@/pipeline/PipelineManager';
import { TextNormalizationPhase } from '@/pipeline/TextNormalizationPhase';
import { ConfigService } from '@/services/ConfigService';
import { BookStructureService } from '@/services/BookStructureService';
import { type LoggerService, createDefaultLoggerService } from '@/services/LoggerService';
import type { CLIOptions, FilenameMetadata, LogLevel, PipelineState, ProgressInfo } from '@/types';
import { AppError, isAppError } from '@/utils/AppError';
import {
    error as chalkError,
    cyan,
    getChalkInstance,
    gray,
    info,
    success,
    warn,
} from '@/utils/ChalkUtils';
import { FileUtils } from '@/utils/FileUtils';
import { Command } from 'commander';
// import ora, { type Ora } from "ora"; // Removed to fix interactive prompt issues

// Commander.js option types (following .cursorrules #5 - no any keyword)
interface CommanderOptions {
    outputDir: string;
    bookType: string;
    verbose: boolean;
    debug: boolean;
    logLevel: string;
}

/**
 * Main CLI command for cleaning books
 */
export class CleanBookCommand {
    private logger: LoggerService;
    private configService: ConfigService;
    private bookStructureService: BookStructureService;
    private fileUtils: FileUtils;
    private pipelineManager: PipelineManager;
    // private spinner: Ora | null = null; // Removed to fix interactive prompt issues

    constructor() {
        this.logger = createDefaultLoggerService();
        this.configService = new ConfigService(this.logger);
        this.bookStructureService = new BookStructureService(this.logger);
        this.fileUtils = new FileUtils(this.logger);
        this.pipelineManager = new PipelineManager(this.logger);

        // Register pipeline phases
        this.registerPipelinePhases();
    }

    /**
     * Register all pipeline phases
     */
    private registerPipelinePhases(): void {
        const dataLoadingPhase = new DataLoadingPhase(
            this.logger,
            this.configService,
            this.bookStructureService,
        );
        const textNormalizationPhase = new TextNormalizationPhase(this.logger);
        const evaluationPhase = new EvaluationPhase(this.logger);
        const aiEnhancementsPhase = new AIEnhancementsPhase(this.logger);

        this.pipelineManager.registerPhase(PIPELINE_PHASES.DATA_LOADING, dataLoadingPhase);
        this.pipelineManager.registerPhase(
            PIPELINE_PHASES.TEXT_NORMALIZATION,
            textNormalizationPhase,
        );
        this.pipelineManager.registerPhase(PIPELINE_PHASES.EVALUATION, evaluationPhase);
        this.pipelineManager.registerPhase(PIPELINE_PHASES.AI_ENHANCEMENTS, aiEnhancementsPhase);
    }

    /**
     * Create and configure the CLI command
     */
    public createCommand(): Command {
        return new Command()
            .name('clean-book')
            .description(APP_DESCRIPTION)
            .version(APP_VERSION)
            .argument('<input-file>', 'Input file path (PDF, EPUB, or TXT)')
            .option(
                `-${CLI_ALIASES[CLI_OPTIONS.OUTPUT_DIR]}, --${CLI_OPTIONS.OUTPUT_DIR} <dir>`,
                'Output directory for processed files',
                DEFAULT_OUTPUT_DIR,
            )
            .option(
                `-${CLI_ALIASES[CLI_OPTIONS.BOOK_TYPE]}, --${CLI_OPTIONS.BOOK_TYPE} <type>`,
                `Book type (required): ${VALID_BOOK_TYPES.join(', ')}`,
            )
            .option(
                `-${CLI_ALIASES[CLI_OPTIONS.VERBOSE]}, --${CLI_OPTIONS.VERBOSE}`,
                'Enable verbose logging',
                false,
            )
            .option(
                `-${CLI_ALIASES[CLI_OPTIONS.DEBUG]}, --${CLI_OPTIONS.DEBUG}`,
                'Enable debug logging',
                false,
            )
            .option(
                `-${CLI_ALIASES[CLI_OPTIONS.LOG_LEVEL]}, --${CLI_OPTIONS.LOG_LEVEL} <level>`,
                'Set log level (debug, info, warn, error, fatal)',
                DEFAULT_LOG_LEVEL,
            )
            .action(async (inputFile: string, options: CommanderOptions) => {
                await this.execute(inputFile, options);
            });
    }

    /**
     * Execute the clean book command
     */
    private async execute(inputFile: string, options: CommanderOptions): Promise<void> {
        const cliLogger = this.logger.getCLILogger(LOG_COMPONENTS.CLI_COMMAND);

        try {
            // Parse and validate options
            const cliOptions = this.parseOptions(inputFile, options);

            // Update logger configuration
            this.updateLoggerConfig(cliOptions);

            // Validate input file
            await this.validateInputFile(cliOptions.inputFile);

            // Parse filename metadata
            const metadata = this.parseFilenameMetadata(cliOptions);

            // Load book manifest (centralized loading)
            await this.bookStructureService.loadBookManifest(metadata);

            // Load configuration
            const bookConfig = await this.configService.loadBookConfig(
                metadata,
                cliOptions.inputFile,
            );

            // Create pipeline configuration
            const pipelineConfig = this.configService.createPipelineConfig(bookConfig, cliOptions);

            // Setup progress reporting
            this.setupProgressReporting(cliOptions);

            // Execute pipeline
            cliLogger.info(
                {
                    inputFile: cliOptions.inputFile,
                    outputDir: cliOptions.outputDir,
                    author: metadata.author,
                    title: metadata.title,
                },
                'Starting book cleaning process',
            );

            const result = await this.pipelineManager.execute(pipelineConfig, metadata);

            // Report success
            await success('✓ Book cleaning completed successfully!');
            await info(`Output directory: ${pipelineConfig.outputDir}`);
            await info(`Processing time: ${this.formatDuration(result.startTime, result.endTime)}`);

            if (cliOptions.verbose) {
                await this.printProcessingStatistics(result);
            }
        } catch (error) {
            await this.handleError(error);
            process.exit(1);
        } finally {
            // Cleanup
            await this.cleanup();
        }
    }

    /**
     * Parse and validate CLI options
     */
    private parseOptions(inputFile: string, options: CommanderOptions): CLIOptions {
        // Validate required book type
        if (!options.bookType) {
            console.error('\n❌ Error: Book type is required\n');
            console.error('Available book types:');
            for (const type of VALID_BOOK_TYPES) {
                console.error(`  - ${type}`);
            }
            console.error('\nUsage: clean-book -b <book-type> <input-file>');
            console.error('Example: clean-book -b rudolf-steiner-ga-werk input.pdf\n');
            process.exit(1);
        }

        // Validate book type is valid
        if (!VALID_BOOK_TYPES.includes(options.bookType)) {
            console.error(`\n❌ Error: Invalid book type "${options.bookType}"\n`);
            console.error('Available book types:');
            for (const type of VALID_BOOK_TYPES) {
                console.error(`  - ${type}`);
            }
            console.error('\nUsage: clean-book -b <book-type> <input-file>');
            console.error('Example: clean-book -b rudolf-steiner-ga-werk input.pdf\n');
            process.exit(1);
        }

        const cliOptions: CLIOptions = {
            inputFile: path.resolve(inputFile),
            outputDir: options.outputDir
                ? path.resolve(options.outputDir)
                : path.resolve(DEFAULT_OUTPUT_DIR),
            bookType: options.bookType,
            verbose: options.verbose || options.debug,
            debug: options.debug,
            logLevel: options.logLevel as LogLevel,
        };

        return cliOptions;
    }

    /**
     * Update logger configuration based on CLI options
     */
    private updateLoggerConfig(options: CLIOptions): void {
        let logLevel = DEFAULT_LOG_LEVEL;

        if (options.debug) {
            logLevel = LOG_LEVELS.DEBUG;
        } else if (options.verbose) {
            logLevel = LOG_LEVELS.INFO;
        } else if (
            options.logLevel &&
            Object.values(LOG_LEVELS).includes(options.logLevel as LogLevel)
        ) {
            logLevel = options.logLevel as LogLevel;
        }

        this.logger.updateConfig({
            level: logLevel as LogLevel,
            pretty: true,
            timestamp: true,
            tags: {
                pipeline: logLevel as LogLevel,
                file_processing: logLevel as LogLevel,
                text_extraction: logLevel as LogLevel,
                ocr: logLevel as LogLevel,
                config: logLevel as LogLevel,
                cli: logLevel as LogLevel,
                error: LOG_LEVELS.ERROR,
            },
        });
    }

    /**
     * Validate input file
     */
    private async validateInputFile(inputFile: string): Promise<void> {
        const exists = await this.fileUtils.fileExists(inputFile);
        if (!exists) {
            throw new AppError(
                ERROR_CODES.FILE_NOT_FOUND,
                LOG_COMPONENTS.CLI_COMMAND,
                'validateInputFile',
                `Input file not found: ${inputFile}`,
                { inputFile },
            );
        }

        const isValidFormat = this.fileUtils.validateFileFormat(inputFile);
        if (!isValidFormat) {
            throw new AppError(
                ERROR_CODES.INVALID_FORMAT,
                LOG_COMPONENTS.CLI_COMMAND,
                'validateInputFile',
                `Unsupported file format: ${path.extname(inputFile)}`,
                { inputFile, extension: path.extname(inputFile) },
            );
        }
    }

    /**
     * Parse filename metadata
     */
    private parseFilenameMetadata(options: CLIOptions): FilenameMetadata {
        return this.fileUtils.parseFilename(options.inputFile);
    }

    /**
     * Setup progress reporting
     */
    private setupProgressReporting(options: CLIOptions): void {
        if (options.verbose || options.debug) {
            // Use detailed logging for verbose mode
            this.pipelineManager.setProgressCallback((progress: ProgressInfo) => {
                const cliLogger = this.logger.getCLILogger(LOG_COMPONENTS.CLI_COMMAND);
                cliLogger.info(
                    {
                        phase: progress.phase,
                        step: progress.step,
                        percentage: progress.percentage,
                    },
                    `${progress.phase}: ${progress.message} (${progress.percentage}%)`,
                );
            });
        } else {
            // Use simple console output instead of spinner
            console.log('Initializing...');

            this.pipelineManager.setProgressCallback((progress: ProgressInfo) => {
                console.log(`${progress.phase}: ${progress.message} (${progress.percentage}%)`);
            });
        }
    }

    /**
     * Handle errors
     */
    private async handleError(error: unknown): Promise<void> {
        console.log('✖ Processing failed');

        const cliLogger = this.logger.getCLILogger(LOG_COMPONENTS.CLI_COMMAND);

        if (isAppError(error)) {
            const chalk = await getChalkInstance();
            console.error(chalk.red('✗ Error:'), error.message);

            if (error.context) {
                await gray(`Context: ${JSON.stringify(error.context, null, 2)}`);
            }

            cliLogger.error(
                {
                    error: error.getDetails(),
                },
                'Application error occurred',
            );

            if (error.cause) {
                await gray(`Caused by: ${error.cause.message}`);
            }
        } else {
            const errorMessage = error instanceof Error ? error.message : String(error);
            const chalk = await getChalkInstance();
            console.error(chalk.red('✗ Error:'), errorMessage);

            cliLogger.error(
                {
                    error: errorMessage,
                },
                'Unexpected error occurred',
            );
        }

        await warn('\nTip: Run with --verbose for more details');
        process.exit(1);
    }

    /**
     * Format duration
     */
    private formatDuration(startTime: Date, endTime?: Date): string {
        if (!endTime) {
            return 'N/A';
        }

        const duration = endTime.getTime() - startTime.getTime();
        const seconds = Math.floor(duration / 1000);
        const minutes = Math.floor(seconds / 60);

        if (minutes > 0) {
            return `${minutes}m ${seconds % 60}s`;
        }
        return `${seconds}s`;
    }

    /**
     * Print processing statistics
     */
    private async printProcessingStatistics(result: PipelineState): Promise<void> {
        await cyan('\n📊 Processing Statistics:');
        await info(`Phases completed: ${result.results.length}`);
        await info(
            `Total processing time: ${this.formatDuration(result.startTime, result.endTime)}`,
        );

        for (const phaseResult of result.results) {
            const duration = phaseResult.duration ? `${phaseResult.duration}ms` : 'N/A';
            const status = phaseResult.status === 'completed' ? '✓' : '✗';
            await info(`  ${status} ${phaseResult.name}: ${duration}`);
        }
    }

    /**
     * Cleanup resources
     */
    private async cleanup(): Promise<void> {
        try {
            // Cleanup pipeline and logger
            await this.pipelineManager.cleanup();
            this.logger.flush();
        } catch (_error) {
            // Ignore cleanup errors
        }
    }
}
