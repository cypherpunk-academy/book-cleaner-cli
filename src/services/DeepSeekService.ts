import { ENV_VARS, ERROR_CODES, LOG_COMPONENTS, RETRY_CONFIG } from '@/constants';
import { AppError } from '@/utils/AppError';
import type { LoggerService } from './LoggerService';

/**
 * DeepSeek Chat API request
 */
export interface DeepSeekChatRequest {
    messages: Array<{
        role: 'system' | 'user' | 'assistant';
        content: string;
    }>;
    model: string;
    temperature?: number;
    max_tokens?: number;
    stream?: boolean;
}

/**
 * DeepSeek Chat API response
 */
export interface DeepSeekChatResponse {
    id: string;
    object: string;
    created: number;
    model: string;
    choices: Array<{
        index: number;
        message: {
            role: string;
            content: string;
        };
        finish_reason: string;
    }>;
    usage: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
}

/**
 * DeepSeek service configuration
 */
export interface DeepSeekConfig {
    apiKey: string;
    apiUri: string;
    model: string;
    maxRetries: number;
    timeout: number;
}

/**
 * Service for DeepSeek Chat API integration
 */
export class DeepSeekService {
    private readonly logger: LoggerService;
    private readonly config: DeepSeekConfig;

    constructor(logger: LoggerService) {
        this.logger = logger;
        this.config = this.loadConfig();
    }

    /**
     * Load configuration from environment variables
     */
    private loadConfig(): DeepSeekConfig {
        const apiKey = process.env[ENV_VARS.DEEPSEEK_REST_API_KEY];
        const apiUri = process.env[ENV_VARS.DEEPSEEK_REST_API_URI];

        if (!apiKey) {
            throw new AppError(
                ERROR_CODES.CONFIG_INVALID,
                LOG_COMPONENTS.CONFIG_SERVICE,
                'loadConfig',
                'DEEPSEEK_REST_API_KEY environment variable is required',
                {},
            );
        }

        if (!apiUri) {
            throw new AppError(
                ERROR_CODES.CONFIG_INVALID,
                LOG_COMPONENTS.CONFIG_SERVICE,
                'loadConfig',
                'DEEPSEEK_REST_API_URI environment variable is required',
                {},
            );
        }

        return {
            apiKey,
            apiUri,
            model: 'deepseek-chat',
            maxRetries: RETRY_CONFIG.MAX_RETRIES,
            timeout: 30000, // 30 seconds
        };
    }

    /**
     * Send a chat request to DeepSeek API
     */
    public async sendChatRequest(
        request: DeepSeekChatRequest,
        options: {
            retries?: number;
            timeout?: number;
        } = {},
    ): Promise<DeepSeekChatResponse> {
        const logger = this.logger.getConfigLogger(LOG_COMPONENTS.CONFIG_SERVICE);
        const retries = options.retries ?? this.config.maxRetries;
        const timeout = options.timeout ?? this.config.timeout;

        logger.debug('Sending DeepSeek Chat request', {
            model: request.model,
            messageCount: request.messages.length,
            maxTokens: request.max_tokens,
            temperature: request.temperature,
        });

        // TODO: Implement actual API call in Phase 3
        // This is a placeholder that simulates the API response

        // Simulate API delay
        await new Promise((resolve) => setTimeout(resolve, 200));

        // Return placeholder response
        const response: DeepSeekChatResponse = {
            id: 'placeholder-response-id',
            object: 'chat.completion',
            created: Date.now(),
            model: request.model,
            choices: [
                {
                    index: 0,
                    message: {
                        role: 'assistant',
                        content:
                            '{"matchedEntries":[],"newEntries":[],"corrections":[],"confidence":1.0}',
                    },
                    finish_reason: 'stop',
                },
            ],
            usage: {
                prompt_tokens: 100,
                completion_tokens: 50,
                total_tokens: 150,
            },
        };

        logger.debug('Received DeepSeek Chat response', {
            responseId: response.id,
            finishReason: response.choices[0]?.finish_reason,
            usage: response.usage,
        });

        return response;
    }

    /**
     * Send a generic chat request with custom messages
     */
    public async sendCustomChatRequest(
        messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
        options: {
            temperature?: number;
            maxTokens?: number;
            retries?: number;
        } = {},
    ): Promise<string> {
        const request: DeepSeekChatRequest = {
            messages,
            model: this.config.model,
            temperature: options.temperature ?? 0.1,
            max_tokens: options.maxTokens ?? 2000,
            stream: false,
        };

        const response = await this.sendChatRequest(request, {
            retries: options.retries,
        });

        const content = response.choices[0]?.message?.content;
        if (!content) {
            throw new AppError(
                ERROR_CODES.API_ERROR,
                LOG_COMPONENTS.CONFIG_SERVICE,
                'sendCustomChatRequest',
                'Empty response from DeepSeek API',
                { responseId: response.id },
            );
        }

        return content;
    }

    /**
     * Send a structure inference request (specific to book structure analysis)
     */
    public async sendStructureInferenceRequest(
        prompt: string,
        options: {
            temperature?: number;
            maxTokens?: number;
            retries?: number;
        } = {},
    ): Promise<string> {
        const messages = [
            {
                role: 'system' as const,
                content:
                    'You are an expert at analyzing book structures and correcting Table of Contents and paragraph entries. Always respond with valid JSON.',
            },
            {
                role: 'user' as const,
                content: prompt,
            },
        ];

        return this.sendCustomChatRequest(messages, options);
    }

    /**
     * Validate API configuration
     */
    public validateConfig(): {
        isValid: boolean;
        errors: string[];
    } {
        const errors: string[] = [];

        if (!this.config.apiKey) {
            errors.push('API key is missing');
        }

        if (!this.config.apiUri) {
            errors.push('API URI is missing');
        }

        if (this.config.maxRetries < 0 || this.config.maxRetries > 10) {
            errors.push('Max retries must be between 0 and 10');
        }

        if (this.config.timeout < 1000 || this.config.timeout > 120000) {
            errors.push('Timeout must be between 1 and 120 seconds');
        }

        return {
            isValid: errors.length === 0,
            errors,
        };
    }

    /**
     * Test API connectivity
     */
    public async testConnection(): Promise<boolean> {
        try {
            const testRequest: DeepSeekChatRequest = {
                messages: [
                    {
                        role: 'user',
                        content: 'Hello',
                    },
                ],
                model: this.config.model,
                max_tokens: 10,
            };

            await this.sendChatRequest(testRequest, { retries: 1 });
            return true;
        } catch (error) {
            this.logger.error('DeepSeek API connection test failed', {
                error: error instanceof Error ? error.message : String(error),
            });
            return false;
        }
    }
}
