import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
    CONFIG_FILE_EXTENSION,
    DEFAULT_ARTIFACTS_DIR,
    DEFAULT_BOOK_MANIFEST_FILE,
    ERROR_CODES,
    ERROR_MESSAGES,
    LOG_COMPONENTS,
} from '@/constants';
import type { BookManifestInfo, FileFormatResult, FilenameMetadata } from '@/types';
import { AppError } from '@/utils/AppError';
import { FileUtils } from '@/utils/FileUtils';
import yaml from 'js-yaml';
import type { LoggerService } from './LoggerService';

/**
 * Information about configuration updates needed
 */
interface ConfigUpdateInfo {
    format?: { current: string; existing: string | undefined };
    size?: { current: number; existing: number | undefined };
    pages?: { current: number; existing: number | undefined };
}

/**
 * Service for managing book structure YAML files
 */
export class BookStructureService {
    private readonly logger: LoggerService;
    private readonly configDir: string;
    private lastFormatResult?: FileFormatResult;

    // Centralized manifest cache - loaded once per CLI run
    private manifestCache: Map<string, BookManifestInfo> = new Map();
    private defaultManifestCache?: BookManifestInfo;

    constructor(logger: LoggerService, configDir: string = DEFAULT_ARTIFACTS_DIR) {
        this.logger = logger;
        this.configDir = configDir;
    }

    /**
     * Load and cache book manifest for the entire CLI run
     * This should be called once at the start of the clean-book command
     */
    public async loadBookManifest(metadata: FilenameMetadata): Promise<BookManifestInfo> {
        const configKey = this.getConfigKey(metadata);

        // Check cache first
        if (this.manifestCache.has(configKey)) {
            this.logger.debug(LOG_COMPONENTS.CONFIG_SERVICE, 'Using cached book manifest', {
                configKey,
            });
            const cachedManifest = this.manifestCache.get(configKey);
            if (!cachedManifest) {
                throw new AppError(
                    ERROR_CODES.CONFIG_INVALID,
                    LOG_COMPONENTS.CONFIG_SERVICE,
                    'loadBookManifest',
                    'Cached manifest is null or undefined',
                    { configKey },
                );
            }
            return cachedManifest;
        }

        // Load from file
        const manifest = await this.loadBookStructure(metadata);

        // Cache the result
        this.manifestCache.set(configKey, manifest);

        this.logger.info(LOG_COMPONENTS.CONFIG_SERVICE, 'Loaded and cached book manifest', {
            configKey,
            author: manifest.author,
            title: manifest.title,
        });

        return manifest;
    }

    /**
     * Get cached book manifest (must be loaded first)
     */
    public getBookManifest(metadata: FilenameMetadata): BookManifestInfo | undefined {
        const configKey = this.getConfigKey(metadata);
        return this.manifestCache.get(configKey);
    }

    /**
     * Update cached book manifest and save to file
     */
    public async updateBookManifest(
        metadata: FilenameMetadata,
        updates: Partial<BookManifestInfo>,
    ): Promise<void> {
        const configKey = this.getConfigKey(metadata);
        const currentManifest = this.manifestCache.get(configKey);

        if (!currentManifest) {
            throw new AppError(
                ERROR_CODES.CONFIG_INVALID,
                LOG_COMPONENTS.CONFIG_SERVICE,
                'updateBookManifest',
                'Book manifest not loaded. Call loadBookManifest first.',
                { configKey },
            );
        }

        // Update the cached manifest
        const updatedManifest: BookManifestInfo = {
            ...currentManifest,
            ...updates,
        };

        this.manifestCache.set(configKey, updatedManifest);

        // Save to file
        await this.saveBookManifest(metadata, updatedManifest);

        this.logger.info(LOG_COMPONENTS.CONFIG_SERVICE, 'Updated book manifest', {
            configKey,
            updates: Object.keys(updates),
        });
    }

    /**
     * Save book manifest to file
     */
    public async saveBookManifest(
        metadata: FilenameMetadata,
        manifest: BookManifestInfo,
    ): Promise<void> {
        const configKey = this.getConfigKey(metadata);
        const configPath = path.join(this.configDir, `${configKey}${CONFIG_FILE_EXTENSION}`);

        try {
            // Ensure directory exists
            await fs.mkdir(path.dirname(configPath), { recursive: true });

            // Convert to YAML format (handle the book-index field properly)
            const yamlManifest: Record<string, unknown> = {
                author: manifest.author,
                title: manifest.title,
                original: manifest.original,
                structure: manifest.structure,
                footnotes: manifest.footnotes,
            };

            // Handle optional fields
            if (manifest.bookIndex) {
                yamlManifest['book-index'] = manifest.bookIndex;
            }
            if (manifest.textBeforeFirstChapter) {
                yamlManifest['text-before-first-chapter'] = manifest.textBeforeFirstChapter;
            }
            if (manifest.textAfterLastChapter) {
                yamlManifest['text-after-last-chapter'] = manifest.textAfterLastChapter;
            }

            // Save to file
            await fs.writeFile(configPath, yaml.dump(yamlManifest), 'utf-8');

            this.logger.debug(LOG_COMPONENTS.CONFIG_SERVICE, 'Saved book manifest to file', {
                configPath,
            });
        } catch (error) {
            throw new AppError(
                ERROR_CODES.CONFIG_INVALID,
                LOG_COMPONENTS.CONFIG_SERVICE,
                'saveBookManifest',
                'Failed to save book manifest',
                { configPath },
                error instanceof Error ? error : new Error(String(error)),
            );
        }
    }

    /**
     * Load default manifest template (cached)
     */
    public async getDefaultManifest(): Promise<BookManifestInfo> {
        if (this.defaultManifestCache) {
            return this.defaultManifestCache;
        }

        const defaultTemplatePath = path.join(this.configDir, DEFAULT_BOOK_MANIFEST_FILE);

        try {
            const templateContent = await fs.readFile(defaultTemplatePath, 'utf-8');
            const templateConfig = yaml.load(templateContent) as BookManifestInfo;

            this.defaultManifestCache = templateConfig;
            return templateConfig;
        } catch (error) {
            throw new AppError(
                ERROR_CODES.CONFIG_INVALID,
                LOG_COMPONENTS.CONFIG_SERVICE,
                'getDefaultManifest',
                'Failed to load default manifest template',
                { defaultTemplatePath },
                error instanceof Error ? error : new Error(String(error)),
            );
        }
    }

    /**
     * Clear manifest cache (useful for testing or when switching books)
     */
    public clearCache(): void {
        this.manifestCache.clear();
        this.defaultManifestCache = undefined;
        this.logger.debug(LOG_COMPONENTS.CONFIG_SERVICE, 'Cleared manifest cache');
    }

    /**
     * Get manifest file path for a book
     */
    public getManifestPath(metadata: FilenameMetadata): string {
        const configKey = this.getConfigKey(metadata);
        return path.join(this.configDir, `${configKey}${CONFIG_FILE_EXTENSION}`);
    }

    /**
     * Check if book structure file exists
     */
    public async exists(metadata: FilenameMetadata): Promise<boolean> {
        const configKey = this.getConfigKey(metadata);
        const configPath = path.join(this.configDir, `${configKey}${CONFIG_FILE_EXTENSION}`);

        try {
            await fs.access(configPath);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Load book structure information from YAML file
     * Only loads from book-specific directory, fails if not found
     */
    public async loadBookStructure(metadata: FilenameMetadata): Promise<BookManifestInfo> {
        const configKey = this.getConfigKey(metadata);

        // Only load from book-specific directory
        const bookSpecificPath = path.join(this.configDir, configKey, 'book-manifest.yaml');

        let configContent: string;

        try {
            // Load book-specific manifest only
            configContent = await fs.readFile(bookSpecificPath, 'utf-8');
            this.logger.info(LOG_COMPONENTS.CONFIG_SERVICE, 'Loaded book-specific manifest', {
                configPath: bookSpecificPath,
            });
        } catch (error) {
            throw new AppError(
                ERROR_CODES.CONFIG_INVALID,
                LOG_COMPONENTS.CONFIG_SERVICE,
                'loadBookStructure',
                ERROR_MESSAGES[ERROR_CODES.CONFIG_INVALID].replace(
                    '{details}',
                    `Book-specific manifest not found at ${bookSpecificPath}. Each book must have its own manifest file.`,
                ),
                { bookSpecificPath, configKey },
                error instanceof Error ? error : new Error(String(error)),
            );
        }

        const bookStructure = yaml.load(configContent) as Record<string, unknown>;

        const result: BookManifestInfo = {
            author: (bookStructure.author as string) || metadata.author,
            title: (bookStructure.title as string) || metadata.title,
            original: bookStructure.original as BookManifestInfo['original'],
            textBeforeFirstChapter: bookStructure['text-before-first-chapter'] as string,
            textAfterLastChapter: bookStructure['text-after-last-chapter'] as string,
            ocrMisreadings: bookStructure['ocr-misreadings'] as BookManifestInfo['ocrMisreadings'],
            structure: bookStructure.structure as BookManifestInfo['structure'],
            footnotes: bookStructure.footnotes as BookManifestInfo['footnotes'],
        };

        // Only add bookIndex if it has a value
        const bookIndexValue = (bookStructure['book-index'] as string) || metadata.bookIndex;
        if (bookIndexValue) {
            result.bookIndex = bookIndexValue;
        }

        return result;
    }

    /**
     * Create a new book structure file based on the default template
     */
    public async createBookStructure(
        metadata: FilenameMetadata,
        inputFilePath?: string,
    ): Promise<BookManifestInfo> {
        const defaultTemplatePath = path.join(this.configDir, DEFAULT_BOOK_MANIFEST_FILE);

        try {
            // Load the default template
            const templateContent = await fs.readFile(defaultTemplatePath, 'utf-8');
            const templateConfig = yaml.load(templateContent) as BookManifestInfo;

            // Fill in the metadata
            templateConfig.author = metadata.author;
            templateConfig.title = metadata.title;

            // Extract book index from filename if present
            const bookIndex = metadata.bookIndex || '';
            if (bookIndex) {
                templateConfig['book-index'] = bookIndex;
            }

            // Determine file type and size from input file path
            const filePath = inputFilePath || metadata.originalFilename;
            const fileType = await this.determineFileType(filePath);
            const fileSize = await this.getFileSize(filePath);

            // Update the original section in the template
            if (templateConfig.original && typeof templateConfig.original === 'object') {
                // Handle original as an object
                const originalObj = templateConfig.original as Record<string, unknown>;
                const updatedOriginal: Record<string, unknown> = {};

                // Handle format field
                if (originalObj.format !== undefined) {
                    updatedOriginal.format = fileType;
                }

                // Handle size field
                if (originalObj.size !== undefined) {
                    updatedOriginal.size = fileSize;
                }

                // Handle pages field - only for non-text files
                if (originalObj.pages !== undefined && fileType !== 'text') {
                    const pageCount = await this.getPageCount(filePath, fileType);
                    updatedOriginal.pages = pageCount;
                }

                // Handle book-type field - preserve existing value or set default
                if (originalObj['book-type'] !== undefined) {
                    updatedOriginal['book-type'] = originalObj['book-type'] as string;
                }

                templateConfig.original = updatedOriginal;
            }

            // Save the new book-specific config file
            const configKey = this.getConfigKey(metadata);
            const configPath = path.join(this.configDir, `${configKey}${CONFIG_FILE_EXTENSION}`);

            // Ensure config directory exists
            await fs.mkdir(this.configDir, { recursive: true });

            // Convert back to YAML and save
            const yamlContent = yaml.dump(templateConfig, {
                indent: 2,
                lineWidth: 120,
                noRefs: true,
            });

            await fs.writeFile(configPath, yamlContent, 'utf-8');

            const configLogger = this.logger.getConfigLogger(LOG_COMPONENTS.CONFIG_SERVICE);
            configLogger.info(
                {
                    author: metadata.author,
                    title: metadata.title,
                    configPath,
                },
                'Book structure file created successfully',
            );

            const result: BookManifestInfo = {
                author: templateConfig.author || metadata.author,
                title: templateConfig.title || metadata.title,
                original: templateConfig.original,
                textBeforeFirstChapter: templateConfig.textBeforeFirstChapter,
                textAfterLastChapter: templateConfig.textAfterLastChapter,
                ocrMisreadings: templateConfig.ocrMisreadings,
                structure: templateConfig.structure,
                footnotes: templateConfig.footnotes,
            };

            // Only add bookIndex if it has a value
            const bookIndexValue = templateConfig['book-index'] as string;
            if (bookIndexValue) {
                result.bookIndex = bookIndexValue;
            }

            return result;
        } catch (error) {
            throw new AppError(
                ERROR_CODES.CONFIG_INVALID,
                LOG_COMPONENTS.CONFIG_SERVICE,
                'createBookStructure',
                ERROR_MESSAGES[ERROR_CODES.CONFIG_INVALID].replace(
                    '{details}',
                    'Failed to create book structure file',
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
            const configPath = path.join(this.configDir, `${configKey}${CONFIG_FILE_EXTENSION}`);
            const configContent = await fs.readFile(configPath, 'utf-8');
            const rawConfig = yaml.load(configContent) as BookManifestInfo;

            let changes: ConfigUpdateInfo | null = null;

            // Check if original section exists and has the expected structure
            if (rawConfig.original && typeof rawConfig.original === 'object') {
                const originalObj = rawConfig.original as Record<string, unknown>;

                // Compare file format
                if (originalObj.format !== currentFileType) {
                    changes = changes || {};
                    changes.format = {
                        current: currentFileType,
                        existing: originalObj.format as string,
                    };
                }

                // Compare file size
                if (originalObj.size !== currentFileSize) {
                    changes = changes || {};
                    changes.size = {
                        current: currentFileSize,
                        existing: originalObj.size as number,
                    };
                }

                // Compare page count (only for non-text files)
                if (currentFileType !== 'text' && originalObj.pages !== currentPageCount) {
                    changes = changes || {};
                    changes.pages = {
                        current: currentPageCount,
                        existing: originalObj.pages as number,
                    };
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
            'Configuration file differs from detected file information',
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
        const configPath = path.join(this.configDir, `${configKey}${CONFIG_FILE_EXTENSION}`);

        // Load the raw YAML to preserve structure
        const configContent = await fs.readFile(configPath, 'utf-8');
        const templateConfig = yaml.load(configContent) as BookManifestInfo;

        // Get current file information
        const fileType = await this.determineFileType(inputFilePath);
        const fileSize = await this.getFileSize(inputFilePath);

        // Update the original section in the template
        if (templateConfig.original && typeof templateConfig.original === 'object') {
            // Handle original as an object
            const originalObj = templateConfig.original as Record<string, unknown>;
            const updatedOriginal: Record<string, unknown> = {};

            // Handle format field
            if (originalObj.format !== undefined) {
                updatedOriginal.format = fileType;
            }

            // Handle size field
            if (originalObj.size !== undefined) {
                updatedOriginal.size = fileSize;
            }

            // Handle pages field - only for non-text files
            if (originalObj.pages !== undefined && fileType !== 'text') {
                const pageCount = await this.getPageCount(inputFilePath, fileType);
                updatedOriginal.pages = pageCount;
            }

            // Handle book-type field - preserve existing value
            if (originalObj['book-type'] !== undefined) {
                updatedOriginal['book-type'] = originalObj['book-type'] as string;
            }

            templateConfig.original = updatedOriginal;
        }

        // Save the updated configuration
        const yamlContent = yaml.dump(templateConfig, {
            indent: 2,
            lineWidth: 120,
            noRefs: true,
        });

        await fs.writeFile(configPath, yamlContent, 'utf-8');

        const configLogger = this.logger.getConfigLogger(LOG_COMPONENTS.CONFIG_SERVICE);
        configLogger.info(
            {
                author: metadata.author,
                title: metadata.title,
                configPath,
            },
            'Book structure file updated successfully',
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
                .filter((file) => file !== DEFAULT_BOOK_MANIFEST_FILE)
                .map((file) => file.replace(CONFIG_FILE_EXTENSION, ''));
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
     * Determine file type based on file analysis
     */
    private async determineFileType(filePath: string): Promise<string> {
        try {
            const ext = path.extname(filePath).toLowerCase();

            if (ext === '.pdf') {
                // Use the existing FileFormatDetector for proper PDF analysis
                const { FileFormatDetector } = await import(
                    '../pipeline/phase_1_Text_Extraction_And_Format_Processing/step_1_File_Format_Detection_And_Validation/FileFormatDetector'
                );
                const detector = new FileFormatDetector(this.logger);

                // Create FileInfo object for detection
                const stats = await fs.stat(filePath);
                const fileInfo = {
                    path: filePath,
                    name: path.basename(filePath),
                    size: stats.size,
                    format: 'pdf' as const,
                    mimeType: 'application/pdf',
                    lastModified: stats.mtime,
                };

                // Perform proper format detection
                const formatResult = await detector.detectFormat(fileInfo);

                // Store format result for later use
                this.lastFormatResult = formatResult;

                // Determine type based on content analysis
                if (formatResult.metadata.contentType === 'text_based') {
                    return 'text'; // Pure text-based PDF (treat as text)
                }
                if (formatResult.metadata.contentType === 'hybrid') {
                    return 'pdf-text-ocr'; // Mixed content (text + images)
                }
                if (formatResult.metadata.contentType === 'image_based') {
                    return 'pdf-ocr'; // Primarily image-based
                }
                return 'pdf-text-ocr'; // Default for unknown content type
            }
            if (ext === '.epub') {
                return 'epub';
            }
            return 'text';
        } catch (_error) {
            // If analysis fails, fall back to extension-based detection
            const ext = path.extname(filePath).toLowerCase();
            if (ext === '.pdf') {
                return 'pdf-text-ocr'; // Default for PDF
            }
            if (ext === '.epub') {
                return 'epub';
            }
            return 'text';
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
            if (fileType === 'text') {
                return 0; // No pages for text files
            }

            // If we have a cached format result, use it
            if (this.lastFormatResult?.metadata.pageCount) {
                return this.lastFormatResult.metadata.pageCount;
            }

            // Otherwise, perform analysis for PDF files
            if (path.extname(filePath).toLowerCase() === '.pdf') {
                const pdfParse = await import('pdf-parse');
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

export type { ConfigUpdateInfo };
