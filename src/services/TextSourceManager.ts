import { promises as fs } from 'node:fs';
import path from 'node:path';
import { ERROR_CODES, ERROR_MESSAGES, LOG_COMPONENTS, TEXT_SOURCE_PRIORITY } from '@/constants';
import type { FilenameMetadata } from '@/types';
import { AppError } from '@/utils/AppError';
import type { LoggerService } from './LoggerService';

/**
 * Information about the selected text source
 */
export interface TextSourceInfo {
    sourceType: string;
    filePath: string;
    content: string;
    priority: number;
}

/**
 * Options for text source loading
 */
export interface TextSourceOptions {
    inferTextPath?: string;
    step2TextPath?: string;
    bookArtifactsDir: string;
}

/**
 * Service for managing text sources for structure inference
 */
export class TextSourceManager {
    private readonly logger: LoggerService;

    constructor(logger: LoggerService) {
        this.logger = logger;
    }

    /**
     * Get the best available text source for structure inference
     */
    public async getTextSource(
        metadata: FilenameMetadata,
        options: TextSourceOptions,
    ): Promise<TextSourceInfo | null> {
        const logger = this.logger.getConfigLogger(LOG_COMPONENTS.CONFIG_SERVICE);

        logger.info('Determining best text source for structure inference', {
            author: metadata.author,
            title: metadata.title,
            inferTextPath: options.inferTextPath,
            step2TextPath: options.step2TextPath,
        });

        // Priority 1: OCR file if available
        const ocrSource = await this.tryLoadOcrFile(metadata, options.bookArtifactsDir);
        if (ocrSource) {
            logger.info('Using OCR file as text source', {
                sourceType: TEXT_SOURCE_PRIORITY.OCR_FILE,
                filePath: ocrSource.filePath,
            });
            return ocrSource;
        }

        // Priority 2: CLI text file if specified
        if (options.inferTextPath) {
            const cliSource = await this.loadCliTextFile(options.inferTextPath);
            if (cliSource) {
                logger.info('Using CLI text file as text source', {
                    sourceType: TEXT_SOURCE_PRIORITY.CLI_TEXT_FILE,
                    filePath: cliSource.filePath,
                });
                return cliSource;
            }
            // If CLI file not found, continue to next priority
        }

        // Priority 3: Step 2 extracted text if available
        if (options.step2TextPath) {
            const step2Source = await this.loadStep2TextFile(options.step2TextPath);
            if (step2Source) {
                logger.info('Using Step 2 extracted text as text source', {
                    sourceType: TEXT_SOURCE_PRIORITY.STEP2_EXTRACTED_TEXT,
                    filePath: step2Source.filePath,
                });
                return step2Source;
            }
            // If Step 2 file not found, continue to final fallback
        }

        // No text source available - return null instead of throwing error
        logger.info('No text source available for structure inference - step will be omitted', {
            author: metadata.author,
            title: metadata.title,
        });
        return null;
    }

    /**
     * Try to load OCR file from book artifacts
     */
    private async tryLoadOcrFile(
        metadata: FilenameMetadata,
        bookArtifactsDir: string,
    ): Promise<TextSourceInfo | null> {
        try {
            // Look for OCR file in the book-specific directory
            const configKey = this.generateConfigKey(metadata);
            const ocrFilePath = path.join(bookArtifactsDir, configKey, 'phase1', 'step2.ocr');

            // Check if OCR file exists
            await fs.access(ocrFilePath);
            const content = await fs.readFile(ocrFilePath, 'utf-8');

            return {
                sourceType: TEXT_SOURCE_PRIORITY.OCR_FILE,
                filePath: ocrFilePath,
                content,
                priority: 1,
            };
        } catch (error) {
            // OCR file not found or not readable
            this.logger.debug(LOG_COMPONENTS.CONFIG_SERVICE, 'OCR file not available', {
                error: error instanceof Error ? error.message : String(error),
            });
            return null;
        }
    }

    /**
     * Load CLI text file
     */
    private async loadCliTextFile(filePath: string): Promise<TextSourceInfo | null> {
        try {
            // Validate file exists
            await fs.access(filePath);
            const content = await fs.readFile(filePath, 'utf-8');

            return {
                sourceType: TEXT_SOURCE_PRIORITY.CLI_TEXT_FILE,
                filePath,
                content,
                priority: 2,
            };
        } catch (error) {
            // File not found or not readable - return null instead of throwing error
            this.logger.debug(LOG_COMPONENTS.CONFIG_SERVICE, 'CLI text file not available', {
                filePath,
                error: error instanceof Error ? error.message : String(error),
            });
            return null;
        }
    }

    /**
     * Load Step 2 extracted text file
     */
    private async loadStep2TextFile(filePath: string): Promise<TextSourceInfo | null> {
        try {
            // Validate file exists
            await fs.access(filePath);
            const content = await fs.readFile(filePath, 'utf-8');

            return {
                sourceType: TEXT_SOURCE_PRIORITY.STEP2_EXTRACTED_TEXT,
                filePath,
                content,
                priority: 3,
            };
        } catch (error) {
            // File not found or not readable - return null instead of throwing error
            this.logger.debug(LOG_COMPONENTS.CONFIG_SERVICE, 'Step 2 text file not available', {
                filePath,
                error: error instanceof Error ? error.message : String(error),
            });
            return null;
        }
    }

    /**
     * Generate config key from metadata (same as BookStructureService)
     */
    private generateConfigKey(metadata: FilenameMetadata): string {
        const parts = [metadata.author, metadata.title];
        if (metadata.bookIndex) {
            parts.push(metadata.bookIndex);
        }
        return parts.join('#');
    }
}
