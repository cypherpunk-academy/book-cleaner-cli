import { ERROR_CODES, LOG_COMPONENTS, STRUCTURE_INFERENCE_CONFIG } from '@/constants';
import type { BookManifestInfo, FilenameMetadata } from '@/types';
import { AppError } from '@/utils/AppError';
import type { LoggerService } from '@/services/LoggerService';
import type { TextChunk } from '@/services/TextChunker';
import { BookStructureService, type StructureInferenceOptions, type StructureInferenceResult } from '@/services/BookStructureService/BookStructureService';
import { StructureInferrer, type StructureInferenceResponse } from '@/services/BookStructureService/StructureInferrer';
import { StructureValidator } from './StructureValidator';

/**
 * Main orchestrator for book structure inference
 */
export class BookStructureAnalyzer {
    private readonly logger: LoggerService;
    private readonly bookStructureService: BookStructureService;
    private readonly structureInferrer: StructureInferrer;
    private readonly structureValidator: StructureValidator;

    constructor(logger: LoggerService) {
        this.logger = logger;
        this.bookStructureService = new BookStructureService(logger);
        this.structureInferrer = new StructureInferrer(logger);
        this.structureValidator = new StructureValidator(logger);
    }

    /**
     * Main method to infer and correct book structure
     */
    public async inferBookStructure(
        metadata: FilenameMetadata,
        textSource: string,
        options: Partial<StructureInferenceOptions> = {},
    ): Promise<StructureInferenceResult> {
        const startTime = Date.now();
        const logger = this.logger.getConfigLogger(LOG_COMPONENTS.CONFIG_SERVICE);

        logger.info('Starting book structure inference', {
            author: metadata.author,
            title: metadata.title,
            textLength: textSource.length,
        });

        try {
            // Load existing book structure
            const manifest = await this.bookStructureService.loadBookManifest(metadata);
            const originalStructure = manifest.bookStructure || [];

            logger.info('Loaded existing book structure', {
                entryCount: originalStructure.length,
            });

            // Validate existing structure
            const validationResult = this.structureValidator.validateStructure(originalStructure);
            if (!validationResult.isValid) {
                logger.warn('Existing structure has validation issues', {
                    errors: validationResult.errors,
                });
            }

            // Use default options if not provided
            const inferenceOptions: StructureInferenceOptions = {
                chunkSize: STRUCTURE_INFERENCE_CONFIG.DEFAULT_CHUNK_SIZE,
                overlapPercentage: STRUCTURE_INFERENCE_CONFIG.DEFAULT_OVERLAP_PERCENTAGE,
                maxRetries: STRUCTURE_INFERENCE_CONFIG.DEFAULT_MAX_RETRIES,
                confidenceThreshold: STRUCTURE_INFERENCE_CONFIG.DEFAULT_CONFIDENCE_THRESHOLD,
                enableNewEntries: STRUCTURE_INFERENCE_CONFIG.DEFAULT_ENABLE_NEW_ENTRIES,
                enableCorrections: STRUCTURE_INFERENCE_CONFIG.DEFAULT_ENABLE_CORRECTIONS,
                ...options,
            };

            // Process text in chunks
            const chunkResponses = await this.processTextChunks(
                textSource,
                originalStructure,
                inferenceOptions,
            );

            // Merge chunk responses
            const mergedResponse = this.structureInferrer.mergeChunkResponses(chunkResponses);

            // Apply corrections to structure
            const correctedStructure = this.bookStructureService['applyStructureCorrections'](
                originalStructure,
                mergedResponse,
                inferenceOptions,
            );

            // Validate corrected structure
            const finalValidation = this.structureValidator.validateStructure(correctedStructure);

            const processingTime = Date.now() - startTime;

            logger.info('Book structure inference completed', {
                originalEntries: originalStructure.length,
                correctedEntries: correctedStructure.length,
                matchedEntries: mergedResponse.matchedEntries.length,
                newEntries: mergedResponse.newEntries.length,
                corrections: mergedResponse.corrections.length,
                confidence: mergedResponse.confidence,
                processingTime,
                validationErrors: finalValidation.errors.length,
            });

            // Save updated structure
            await this.bookStructureService.updateBookManifest(metadata, {
                bookStructure: correctedStructure,
            });

            return {
                success: true,
                originalStructure,
                correctedStructure,
                newEntries: mergedResponse.newEntries.map(entry => entry.text),
                corrections: mergedResponse.corrections.map(correction => ({
                    index: correction.index,
                    original: correction.original,
                    corrected: correction.corrected,
                })),
                confidence: mergedResponse.confidence,
                processingTime,
                errors: finalValidation.errors,
            };
        } catch (error) {
            const processingTime = Date.now() - startTime;
            logger.error('Book structure inference failed', {
                error: error instanceof Error ? error.message : String(error),
                processingTime,
            });

            throw new AppError(
                ERROR_CODES.CONFIG_INVALID,
                LOG_COMPONENTS.CONFIG_SERVICE,
                'inferBookStructure',
                'Failed to infer book structure',
                { metadata, textLength: textSource.length },
                error instanceof Error ? error : new Error(String(error)),
            );
        }
    }

    /**
     * Process text in chunks and analyze each chunk
     */
    private async processTextChunks(
        textSource: string,
        bookStructure: BookManifestInfo['bookStructure'],
        options: StructureInferenceOptions,
    ): Promise<StructureInferenceResponse[]> {
        const logger = this.logger.getConfigLogger(LOG_COMPONENTS.CONFIG_SERVICE);

        // Create text chunks
        const chunkingResult = this.bookStructureService.textChunker.chunkText(textSource, {
            chunkSize: options.chunkSize,
            overlapPercentage: options.overlapPercentage,
        });
        const chunks = chunkingResult.chunks;

        logger.info('Created text chunks for analysis', {
            totalChunks: chunks.length,
            chunkSize: options.chunkSize,
            overlapPercentage: options.overlapPercentage,
        });

        const responses: StructureInferenceResponse[] = [];

        // Process chunks sequentially to avoid overwhelming the API
        for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];
            logger.debug('Processing chunk', {
                chunkIndex: i + 1,
                totalChunks: chunks.length,
                chunkSize: chunk.characterCount,
            });

            try {
                const response = await this.structureInferrer.inferStructureFromChunk(
                    chunk,
                    bookStructure,
                    {
                        maxRetries: options.maxRetries,
                        confidenceThreshold: options.confidenceThreshold,
                        enableNewEntries: options.enableNewEntries,
                        enableCorrections: options.enableCorrections,
                        temperature: 0.1,
                        maxTokens: 2000,
                    },
                );

                responses.push(response);

                logger.debug('Chunk analysis completed', {
                    chunkIndex: i + 1,
                    matchedEntries: response.matchedEntries.length,
                    newEntries: response.newEntries.length,
                    corrections: response.corrections.length,
                    confidence: response.confidence,
                });
            } catch (error) {
                logger.error('Chunk analysis failed', {
                    chunkIndex: i + 1,
                    error: error instanceof Error ? error.message : String(error),
                });

                // Add empty response for failed chunk
                responses.push({
                    matchedEntries: [],
                    newEntries: [],
                    corrections: [],
                    confidence: 0.0,
                    processingTime: 0,
                });
            }
        }

        return responses;
    }

    /**
     * Get progress information for the current inference process
     */
    public getProgressInfo(): {
        totalChunks: number;
        processedChunks: number;
        currentChunk: number;
        estimatedTimeRemaining: number;
    } {
        // This would be implemented with actual progress tracking
        // For now, return placeholder information
        return {
            totalChunks: 0,
            processedChunks: 0,
            currentChunk: 0,
            estimatedTimeRemaining: 0,
        };
    }
} 