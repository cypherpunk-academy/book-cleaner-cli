import { promises as fs } from "node:fs";
import path from "node:path";
import {
  CONFIG_FILE_EXTENSION,
  DEFAULT_CONFIG_DIR,
  DEFAULT_CONFIG_FILE,
  ERROR_CODES,
  ERROR_MESSAGES,
  LOG_COMPONENTS,
  VALIDATION_PATTERNS,
} from "@/constants";
import type { FileFormatResult, FilenameMetadata } from "@/types";
import { AppError } from "@/utils/AppError";
import { FileUtils } from "@/utils/FileUtils";
import yaml from "js-yaml";
import type { LoggerService } from "./LoggerService";

/**
 * Information about configuration updates needed
 */
interface ConfigUpdateInfo {
  type?: { current: string; existing: string | undefined };
  size?: { current: number; existing: number | undefined };
  pages?: { current: number; existing: number | undefined };
}

/**
 * Book structure information extracted from YAML files
 */
interface BookStructureInfo {
  author: string;
  title: string;
  bookIndex?: string;
  original?: Array<{
    type?: string;
    size?: number;
    pages?: number;
  }>;
}

/**
 * Raw YAML structure for book configuration files
 */
interface RawBookStructureYaml {
  author?: string;
  title?: string;
  "book-index"?: string;
  original?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

/**
 * Service for managing book structure YAML files
 */
export class BookStructureService {
  private readonly logger: LoggerService;
  private readonly configDir: string;
  private lastFormatResult?: FileFormatResult;

  constructor(logger: LoggerService, configDir: string = DEFAULT_CONFIG_DIR) {
    this.logger = logger;
    this.configDir = configDir;
  }

  /**
   * Check if book structure file exists
   */
  public async exists(metadata: FilenameMetadata): Promise<boolean> {
    const configKey = this.getConfigKey(metadata);
    const configPath = path.join(
      this.configDir,
      `${configKey}${CONFIG_FILE_EXTENSION}`,
    );

    try {
      await fs.access(configPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Load book structure information from YAML file
   */
  public async loadBookStructure(
    metadata: FilenameMetadata,
  ): Promise<BookStructureInfo> {
    const configKey = this.getConfigKey(metadata);
    const configPath = path.join(
      this.configDir,
      `${configKey}${CONFIG_FILE_EXTENSION}`,
    );

    try {
      const configContent = await fs.readFile(configPath, "utf-8");
      const bookStructure = yaml.load(configContent) as RawBookStructureYaml;

      const result: BookStructureInfo = {
        author: bookStructure.author || metadata.author,
        title: bookStructure.title || metadata.title,
        original: (bookStructure.original || []) as Array<{
          type?: string;
          size?: number;
          pages?: number;
        }>,
      };

      // Only add bookIndex if it has a value
      const bookIndexValue = bookStructure["book-index"] || metadata.bookIndex;
      if (bookIndexValue) {
        result.bookIndex = bookIndexValue;
      }

      return result;
    } catch (error) {
      throw new AppError(
        ERROR_CODES.CONFIG_INVALID,
        LOG_COMPONENTS.CONFIG_SERVICE,
        "loadBookStructure",
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
   * Create a new book structure file based on the default template
   */
  public async createBookStructure(
    metadata: FilenameMetadata,
    inputFilePath?: string,
  ): Promise<BookStructureInfo> {
    const defaultTemplatePath = path.join(this.configDir, DEFAULT_CONFIG_FILE);

    try {
      // Load the default template
      const templateContent = await fs.readFile(defaultTemplatePath, "utf-8");
      const templateConfig = yaml.load(templateContent) as RawBookStructureYaml;

      // Fill in the metadata
      templateConfig.author = metadata.author;
      templateConfig.title = metadata.title;

      // Extract book index from filename if present
      const bookIndex = metadata.bookIndex || "";
      if (bookIndex) {
        templateConfig["book-index"] = bookIndex;
      }

      // Determine file type and size from input file path
      const filePath = inputFilePath || metadata.originalFilename;
      const fileType = await this.determineFileType(filePath);
      const fileSize = await this.getFileSize(filePath);

      // Update the original section in the template
      if (templateConfig.original && Array.isArray(templateConfig.original)) {
        // Filter out and rebuild the original array properly
        const updatedOriginal: Record<string, unknown>[] = [];

        for (const item of templateConfig.original) {
          if (typeof item === "object" && item !== null) {
            const updatedItem: Record<string, unknown> = {};

            // Handle type field
            if (item.type !== undefined) {
              updatedItem.type = fileType;
            }

            // Handle size field
            if (item.size !== undefined) {
              updatedItem.size = fileSize;
            }

            // Handle pages field - only for non-text files
            if (item.pages !== undefined && fileType !== "text") {
              const pageCount = await this.getPageCount(filePath, fileType);
              updatedItem.pages = pageCount;
            }

            // Only add the item if it has content
            if (Object.keys(updatedItem).length > 0) {
              updatedOriginal.push(updatedItem);
            }
          }
        }

        templateConfig.original = updatedOriginal;
      }

      // Save the new book-specific config file
      const configKey = this.getConfigKey(metadata);
      const configPath = path.join(
        this.configDir,
        `${configKey}${CONFIG_FILE_EXTENSION}`,
      );

      // Ensure config directory exists
      await fs.mkdir(this.configDir, { recursive: true });

      // Convert back to YAML and save
      const yamlContent = yaml.dump(templateConfig, {
        indent: 2,
        lineWidth: 120,
        noRefs: true,
      });

      await fs.writeFile(configPath, yamlContent, "utf-8");

      const configLogger = this.logger.getConfigLogger(LOG_COMPONENTS.CONFIG_SERVICE);
      configLogger.info(
        {
          author: metadata.author,
          title: metadata.title,
          configPath,
        },
        "Book structure file created successfully",
      );

      const result: BookStructureInfo = {
        author: templateConfig.author || metadata.author,
        title: templateConfig.title || metadata.title,
        original: templateConfig.original as Array<{
          type?: string;
          size?: number;
          pages?: number;
        }>,
      };

      // Only add bookIndex if it has a value
      const bookIndexValue = templateConfig["book-index"];
      if (bookIndexValue) {
        result.bookIndex = bookIndexValue;
      }

      return result;
    } catch (error) {
      throw new AppError(
        ERROR_CODES.CONFIG_INVALID,
        LOG_COMPONENTS.CONFIG_SERVICE,
        "createBookStructure",
        ERROR_MESSAGES[ERROR_CODES.CONFIG_INVALID].replace(
          "{details}",
          "Failed to create book structure file",
        ),
        { metadata },
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  /**
   * Check if book structure file needs updating based on file analysis
   */
  public async checkIfUpdateNeeded(
    metadata: FilenameMetadata,
    inputFilePath: string,
  ): Promise<ConfigUpdateInfo | null> {
    try {
      // Get current file information
      const currentFileType = await this.determineFileType(inputFilePath);
      const currentFileSize = await this.getFileSize(inputFilePath);
      const currentPageCount = await this.getPageCount(inputFilePath, currentFileType);

      // Load the raw YAML to check original section
      const configKey = this.getConfigKey(metadata);
      const configPath = path.join(
        this.configDir,
        `${configKey}${CONFIG_FILE_EXTENSION}`,
      );
      const configContent = await fs.readFile(configPath, "utf-8");
      const rawConfig = yaml.load(configContent) as RawBookStructureYaml;

      let changes: ConfigUpdateInfo | null = null;

      // Check if original section exists and has the expected structure
      if (rawConfig.original && Array.isArray(rawConfig.original)) {
        const originalInfo = this.extractOriginalInfo(rawConfig.original);

        // Compare file type
        if (originalInfo.type !== currentFileType) {
          changes = changes || {};
          changes.type = { current: currentFileType, existing: originalInfo.type };
        }

        // Compare file size
        if (originalInfo.size !== currentFileSize) {
          changes = changes || {};
          changes.size = { current: currentFileSize, existing: originalInfo.size };
        }

        // Compare page count (only for non-text files)
        if (currentFileType !== "text" && originalInfo.pages !== currentPageCount) {
          changes = changes || {};
          changes.pages = { current: currentPageCount, existing: originalInfo.pages };
        }
      }

      return changes;
    } catch (_error) {
      return null;
    }
  }

  /**
   * Prompt user for configuration update
   */
  public async promptForUpdate(
    metadata: FilenameMetadata,
    changes: ConfigUpdateInfo,
  ): Promise<boolean> {
    const configLogger = this.logger.getConfigLogger(LOG_COMPONENTS.CONFIG_SERVICE);

    configLogger.warn(
      {
        author: metadata.author,
        title: metadata.title,
        changes,
      },
      "Configuration file differs from detected file information",
    );

    // For now, automatically update - in a real implementation, this would prompt the user
    // TODO: Implement actual user prompting mechanism
    return true;
  }

  /**
   * Update book structure file with new information
   */
  public async updateBookStructure(
    metadata: FilenameMetadata,
    inputFilePath: string,
  ): Promise<void> {
    const configKey = this.getConfigKey(metadata);
    const configPath = path.join(
      this.configDir,
      `${configKey}${CONFIG_FILE_EXTENSION}`,
    );

    // Load the raw YAML to preserve structure
    const configContent = await fs.readFile(configPath, "utf-8");
    const templateConfig = yaml.load(configContent) as RawBookStructureYaml;

    // Get current file information
    const fileType = await this.determineFileType(inputFilePath);
    const fileSize = await this.getFileSize(inputFilePath);

    // Update the original section in the template
    if (templateConfig.original && Array.isArray(templateConfig.original)) {
      // Filter out and rebuild the original array properly
      const updatedOriginal = [];

      for (const item of templateConfig.original) {
        if (typeof item === "object" && item !== null) {
          const updatedItem: Record<string, unknown> = {};

          // Handle type field
          if (item.type !== undefined) {
            updatedItem.type = fileType;
          }

          // Handle size field
          if (item.size !== undefined) {
            updatedItem.size = fileSize;
          }

          // Handle pages field - only for non-text files
          if (item.pages !== undefined && fileType !== "text") {
            const pageCount = await this.getPageCount(inputFilePath, fileType);
            updatedItem.pages = pageCount;
          }

          // Only add the item if it has content
          if (Object.keys(updatedItem).length > 0) {
            updatedOriginal.push(updatedItem);
          }
        }
      }

      templateConfig.original = updatedOriginal;
    }

    // Save the updated configuration
    const yamlContent = yaml.dump(templateConfig, {
      indent: 2,
      lineWidth: 120,
      noRefs: true,
    });

    await fs.writeFile(configPath, yamlContent, "utf-8");

    const configLogger = this.logger.getConfigLogger(LOG_COMPONENTS.CONFIG_SERVICE);
    configLogger.info(
      {
        author: metadata.author,
        title: metadata.title,
        configPath,
      },
      "Book structure file updated successfully",
    );
  }

  /**
   * Get all available book structure files
   */
  public async getAvailableBookStructures(): Promise<string[]> {
    try {
      const files = await fs.readdir(this.configDir);
      return files
        .filter((file) => file.endsWith(CONFIG_FILE_EXTENSION))
        .filter((file) => file !== DEFAULT_CONFIG_FILE)
        .map((file) => file.replace(CONFIG_FILE_EXTENSION, ""));
    } catch (_error) {
      return [];
    }
  }

  /**
   * Generate configuration key from metadata
   */
  private getConfigKey(metadata: FilenameMetadata): string {
    return FileUtils.generateConfigKey(metadata);
  }

  /**
   * Extract original information from config
   */
  private extractOriginalInfo(originalArray: Record<string, unknown>[]): {
    type?: string;
    size?: number;
    pages?: number;
  } {
    const info: { type?: string; size?: number; pages?: number } = {};

    for (const item of originalArray) {
      if (typeof item === "object" && item !== null) {
        if (item.type !== undefined) info.type = item.type as string;
        if (item.size !== undefined) info.size = item.size as number;
        if (item.pages !== undefined) info.pages = item.pages as number;
      }
    }

    return info;
  }

  /**
   * Determine file type based on file analysis
   */
  private async determineFileType(filePath: string): Promise<string> {
    try {
      const ext = path.extname(filePath).toLowerCase();

      if (ext === ".pdf") {
        // Use the existing FileFormatDetector for proper PDF analysis
        const { FileFormatDetector } = await import(
          "../pipeline/phase_1_Text_Extraction_And_Format_Processing/step_1_File_Format_Detection_And_Validation/FileFormatDetector"
        );
        const detector = new FileFormatDetector(this.logger);

        // Create FileInfo object for detection
        const stats = await fs.stat(filePath);
        const fileInfo = {
          path: filePath,
          name: path.basename(filePath),
          size: stats.size,
          format: "pdf" as const,
          mimeType: "application/pdf",
          lastModified: stats.mtime,
        };

        // Perform proper format detection
        const formatResult = await detector.detectFormat(fileInfo);

        // Store format result for later use
        this.lastFormatResult = formatResult;

        // Determine type based on content analysis
        if (formatResult.metadata.contentType === "text_based") {
          return "text"; // Pure text-based PDF (treat as text)
        }
        if (formatResult.metadata.contentType === "hybrid") {
          return "pdf-text-ocr"; // Mixed content (text + images)
        }
        if (formatResult.metadata.contentType === "image_based") {
          return "pdf-ocr"; // Primarily image-based
        }
        return "pdf-text-ocr"; // Default for unknown content type
      }
      if (ext === ".epub") {
        return "epub";
      }
      return "text";
    } catch (_error) {
      // If analysis fails, fall back to extension-based detection
      const ext = path.extname(filePath).toLowerCase();
      if (ext === ".pdf") {
        return "pdf-text-ocr"; // Default for PDF
      }
      if (ext === ".epub") {
        return "epub";
      }
      return "text";
    }
  }

  /**
   * Get file size
   */
  private async getFileSize(filePath: string): Promise<number> {
    try {
      const stats = await fs.stat(filePath);
      return stats.size;
    } catch (_error) {
      return 0;
    }
  }

  /**
   * Get page count for non-text files
   */
  private async getPageCount(filePath: string, fileType: string): Promise<number> {
    try {
      if (fileType === "text") {
        return 0; // No pages for text files
      }

      // If we have a cached format result, use it
      if (this.lastFormatResult?.metadata.pageCount) {
        return this.lastFormatResult.metadata.pageCount;
      }

      // Otherwise, perform analysis for PDF files
      if (path.extname(filePath).toLowerCase() === ".pdf") {
        const pdfParse = await import("pdf-parse");
        const buffer = await fs.readFile(filePath);
        const pdfData = await pdfParse.default(buffer, { max: 0 }); // Get all pages for count
        return pdfData.numpages;
      }

      return 0;
    } catch (_error) {
      return 0;
    }
  }
}

export type { ConfigUpdateInfo, BookStructureInfo };
