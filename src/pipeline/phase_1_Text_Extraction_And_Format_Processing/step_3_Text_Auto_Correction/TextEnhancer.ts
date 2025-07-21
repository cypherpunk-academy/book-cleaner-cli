import { readFileSync } from 'node:fs';
import { load as parseYaml } from 'js-yaml';
import {
    ERROR_CODES,
    LOG_COMPONENTS,
    MIN_PARAGRAPHS_FOR_ANALYSIS,
    PARAGRAPH_END_MARKERS,
    TEXT_QUALITY_ENHANCEMENT,
} from '../../../constants';
import { BookTypesService } from '../../../services/BookTypesService';
import { ConfigService } from '../../../services/ConfigService';
import type { LoggerService } from '../../../services/LoggerService';
import { AppError } from '../../../utils/AppError';
import type { QualityImprovement, QualityIssue, TextQualityAnalysisResult } from './TextComparator';

/**
 * Text enhancement result interface
 */
export interface TextEnhancementResult {
    enhancedText: string;
    improvementsMade: QualityImprovement[];
    issuesFixed: number;
    issuesRemaining: number;
    confidence: number;
    processingTime: number;
    enhancementSummary: {
        spellingCorrections: number;
        debrisRemoved: number;
        wordsReconstructed: number;
        charactersFixed: number;
    };
}

/**
 * Text enhancement options
 */
export interface TextEnhancementOptions {
    fixSpellingErrors?: boolean;
    removeOCRDebris?: boolean;
    reconstructBrokenWords?: boolean;
    cleanWeirdCharacters?: boolean;
    preserveFormatting?: boolean;
    aggressiveMode?: boolean;
    language?: string;
    manifestPath?: string;
}

/**
 * Text preprocessing result for manifest-based cleaning and paragraph normalization
 */
export interface TextPreprocessingResult {
    processedText: string;
    patternsRemoved: number;
    paragraphsFound: number;
    paragraphsNormalized: boolean;
    processingDetails: {
        removedPatterns: string[];
        paragraphAnalysis: {
            totalParagraphs: number;
            paragraphsWithEndMarkers: number;
            needsNormalization: boolean;
        };
        normalizationStats: {
            linesJoined: number;
            hyphensRemoved: number;
            paragraphsCreated: number;
        };
    };
}

/**
 * Text Enhancer for fixing OCR-related text quality issues
 *
 * This enhancer applies fixes based on quality analysis results:
 * - Removes OCR debris (weird characters, symbols)
 * - Corrects spelling mistakes using embedded text comparison
 * - Reconstructs broken words
 * - Cleans up formatting issues
 */
export class TextEnhancer {
    private readonly logger: LoggerService;
    private readonly bookTypesService: BookTypesService;

    constructor(logger: LoggerService, configService: ConfigService) {
        this.logger = logger;
        this.bookTypesService = new BookTypesService(logger, configService);
    }

    /**
     * Preprocess text with manifest-based pattern removal and paragraph normalization
     *
     * @param text - Input text to preprocess
     * @param manifestPath - Path to book manifest YAML file
     * @returns Preprocessing result with processed text and statistics
     */
    async preprocessText(text: string, manifestPath: string): Promise<TextPreprocessingResult> {
        const preprocessLogger = this.logger.getTextExtractionLogger(
            LOG_COMPONENTS.PIPELINE_MANAGER,
        );

        try {
            preprocessLogger.info(
                {
                    textLength: text.length,
                    manifestPath,
                },
                'Starting text preprocessing with manifest patterns and paragraph normalization',
            );

            // Step 1: Load and apply text-removal-patterns from manifest
            const { processedText: patternCleanedText, removedPatterns } =
                await this.applyManifestPatterns(text, manifestPath);

            // Step 2: Analyze paragraph structure
            const paragraphAnalysis = this.analyzeParagraphStructure(patternCleanedText);

            // Step 3: Normalize paragraphs if needed
            const { normalizedText, normalizationStats } = paragraphAnalysis.needsNormalization
                ? this.normalizeParagraphs(patternCleanedText)
                : {
                      normalizedText: patternCleanedText,
                      normalizationStats: {
                          linesJoined: 0,
                          hyphensRemoved: 0,
                          paragraphsCreated: 0,
                      },
                  };

            const result: TextPreprocessingResult = {
                processedText: normalizedText,
                patternsRemoved: removedPatterns.length,
                paragraphsFound: paragraphAnalysis.totalParagraphs,
                paragraphsNormalized: paragraphAnalysis.needsNormalization,
                processingDetails: {
                    removedPatterns,
                    paragraphAnalysis,
                    normalizationStats,
                },
            };

            preprocessLogger.info(
                {
                    originalLength: text.length,
                    processedLength: normalizedText.length,
                    patternsRemoved: removedPatterns.length,
                    paragraphsNormalized: paragraphAnalysis.needsNormalization,
                },
                'Text preprocessing completed',
            );

            return result;
        } catch (error) {
            preprocessLogger.error(
                { error: error instanceof Error ? error.message : String(error) },
                'Text preprocessing failed',
            );
            throw new AppError(
                ERROR_CODES.PIPELINE_FAILED,
                LOG_COMPONENTS.PIPELINE_MANAGER,
                'TextEnhancer.preprocessText',
                'Text preprocessing failed',
                { textLength: text.length, manifestPath },
                error instanceof Error ? error : new Error(String(error)),
            );
        }
    }

    /**
     * Load text-removal-patterns from manifest and apply them to text
     */
    private async applyManifestPatterns(
        text: string,
        manifestPath: string,
    ): Promise<{ processedText: string; removedPatterns: string[] }> {
        let processedText = text;
        const removedPatterns: string[] = [];

        try {
            // Load manifest file
            const manifestContent = readFileSync(manifestPath, 'utf-8');
            const manifest = parseYaml(manifestContent) as Record<string, unknown>;

            // Extract patterns from manifest
            const manifestPatterns = manifest['text-removal-patterns'] as string[] | undefined;
            let allPatterns: string[] = [];

            if (manifestPatterns && Array.isArray(manifestPatterns)) {
                allPatterns = [...manifestPatterns];
            }

            // Extract book-type and load additional patterns from book-types.yaml
            const originalSection = manifest.original as Record<string, unknown> | undefined;
            if (originalSection && typeof originalSection === 'object') {
                const bookType = originalSection['book-type'] as string | undefined;
                if (bookType && typeof bookType === 'string') {
                    try {
                        const bookTypePatterns =
                            await this.bookTypesService.getTextRemovalPatterns(bookType);
                        allPatterns = [...allPatterns, ...bookTypePatterns];
                    } catch (error) {
                        this.logger.getTextExtractionLogger(LOG_COMPONENTS.PIPELINE_MANAGER).warn(
                            {
                                bookType,
                                error: error instanceof Error ? error.message : String(error),
                            },
                            'Failed to load patterns for book type, continuing with manifest patterns only',
                        );
                    }
                }
            }

            // Apply all patterns
            if (allPatterns.length > 0) {
                this.logger
                    .getTextExtractionLogger(LOG_COMPONENTS.PIPELINE_MANAGER)
                    .info(
                        { totalPatterns: allPatterns.length, patterns: allPatterns },
                        'Applying text-removal-patterns',
                    );

                for (const pattern of allPatterns) {
                    if (typeof pattern === 'string') {
                        const beforeLength = processedText.length;
                        let replacementCount = 0;

                        // Convert pattern to regex (assuming they are in /pattern/ format)
                        const regexMatch = pattern.match(/^\/(.+)\/([gimuy]*)$/);
                        if (regexMatch?.[1]) {
                            const regexPattern = regexMatch[1];
                            let flags = regexMatch[2] || '';

                            // Ensure global flag is set for multiple replacements
                            if (!flags.includes('g')) {
                                flags += 'g';
                            }

                            const regex = new RegExp(regexPattern, flags);

                            // Count matches before replacement
                            const matches = processedText.match(regex);
                            replacementCount = matches ? matches.length : 0;

                            processedText = processedText.replace(regex, '');

                            if (replacementCount > 0) {
                                removedPatterns.push(pattern);
                            }
                        } else {
                            // Treat as literal string if not in regex format
                            const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                            const regex = new RegExp(escaped, 'g');

                            // Count matches before replacement
                            const matches = processedText.match(regex);
                            replacementCount = matches ? matches.length : 0;

                            processedText = processedText.replace(regex, '');

                            if (replacementCount > 0) {
                                removedPatterns.push(pattern);
                            }
                        }

                        const afterLength = processedText.length;
                        const charactersRemoved = beforeLength - afterLength;

                        // Log each pattern's results
                        this.logger.getTextExtractionLogger(LOG_COMPONENTS.PIPELINE_MANAGER).info(
                            {
                                pattern,
                                replacementCount,
                                charactersRemoved,
                                beforeLength,
                                afterLength,
                            },
                            `Pattern application result: ${replacementCount} replacements, ${charactersRemoved} characters removed`,
                        );
                    }
                }
            }
        } catch (error) {
            this.logger.getTextExtractionLogger(LOG_COMPONENTS.PIPELINE_MANAGER).warn(
                {
                    error: error instanceof Error ? error.message : String(error),
                    manifestPath,
                },
                'Failed to load or apply manifest patterns, continuing without pattern removal',
            );
        }

        return { processedText, removedPatterns };
    }

    /**
     * Analyze paragraph structure to determine if normalization is needed
     */
    private analyzeParagraphStructure(text: string): {
        totalParagraphs: number;
        paragraphsWithEndMarkers: number;
        needsNormalization: boolean;
    } {
        // Split text into paragraphs
        const paragraphs = text.split(/\n/).filter((p) => p.trim().length > 0);
        const totalParagraphs = paragraphs.length;

        // Check if we have enough paragraphs for analysis
        if (totalParagraphs < MIN_PARAGRAPHS_FOR_ANALYSIS) {
            return {
                totalParagraphs,
                paragraphsWithEndMarkers: 0,
                needsNormalization: true, // Always normalize if we have too few paragraphs
            };
        }

        // Check first 10 paragraphs for end markers
        const paragraphsToCheck = Math.min(10, totalParagraphs);
        let paragraphsWithEndMarkers = 0;

        for (let i = 0; i < paragraphsToCheck; i++) {
            const paragraph = paragraphs[i];
            if (paragraph && paragraph.trim().length > 0) {
                for (const marker of PARAGRAPH_END_MARKERS) {
                    if (paragraph.endsWith(marker)) {
                        paragraphsWithEndMarkers++;
                        break;
                    }
                }
            }
        }

        // If most paragraphs (at least 70%) have end markers, consider them well-structured
        const threshold = Math.ceil(paragraphsToCheck * 0.7);
        const needsNormalization = paragraphsWithEndMarkers < threshold;

        return {
            totalParagraphs,
            paragraphsWithEndMarkers,
            needsNormalization,
        };
    }

    /**
     * Normalize paragraphs by joining lines and handling hyphenation
     */
    private normalizeParagraphs(text: string): {
        normalizedText: string;
        normalizationStats: {
            linesJoined: number;
            hyphensRemoved: number;
            paragraphsCreated: number;
        };
    } {
        const lines = text.split('\n');
        const normalizedLines: string[] = [];
        let currentParagraph = '';

        let linesJoined = 0;
        let hyphensRemoved = 0;
        let paragraphsCreated = 0;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (!line) continue;

            const trimmedLine = line.trim();

            // Skip empty lines
            if (trimmedLine.length === 0) {
                // If we have a current paragraph, finish it
                if (currentParagraph.trim().length > 0) {
                    normalizedLines.push(currentParagraph.trim());
                    currentParagraph = '';
                    paragraphsCreated++;
                }
                continue;
            }

            // Check if line should be joined with the next line
            const nextLine = i + 1 < lines.length ? lines[i + 1] : undefined;
            const shouldJoinWithNext = this.shouldJoinLine(trimmedLine, nextLine);

            if (shouldJoinWithNext) {
                // Handle hyphenation at end of line
                if (trimmedLine.endsWith(TEXT_QUALITY_ENHANCEMENT.HYPHEN_LINE_ENDING)) {
                    const nextLineContent = nextLine?.trim() || '';
                    const nextFirstChar = nextLineContent.charAt(0);

                    if (nextFirstChar && nextFirstChar === nextFirstChar.toLowerCase()) {
                        // Next line starts with lowercase, remove hyphen
                        currentParagraph += trimmedLine.slice(0, -1); // Remove hyphen
                        hyphensRemoved++;
                    } else {
                        // Keep hyphen
                        currentParagraph += trimmedLine;
                    }
                } else {
                    currentParagraph += `${trimmedLine} `;
                }
                linesJoined++;
            } else {
                // Line ends a sentence/paragraph
                currentParagraph += trimmedLine;
                normalizedLines.push(currentParagraph.trim());
                currentParagraph = '';
                paragraphsCreated++;
            }
        }

        // Add any remaining paragraph
        if (currentParagraph.trim().length > 0) {
            normalizedLines.push(currentParagraph.trim());
            paragraphsCreated++;
        }

        // Join paragraphs with double newlines
        const normalizedText = normalizedLines.join(TEXT_QUALITY_ENHANCEMENT.PARAGRAPH_SEPARATOR);

        return {
            normalizedText,
            normalizationStats: {
                linesJoined,
                hyphensRemoved,
                paragraphsCreated,
            },
        };
    }

    /**
     * Determine if a line should be joined with the next line
     */
    private shouldJoinLine(currentLine: string, nextLine?: string): boolean {
        if (!nextLine || nextLine.trim().length === 0) {
            return false;
        }

        const trimmedLine = currentLine.trim();

        // Check if line ends with one of the paragraph end markers
        for (const marker of PARAGRAPH_END_MARKERS) {
            if (trimmedLine.endsWith(marker)) {
                return false; // Don't join if line ends with a sentence/paragraph marker
            }
        }

        // Check if line ends with hyphen (should always join)
        if (trimmedLine.endsWith(TEXT_QUALITY_ENHANCEMENT.HYPHEN_LINE_ENDING)) {
            return true;
        }

        // Default: join if line doesn't end with sentence terminators
        return true;
    }

    /**
     * Enhance text quality based on analysis results
     *
     * @param originalText - Original text to enhance
     * @param analysisResult - Quality analysis result with issues and suggestions
     * @param options - Enhancement options
     * @returns Enhanced text with improvement details
     */
    async enhanceText(
        originalText: string,
        analysisResult: TextQualityAnalysisResult,
        options: TextEnhancementOptions = {},
    ): Promise<TextEnhancementResult> {
        const enhancementLogger = this.logger.getTextExtractionLogger(
            LOG_COMPONENTS.PIPELINE_MANAGER,
        );

        const startTime = Date.now();

        try {
            enhancementLogger.info(
                {
                    originalLength: originalText.length,
                    issuesFound: analysisResult.issues.length,
                    suggestionsAvailable: analysisResult.suggestions.length,
                    options,
                },
                'Starting text enhancement',
            );

            let enhancedText = originalText;
            const improvementsMade: QualityImprovement[] = [];
            const enhancementSummary = {
                spellingCorrections: 0,
                debrisRemoved: 0,
                wordsReconstructed: 0,
                charactersFixed: 0,
            };

            // Apply suggested improvements first
            if (analysisResult.suggestions.length > 0) {
                const suggestionResults = this.applySuggestions(
                    enhancedText,
                    analysisResult.suggestions,
                    options,
                );
                enhancedText = suggestionResults.text;
                improvementsMade.push(...suggestionResults.improvements);
                this.updateSummary(enhancementSummary, suggestionResults.improvements);
            }

            // Fix issues based on type and options
            if (options.removeOCRDebris !== false) {
                const debrisResult = this.removeOCRDebris(
                    enhancedText,
                    analysisResult.issues,
                    options,
                );
                enhancedText = debrisResult.text;
                improvementsMade.push(...debrisResult.improvements);
                this.updateSummary(enhancementSummary, debrisResult.improvements);
            }

            if (options.reconstructBrokenWords !== false) {
                const wordResult = this.reconstructBrokenWords(
                    enhancedText,
                    analysisResult.issues,
                    options,
                );
                enhancedText = wordResult.text;
                improvementsMade.push(...wordResult.improvements);
                this.updateSummary(enhancementSummary, wordResult.improvements);
            }

            if (options.fixSpellingErrors !== false) {
                const spellingResult = this.fixSpellingErrors(
                    enhancedText,
                    analysisResult.issues,
                    options,
                );
                enhancedText = spellingResult.text;
                improvementsMade.push(...spellingResult.improvements);
                this.updateSummary(enhancementSummary, spellingResult.improvements);
            }

            if (options.cleanWeirdCharacters !== false) {
                const characterResult = this.cleanWeirdCharacters(
                    enhancedText,
                    analysisResult.issues,
                    options,
                );
                enhancedText = characterResult.text;
                improvementsMade.push(...characterResult.improvements);
                this.updateSummary(enhancementSummary, characterResult.improvements);
            }

            const processingTime = Date.now() - startTime;
            const issuesFixed = improvementsMade.length;
            const issuesRemaining = Math.max(0, analysisResult.issues.length - issuesFixed);

            const result: TextEnhancementResult = {
                enhancedText,
                improvementsMade,
                issuesFixed,
                issuesRemaining,
                confidence: this.calculateEnhancementConfidence(improvementsMade),
                processingTime,
                enhancementSummary,
            };

            enhancementLogger.info(
                {
                    originalLength: originalText.length,
                    enhancedLength: enhancedText.length,
                    issuesFixed,
                    issuesRemaining,
                    confidence: result.confidence,
                    processingTime,
                    enhancementSummary,
                },
                'Text enhancement completed',
            );

            return result;
        } catch (error) {
            const processingTime = Date.now() - startTime;

            enhancementLogger.error(
                {
                    error: error instanceof Error ? error.message : String(error),
                    processingTime,
                },
                'Text enhancement failed',
            );

            throw new AppError(
                ERROR_CODES.PIPELINE_FAILED,
                LOG_COMPONENTS.PIPELINE_MANAGER,
                'TextEnhancer.enhanceText',
                'Text enhancement failed',
                {
                    originalLength: originalText.length,
                    issuesFound: analysisResult.issues.length,
                },
                error instanceof Error ? error : new Error(String(error)),
            );
        }
    }

    /**
     * Apply quality improvement suggestions
     */
    private applySuggestions(
        text: string,
        suggestions: QualityImprovement[],
        options: TextEnhancementOptions,
    ): { text: string; improvements: QualityImprovement[] } {
        let enhancedText = text;
        const improvements: QualityImprovement[] = [];

        // Sort suggestions by position (reverse order to maintain positions)
        const sortedSuggestions = [...suggestions].sort((a, b) => b.position - a.position);

        for (const suggestion of sortedSuggestions) {
            // Apply improvement based on type and options
            if (this.shouldApplySuggestion(suggestion, options)) {
                const before = enhancedText.slice(0, suggestion.position);
                const after = enhancedText.slice(
                    suggestion.position + suggestion.originalText.length,
                );
                enhancedText = before + suggestion.improvedText + after;
                improvements.push(suggestion);
            }
        }

        return { text: enhancedText, improvements };
    }

    /**
     * Remove OCR debris (weird characters, symbols)
     */
    private removeOCRDebris(
        text: string,
        issues: QualityIssue[],
        options: TextEnhancementOptions,
    ): { text: string; improvements: QualityImprovement[] } {
        let enhancedText = text;
        const improvements: QualityImprovement[] = [];

        const debrisIssues = issues.filter((issue) => issue.type === 'ocr_debris');

        // Sort by position (reverse order to maintain positions)
        const sortedIssues = [...debrisIssues].sort((a, b) => b.position - a.position);

        for (const issue of sortedIssues) {
            // Remove the problematic text
            const before = enhancedText.slice(0, issue.position);
            const after = enhancedText.slice(issue.position + issue.length);
            const replacement = this.getDebrisReplacement(issue.problematicText, options);

            enhancedText = before + replacement + after;

            improvements.push({
                type: 'debris_removal',
                originalText: issue.problematicText,
                improvedText: replacement,
                position: issue.position,
                confidence: issue.confidence,
                source: 'pattern_matching',
            });
        }

        return { text: enhancedText, improvements };
    }

    /**
     * Reconstruct broken words
     */
    private reconstructBrokenWords(
        text: string,
        issues: QualityIssue[],
        _options: TextEnhancementOptions,
    ): { text: string; improvements: QualityImprovement[] } {
        let enhancedText = text;
        const improvements: QualityImprovement[] = [];

        const brokenWordIssues = issues.filter((issue) => issue.type === 'broken_word');

        // Sort by position (reverse order to maintain positions)
        const sortedIssues = [...brokenWordIssues].sort((a, b) => b.position - a.position);

        for (const issue of sortedIssues) {
            if (issue.suggestedFix) {
                const before = enhancedText.slice(0, issue.position);
                const after = enhancedText.slice(issue.position + issue.length);
                enhancedText = before + issue.suggestedFix + after;

                improvements.push({
                    type: 'word_reconstruction',
                    originalText: issue.problematicText,
                    improvedText: issue.suggestedFix,
                    position: issue.position,
                    confidence: issue.confidence,
                    source: 'pattern_matching',
                });
            }
        }

        return { text: enhancedText, improvements };
    }

    /**
     * Fix spelling errors using embedded text comparison
     */
    private fixSpellingErrors(
        text: string,
        issues: QualityIssue[],
        _options: TextEnhancementOptions,
    ): { text: string; improvements: QualityImprovement[] } {
        let enhancedText = text;
        const improvements: QualityImprovement[] = [];

        const spellingIssues = issues.filter((issue) => issue.type === 'spelling_error');

        // Sort by position (reverse order to maintain positions)
        const sortedIssues = [...spellingIssues].sort((a, b) => b.position - a.position);

        for (const issue of sortedIssues) {
            if (issue.suggestedFix && issue.confidence > 0.5) {
                const before = enhancedText.slice(0, issue.position);
                const after = enhancedText.slice(issue.position + issue.length);
                enhancedText = before + issue.suggestedFix + after;

                improvements.push({
                    type: 'spelling_correction',
                    originalText: issue.problematicText,
                    improvedText: issue.suggestedFix,
                    position: issue.position,
                    confidence: issue.confidence,
                    source: 'embedded_text',
                });
            }
        }

        return { text: enhancedText, improvements };
    }

    /**
     * Clean weird characters
     */
    private cleanWeirdCharacters(
        text: string,
        issues: QualityIssue[],
        options: TextEnhancementOptions,
    ): { text: string; improvements: QualityImprovement[] } {
        let enhancedText = text;
        const improvements: QualityImprovement[] = [];

        const characterIssues = issues.filter((issue) => issue.type === 'weird_character');

        // Sort by position (reverse order to maintain positions)
        const sortedIssues = [...characterIssues].sort((a, b) => b.position - a.position);

        for (const issue of sortedIssues) {
            const replacement = this.getCharacterReplacement(issue.problematicText, options);
            const before = enhancedText.slice(0, issue.position);
            const after = enhancedText.slice(issue.position + issue.length);
            enhancedText = before + replacement + after;

            improvements.push({
                type: 'character_cleaning',
                originalText: issue.problematicText,
                improvedText: replacement,
                position: issue.position,
                confidence: 0.8,
                source: 'pattern_matching',
            });
        }

        return { text: enhancedText, improvements };
    }

    /**
     * Check if a suggestion should be applied based on options
     */
    private shouldApplySuggestion(
        suggestion: QualityImprovement,
        options: TextEnhancementOptions,
    ): boolean {
        // Check confidence threshold
        if (suggestion.confidence < 0.5) return false;

        // Check type-specific options
        switch (suggestion.type) {
            case 'spelling_correction':
                return options.fixSpellingErrors !== false;
            case 'debris_removal':
                return options.removeOCRDebris !== false;
            case 'word_reconstruction':
                return options.reconstructBrokenWords !== false;
            case 'character_cleaning':
                return options.cleanWeirdCharacters !== false;
            default:
                return true;
        }
    }

    /**
     * Get replacement text for OCR debris
     */
    private getDebrisReplacement(debris: string, _options: TextEnhancementOptions): string {
        // Common OCR debris replacements
        const replacements = new Map([
            [/[|]+/g, ' '],
            [/[~]+/g, ' '],
            [/[`]+/g, "'"],
            [/[_]{3,}/g, ' '],
            [/[.]{4,}/g, '...'],
        ]);

        let replacement = debris;
        for (const [pattern, replace] of replacements) {
            replacement = replacement.replace(pattern, replace);
        }

        return replacement.trim() || ' ';
    }

    /**
     * Get replacement text for weird characters
     */
    private getCharacterReplacement(character: string, _options: TextEnhancementOptions): string {
        // Common character replacements for OCR artifacts
        const replacements = new Map<string, string>([
            ['\u00A0', ' '], // Non-breaking space
            ['\u2019', "'"], // Right single quotation mark
            ['\u201C', '"'], // Left double quotation mark
            ['\u201D', '"'], // Right double quotation mark
            ['\u2013', '–'], // En dash
            ['\u2014', '—'], // Em dash
            ['\u00C2', 'A'], // Latin capital letter A with circumflex
            ['\u00E9', 'é'], // Latin small letter e with acute
            ['\u00E1', 'á'], // Latin small letter a with acute
            ['\u00FC', 'ü'], // Latin small letter u with diaeresis
        ]);

        return replacements.get(character) || '';
    }

    /**
     * Update enhancement summary with improvements
     */
    private updateSummary(
        summary: TextEnhancementResult['enhancementSummary'],
        improvements: QualityImprovement[],
    ): void {
        for (const improvement of improvements) {
            switch (improvement.type) {
                case 'spelling_correction':
                    summary.spellingCorrections++;
                    break;
                case 'debris_removal':
                    summary.debrisRemoved++;
                    break;
                case 'word_reconstruction':
                    summary.wordsReconstructed++;
                    break;
                case 'character_cleaning':
                    summary.charactersFixed++;
                    break;
            }
        }
    }

    /**
     * Calculate confidence in enhancement results
     */
    private calculateEnhancementConfidence(improvements: QualityImprovement[]): number {
        if (improvements.length === 0) return 1.0;

        const avgConfidence =
            improvements.reduce((sum, imp) => sum + imp.confidence, 0) / improvements.length;
        return Math.min(1.0, avgConfidence);
    }
}
