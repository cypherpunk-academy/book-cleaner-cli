import { LOG_COMPONENTS, STRUCTURE_INFERENCE_CONFIG } from '@/constants';
import type { LoggerService } from './LoggerService';

/**
 * Information about a text chunk
 */
export interface TextChunk {
    index: number;
    startPosition: number;
    endPosition: number;
    content: string;
    overlapWithPrevious: number;
    overlapWithNext: number;
    wordCount: number;
    characterCount: number;
}

/**
 * Options for text chunking
 */
export interface TextChunkingOptions {
    chunkSize: number;
    overlapPercentage: number;
    preserveWordBoundaries: boolean;
    maxChunks?: number;
}

/**
 * Result of text chunking operation
 */
export interface TextChunkingResult {
    chunks: TextChunk[];
    totalChunks: number;
    averageChunkSize: number;
    totalOverlap: number;
    processingTime: number;
}

/**
 * Service for dividing text into overlapping chunks for AI processing
 */
export class TextChunker {
    private readonly logger: LoggerService;

    constructor(logger: LoggerService) {
        this.logger = logger;
    }

    /**
     * Divide text into overlapping chunks
     */
    public chunkText(text: string, options: Partial<TextChunkingOptions> = {}): TextChunkingResult {
        const startTime = Date.now();
        const logger = this.logger.getConfigLogger(LOG_COMPONENTS.CONFIG_SERVICE);

        // Use default options if not provided
        const chunkingOptions: TextChunkingOptions = {
            chunkSize: STRUCTURE_INFERENCE_CONFIG.DEFAULT_CHUNK_SIZE,
            overlapPercentage: STRUCTURE_INFERENCE_CONFIG.DEFAULT_OVERLAP_PERCENTAGE,
            preserveWordBoundaries: true,
            maxChunks: undefined,
            ...options,
        };

        logger.info('Starting text chunking', {
            textLength: text.length,
            chunkSize: chunkingOptions.chunkSize,
            overlapPercentage: chunkingOptions.overlapPercentage,
        });

        const chunks: TextChunk[] = [];
        const overlapSize = Math.floor(
            (chunkingOptions.chunkSize * chunkingOptions.overlapPercentage) / 100,
        );

        let currentPosition = 0;
        let chunkIndex = 0;

        while (currentPosition < text.length) {
            // Check if we've reached the maximum number of chunks
            if (chunkingOptions.maxChunks && chunkIndex >= chunkingOptions.maxChunks) {
                logger.info('Reached maximum chunk limit', {
                    maxChunks: chunkingOptions.maxChunks,
                    totalChunks: chunkIndex,
                });
                break;
            }

            // Calculate chunk boundaries
            const chunkStart = currentPosition;
            let chunkEnd = Math.min(chunkStart + chunkingOptions.chunkSize, text.length);

            // Preserve word boundaries if requested
            if (chunkingOptions.preserveWordBoundaries && chunkEnd < text.length) {
                chunkEnd = this.findWordBoundary(text, chunkEnd);
            }

            // Extract chunk content
            const chunkContent = text.substring(chunkStart, chunkEnd);

            // Calculate overlap information
            const overlapWithPrevious = chunkIndex > 0 ? overlapSize : 0;
            const overlapWithNext = chunkEnd < text.length ? overlapSize : 0;

            // Create chunk object
            const chunk: TextChunk = {
                index: chunkIndex,
                startPosition: chunkStart,
                endPosition: chunkEnd,
                content: chunkContent,
                overlapWithPrevious,
                overlapWithNext,
                wordCount: this.countWords(chunkContent),
                characterCount: chunkContent.length,
            };

            chunks.push(chunk);

            // Move to next chunk position (accounting for overlap)
            const nextPosition = chunkEnd - overlapSize;
            if (nextPosition <= currentPosition) {
                // Prevent infinite loop - move forward at least one character
                currentPosition = chunkEnd;
            } else {
                currentPosition = nextPosition;
            }

            chunkIndex++;
        }

        const processingTime = Date.now() - startTime;
        const totalOverlap = chunks.reduce(
            (sum, chunk) => sum + chunk.overlapWithPrevious + chunk.overlapWithNext,
            0,
        );
        const averageChunkSize =
            chunks.length > 0
                ? chunks.reduce((sum, chunk) => sum + chunk.characterCount, 0) / chunks.length
                : 0;

        const result: TextChunkingResult = {
            chunks,
            totalChunks: chunks.length,
            averageChunkSize: Math.round(averageChunkSize),
            totalOverlap,
            processingTime,
        };

        logger.info('Text chunking completed', {
            totalChunks: result.totalChunks,
            averageChunkSize: result.averageChunkSize,
            totalOverlap: result.totalOverlap,
            processingTime: result.processingTime,
        });

        return result;
    }

    /**
     * Find the nearest word boundary before the given position
     */
    private findWordBoundary(text: string, position: number): number {
        // Look backwards from the position to find a word boundary
        for (let i = position; i > Math.max(0, position - 100); i--) {
            const char = text[i];
            if (this.isWordBoundary(char)) {
                return i;
            }
        }

        // If no word boundary found, return the original position
        return position;
    }

    /**
     * Check if a character represents a word boundary
     */
    private isWordBoundary(char: string): boolean {
        return /[\s\n\r\t.,;:!?()[\]{}"'`~@#$%^&*+=|\\/<>]/.test(char);
    }

    /**
     * Count words in a text chunk
     */
    private countWords(text: string): number {
        // Remove extra whitespace and split by word boundaries
        const words = text.trim().split(/\s+/);
        return words.filter((word) => word.length > 0).length;
    }

    /**
     * Get chunk statistics for analysis
     */
    public getChunkStatistics(chunks: TextChunk[]): {
        totalWords: number;
        totalCharacters: number;
        averageWordsPerChunk: number;
        averageCharactersPerChunk: number;
        overlapPercentage: number;
    } {
        if (chunks.length === 0) {
            return {
                totalWords: 0,
                totalCharacters: 0,
                averageWordsPerChunk: 0,
                averageCharactersPerChunk: 0,
                overlapPercentage: 0,
            };
        }

        const totalWords = chunks.reduce((sum, chunk) => sum + chunk.wordCount, 0);
        const totalCharacters = chunks.reduce((sum, chunk) => sum + chunk.characterCount, 0);
        const totalOverlap = chunks.reduce(
            (sum, chunk) => sum + chunk.overlapWithPrevious + chunk.overlapWithNext,
            0,
        );

        return {
            totalWords,
            totalCharacters,
            averageWordsPerChunk: Math.round(totalWords / chunks.length),
            averageCharactersPerChunk: Math.round(totalCharacters / chunks.length),
            overlapPercentage: Math.round((totalOverlap / totalCharacters) * 100),
        };
    }

    /**
     * Validate chunking options
     */
    public validateOptions(options: TextChunkingOptions): {
        isValid: boolean;
        errors: string[];
    } {
        const errors: string[] = [];

        if (options.chunkSize <= 0) {
            errors.push('Chunk size must be greater than 0');
        }

        if (options.chunkSize > 100000) {
            errors.push('Chunk size cannot exceed 100,000 characters');
        }

        if (options.overlapPercentage < 0 || options.overlapPercentage > 50) {
            errors.push('Overlap percentage must be between 0 and 50');
        }

        if (options.maxChunks !== undefined && options.maxChunks <= 0) {
            errors.push('Max chunks must be greater than 0');
        }

        return {
            isValid: errors.length === 0,
            errors,
        };
    }
}
