import { promises as fs } from "node:fs";
import path from "node:path";
import {
  AI_PROVIDERS,
  CONFIG_FILE_EXTENSION,
  DEFAULT_AI_CONFIG,
  DEFAULT_CHAPTER_MARKERS,
  DEFAULT_CONFIG_DIR,
  DEFAULT_CONFIG_FILE,
  DEFAULT_FILENAME_PATTERN,
  DEFAULT_FOOTNOTE_MARKERS,
  DEFAULT_LOG_LEVEL,
  DEFAULT_OUTPUT_DIR,
  DEFAULT_PARAGRAPH_MARKERS,
  DEFAULT_SECTION_MARKERS,
  ENV_VARS,
  ERROR_CODES,
  ERROR_MESSAGES,
  LOG_COMPONENTS,
  OCR_ENGINES,
  OCR_LANGUAGES,
  OUTPUT_FORMATS,
  VALIDATION_PATTERNS,
} from "@/constants";
import type { BookConfig, FilenameMetadata, LogLevel, PipelineConfig } from "@/types";
import { AppError } from "@/utils/AppError";
import { FileUtils } from "@/utils/FileUtils";
import yaml from "js-yaml";
import { type BookStructureInfo, BookStructureService } from "./BookStructureService";
import type { LoggerService } from "./LoggerService";

/**
 * Configuration service for loading and managing book-specific configurations
 */
export class ConfigService {
  private readonly logger: LoggerService;
  private readonly configDir: string;
  private readonly configCache: Map<string, BookConfig> = new Map();
  private readonly bookStructureService: BookStructureService;

  constructor(logger: LoggerService, configDir: string = DEFAULT_CONFIG_DIR) {
    this.logger = logger;
    this.configDir = configDir;
    this.bookStructureService = new BookStructureService(logger, configDir);
  }

  /**
   * Load configuration for a specific book based on filename metadata
   */
  public async loadBookConfig(
    metadata: FilenameMetadata,
    inputFilePath?: string,
  ): Promise<BookConfig> {
    const configKey = this.getConfigKey(metadata);

    // Check cache first
    if (this.configCache.has(configKey)) {
      const cachedConfig = this.configCache.get(configKey);
      if (cachedConfig) {
        return cachedConfig;
      }
    }

    const configLogger = this.logger.getConfigLogger(LOG_COMPONENTS.CONFIG_SERVICE);

    try {
      // Try to load book structure file
      const bookStructure = await this.bookStructureService.loadBookStructure(metadata);

      // Check if file information needs updating
      if (inputFilePath) {
        const needsUpdate = await this.bookStructureService.checkIfUpdateNeeded(
          metadata,
          inputFilePath,
        );
        if (needsUpdate) {
          const shouldUpdate = await this.bookStructureService.promptForUpdate(
            metadata,
            needsUpdate,
          );
          if (shouldUpdate) {
            await this.bookStructureService.updateBookStructure(
              metadata,
              inputFilePath,
            );
            configLogger.info(
              {
                author: metadata.author,
                title: metadata.title,
                configKey,
                changes: needsUpdate,
              },
              "Configuration file updated with new information",
            );
          }
        }
      }

      // Create BookConfig from book structure
      const config = this.createBookConfigFromStructure(bookStructure);

      // Cache the configuration
      this.configCache.set(configKey, config);

      configLogger.info(
        {
          author: metadata.author,
          title: metadata.title,
          configKey,
        },
        "Configuration loaded successfully",
      );

      return config;
    } catch (error) {
      configLogger.warn(
        {
          author: metadata.author,
          title: metadata.title,
          configKey,
          error: error instanceof Error ? error.message : String(error),
        },
        "Failed to load specific configuration, creating new one",
      );

      // Create a new book structure file
      const bookStructure = await this.bookStructureService.createBookStructure(
        metadata,
        inputFilePath,
      );

      // Create BookConfig from book structure
      const config = this.createBookConfigFromStructure(bookStructure);

      // Cache the configuration
      this.configCache.set(configKey, config);

      configLogger.info(
        {
          author: metadata.author,
          title: metadata.title,
          configKey,
        },
        "Created new book-specific configuration",
      );

      return config;
    }
  }

  /**
   * Create pipeline configuration from book config and CLI options
   */
  public createPipelineConfig(
    bookConfig: BookConfig,
    options: {
      inputFile: string;
      outputDir?: string;
      verbose?: boolean;
      debug?: boolean;
      logLevel?: LogLevel;
      phases?: string[];
    },
  ): PipelineConfig {
    return {
      inputFile: options.inputFile,
      outputDir: options.outputDir || DEFAULT_OUTPUT_DIR,
      author: bookConfig.author,
      title: bookConfig.title,
      verbose: options.verbose || false,
      debug: options.debug || false,
      logLevel: options.logLevel || DEFAULT_LOG_LEVEL,
      phases: {
        dataLoading: !options.phases || options.phases.includes("data_loading"),
        textNormalization:
          !options.phases || options.phases.includes("text_normalization"),
        evaluation: !options.phases || options.phases.includes("evaluation"),
        aiEnhancements: !options.phases || options.phases.includes("ai_enhancements"),
      },
    };
  }

  /**
   * Load default configuration
   */
  private async loadDefaultConfig(): Promise<BookConfig> {
    const defaultConfigPath = path.join(this.configDir, DEFAULT_CONFIG_FILE);

    try {
      const configContent = await fs.readFile(defaultConfigPath, "utf-8");
      const config = yaml.load(configContent) as BookConfig;

      // Merge with environment variables
      this.mergeEnvironmentVariables(config);

      return config;
    } catch (_error) {
      // If default config doesn't exist, create a minimal one
      return this.createMinimalConfig();
    }
  }

  /**
   * Load configuration from file
   */
  private async loadConfigFromFile(configKey: string): Promise<BookConfig> {
    const configPath = path.join(
      this.configDir,
      `${configKey}${CONFIG_FILE_EXTENSION}`,
    );

    try {
      const configContent = await fs.readFile(configPath, "utf-8");
      const bookStructure = yaml.load(configContent) as {
        author?: string;
        title?: string;
        [key: string]: unknown;
      };

      // Convert book structure to full BookConfig
      const defaultConfig = this.createMinimalConfig();

      // Override with book structure information
      if (bookStructure.author) defaultConfig.author = bookStructure.author;
      if (bookStructure.title) defaultConfig.title = bookStructure.title;

      // Merge with environment variables
      this.mergeEnvironmentVariables(defaultConfig);

      return defaultConfig;
    } catch (error) {
      throw new AppError(
        ERROR_CODES.CONFIG_INVALID,
        LOG_COMPONENTS.CONFIG_SERVICE,
        "loadConfigFromFile",
        ERROR_MESSAGES[ERROR_CODES.CONFIG_INVALID].replace(
          "{details}",
          `File not found: ${configPath}`,
        ),
        { configPath, configKey },
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  /**
   * Create minimal configuration when no config file exists
   */
  private createMinimalConfig(): BookConfig {
    return {
      author: "Unknown Author",
      title: "Unknown Title",
      textBoundaries: {
        paragraphMarkers: [...DEFAULT_PARAGRAPH_MARKERS],
        sectionMarkers: [...DEFAULT_SECTION_MARKERS],
        chapterMarkers: [...DEFAULT_CHAPTER_MARKERS],
        footnoteMarkers: [...DEFAULT_FOOTNOTE_MARKERS],
      },
      processing: {
        ocr: {
          enabled: true,
          engine: OCR_ENGINES.TESSERACT,
          language: OCR_LANGUAGES.GERMAN,
          confidence: 0.7,
          preprocessor: {
            deskew: true,
            denoise: true,
            enhance: true,
          },
        },
        textCleaning: {
          removeHeaders: true,
          removeFooters: true,
          normalizeWhitespace: true,
          fixEncoding: true,
          modernizeSpelling: false,
        },
        quality: {
          minimumConfidence: 0.8,
          requireManualReview: false,
          failOnLowQuality: false,
        },
      },
      ai: {
        provider: AI_PROVIDERS.DEEPSEEK,
        model: "deepseek-chat",
        apiKey: process.env[ENV_VARS.DEEPSEEK_API_KEY] || "",
        temperature: DEFAULT_AI_CONFIG.TEMPERATURE,
        maxTokens: DEFAULT_AI_CONFIG.MAX_TOKENS,
        retries: DEFAULT_AI_CONFIG.RETRIES,
        timeout: DEFAULT_AI_CONFIG.TIMEOUT,
      },
      output: {
        format: OUTPUT_FORMATS.MARKDOWN,
        includeMetadata: true,
        includeFootnotes: true,
        includeTableOfContents: true,
        filenamePattern: DEFAULT_FILENAME_PATTERN,
      },
    };
  }

  /**
   * Merge environment variables into configuration
   */
  private mergeEnvironmentVariables(config: BookConfig): void {
    // AI API keys
    const deepseekApiKey = process.env[ENV_VARS.DEEPSEEK_API_KEY];
    if (deepseekApiKey) {
      config.ai.apiKey = deepseekApiKey;
    }

    const openaiApiKey = process.env[ENV_VARS.OPENAI_API_KEY];
    if (openaiApiKey && config.ai.provider === AI_PROVIDERS.OPENAI) {
      config.ai.apiKey = openaiApiKey;
    }

    const anthropicApiKey = process.env[ENV_VARS.ANTHROPIC_API_KEY];
    if (anthropicApiKey && config.ai.provider === AI_PROVIDERS.ANTHROPIC) {
      config.ai.apiKey = anthropicApiKey;
    }
  }

  /**
   * Validate configuration
   */
  private validateConfig(config: BookConfig): void {
    const errors: string[] = [];

    // Validate author and title
    if (!config.author || config.author.trim().length === 0) {
      errors.push("Author is required");
    }

    if (!config.title || config.title.trim().length === 0) {
      errors.push("Title is required");
    }

    // Validate text boundaries
    if (
      !config.textBoundaries.paragraphMarkers ||
      config.textBoundaries.paragraphMarkers.length === 0
    ) {
      errors.push("Paragraph markers are required");
    }

    // Validate AI configuration
    if (!config.ai.apiKey || config.ai.apiKey.trim().length === 0) {
      errors.push("AI API key is required");
    }

    if (!Object.values(AI_PROVIDERS).includes(config.ai.provider)) {
      errors.push(`Invalid AI provider: ${config.ai.provider}`);
    }

    // Validate OCR configuration
    if (!Object.values(OCR_ENGINES).includes(config.processing.ocr.engine)) {
      errors.push(`Invalid OCR engine: ${config.processing.ocr.engine}`);
    }

    if (config.processing.ocr.confidence < 0 || config.processing.ocr.confidence > 1) {
      errors.push("OCR confidence must be between 0 and 1");
    }

    // Validate output configuration
    if (!Object.values(OUTPUT_FORMATS).includes(config.output.format)) {
      errors.push(`Invalid output format: ${config.output.format}`);
    }

    if (errors.length > 0) {
      throw new AppError(
        ERROR_CODES.CONFIG_INVALID,
        LOG_COMPONENTS.CONFIG_SERVICE,
        "validateConfig",
        ERROR_MESSAGES[ERROR_CODES.CONFIG_INVALID].replace(
          "{details}",
          errors.join(", "),
        ),
        { errors, config: `${config.author}#${config.title}` },
      );
    }
  }

  /**
   * Generate configuration key from metadata
   */
  private getConfigKey(metadata: FilenameMetadata): string {
    return FileUtils.generateConfigKey(metadata);
  }

  /**
   * Save configuration to file
   */
  public async saveConfig(
    metadata: FilenameMetadata,
    config: BookConfig,
  ): Promise<void> {
    const configKey = this.getConfigKey(metadata);
    const configPath = path.join(
      this.configDir,
      `${configKey}${CONFIG_FILE_EXTENSION}`,
    );

    try {
      // Ensure config directory exists
      await fs.mkdir(this.configDir, { recursive: true });

      // Convert to YAML and save
      const yamlContent = yaml.dump(config, {
        indent: 2,
        lineWidth: 120,
        noRefs: true,
      });

      await fs.writeFile(configPath, yamlContent, "utf-8");

      // Update cache
      this.configCache.set(configKey, config);

      const configLogger = this.logger.getConfigLogger(LOG_COMPONENTS.CONFIG_SERVICE);
      configLogger.info(
        {
          author: metadata.author,
          title: metadata.title,
          configPath,
        },
        "Configuration saved successfully",
      );
    } catch (error) {
      throw new AppError(
        ERROR_CODES.CONFIG_INVALID,
        LOG_COMPONENTS.CONFIG_SERVICE,
        "saveConfig",
        ERROR_MESSAGES[ERROR_CODES.CONFIG_INVALID].replace(
          "{details}",
          `Failed to save config: ${configPath}`,
        ),
        { configPath, configKey },
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  /**
   * Clear configuration cache
   */
  public clearCache(): void {
    this.configCache.clear();
  }

  /**
   * Get all available configurations
   */
  public async getAvailableConfigs(): Promise<string[]> {
    return await this.bookStructureService.getAvailableBookStructures();
  }

  /**
   * Check if configuration exists for metadata
   */
  public async configExists(metadata: FilenameMetadata): Promise<boolean> {
    return await this.bookStructureService.exists(metadata);
  }

  /**
   * Create BookConfig from book structure information
   */
  private createBookConfigFromStructure(bookStructure: BookStructureInfo): BookConfig {
    const config = this.createMinimalConfig();

    // Override with book structure information
    config.author = bookStructure.author;
    config.title = bookStructure.title;

    // Merge with environment variables
    this.mergeEnvironmentVariables(config);

    return config;
  }

  /**
   * Create default configuration file if it doesn't exist
   */
  public async ensureDefaultConfig(): Promise<void> {
    const defaultConfigPath = path.join(this.configDir, DEFAULT_CONFIG_FILE);

    try {
      await fs.access(defaultConfigPath);
    } catch {
      // Default config doesn't exist, create it
      await fs.mkdir(this.configDir, { recursive: true });

      const defaultConfig = this.createMinimalConfig();
      const yamlContent = yaml.dump(defaultConfig, {
        indent: 2,
        lineWidth: 120,
        noRefs: true,
      });

      await fs.writeFile(defaultConfigPath, yamlContent, "utf-8");

      const configLogger = this.logger.getConfigLogger(LOG_COMPONENTS.CONFIG_SERVICE);
      configLogger.info(
        {
          configPath: defaultConfigPath,
        },
        "Default configuration created",
      );
    }
  }
}
