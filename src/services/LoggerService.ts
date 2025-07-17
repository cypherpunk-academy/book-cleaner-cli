import { LOG_COMPONENTS, LOG_LEVELS, LOG_TAGS } from '@/constants';
import type { LogContext, LogLevel, LoggerConfig } from '@/types';
import pino from 'pino';

/**
 * Tagged logging service using Pino
 * Provides component-specific logging with different log levels per tag
 */
export class LoggerService {
    private readonly logger: pino.Logger;
    private readonly config: LoggerConfig;
    private readonly taggedLoggers: Map<string, pino.Logger> = new Map();

    constructor(config: LoggerConfig) {
        this.config = config;
        this.logger = pino({
            level: config.level,
            ...(config.pretty && {
                transport: {
                    target: 'pino-pretty',
                    options: {
                        colorize: true,
                        translateTime: config.timestamp ? 'yyyy-mm-dd HH:MM:ss' : false,
                        ignore: 'pid,hostname',
                    },
                },
            }),
            timestamp: config.timestamp,
            formatters: {
                level: (label: string) => {
                    return { level: label };
                },
            },
        });
    }

    /**
     * Get a tagged logger for a specific component
     */
    public getTaggedLogger(component: string, tag: string): pino.Logger {
        const key = `${component}-${tag}`;

        if (!this.taggedLoggers.has(key)) {
            const tagLevel = this.config.tags[tag] || this.config.level;
            const childLogger = this.logger.child({
                component,
                tag,
                level: tagLevel,
            });

            this.taggedLoggers.set(key, childLogger);
        }

        const logger = this.taggedLoggers.get(key);
        if (!logger) {
            throw new Error(`Logger for key ${key} not found`);
        }
        return logger;
    }

    /**
     * Get logger for pipeline operations
     */
    public getPipelineLogger(component: string): pino.Logger {
        return this.getTaggedLogger(component, LOG_TAGS.PIPELINE);
    }

    /**
     * Get logger for file processing operations
     */
    public getFileProcessingLogger(component: string): pino.Logger {
        return this.getTaggedLogger(component, LOG_TAGS.FILE_PROCESSING);
    }

    /**
     * Get logger for text extraction operations
     */
    public getTextExtractionLogger(component: string): pino.Logger {
        return this.getTaggedLogger(component, LOG_TAGS.TEXT_EXTRACTION);
    }

    /**
     * Get logger for OCR operations
     */
    public getOCRLogger(component: string): pino.Logger {
        return this.getTaggedLogger(component, LOG_TAGS.OCR);
    }

    /**
     * Get logger for configuration operations
     */
    public getConfigLogger(component: string): pino.Logger {
        return this.getTaggedLogger(component, LOG_TAGS.CONFIG);
    }

    /**
     * Get logger for CLI operations
     */
    public getCLILogger(component: string): pino.Logger {
        return this.getTaggedLogger(component, LOG_TAGS.CLI);
    }

    /**
     * Get logger for error handling
     */
    public getErrorLogger(component: string): pino.Logger {
        return this.getTaggedLogger(component, LOG_TAGS.ERROR);
    }

    /**
     * Log with context
     */
    public logWithContext(
        level: LogLevel,
        context: LogContext,
        message: string,
        data?: Record<string, unknown>,
    ): void {
        const logger = this.getTaggedLogger(context.component, LOG_TAGS.PIPELINE);

        const logData = {
            ...context,
            ...data,
        };

        logger[level](logData, message);
    }

    /**
     * Log debug message
     */
    public debug(component: string, message: string, data?: Record<string, unknown>): void {
        const logger = this.getTaggedLogger(component, LOG_TAGS.PIPELINE);
        logger.debug(data, message);
    }

    /**
     * Log info message
     */
    public info(component: string, message: string, data?: Record<string, unknown>): void {
        const logger = this.getTaggedLogger(component, LOG_TAGS.PIPELINE);
        logger.info(data, message);
    }

    /**
     * Log warning message
     */
    public warn(component: string, message: string, data?: Record<string, unknown>): void {
        const logger = this.getTaggedLogger(component, LOG_TAGS.PIPELINE);
        logger.warn(data, message);
    }

    /**
     * Log error message
     */
    public error(component: string, message: string, data?: Record<string, unknown>): void {
        const logger = this.getErrorLogger(component);
        logger.error(data, message);
    }

    /**
     * Log fatal message
     */
    public fatal(component: string, message: string, data?: Record<string, unknown>): void {
        const logger = this.getErrorLogger(component);
        logger.fatal(data, message);
    }

    /**
     * Create a child logger with additional context
     */
    public child(component: string, tag: string, context: Record<string, unknown>): pino.Logger {
        const logger = this.getTaggedLogger(component, tag);
        return logger.child(context);
    }

    /**
     * Update logging configuration
     */
    public updateConfig(config: Partial<LoggerConfig>): void {
        if (config.level) {
            this.logger.level = config.level;
        }

        if (config.tags) {
            Object.assign(this.config.tags, config.tags);
            // Clear cached loggers to apply new tag levels
            this.taggedLoggers.clear();
        }
    }

    /**
     * Get current log level
     */
    public getLogLevel(): LogLevel {
        return this.config.level;
    }

    /**
     * Check if level is enabled
     */
    public isLevelEnabled(level: LogLevel): boolean {
        return this.logger.isLevelEnabled(level);
    }

    /**
     * Flush all logs
     */
    public flush(): void {
        this.logger.flush();
    }

    /**
     * Create a performance logger for measuring execution time
     */
    public createPerformanceLogger(component: string, operation: string): PerformanceLogger {
        return new PerformanceLogger(this.getTaggedLogger(component, LOG_TAGS.PIPELINE), operation);
    }
}

/**
 * Performance logger for measuring execution time
 */
export class PerformanceLogger {
    private readonly logger: pino.Logger;
    private readonly operation: string;
    private readonly startTime: number;

    constructor(logger: pino.Logger, operation: string) {
        this.logger = logger;
        this.operation = operation;
        this.startTime = Date.now();

        this.logger.debug({ operation }, 'Operation started');
    }

    /**
     * Log completion with duration
     */
    public complete(data?: Record<string, unknown>): void {
        const duration = Date.now() - this.startTime;
        this.logger.info(
            {
                operation: this.operation,
                duration,
                ...data,
            },
            `Operation completed in ${duration}ms`,
        );
    }

    /**
     * Log error with duration
     */
    public error(error: Error, data?: Record<string, unknown>): void {
        const duration = Date.now() - this.startTime;
        this.logger.error(
            {
                operation: this.operation,
                duration,
                error: error.message,
                stack: error.stack,
                ...data,
            },
            `Operation failed after ${duration}ms`,
        );
    }

    /**
     * Log progress update
     */
    public progress(message: string, data?: Record<string, unknown>): void {
        const duration = Date.now() - this.startTime;
        this.logger.debug(
            {
                operation: this.operation,
                duration,
                ...data,
            },
            message,
        );
    }
}

/**
 * Create a default logger service instance
 */
export function createDefaultLoggerService(
    level: LogLevel = LOG_LEVELS.INFO,
    pretty: boolean = process.env.NODE_ENV !== 'production',
): LoggerService {
    return new LoggerService({
        level,
        pretty,
        timestamp: true,
        tags: {
            [LOG_TAGS.PIPELINE]: level,
            [LOG_TAGS.FILE_PROCESSING]: level,
            [LOG_TAGS.TEXT_EXTRACTION]: level,
            [LOG_TAGS.OCR]: level,
            [LOG_TAGS.CONFIG]: level,
            [LOG_TAGS.CLI]: level,
            [LOG_TAGS.ERROR]: LOG_LEVELS.ERROR,
        },
    });
}

/**
 * Helper function to format template strings with data
 */
export function formatLogMessage(template: string, data: Record<string, unknown>): string {
    return template.replace(/\{([^}]+)\}/g, (match, key) => String(data[key] || match));
}
