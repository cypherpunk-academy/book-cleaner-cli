import { promises as fs } from 'node:fs';
import { ERROR_CODES, LOG_COMPONENTS, MESSAGE_TEMPLATES } from '@/constants';
import type { LoggerService } from '@/services/LoggerService';
import { formatLogMessage } from '@/services/LoggerService';
import type {
    FileInfo,
    TextExtractionResult,
    TextMetadata,
    TextQuality,
} from '@/types';
import { AppError } from '@/utils/AppError';

/**
 * Handler for extracting text from plain text files
 */
export class TextHandler {
    private readonly logger: LoggerService;

    constructor(logger: LoggerService) {
        this.logger = logger;
    }

    /**
     * Extract text from a plain text file
     */
    public async extractText(fileInfo: FileInfo): Promise<TextExtractionResult> {
        const textLogger = this.logger.getTextExtractionLogger(
            LOG_COMPONENTS.FILE_HANDLER,
        );

        textLogger.info(
            {
                filePath: fileInfo.path,
                fileSize: fileInfo.size,
            },
            formatLogMessage(MESSAGE_TEMPLATES.PROCESSING_START, {
                filename: fileInfo.name,
            }),
        );

        try {
            // Detect encoding and read file
            const encoding = await this.detectEncoding(fileInfo.path);
            const rawText = await fs.readFile(fileInfo.path, encoding);

            // Process and clean text
            const processedText = this.processText(rawText);

            const wordCount = this.countWords(processedText);
            const characterCount = processedText.length;
            const lineCount = processedText.split('\n').length;

            // Assess text quality
            const quality = this.assessTextQuality(processedText, encoding);

            // Create metadata
            const metadata: TextMetadata = {
                pageCount: lineCount,
                wordCount,
                characterCount,
                encoding,
                language: this.detectLanguage(processedText),
                confidence: quality.confidence,
            };

            const result: TextExtractionResult = {
                text: processedText,
                metadata,
                quality,
                source: 'embedded',
            };

            textLogger.info(
                {
                    filePath: fileInfo.path,
                    encoding,
                    wordCount,
                    characterCount,
                    lineCount,
                    qualityScore: quality.score,
                    confidence: quality.confidence,
                },
                formatLogMessage(MESSAGE_TEMPLATES.TEXT_EXTRACTED, {
                    words: wordCount,
                    characters: characterCount,
                }),
            );

            return result;
        } catch (error) {
            throw new AppError(
                ERROR_CODES.EXTRACTION_FAILED,
                LOG_COMPONENTS.FILE_HANDLER,
                'extractText',
                `Failed to extract text from file: ${fileInfo.path}`,
                {
                    filePath: fileInfo.path,
                    fileSize: fileInfo.size,
                },
                error instanceof Error ? error : new Error(String(error)),
            );
        }
    }

    /**
     * Get text file information
     */
    public async getTextInfo(fileInfo: FileInfo): Promise<{
        encoding: string;
        lineCount: number;
        wordCount: number;
        characterCount: number;
        hasControlCharacters: boolean;
        detectedLanguage: string;
    }> {
        const textLogger = this.logger.getTextExtractionLogger(
            LOG_COMPONENTS.FILE_HANDLER,
        );

        try {
            const encoding = await this.detectEncoding(fileInfo.path);
            const rawText = await fs.readFile(fileInfo.path, encoding);
            const processedText = this.processText(rawText);

            const info = {
                encoding,
                lineCount: processedText.split('\n').length,
                wordCount: this.countWords(processedText),
                characterCount: processedText.length,
                hasControlCharacters: this.hasControlCharacters(rawText),
                detectedLanguage: this.detectLanguage(processedText),
            };

            textLogger.debug(
                {
                    filePath: fileInfo.path,
                    ...info,
                },
                'Text file information extracted',
            );

            return info;
        } catch (error) {
            throw new AppError(
                ERROR_CODES.EXTRACTION_FAILED,
                LOG_COMPONENTS.FILE_HANDLER,
                'getTextInfo',
                `Failed to get text file information: ${fileInfo.path}`,
                { filePath: fileInfo.path },
                error instanceof Error ? error : new Error(String(error)),
            );
        }
    }

    /**
     * Detect file encoding
     */
    private async detectEncoding(filePath: string): Promise<BufferEncoding> {
        try {
            // Read first few bytes to detect encoding
            const buffer = await fs.readFile(filePath);
            const firstBytes = buffer.slice(0, 4);

            // Check for BOM (Byte Order Mark)
            if (
                firstBytes[0] === 0xef &&
                firstBytes[1] === 0xbb &&
                firstBytes[2] === 0xbf
            ) {
                return 'utf8'; // UTF-8 BOM
            }

            if (firstBytes[0] === 0xff && firstBytes[1] === 0xfe) {
                return 'utf16le'; // UTF-16 LE BOM
            }

            if (firstBytes[0] === 0xfe && firstBytes[1] === 0xff) {
                return 'utf8'; // UTF-16 BE BOM (not supported by Node.js, fallback to utf8)
            }

            // Try to decode as UTF-8 first
            try {
                const testText = buffer.toString('utf8');

                // Check for replacement characters (indicates encoding issues)
                if (!testText.includes('\uFFFD')) {
                    return 'utf8';
                }
            } catch {
                // UTF-8 decoding failed
            }

            // Try latin1 as fallback
            try {
                buffer.toString('latin1');
                return 'latin1';
            } catch {
                // Latin1 decoding failed
            }

            // Default to UTF-8
            return 'utf8';
        } catch (_error) {
            // If detection fails, default to UTF-8
            return 'utf8';
        }
    }

    /**
     * Process and clean text
     */
    private processText(text: string): string {
        // Normalize line endings
        let processedText = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

        // Remove control characters except tabs and newlines
        processedText = this.removeControlCharacters(processedText);

        // Normalize Unicode
        processedText = processedText.normalize('NFC');

        // Convert non-breaking spaces to regular spaces
        processedText = processedText.replace(/\u00A0/g, ' ');

        // Fix common encoding issues
        processedText = this.fixCommonEncodingIssues(processedText);

        // Trim excessive whitespace but preserve structure
        processedText = processedText.replace(/[ \t]+/g, ' '); // Multiple spaces/tabs to single space
        processedText = processedText.replace(/\n{3,}/g, '\n\n'); // Multiple newlines to double newline

        return processedText.trim();
    }

    /**
     * Fix common encoding issues
     */
    private fixCommonEncodingIssues(text: string): string {
        // Common Windows-1252 to UTF-8 fixes
        const fixes: Array<[RegExp, string]> = [
            [/â€™/g, "'"], // Right single quotation mark
            [/â€œ/g, '"'], // Left double quotation mark
            [/â€/g, '"'], // Right double quotation mark
            [/â€"/g, '—'], // Em dash
            [/â€"/g, '–'], // En dash
            [/â€¦/g, '…'], // Horizontal ellipsis
            [/Ã¤/g, 'ä'], // a with diaeresis
            [/Ã¶/g, 'ö'], // o with diaeresis
            [/Ã¼/g, 'ü'], // u with diaeresis
            [/ÃŸ/g, 'ß'], // sharp s
            [/Ã„/g, 'Ä'], // A with diaeresis
            [/Ã–/g, 'Ö'], // O with diaeresis
            [/Ãœ/g, 'Ü'], // U with diaeresis
        ];

        let fixedText = text;
        for (const [pattern, replacement] of fixes) {
            fixedText = fixedText.replace(pattern, replacement);
        }

        return fixedText;
    }

    /**
     * Check if text contains control characters
     */
    private hasControlCharacters(text: string): boolean {
        return this.removeControlCharacters(text) !== text;
    }

    private removeControlCharacters(text: string): string {
        let result = '';
        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            if (char) {
                const code = char.charCodeAt(0);

                // Keep tabs (0x09), newlines (0x0A), and carriage returns (0x0D)
                // Remove other control characters (0x00-0x1F, 0x7F)
                if (code >= 0x20 || code === 0x09 || code === 0x0a || code === 0x0d) {
                    result += char;
                }
            }
        }
        return result;
    }

    /**
     * Count words in text
     */
    private countWords(text: string): number {
        return text
            .trim()
            .split(/\s+/)
            .filter((word) => word.length > 0).length;
    }

    /**
     * Assess text quality
     */
    private assessTextQuality(text: string, encoding: string): TextQuality {
        const issues = [];
        let score = 100;
        let confidence = 1.0;

        // Check for empty or very short text
        if (text.trim().length < 100) {
            issues.push({
                type: 'missing_text' as const,
                description: 'Very little text content',
                severity: 'high' as const,
            });
            score -= 30;
            confidence -= 0.3;
        }

        // Check for encoding issues
        if (text.includes('�') || text.includes('\uFFFD')) {
            issues.push({
                type: 'encoding' as const,
                description:
                    'Text contains replacement characters, possible encoding issues',
                severity: 'medium' as const,
            });
            score -= 20;
            confidence -= 0.2;
        }

        // Check for suspicious encoding patterns
        if (text.includes('â€') || text.includes('Ã') || text.includes('Ã¤')) {
            issues.push({
                type: 'encoding' as const,
                description: 'Text contains suspicious encoding patterns',
                severity: 'medium' as const,
            });
            score -= 15;
            confidence -= 0.15;
        }

        // Check for excessive control characters
        if (this.hasControlCharacters(text)) {
            issues.push({
                type: 'corruption' as const,
                description: 'Text contains control characters',
                severity: 'low' as const,
            });
            score -= 10;
            confidence -= 0.1;
        }

        // Check for proper text structure
        const hasProperSentences = /[.!?]\s+[A-Z]/.test(text);
        if (!hasProperSentences && text.length > 500) {
            issues.push({
                type: 'formatting' as const,
                description: 'Text lacks proper sentence structure',
                severity: 'low' as const,
            });
            score -= 10;
            confidence -= 0.1;
        }

        // Bonus for UTF-8 encoding
        if (encoding === 'utf8') {
            score += 5;
            confidence += 0.05;
        }

        return {
            score: Math.max(0, Math.min(100, score)),
            confidence: Math.max(0, Math.min(1, confidence)),
            issues,
            readability: this.calculateReadability(text),
        };
    }

    /**
     * Calculate basic readability score
     */
    private calculateReadability(text: string): number {
        const sentences = text
            .split(/[.!?]+/)
            .filter((s) => s.trim().length > 0).length;
        const words = this.countWords(text);
        const syllables = this.countSyllables(text);

        if (sentences === 0 || words === 0) {
            return 0;
        }

        // Simple Flesch Reading Ease approximation
        const avgWordsPerSentence = words / sentences;
        const avgSyllablesPerWord = syllables / words;

        const readabilityScore =
            206.835 - 1.015 * avgWordsPerSentence - 84.6 * avgSyllablesPerWord;

        return Math.max(0, Math.min(100, readabilityScore));
    }

    /**
     * Count syllables in text (approximation)
     */
    private countSyllables(text: string): number {
        const words = text.toLowerCase().match(/\b\w+\b/g) || [];

        return words.reduce((total, word) => {
            // Simple syllable counting heuristic
            const vowels = word.match(/[aeiouäöüy]+/g) || [];
            let syllables = vowels.length;

            // Adjust for common patterns
            if (word.endsWith('e') && syllables > 1) {
                syllables--;
            }

            return total + Math.max(1, syllables);
        }, 0);
    }

    /**
     * Detect language (basic heuristic)
     */
    private detectLanguage(text: string): string {
        const sample = text.slice(0, 1000).toLowerCase();

        // German indicators
        const germanWords = [
            'der',
            'die',
            'das',
            'und',
            'ist',
            'ein',
            'eine',
            'von',
            'zu',
            'mit',
        ];
        const germanMatches = germanWords.filter((word) =>
            sample.includes(word),
        ).length;

        // English indicators
        const englishWords = [
            'the',
            'and',
            'is',
            'a',
            'an',
            'of',
            'to',
            'in',
            'for',
            'with',
        ];
        const englishMatches = englishWords.filter((word) =>
            sample.includes(word),
        ).length;

        if (germanMatches > englishMatches) {
            return 'de';
        }
        if (englishMatches > germanMatches) {
            return 'en';
        }

        return 'auto';
    }
}

// Define BufferEncoding type for Node.js buffer operations
type BufferEncoding =
    | 'ascii'
    | 'utf8'
    | 'utf-8'
    | 'utf16le'
    | 'ucs2'
    | 'ucs-2'
    | 'base64'
    | 'base64url'
    | 'latin1'
    | 'binary'
    | 'hex';
