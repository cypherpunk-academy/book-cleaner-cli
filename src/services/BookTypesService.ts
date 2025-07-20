import { promises as fs } from 'node:fs';
import path from 'node:path';
import { DEFAULT_ARTIFACTS_DIR, ERROR_CODES, ERROR_MESSAGES, LOG_COMPONENTS } from '@/constants';
import { AppError } from '@/utils/AppError';
import yaml from 'js-yaml';
import type { LoggerService } from './LoggerService';

/**
 * Header type configuration structure
 */
interface HeaderTypeConfig {
    level1: {
        formats: string[];
        examples: string[];
    };
}

/**
 * Book type configuration structure
 */
interface BookTypeConfig {
    description?: string;
    'header-type': HeaderTypeConfig;
    'text-removal-patterns': string[];
}

/**
 * Book types configuration file structure
 */
interface BookTypesConfig {
    [key: string]: BookTypeConfig;
}

/**
 * Service for managing book types and their configurations
 */
export class BookTypesService {
    private readonly logger: LoggerService;
    private readonly configDir: string;
    private bookTypesCache: BookTypesConfig | null = null;
    private readonly bookTypesFileName = 'book-types.yaml';

    constructor(logger: LoggerService, configDir: string = DEFAULT_ARTIFACTS_DIR) {
        this.logger = logger;
        this.configDir = configDir;
    }

    /**
     * Load book types configuration from book-types.yaml
     */
    public async loadBookTypes(): Promise<BookTypesConfig> {
        if (this.bookTypesCache) {
            return this.bookTypesCache;
        }

        const bookTypesPath = path.join(this.configDir, this.bookTypesFileName);
        const configLogger = this.logger.getConfigLogger(LOG_COMPONENTS.CONFIG_SERVICE);

        try {
            const configContent = await fs.readFile(bookTypesPath, 'utf-8');
            const bookTypes = yaml.load(configContent) as BookTypesConfig;

            // Validate the structure
            this.validateBookTypesConfig(bookTypes);

            this.bookTypesCache = bookTypes;

            configLogger.info(
                {
                    bookTypesPath,
                    typesLoaded: Object.keys(bookTypes).length,
                },
                'Book types configuration loaded successfully',
            );

            return bookTypes;
        } catch (error) {
            throw new AppError(
                ERROR_CODES.CONFIG_INVALID,
                LOG_COMPONENTS.CONFIG_SERVICE,
                'loadBookTypes',
                ERROR_MESSAGES[ERROR_CODES.CONFIG_INVALID].replace(
                    '{details}',
                    `Failed to load book types: ${bookTypesPath}`,
                ),
                { bookTypesPath },
                error instanceof Error ? error : new Error(String(error)),
            );
        }
    }

    /**
     * Get text-removal-patterns for a specific book type
     */
    public async getTextRemovalPatterns(bookType: string): Promise<string[]> {
        const bookTypes = await this.loadBookTypes();
        const typeConfig = bookTypes[bookType];

        if (!typeConfig) {
            const configLogger = this.logger.getConfigLogger(LOG_COMPONENTS.CONFIG_SERVICE);
            configLogger.warn(
                { bookType, availableTypes: Object.keys(bookTypes) },
                'Unknown book type, falling back to default',
            );

            // Fall back to default if it exists
            const defaultConfig = bookTypes.default;
            return defaultConfig?.['text-removal-patterns'] || [];
        }

        return typeConfig['text-removal-patterns'] || [];
    }

    /**
     * Get header type configuration for a specific book type
     */
    public async getHeaderTypeConfig(bookType: string): Promise<HeaderTypeConfig | null> {
        const bookTypes = await this.loadBookTypes();
        const typeConfig = bookTypes[bookType];

        if (!typeConfig) {
            // Fall back to default if it exists
            const defaultConfig = bookTypes.default;
            return defaultConfig?.['header-type'] || null;
        }

        return typeConfig['header-type'] || null;
    }

    /**
     * Get available book types
     */
    public async getAvailableBookTypes(): Promise<string[]> {
        const bookTypes = await this.loadBookTypes();
        return Object.keys(bookTypes);
    }

    /**
     * Get book type configuration by name
     */
    public async getBookTypeConfig(bookType: string): Promise<BookTypeConfig | null> {
        const bookTypes = await this.loadBookTypes();
        return bookTypes[bookType] || null;
    }

    /**
     * Clear the cache (useful for testing or when config changes)
     */
    public clearCache(): void {
        this.bookTypesCache = null;
    }

    /**
     * Validate book types configuration structure
     */
    private validateBookTypesConfig(bookTypes: BookTypesConfig): void {
        const configLogger = this.logger.getConfigLogger(LOG_COMPONENTS.CONFIG_SERVICE);

        for (const [typeName, typeConfig] of Object.entries(bookTypes)) {
            // Check if required fields are present
            if (
                !typeConfig['text-removal-patterns'] ||
                !Array.isArray(typeConfig['text-removal-patterns'])
            ) {
                configLogger.warn(
                    { typeName },
                    'Book type missing or invalid text-removal-patterns array',
                );
            }

            if (!typeConfig['header-type'] || typeof typeConfig['header-type'] !== 'object') {
                configLogger.warn(
                    { typeName },
                    'Book type missing or invalid header-type configuration',
                );
            }
        }
    }

    /**
     * Check if book types configuration file exists
     */
    public async exists(): Promise<boolean> {
        const bookTypesPath = path.join(this.configDir, this.bookTypesFileName);
        try {
            await fs.access(bookTypesPath);
            return true;
        } catch {
            return false;
        }
    }
}

export type { BookTypeConfig, HeaderTypeConfig, BookTypesConfig };
