import { ERROR_CODES, LOG_COMPONENTS, MESSAGE_TEMPLATES } from '@/constants';
import type { LoggerService } from '@/services/LoggerService';
import { formatLogMessage } from '@/services/LoggerService';
import type {
    ChapterInfo,
    FileInfo,
    TextExtractionResult,
    TextMetadata,
    TextQuality,
} from '@/types';
import { AppError } from '@/utils/AppError';
import { EPub } from 'epub2';

/**
 * Handler for extracting text from EPUB files
 */
export class EPUBHandler {
    private readonly logger: LoggerService;

    constructor(logger: LoggerService) {
        this.logger = logger;
    }

    /**
     * Extract text from an EPUB file
     */
    public async extractText(fileInfo: FileInfo): Promise<TextExtractionResult> {
        const epubLogger = this.logger.getTextExtractionLogger(LOG_COMPONENTS.FILE_HANDLER);

        epubLogger.info(
            {
                filePath: fileInfo.path,
                fileSize: fileInfo.size,
            },
            formatLogMessage(MESSAGE_TEMPLATES.PROCESSING_START, {
                filename: fileInfo.name,
            }),
        );

        try {
            const epubData = await this.parseEPUB(fileInfo.path);
            const extractedText = await this.extractTextFromEPUB(epubData);

            const wordCount = this.countWords(extractedText);
            const characterCount = extractedText.length;
            const chapters = await this.extractChapters(epubData);

            // Assess text quality
            const quality = this.assessTextQuality(extractedText, chapters);

            // Create metadata
            const metadata: TextMetadata = {
                pageCount: chapters.length,
                wordCount,
                characterCount,
                encoding: 'utf-8',
                language: epubData.metadata.language || this.detectLanguage(extractedText),
                confidence: quality.confidence,
            };

            const result: TextExtractionResult = {
                text: extractedText,
                metadata,
                quality,
                source: 'embedded',
            };

            epubLogger.info(
                {
                    filePath: fileInfo.path,
                    chapters: chapters.length,
                    wordCount,
                    characterCount,
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
                `Failed to extract text from EPUB: ${fileInfo.path}`,
                {
                    filePath: fileInfo.path,
                    fileSize: fileInfo.size,
                },
                error instanceof Error ? error : new Error(String(error)),
            );
        }
    }

    /**
     * Get EPUB information
     */
    public async getEPUBInfo(fileInfo: FileInfo): Promise<{
        title?: string;
        author?: string;
        publisher?: string;
        language?: string;
        description?: string;
        publicationDate?: string;
        chapters: ChapterInfo[];
    }> {
        const epubLogger = this.logger.getTextExtractionLogger(LOG_COMPONENTS.FILE_HANDLER);

        try {
            const epubData = await this.parseEPUB(fileInfo.path);
            const chapters = await this.extractChapters(epubData);

            const info = {
                title: epubData.metadata.title ?? 'Unknown',
                author: epubData.metadata.creator ?? 'Unknown',
                publisher: epubData.metadata.publisher ?? 'Unknown',
                language: epubData.metadata.language ?? 'Unknown',
                description: epubData.metadata.description ?? 'Unknown',
                publicationDate: epubData.metadata.date ?? 'Unknown',
                chapters,
            };

            epubLogger.debug(
                {
                    filePath: fileInfo.path,
                    ...info,
                },
                'EPUB information extracted',
            );

            return info;
        } catch (error) {
            throw new AppError(
                ERROR_CODES.EXTRACTION_FAILED,
                LOG_COMPONENTS.FILE_HANDLER,
                'getEPUBInfo',
                `Failed to get EPUB information: ${fileInfo.path}`,
                { filePath: fileInfo.path },
                error instanceof Error ? error : new Error(String(error)),
            );
        }
    }

    /**
     * Parse EPUB file
     */
    private async parseEPUB(filePath: string): Promise<EPub> {
        return new Promise((resolve, reject) => {
            const epubData = new EPub(filePath);

            epubData.on('error', (error: Error) => {
                reject(error);
            });

            epubData.on('end', () => {
                resolve(epubData);
            });

            epubData.parse();
        });
    }

    /**
     * Extract text from EPUB data
     */
    private async extractTextFromEPUB(epubData: EPub): Promise<string> {
        const textParts: string[] = [];

        // Get text from each chapter
        for (const chapter of epubData.flow) {
            if (chapter.id) {
                const chapterText = await this.getChapterText(epubData, chapter.id);
                if (chapterText) {
                    textParts.push(chapterText);
                }
            }
        }

        return textParts.join('\n\n');
    }

    /**
     * Get text from a specific chapter
     */
    private async getChapterText(epubData: EPub, chapterId: string): Promise<string> {
        return new Promise((resolve, reject) => {
            epubData.getChapter(chapterId, (error: Error, text?: string) => {
                if (error) {
                    reject(error);
                } else {
                    // Remove HTML tags and clean up text
                    const cleanText = this.cleanHTMLText(text || '');
                    resolve(cleanText);
                }
            });
        });
    }

    /**
     * Clean HTML text
     */
    private cleanHTMLText(htmlText: string): string {
        // Remove HTML tags
        let cleanText = htmlText.replace(/<[^>]*>/g, '');

        // Decode HTML entities
        cleanText = cleanText
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&apos;/g, "'")
            .replace(/&nbsp;/g, ' ')
            .replace(/&#(\d+);/g, (_match, dec) => String.fromCharCode(dec))
            .replace(/&#x([a-fA-F0-9]+);/g, (_match, hex) =>
                String.fromCharCode(Number.parseInt(hex, 16)),
            );

        // Normalize whitespace
        cleanText = cleanText
            .replace(/\s+/g, ' ')
            .replace(/\n\s*\n/g, '\n\n')
            .trim();

        return cleanText;
    }

    /**
     * Extract chapters information
     */
    private async extractChapters(epubData: EPub): Promise<ChapterInfo[]> {
        const chapters: ChapterInfo[] = [];

        for (let i = 0; i < epubData.flow.length; i++) {
            const chapter = epubData.flow[i];

            if (chapter?.id) {
                try {
                    const chapterText = await this.getChapterText(epubData, chapter.id);
                    const wordCount = this.countWords(chapterText);

                    chapters.push({
                        number: i + 1,
                        title: chapter.title || `Chapter ${i + 1}`,
                        wordCount,
                        level: 1, // EPUB doesn't have hierarchical levels like PDF
                    });
                } catch (_error) {
                    // Skip chapters that can't be processed
                }
            }
        }

        return chapters;
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
    private assessTextQuality(text: string, chapters: ChapterInfo[]): TextQuality {
        const issues = [];
        let score = 100;
        let confidence = 1.0;

        // Check for empty or very short text
        if (text.trim().length < 100) {
            issues.push({
                type: 'missing_text' as const,
                description: 'Very little text extracted',
                severity: 'high' as const,
            });
            score -= 30;
            confidence -= 0.3;
        }

        // Check for HTML remnants
        if (text.includes('<') || text.includes('>')) {
            issues.push({
                type: 'formatting' as const,
                description: 'Text contains HTML remnants',
                severity: 'medium' as const,
            });
            score -= 15;
            confidence -= 0.15;
        }

        // Check for encoding issues
        if (text.includes('�') || text.includes('\uFFFD')) {
            issues.push({
                type: 'encoding' as const,
                description: 'Text contains replacement characters, possible encoding issues',
                severity: 'medium' as const,
            });
            score -= 20;
            confidence -= 0.2;
        }

        // Check chapter structure
        if (chapters.length === 0) {
            issues.push({
                type: 'formatting' as const,
                description: 'No chapters found',
                severity: 'medium' as const,
            });
            score -= 15;
            confidence -= 0.15;
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
        const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0).length;
        const words = this.countWords(text);
        const syllables = this.countSyllables(text);

        if (sentences === 0 || words === 0) {
            return 0;
        }

        // Simple Flesch Reading Ease approximation
        const avgWordsPerSentence = words / sentences;
        const avgSyllablesPerWord = syllables / words;

        const readabilityScore = 206.835 - 1.015 * avgWordsPerSentence - 84.6 * avgSyllablesPerWord;

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
        const germanWords = ['der', 'die', 'das', 'und', 'ist', 'ein', 'eine', 'von', 'zu', 'mit'];
        const germanMatches = germanWords.filter((word) => sample.includes(word)).length;

        // English indicators
        const englishWords = ['the', 'and', 'is', 'a', 'an', 'of', 'to', 'in', 'for', 'with'];
        const englishMatches = englishWords.filter((word) => sample.includes(word)).length;

        if (germanMatches > englishMatches) {
            return 'de';
        }
        if (englishMatches > germanMatches) {
            return 'en';
        }

        return 'auto';
    }
}
