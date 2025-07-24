import { ERROR_CODES, LOG_COMPONENTS } from '../../../constants';
import type { LoggerService } from '../../../services/LoggerService';
import { AppError } from '../../../utils/AppError';
import type { TextEnhancementResult } from './TextEnhancer';

/**
 * Quality validation result interface
 */
export interface QualityValidationResult {
    isValid: boolean;
    overallScore: number; // 0-1 score
    validationMetrics: {
        textLength: number;
        wordCount: number;
        sentenceCount: number;
        paragraphCount: number;
        readabilityScore: number;
        structureScore: number;
        cleanlinessScore: number;
    };
    validationIssues: ValidationIssue[];
    recommendations: string[];
    processingTime: number;
    validationMethod: string;
}

/**
 * Validation issue interface
 */
export interface ValidationIssue {
    type: 'structure' | 'readability' | 'cleanliness' | 'completeness' | 'formatting';
    severity: 'low' | 'medium' | 'high' | 'critical';
    description: string;
    position?: number;
    suggestedAction: string;
}

/**
 * Quality validation options
 */
export interface QualityValidationOptions {
    checkReadability?: boolean;
    checkStructure?: boolean;
    checkCleanliness?: boolean;
    checkCompleteness?: boolean;
    checkFormatting?: boolean;
    language?: string;
    strictMode?: boolean;
    minimumQualityScore?: number;
}

/**
 * Quality Validator for validating enhanced text quality
 *
 * This validator ensures that the enhanced text meets quality standards:
 * - Checks text structure (paragraphs, sentences, words)
 * - Validates readability and coherence
 * - Ensures cleanliness (no OCR debris remaining)
 * - Validates completeness (no missing sections)
 * - Checks formatting consistency
 */
export class QualityValidator {
    private readonly logger: LoggerService;

    constructor(logger: LoggerService) {
        this.logger = logger;
    }

    /**
     * Validate the quality of enhanced text
     *
     * @param enhancedText - The enhanced text to validate
     * @param originalText - The original text for comparison
     * @param enhancementResult - The enhancement result with improvement details
     * @param options - Validation options
     * @returns Quality validation result
     */
    async validateQuality(
        enhancedText: string,
        originalText: string,
        enhancementResult: TextEnhancementResult,
        options: QualityValidationOptions = {},
    ): Promise<QualityValidationResult> {
        const validationLogger = this.logger.getTextExtractionLogger(
            LOG_COMPONENTS.PIPELINE_MANAGER,
        );

        const startTime = Date.now();

        try {
            validationLogger.info(
                {
                    enhancedTextLength: enhancedText.length,
                    originalTextLength: originalText.length,
                    improvementsMade: enhancementResult.improvementsMade.length,
                    options,
                },
                'Starting quality validation',
            );

            const validationIssues: ValidationIssue[] = [];
            const recommendations: string[] = [];

            // Calculate basic metrics
            const validationMetrics = this.calculateValidationMetrics(enhancedText);

            // Perform different validation checks
            if (options.checkStructure !== false) {
                const structureIssues = this.validateStructure(
                    enhancedText,
                    originalText,
                );
                validationIssues.push(...structureIssues);
            }

            if (options.checkReadability !== false) {
                const readabilityIssues = this.validateReadability(
                    enhancedText,
                    options,
                );
                validationIssues.push(...readabilityIssues);
            }

            if (options.checkCleanliness !== false) {
                const cleanlinessIssues = this.validateCleanliness(
                    enhancedText,
                    enhancementResult,
                );
                validationIssues.push(...cleanlinessIssues);
            }

            if (options.checkCompleteness !== false) {
                const completenessIssues = this.validateCompleteness(
                    enhancedText,
                    originalText,
                );
                validationIssues.push(...completenessIssues);
            }

            if (options.checkFormatting !== false) {
                const formattingIssues = this.validateFormatting(enhancedText, options);
                validationIssues.push(...formattingIssues);
            }

            // Generate recommendations
            recommendations.push(
                ...this.generateRecommendations(validationIssues, enhancementResult),
            );

            // Calculate overall score
            const overallScore = this.calculateOverallScore(
                validationMetrics,
                validationIssues,
            );

            // Determine if validation passes
            const minimumScore = options.minimumQualityScore || 0.7;
            const isValid =
                overallScore >= minimumScore &&
                !validationIssues.some((issue) => issue.severity === 'critical');

            const processingTime = Date.now() - startTime;

            const result: QualityValidationResult = {
                isValid,
                overallScore,
                validationMetrics,
                validationIssues,
                recommendations,
                processingTime,
                validationMethod: 'comprehensive_analysis',
            };

            validationLogger.info(
                {
                    isValid,
                    overallScore,
                    issuesFound: validationIssues.length,
                    recommendationsGenerated: recommendations.length,
                    processingTime,
                },
                'Quality validation completed',
            );

            return result;
        } catch (error) {
            const processingTime = Date.now() - startTime;

            validationLogger.error(
                {
                    error: error instanceof Error ? error.message : String(error),
                    processingTime,
                },
                'Quality validation failed',
            );

            throw new AppError(
                ERROR_CODES.PIPELINE_FAILED,
                LOG_COMPONENTS.PIPELINE_MANAGER,
                'QualityValidator.validateQuality',
                'Quality validation failed',
                {
                    enhancedTextLength: enhancedText.length,
                    originalTextLength: originalText.length,
                },
                error instanceof Error ? error : new Error(String(error)),
            );
        }
    }

    /**
     * Calculate basic validation metrics
     */
    private calculateValidationMetrics(
        text: string,
    ): QualityValidationResult['validationMetrics'] {
        const textLength = text.length;
        const wordCount = text
            .trim()
            .split(/\s+/)
            .filter((word) => word.length > 0).length;
        const sentenceCount = text
            .split(/[.!?]+/)
            .filter((sentence) => sentence.trim().length > 0).length;
        const paragraphCount = text
            .split(/\n\s*\n/)
            .filter((paragraph) => paragraph.trim().length > 0).length;

        // Simple readability score (placeholder)
        const avgWordsPerSentence = wordCount / Math.max(sentenceCount, 1);
        const readabilityScore = Math.min(
            1.0,
            Math.max(0, 1 - (avgWordsPerSentence - 15) / 50),
        );

        // Structure score based on paragraph organization
        const structureScore =
            paragraphCount > 0 ? Math.min(1.0, paragraphCount / 10) : 0;

        // Cleanliness score based on character distribution
        const cleanlinessScore = this.calculateCleanlinessScore(text);

        return {
            textLength,
            wordCount,
            sentenceCount,
            paragraphCount,
            readabilityScore,
            structureScore,
            cleanlinessScore,
        };
    }

    /**
     * Validate text structure
     */
    private validateStructure(
        enhancedText: string,
        originalText: string,
    ): ValidationIssue[] {
        const issues: ValidationIssue[] = [];

        // Check for extremely short text
        if (enhancedText.length < 100) {
            issues.push({
                type: 'structure',
                severity: 'high',
                description: 'Text is extremely short, possibly incomplete',
                suggestedAction: 'Review text extraction and enhancement process',
            });
        }

        // Check for lack of paragraphs
        const paragraphs = enhancedText
            .split(/\n\s*\n/)
            .filter((p) => p.trim().length > 0);
        if (paragraphs.length === 0) {
            issues.push({
                type: 'structure',
                severity: 'medium',
                description: 'No paragraph breaks detected',
                suggestedAction:
                    'Consider adding paragraph structure based on content analysis',
            });
        }

        // Check for significant length difference
        const lengthDiff = Math.abs(enhancedText.length - originalText.length);
        const lengthRatio = lengthDiff / originalText.length;
        if (lengthRatio > 0.3) {
            issues.push({
                type: 'structure',
                severity: 'medium',
                description: `Significant length difference from original (${(lengthRatio * 100).toFixed(1)}%)`,
                suggestedAction:
                    'Review enhancement process for potential over-processing',
            });
        }

        return issues;
    }

    /**
     * Validate readability
     */
    private validateReadability(
        enhancedText: string,
        _options: QualityValidationOptions,
    ): ValidationIssue[] {
        const issues: ValidationIssue[] = [];

        // Check for extremely long sentences
        const sentences = enhancedText
            .split(/[.!?]+/)
            .filter((s) => s.trim().length > 0);
        const longSentences = sentences.filter((s) => s.split(/\s+/).length > 50);

        if (longSentences.length > sentences.length * 0.2) {
            issues.push({
                type: 'readability',
                severity: 'low',
                description:
                    'Many sentences are very long, potentially affecting readability',
                suggestedAction:
                    'Consider breaking down long sentences for better readability',
            });
        }

        // Check for repetitive patterns
        const words = enhancedText.toLowerCase().split(/\s+/);
        const wordFrequency = new Map<string, number>();
        words.forEach((word) => {
            wordFrequency.set(word, (wordFrequency.get(word) || 0) + 1);
        });

        const repeatedWords = Array.from(wordFrequency.entries())
            .filter(([word, count]) => count > words.length * 0.05 && word.length > 3)
            .map(([word]) => word);

        if (repeatedWords.length > 5) {
            issues.push({
                type: 'readability',
                severity: 'low',
                description: 'High repetition of certain words detected',
                suggestedAction: 'Consider varying word usage for better readability',
            });
        }

        return issues;
    }

    /**
     * Validate cleanliness (no OCR debris remaining)
     */
    private validateCleanliness(
        enhancedText: string,
        enhancementResult: TextEnhancementResult,
    ): ValidationIssue[] {
        const issues: ValidationIssue[] = [];

        // Check for remaining OCR artifacts
        const ocrArtifacts = [
            /[|]{2,}/g, // Multiple pipe characters
            /[~]{2,}/g, // Multiple tilde characters
            /[_]{4,}/g, // Multiple underscores
            /[.]{5,}/g, // Multiple dots
            /[^\x00-\x7F\u00A0-\u024F\u2000-\u206F]/g, // Non-standard characters
        ];

        ocrArtifacts.forEach((pattern) => {
            const matches = enhancedText.match(pattern);
            if (matches && matches.length > 0) {
                issues.push({
                    type: 'cleanliness',
                    severity: 'medium',
                    description: `Potential OCR artifacts still present: ${matches.slice(0, 3).join(', ')}`,
                    suggestedAction: 'Run additional cleaning passes or manual review',
                });
            }
        });

        // Check enhancement effectiveness
        if (enhancementResult.issuesRemaining > enhancementResult.issuesFixed) {
            issues.push({
                type: 'cleanliness',
                severity: 'high',
                description: 'More issues remain unfixed than were fixed',
                suggestedAction:
                    'Review enhancement settings and consider more aggressive cleaning',
            });
        }

        return issues;
    }

    /**
     * Validate completeness
     */
    private validateCompleteness(
        enhancedText: string,
        originalText: string,
    ): ValidationIssue[] {
        const issues: ValidationIssue[] = [];

        // Check for significant content loss
        const enhancedWords = enhancedText
            .toLowerCase()
            .split(/\s+/)
            .filter((w) => w.length > 3);
        const originalWords = originalText
            .toLowerCase()
            .split(/\s+/)
            .filter((w) => w.length > 3);

        const wordsLost = originalWords.filter((word) => !enhancedWords.includes(word));
        const lossRatio = wordsLost.length / originalWords.length;

        if (lossRatio > 0.1) {
            issues.push({
                type: 'completeness',
                severity: 'high',
                description: `Significant content loss detected (${(lossRatio * 100).toFixed(1)}% of unique words)`,
                suggestedAction:
                    'Review enhancement process for over-aggressive cleaning',
            });
        }

        // Check for missing sections (placeholder)
        const enhancedLines = enhancedText
            .split('\n')
            .filter((line) => line.trim().length > 0);
        const originalLines = originalText
            .split('\n')
            .filter((line) => line.trim().length > 0);

        if (enhancedLines.length < originalLines.length * 0.8) {
            issues.push({
                type: 'completeness',
                severity: 'medium',
                description: 'Potential missing sections detected',
                suggestedAction: 'Compare line-by-line to identify missing content',
            });
        }

        return issues;
    }

    /**
     * Validate formatting
     */
    private validateFormatting(
        enhancedText: string,
        _options: QualityValidationOptions,
    ): ValidationIssue[] {
        const issues: ValidationIssue[] = [];

        // Check for inconsistent spacing
        const inconsistentSpacing = enhancedText.match(/\s{3,}/g);
        if (inconsistentSpacing && inconsistentSpacing.length > 5) {
            issues.push({
                type: 'formatting',
                severity: 'low',
                description: 'Inconsistent spacing detected',
                suggestedAction: 'Standardize spacing throughout the text',
            });
        }

        // Check for mixed line endings
        const hasWindowsLineEndings = enhancedText.includes('\r\n');
        const hasUnixLineEndings =
            enhancedText.includes('\n') && !enhancedText.includes('\r\n');

        if (hasWindowsLineEndings && hasUnixLineEndings) {
            issues.push({
                type: 'formatting',
                severity: 'low',
                description: 'Mixed line ending types detected',
                suggestedAction: 'Standardize line endings to one type',
            });
        }

        return issues;
    }

    /**
     * Generate recommendations based on validation results
     */
    private generateRecommendations(
        validationIssues: ValidationIssue[],
        enhancementResult: TextEnhancementResult,
    ): string[] {
        const recommendations: string[] = [];

        // Critical issues first
        const criticalIssues = validationIssues.filter(
            (issue) => issue.severity === 'critical',
        );
        if (criticalIssues.length > 0) {
            recommendations.push(
                'Address all critical issues before proceeding to next pipeline phase',
            );
        }

        // Enhancement effectiveness
        if (enhancementResult.confidence < 0.7) {
            recommendations.push(
                'Consider adjusting enhancement settings for better results',
            );
        }

        // High-frequency issues
        const issueTypes = validationIssues.reduce(
            (acc, issue) => {
                acc[issue.type] = (acc[issue.type] || 0) + 1;
                return acc;
            },
            {} as Record<string, number>,
        );

        const mostCommonIssue = Object.entries(issueTypes).sort(
            ([, a], [, b]) => b - a,
        )[0];

        if (mostCommonIssue && mostCommonIssue[1] > 2) {
            recommendations.push(
                `Focus on ${mostCommonIssue[0]} issues - they appear most frequently`,
            );
        }

        // Enhancement-specific recommendations
        if (enhancementResult.enhancementSummary.debrisRemoved === 0) {
            recommendations.push(
                'No OCR debris was removed - consider adjusting debris detection settings',
            );
        }

        if (enhancementResult.enhancementSummary.spellingCorrections === 0) {
            recommendations.push(
                'No spelling corrections were made - review spell-checking configuration',
            );
        }

        return recommendations;
    }

    /**
     * Calculate cleanliness score based on character distribution
     */
    private calculateCleanlinessScore(text: string): number {
        const totalChars = text.length;
        if (totalChars === 0) return 0;

        // Count problematic characters
        const problematicChars =
            text.match(/[^\x00-\x7F\u00A0-\u024F\u2000-\u206F]/g) || [];
        const repeatPatterns = text.match(/(.)\1{3,}/g) || [];

        const problematicCount = problematicChars.length + repeatPatterns.length;
        const cleanlinessRatio = 1 - problematicCount / totalChars;

        return Math.max(0, Math.min(1, cleanlinessRatio));
    }

    /**
     * Calculate overall quality score
     */
    private calculateOverallScore(
        metrics: QualityValidationResult['validationMetrics'],
        issues: ValidationIssue[],
    ): number {
        // Base score from metrics
        const metricsScore =
            metrics.readabilityScore * 0.3 +
            metrics.structureScore * 0.3 +
            metrics.cleanlinessScore * 0.4;

        // Penalty for issues
        const issuePenalty = issues.reduce((penalty, issue) => {
            const severityPenalty = {
                low: 0.02,
                medium: 0.05,
                high: 0.1,
                critical: 0.2,
            };
            return penalty + severityPenalty[issue.severity];
        }, 0);

        return Math.max(0, Math.min(1, metricsScore - issuePenalty));
    }
}
