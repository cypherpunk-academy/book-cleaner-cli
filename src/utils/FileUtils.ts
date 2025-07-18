import { promises as fs } from "node:fs";
import path from "node:path";
import {
  ERROR_CODES,
  ERROR_MESSAGES,
  FILE_EXTENSIONS,
  LOG_COMPONENTS,
  MIME_TYPES,
  SUPPORTED_FORMATS,
  VALIDATION_LIMITS,
  VALIDATION_PATTERNS,
} from "@/constants";
import type { LoggerService } from "@/services/LoggerService";
import type { FileInfo, FilenameMetadata, SupportedFormat } from "@/types";
import { lookup } from "mime-types";
import { AppError } from "./AppError";

// Define BufferEncoding type for Node.js buffer operations
type BufferEncoding =
  | "ascii"
  | "utf8"
  | "utf-8"
  | "utf16le"
  | "ucs2"
  | "ucs-2"
  | "base64"
  | "base64url"
  | "latin1"
  | "binary"
  | "hex";

/**
 * Utility class for file system operations and filename parsing
 */
export class FileUtils {
  private readonly logger: LoggerService;

  constructor(logger: LoggerService) {
    this.logger = logger;
  }

  /**
   * Get file information
   */
  public async getFileInfo(filePath: string): Promise<FileInfo> {
    const fileLogger = this.logger.getFileProcessingLogger(LOG_COMPONENTS.FILE_HANDLER);

    try {
      const stats = await fs.stat(filePath);
      const name = path.basename(filePath);
      const format = this.getFileFormat(filePath);
      const mimeType = lookup(filePath) || MIME_TYPES.TXT;

      const fileInfo: FileInfo = {
        path: filePath,
        name,
        size: stats.size,
        format,
        mimeType,
        lastModified: stats.mtime,
      };

      fileLogger.debug(
        {
          path: filePath,
          size: stats.size,
          format,
          mimeType,
        },
        "File information retrieved",
      );

      return fileInfo;
    } catch (error) {
      throw new AppError(
        ERROR_CODES.FILE_NOT_FOUND,
        LOG_COMPONENTS.FILE_HANDLER,
        "getFileInfo",
        ERROR_MESSAGES[ERROR_CODES.FILE_NOT_FOUND].replace("{path}", filePath),
        { filePath },
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  /**
   * Parse filename to extract metadata
   */
  public parseFilename(filename: string): FilenameMetadata {
    const fileLogger = this.logger.getFileProcessingLogger(LOG_COMPONENTS.FILE_HANDLER);

    // Remove file extension for parsing
    const nameWithoutExt = path.basename(filename, path.extname(filename));

    // Match pattern: author#title[#bookIndex]
    const match = nameWithoutExt.match(VALIDATION_PATTERNS.FILENAME_METADATA);

    if (!match) {
      throw new AppError(
        ERROR_CODES.VALIDATION_ERROR,
        LOG_COMPONENTS.FILE_HANDLER,
        "parseFilename",
        ERROR_MESSAGES[ERROR_CODES.VALIDATION_ERROR].replace(
          "{field}",
          "filename format",
        ),
        {
          filename,
          expectedPattern: "author#title[#bookIndex].extension",
          actualPattern: nameWithoutExt,
        },
      );
    }

    const [, author, title, bookIndex] = match;

    // Convert underscores to spaces
    const processedAuthor = author.replace(/_/g, " ");
    const processedTitle = title.replace(/_/g, " ");

    // Validate lengths
    if (processedAuthor.length > VALIDATION_LIMITS.MAX_AUTHOR_LENGTH) {
      throw new AppError(
        ERROR_CODES.VALIDATION_ERROR,
        LOG_COMPONENTS.FILE_HANDLER,
        "parseFilename",
        ERROR_MESSAGES[ERROR_CODES.VALIDATION_ERROR].replace(
          "{field}",
          "author length",
        ),
        {
          author: processedAuthor,
          maxLength: VALIDATION_LIMITS.MAX_AUTHOR_LENGTH,
          actualLength: processedAuthor.length,
        },
      );
    }

    if (processedTitle.length > VALIDATION_LIMITS.MAX_TITLE_LENGTH) {
      throw new AppError(
        ERROR_CODES.VALIDATION_ERROR,
        LOG_COMPONENTS.FILE_HANDLER,
        "parseFilename",
        ERROR_MESSAGES[ERROR_CODES.VALIDATION_ERROR].replace("{field}", "title length"),
        {
          title: processedTitle,
          maxLength: VALIDATION_LIMITS.MAX_TITLE_LENGTH,
          actualLength: processedTitle.length,
        },
      );
    }

    const metadata: FilenameMetadata = {
      author: processedAuthor,
      title: processedTitle,
      bookIndex: bookIndex ? bookIndex.replace(/_/g, " ") : undefined,
      originalFilename: filename,
    };

    fileLogger.debug(
      {
        filename,
        author: metadata.author,
        title: metadata.title,
        bookIndex: metadata.bookIndex,
      },
      "Filename parsed successfully",
    );

    return metadata;
  }

  /**
   * Get file format from filename
   */
  public getFileFormat(filename: string): SupportedFormat {
    const ext = path.extname(filename).toLowerCase();

    switch (ext) {
      case FILE_EXTENSIONS.PDF:
        return "pdf";
      case FILE_EXTENSIONS.EPUB:
        return "epub";
      case FILE_EXTENSIONS.TXT:
        return "txt";
      case FILE_EXTENSIONS.DOCX:
        return "docx";
      default:
        throw new AppError(
          ERROR_CODES.INVALID_FORMAT,
          LOG_COMPONENTS.FILE_HANDLER,
          "getFileFormat",
          ERROR_MESSAGES[ERROR_CODES.INVALID_FORMAT].replace("{format}", ext),
          {
            filename,
            extension: ext,
            supportedFormats: SUPPORTED_FORMATS,
          },
        );
    }
  }

  /**
   * Validate file format
   */
  public validateFileFormat(filename: string): boolean {
    try {
      this.getFileFormat(filename);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if file exists
   */
  public async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Ensure directory exists
   */
  public async ensureDirectory(dirPath: string): Promise<void> {
    try {
      await fs.mkdir(dirPath, { recursive: true });
    } catch (error) {
      throw new AppError(
        ERROR_CODES.VALIDATION_ERROR,
        LOG_COMPONENTS.FILE_HANDLER,
        "ensureDirectory",
        ERROR_MESSAGES[ERROR_CODES.VALIDATION_ERROR].replace(
          "{field}",
          "directory creation",
        ),
        { dirPath },
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  /**
   * Get file size in bytes
   */
  public async getFileSize(filePath: string): Promise<number> {
    try {
      const stats = await fs.stat(filePath);
      return stats.size;
    } catch (error) {
      throw new AppError(
        ERROR_CODES.FILE_NOT_FOUND,
        LOG_COMPONENTS.FILE_HANDLER,
        "getFileSize",
        ERROR_MESSAGES[ERROR_CODES.FILE_NOT_FOUND].replace("{path}", filePath),
        { filePath },
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  /**
   * Read file content
   */
  public async readFile(
    filePath: string,
    encoding: BufferEncoding = "utf-8",
  ): Promise<string> {
    try {
      return await fs.readFile(filePath, encoding);
    } catch (error) {
      throw new AppError(
        ERROR_CODES.FILE_NOT_FOUND,
        LOG_COMPONENTS.FILE_HANDLER,
        "readFile",
        ERROR_MESSAGES[ERROR_CODES.FILE_NOT_FOUND].replace("{path}", filePath),
        { filePath, encoding },
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  /**
   * Write file content
   */
  public async writeFile(
    filePath: string,
    content: string,
    encoding: BufferEncoding = "utf-8",
  ): Promise<void> {
    try {
      // Ensure directory exists
      await this.ensureDirectory(path.dirname(filePath));

      // Write file
      await fs.writeFile(filePath, content, encoding);

      const fileLogger = this.logger.getFileProcessingLogger(
        LOG_COMPONENTS.FILE_HANDLER,
      );
      fileLogger.debug(
        {
          filePath,
          size: content.length,
          encoding,
        },
        "File written successfully",
      );
    } catch (error) {
      throw new AppError(
        ERROR_CODES.VALIDATION_ERROR,
        LOG_COMPONENTS.FILE_HANDLER,
        "writeFile",
        ERROR_MESSAGES[ERROR_CODES.VALIDATION_ERROR].replace("{field}", "file writing"),
        { filePath, encoding },
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  /**
   * Copy file
   */
  public async copyFile(sourcePath: string, targetPath: string): Promise<void> {
    try {
      // Ensure target directory exists
      await this.ensureDirectory(path.dirname(targetPath));

      // Copy file
      await fs.copyFile(sourcePath, targetPath);

      const fileLogger = this.logger.getFileProcessingLogger(
        LOG_COMPONENTS.FILE_HANDLER,
      );
      fileLogger.debug(
        {
          sourcePath,
          targetPath,
        },
        "File copied successfully",
      );
    } catch (error) {
      throw new AppError(
        ERROR_CODES.VALIDATION_ERROR,
        LOG_COMPONENTS.FILE_HANDLER,
        "copyFile",
        ERROR_MESSAGES[ERROR_CODES.VALIDATION_ERROR].replace("{field}", "file copying"),
        { sourcePath, targetPath },
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  /**
   * Delete file
   */
  public async deleteFile(filePath: string): Promise<void> {
    try {
      await fs.unlink(filePath);

      const fileLogger = this.logger.getFileProcessingLogger(
        LOG_COMPONENTS.FILE_HANDLER,
      );
      fileLogger.debug(
        {
          filePath,
        },
        "File deleted successfully",
      );
    } catch (error) {
      throw new AppError(
        ERROR_CODES.FILE_NOT_FOUND,
        LOG_COMPONENTS.FILE_HANDLER,
        "deleteFile",
        ERROR_MESSAGES[ERROR_CODES.FILE_NOT_FOUND].replace("{path}", filePath),
        { filePath },
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  /**
   * Get temporary file path
   */
  public getTempFilePath(prefix: string, extension: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2);
    const filename = `${prefix}_${timestamp}_${random}${extension}`;

    return path.join(process.env.TEMP_DIR || "/tmp", filename);
  }

  /**
   * Generate output filename based on metadata and pattern
   */
  public generateOutputFilename(
    metadata: FilenameMetadata,
    pattern: string,
    extension: string,
  ): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

    let filename = pattern
      .replace("{author}", metadata.author)
      .replace("{title}", metadata.title)
      .replace("{bookIndex}", metadata.bookIndex || "")
      .replace("{timestamp}", timestamp);

    // Clean up any empty brackets
    filename = filename.replace(/\[\s*\]/g, "");

    // Add extension
    if (!filename.endsWith(extension)) {
      filename += extension;
    }

    return filename;
  }

  /**
   * Validate filename characters
   */
  public validateFilenameCharacters(filename: string): boolean {
    return VALIDATION_PATTERNS.FILENAME_CHARS.test(filename);
  }

  /**
   * Sanitize filename for filesystem
   */
  public sanitizeFilename(filename: string): string {
    return filename
      .replace(/[<>:"/\\|?*]/g, "_")
      .replace(/\s+/g, "_")
      .substring(0, VALIDATION_LIMITS.MAX_FILENAME_LENGTH);
  }

  /**
   * Generate consistent configuration key from metadata
   * Always includes book index if present to ensure uniqueness
   */
  static generateConfigKey(metadata: FilenameMetadata): string {
    if (!metadata.author || !metadata.title) {
      throw new Error("Author and title are required for configuration key generation");
    }

    const parts = [metadata.author, metadata.title];
    if (metadata.bookIndex) {
      parts.push(metadata.bookIndex);
    }
    return parts.join(VALIDATION_PATTERNS.AUTHOR_TITLE_SEPARATOR);
  }

  /**
   * Generate configuration filename with extension
   */
  static generateConfigFilename(metadata: FilenameMetadata): string {
    return `${FileUtils.generateConfigKey(metadata)}.yaml`;
  }
}
