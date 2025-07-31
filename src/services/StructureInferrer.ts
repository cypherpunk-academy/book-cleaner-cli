import { ERROR_CODES, LOG_COMPONENTS, STRUCTURE_INFERENCE_CONFIG } from '@/constants';
import type { BookManifestInfo } from '@/types';
import { AppError } from '@/utils/AppError';
import type { LoggerService } from './LoggerService';
import type { TextChunk } from './TextChunker';
import { DeepSeekService } from './DeepSeekService';

/**
 * Options for structure inference
 */
export interface InferenceOptions {
    maxRetries: number;
    confidenceThreshold: number;
    enableNewEntries: boolean;
    enableCorrections: boolean;
    temperature: number;
    maxTokens: number;
}

/**
 * Matched entry from AI analysis
 */
export interface MatchedEntry {
    originalIndex: number;
    correctedText: string;
    confidence: number;
    position: number;
}

/**
 * New entry discovered by AI
 */
export interface NewEntry {
    text: string;
    position: string; // e.g., "after index 5"
    confidence: number;
}

/**
 * Structure correction from AI
 */
export interface StructureCorrection {
    index: number;
    original: string;
    corrected: string;
    confidence: number;
}

/**
 * AI response for structure inference
 */
export interface StructureInferenceResponse {
    matchedEntries: MatchedEntry[];
    newEntries: NewEntry[];
    corrections: StructureCorrection[];
    confidence: number;
    processingTime: number;
}

/**
 * Service for AI-powered structure inference
 */
export class StructureInferrer {
    private readonly logger: LoggerService;
    private readonly deepSeekService: DeepSeekService;

    constructor(logger: LoggerService) {
        this.logger = logger;
        this.deepSeekService = new DeepSeekService(logger);
    }

    /**
     * Infer structure from a text chunk using AI
     */
    public async inferStructureFromChunk(
        chunk: TextChunk,
        bookStructure: BookManifestInfo['bookStructure'],
        options: Partial<InferenceOptions> = {},
    ): Promise<StructureInferenceResponse> {
        const startTime = Date.now();
        const logger = this.logger.getConfigLogger(LOG_COMPONENTS.CONFIG_SERVICE);

        // Use default options if not provided
        const inferenceOptions: InferenceOptions = {
            maxRetries: STRUCTURE_INFERENCE_CONFIG.DEFAULT_MAX_RETRIES,
            confidenceThreshold: STRUCTURE_INFERENCE_CONFIG.DEFAULT_CONFIDENCE_THRESHOLD,
            enableNewEntries: STRUCTURE_INFERENCE_CONFIG.DEFAULT_ENABLE_NEW_ENTRIES,
            enableCorrections: STRUCTURE_INFERENCE_CONFIG.DEFAULT_ENABLE_CORRECTIONS,
            temperature: 0.1, // Low temperature for consistent results
            maxTokens: 2000,
            ...options,
        };

        logger.info('Starting structure inference for chunk', {
            chunkIndex: chunk.index,
            chunkSize: chunk.characterCount,
            wordCount: chunk.wordCount,
            structureEntries: bookStructure?.length || 0,
        });

        try {
            // Generate prompt for AI
            const prompt = this.generatePrompt(chunk, bookStructure || []);

            // TODO: Implement actual DeepSeek Chat API call in Phase 3
            // For now, return a placeholder response
            const response = await this.callDeepSeekAPI(prompt, inferenceOptions);

            const processingTime = Date.now() - startTime;

            logger.info('Structure inference completed for chunk', {
                chunkIndex: chunk.index,
                matchedEntries: response.matchedEntries.length,
                newEntries: response.newEntries.length,
                corrections: response.corrections.length,
                confidence: response.confidence,
                processingTime,
            });

            return {
                ...response,
                processingTime,
            };
        } catch (error) {
            const processingTime = Date.now() - startTime;
            logger.error('Structure inference failed for chunk', {
                chunkIndex: chunk.index,
                error: error instanceof Error ? error.message : String(error),
                processingTime,
            });

            // Return empty response on failure
            return {
                matchedEntries: [],
                newEntries: [],
                corrections: [],
                confidence: 0.0,
                processingTime,
            };
        }
    }

    /**
     * Generate prompt for DeepSeek Chat API
     */
    private generatePrompt(chunk: TextChunk, bookStructure: string[]): string {
        const structureText = bookStructure
            .map((entry, index) => `${index}: "${entry}"`)
            .join('\n');

        return `You are analyzing a book structure to correct Table of Contents (TOC) and paragraph starts. Given the current book structure entries and a text chunk, your task is to:

1. Match text in the chunk to existing TOC and paragraph entries
2. Identify any missing entries that should be added
3. Correct any errors in existing entries
4. Return results in the exact format specified

Book Structure (TOC and Paragraphs):
${structureText}

Text Chunk (${chunk.index + 1}):
${chunk.content}

Instructions:
- Match entries in the order they appear in the book structure
- Focus on TOC entries (chapter titles, sections) and paragraph starts
- Handle slight variations in spelling, formatting, and line breaks
- If text is cut off at chunk boundaries, omit incomplete entries
- Add missing entries that are clearly identifiable
- Return corrected entries in the exact format from the book structure
- Provide confidence scores for each match

Return your response as JSON with the following structure:
{
  "matchedEntries": [
    {
      "originalIndex": 0,
      "correctedText": "exact text from book structure",
      "confidence": 0.95
    }
  ],
  "newEntries": [
    {
      "text": "new entry text",
      "position": "after index 5",
      "confidence": 0.8
    }
  ],
  "corrections": [
    {
      "index": 2,
      "original": "incorrect text",
      "corrected": "corrected text",
      "confidence": 0.9
    }
  ],
  "confidence": 0.85
}`;
    }

    /**
     * Call DeepSeek Chat API for structure inference
     */
    private async callDeepSeekAPI(
        prompt: string,
        options: InferenceOptions,
    ): Promise<StructureInferenceResponse> {
        const logger = this.logger.getConfigLogger(LOG_COMPONENTS.CONFIG_SERVICE);

        try {
            logger.debug('Calling DeepSeek Chat API for structure inference', {
                promptLength: prompt.length,
                options,
            });

            // Use the DeepSeekService to make the API call
            const responseText = await this.deepSeekService.sendStructureInferenceRequest(prompt, {
                temperature: options.temperature,
                maxTokens: options.maxTokens,
                retries: options.maxRetries,
            });

            // Parse the AI response
            const parsedResponse = this.parseAIResponse(responseText);

            logger.debug('DeepSeek Chat API response received', {
                matchedEntries: parsedResponse.matchedEntries.length,
                newEntries: parsedResponse.newEntries.length,
                corrections: parsedResponse.corrections.length,
                confidence: parsedResponse.confidence,
            });

            return parsedResponse;
        } catch (error) {
            logger.error('DeepSeek Chat API call failed', {
                error: error instanceof Error ? error.message : String(error),
                promptLength: prompt.length,
            });

            // Return empty response on failure
            return {
                matchedEntries: [],
                newEntries: [],
                corrections: [],
                confidence: 0.0,
                processingTime: 0,
            };
        }
    }

    /**
     * Parse AI response JSON
     */
    public parseAIResponse(responseText: string): StructureInferenceResponse {
        try {
            const parsed = JSON.parse(responseText) as StructureInferenceResponse;

            // Validate required fields
            if (!Array.isArray(parsed.matchedEntries)) {
                throw new Error('matchedEntries must be an array');
            }
            if (!Array.isArray(parsed.newEntries)) {
                throw new Error('newEntries must be an array');
            }
            if (!Array.isArray(parsed.corrections)) {
                throw new Error('corrections must be an array');
            }
            if (typeof parsed.confidence !== 'number') {
                throw new Error('confidence must be a number');
            }

            return parsed;
        } catch (error) {
            throw new AppError(
                ERROR_CODES.CONFIG_INVALID,
                LOG_COMPONENTS.CONFIG_SERVICE,
                'parseAIResponse',
                'Failed to parse AI response',
                { responseText: responseText.substring(0, 200) },
                error instanceof Error ? error : new Error(String(error)),
            );
        }
    }

    /**
     * Validate inference options
     */
    public validateOptions(options: InferenceOptions): {
        isValid: boolean;
        errors: string[];
    } {
        const errors: string[] = [];

        if (options.maxRetries < 0 || options.maxRetries > 10) {
            errors.push('Max retries must be between 0 and 10');
        }

        if (options.confidenceThreshold < 0 || options.confidenceThreshold > 1) {
            errors.push('Confidence threshold must be between 0 and 1');
        }

        if (options.temperature < 0 || options.temperature > 2) {
            errors.push('Temperature must be between 0 and 2');
        }

        if (options.maxTokens < 100 || options.maxTokens > 8000) {
            errors.push('Max tokens must be between 100 and 8000');
        }

        return {
            isValid: errors.length === 0,
            errors,
        };
    }

    /**
     * Merge multiple chunk responses into a single result
     */
    public mergeChunkResponses(
        responses: StructureInferenceResponse[],
    ): StructureInferenceResponse {
        const merged: StructureInferenceResponse = {
            matchedEntries: [],
            newEntries: [],
            corrections: [],
            confidence: 0,
            processingTime: 0,
        };

        let totalConfidence = 0;
        let totalProcessingTime = 0;

        for (const response of responses) {
            // Merge matched entries (avoid duplicates)
            for (const entry of response.matchedEntries) {
                const existingIndex = merged.matchedEntries.findIndex(
                    (e) => e.originalIndex === entry.originalIndex,
                );
                if (existingIndex === -1) {
                    merged.matchedEntries.push(entry);
                } else if (
                    entry.confidence > (merged.matchedEntries[existingIndex]?.confidence ?? 0)
                ) {
                    merged.matchedEntries[existingIndex] = entry;
                }
            }

            // Merge new entries
            merged.newEntries.push(...response.newEntries);

            // Merge corrections (avoid duplicates)
            for (const correction of response.corrections) {
                const existingIndex = merged.corrections.findIndex(
                    (c) => c.index === correction.index,
                );
                if (existingIndex === -1) {
                    merged.corrections.push(correction);
                } else if (
                    correction.confidence > (merged.corrections[existingIndex]?.confidence ?? 0)
                ) {
                    merged.corrections[existingIndex] = correction;
                }
            }

            totalConfidence += response.confidence;
            totalProcessingTime += response.processingTime;
        }

        // Calculate average confidence
        merged.confidence = responses.length > 0 ? totalConfidence / responses.length : 0;
        merged.processingTime = totalProcessingTime;

        return merged;
    }
}
