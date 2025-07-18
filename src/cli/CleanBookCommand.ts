import path from "node:path";
import {
  APP_DESCRIPTION,
  APP_NAME,
  APP_VERSION,
  CLI_ALIASES,
  CLI_OPTIONS,
  DEFAULT_LOG_LEVEL,
  DEFAULT_OUTPUT_DIR,
  ERROR_CODES,
  LOG_COMPONENTS,
  LOG_LEVELS,
  MESSAGE_TEMPLATES,
  PIPELINE_PHASES,
} from "@/constants";
import { PipelineManager } from "@/pipeline/PipelineManager";
import { DataLoadingPhase } from "@/pipeline/DataLoadingPhase";
import { TextNormalizationPhase } from "@/pipeline/TextNormalizationPhase";
import { EvaluationPhase } from "@/pipeline/EvaluationPhase";
import { AIEnhancementsPhase } from "@/pipeline/AIEnhancementsPhase";
import { ConfigService } from "@/services/ConfigService";
import {
  type LoggerService,
  createDefaultLoggerService,
} from "@/services/LoggerService";
import { formatLogMessage } from "@/services/LoggerService";
import {
  type CLIOptions,
  type FilenameMetadata,
  type LogLevel,
  PipelineConfig,
  type PipelineState,
  type ProgressInfo,
} from "@/types";
import { AppError, isAppError } from "@/utils/AppError";
import { FileUtils } from "@/utils/FileUtils";
import chalk from "chalk";
import { Command } from "commander";
import ora, { type Ora } from "ora";

// Commander.js option types (following .cursorrules #5 - no any keyword)
interface CommanderOptions {
  outputDir: string;
  author?: string;
  title?: string;
  bookIndex?: string;
  verbose: boolean;
  debug: boolean;
  logLevel: string;
  phases: string;
}

/**
 * Main CLI command for cleaning books
 */
export class CleanBookCommand {
  private logger: LoggerService;
  private configService: ConfigService;
  private fileUtils: FileUtils;
  private pipelineManager: PipelineManager;
  private spinner: Ora | null = null;

  constructor() {
    this.logger = createDefaultLoggerService();
    this.configService = new ConfigService(this.logger);
    this.fileUtils = new FileUtils(this.logger);
    this.pipelineManager = new PipelineManager(this.logger);

    // Register pipeline phases
    this.registerPipelinePhases();
  }

  /**
   * Register all pipeline phases
   */
  private registerPipelinePhases(): void {
    const dataLoadingPhase = new DataLoadingPhase(this.logger);
    const textNormalizationPhase = new TextNormalizationPhase(this.logger);
    const evaluationPhase = new EvaluationPhase(this.logger);
    const aiEnhancementsPhase = new AIEnhancementsPhase(this.logger);

    this.pipelineManager.registerPhase(PIPELINE_PHASES.DATA_LOADING, dataLoadingPhase);
    this.pipelineManager.registerPhase(
      PIPELINE_PHASES.TEXT_NORMALIZATION,
      textNormalizationPhase,
    );
    this.pipelineManager.registerPhase(PIPELINE_PHASES.EVALUATION, evaluationPhase);
    this.pipelineManager.registerPhase(
      PIPELINE_PHASES.AI_ENHANCEMENTS,
      aiEnhancementsPhase,
    );
  }

  /**
   * Create and configure the CLI command
   */
  public createCommand(): Command {
    return new Command()
      .name("clean-book")
      .description(APP_DESCRIPTION)
      .version(APP_VERSION)
      .argument("<input-file>", "Input file path (PDF, EPUB, or TXT)")
      .option(
        `-${CLI_ALIASES[CLI_OPTIONS.OUTPUT_DIR]}, --${CLI_OPTIONS.OUTPUT_DIR} <dir>`,
        "Output directory for processed files",
        DEFAULT_OUTPUT_DIR,
      )
      .option(
        `-${CLI_ALIASES[CLI_OPTIONS.AUTHOR]}, --${CLI_OPTIONS.AUTHOR} <author>`,
        "Override author from filename",
      )
      .option(
        `-${CLI_ALIASES[CLI_OPTIONS.TITLE]}, --${CLI_OPTIONS.TITLE} <title>`,
        "Override title from filename",
      )
      .option(
        `-${CLI_ALIASES[CLI_OPTIONS.BOOK_INDEX]}, --${CLI_OPTIONS.BOOK_INDEX} <index>`,
        "Override book index from filename",
      )
      .option(
        `-${CLI_ALIASES[CLI_OPTIONS.VERBOSE]}, --${CLI_OPTIONS.VERBOSE}`,
        "Enable verbose logging",
        false,
      )
      .option(
        `-${CLI_ALIASES[CLI_OPTIONS.DEBUG]}, --${CLI_OPTIONS.DEBUG}`,
        "Enable debug logging",
        false,
      )
      .option(
        `-${CLI_ALIASES[CLI_OPTIONS.LOG_LEVEL]}, --${CLI_OPTIONS.LOG_LEVEL} <level>`,
        "Set log level (debug, info, warn, error, fatal)",
        DEFAULT_LOG_LEVEL,
      )
      .option(
        `-${CLI_ALIASES[CLI_OPTIONS.PHASES]}, --${CLI_OPTIONS.PHASES} <phases>`,
        "Comma-separated list of phases to run",
        "data_loading,text_normalization,evaluation,ai_enhancements",
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

      // Load configuration
      const bookConfig = await this.configService.loadBookConfig(metadata, cliOptions.inputFile);

      // Create pipeline configuration
      const pipelineConfig = this.configService.createPipelineConfig(
        bookConfig,
        cliOptions,
      );

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
        "Starting book cleaning process",
      );

      const result = await this.pipelineManager.execute(pipelineConfig, metadata);

      // Report success
      console.log(chalk.green("✓ Book cleaning completed successfully!"));
      console.log(chalk.blue(`Output directory: ${pipelineConfig.outputDir}`));
      console.log(
        chalk.blue(
          `Processing time: ${this.formatDuration(result.startTime, result.endTime)}`,
        ),
      );

      if (cliOptions.verbose) {
        this.printProcessingStatistics(result);
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
    const phases = options.phases
      ? options.phases.split(",").map((p: string) => p.trim())
      : undefined;

    const cliOptions: CLIOptions = {
      inputFile: path.resolve(inputFile),
      outputDir: options.outputDir
        ? path.resolve(options.outputDir)
        : path.resolve(DEFAULT_OUTPUT_DIR),
      verbose: options.verbose || options.debug,
      debug: options.debug,
      logLevel: options.logLevel as LogLevel,
    };

    // Only assign optional properties if they are defined
    if (options.author !== undefined) {
      cliOptions.author = options.author;
    }
    if (options.title !== undefined) {
      cliOptions.title = options.title;
    }
    if (options.bookIndex !== undefined) {
      cliOptions.bookIndex = options.bookIndex;
    }
    if (phases !== undefined) {
      cliOptions.phases = phases;
    }

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
        "validateInputFile",
        `Input file not found: ${inputFile}`,
        { inputFile },
      );
    }

    const isValidFormat = this.fileUtils.validateFileFormat(inputFile);
    if (!isValidFormat) {
      throw new AppError(
        ERROR_CODES.INVALID_FORMAT,
        LOG_COMPONENTS.CLI_COMMAND,
        "validateInputFile",
        `Unsupported file format: ${path.extname(inputFile)}`,
        { inputFile, extension: path.extname(inputFile) },
      );
    }
  }

  /**
   * Parse filename metadata with CLI overrides
   */
  private parseFilenameMetadata(options: CLIOptions): FilenameMetadata {
    const metadata = this.fileUtils.parseFilename(options.inputFile);

    // Apply CLI overrides
    if (options.author) {
      metadata.author = options.author;
    }

    if (options.title) {
      metadata.title = options.title;
    }

    if (options.bookIndex) {
      metadata.bookIndex = options.bookIndex;
    }

    return metadata;
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
      // Use spinner for normal mode
      this.spinner = ora("Initializing...").start();

      this.pipelineManager.setProgressCallback((progress: ProgressInfo) => {
        if (this.spinner) {
          this.spinner.text = `${progress.phase}: ${progress.message} (${progress.percentage}%)`;
        }
      });
    }
  }

  /**
   * Handle errors
   */
  private async handleError(error: unknown): Promise<void> {
    if (this.spinner) {
      this.spinner.fail("Processing failed");
      this.spinner = null;
    }

    const cliLogger = this.logger.getCLILogger(LOG_COMPONENTS.CLI_COMMAND);

    if (isAppError(error)) {
      console.error(chalk.red("✗ Error:"), error.message);

      if (error.context) {
        console.error(chalk.gray("Context:"), JSON.stringify(error.context, null, 2));
      }

      cliLogger.error(
        {
          error: error.getDetails(),
        },
        "Application error occurred",
      );

      if (error.cause) {
        console.error(chalk.gray("Caused by:"), error.cause.message);
      }
    } else {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(chalk.red("✗ Unexpected error:"), errorMessage);

      cliLogger.error(
        {
          error: errorMessage,
          stack: error instanceof Error ? error.stack : undefined,
        },
        "Unexpected error occurred",
      );
    }

    console.error(chalk.yellow("\nTip: Run with --verbose for more details"));
  }

  /**
   * Format duration
   */
  private formatDuration(startTime: Date, endTime?: Date): string {
    if (!endTime) {
      return "N/A";
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
  private printProcessingStatistics(result: PipelineState): void {
    console.log(chalk.cyan("\n📊 Processing Statistics:"));
    console.log(chalk.blue(`Phases completed: ${result.results.length}`));
    console.log(
      chalk.blue(
        `Total processing time: ${this.formatDuration(result.startTime, result.endTime)}`,
      ),
    );

    for (const phaseResult of result.results) {
      const duration = phaseResult.duration ? `${phaseResult.duration}ms` : "N/A";
      const status = phaseResult.status === "completed" ? "✓" : "✗";
      console.log(chalk.blue(`  ${status} ${phaseResult.name}: ${duration}`));
    }
  }

  /**
   * Cleanup resources
   */
  private async cleanup(): Promise<void> {
    try {
      if (this.spinner) {
        this.spinner.stop();
      }

      await this.pipelineManager.cleanup();
      this.logger.flush();
    } catch (_error) {
      // Ignore cleanup errors
    }
  }
}
