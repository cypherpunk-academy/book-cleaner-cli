import { ERROR_CODES, LOG_COMPONENTS } from '@/constants';
import type { BookManifestInfo } from '@/types';
import { AppError } from '@/utils/AppError';
import type { LoggerService } from '@/services/LoggerService';

/**
 * Validation result for book structure
 */
export interface StructureValidationResult {
    isValid: boolean;
    errors: string[];
    warnings: string[];
    suggestions: string[];
}

/**
 * TOC entry validation result
 */
export interface TOCValidationResult {
    isValid: boolean;
    errors: string[];
    level: number;
    hasSubsections: boolean;
}

/**
 * Paragraph entry validation result
 */
export interface ParagraphValidationResult {
    isValid: boolean;
    errors: string[];
    paragraphNumber: number;
    hasContent: boolean;
}

/**
 * Service for validating book structure (TOC and paragraph entries)
 */
export class StructureValidator {
    private readonly logger: LoggerService;

    constructor(logger: LoggerService) {
        this.logger = logger;
    }

    /**
     * Validate entire book structure
     */
    public validateStructure(structure: BookManifestInfo['bookStructure']): StructureValidationResult {
        const logger = this.logger.getConfigLogger(LOG_COMPONENTS.CONFIG_SERVICE);
        const errors: string[] = [];
        const warnings: string[] = [];
        const suggestions: string[] = [];

        logger.debug('Validating book structure', {
            entryCount: structure.length,
        });

        // Basic validation
        if (!Array.isArray(structure)) {
            errors.push('Book structure must be an array');
            return { isValid: false, errors, warnings, suggestions };
        }

        if (structure.length === 0) {
            warnings.push('Book structure is empty');
            return { isValid: true, errors, warnings, suggestions };
        }

        // Validate individual entries
        for (let i = 0; i < structure.length; i++) {
            const entry = structure[i];
            const entryValidation = this.validateEntry(entry, i);

            if (!entryValidation.isValid) {
                errors.push(`Entry ${i}: ${entryValidation.errors.join(', ')}`);
            }

            if (entryValidation.warnings.length > 0) {
                warnings.push(`Entry ${i}: ${entryValidation.warnings.join(', ')}`);
            }
        }

        // Validate structure consistency
        const consistencyValidation = this.validateStructureConsistency(structure);
        errors.push(...consistencyValidation.errors);
        warnings.push(...consistencyValidation.warnings);
        suggestions.push(...consistencyValidation.suggestions);

        // Validate completeness
        const completenessValidation = this.validateCompleteness(structure);
        errors.push(...completenessValidation.errors);
        warnings.push(...completenessValidation.warnings);
        suggestions.push(...completenessValidation.suggestions);

        const isValid = errors.length === 0;

        logger.debug('Structure validation completed', {
            isValid,
            errorCount: errors.length,
            warningCount: warnings.length,
            suggestionCount: suggestions.length,
        });

        return { isValid, errors, warnings, suggestions };
    }

    /**
     * Validate individual structure entry
     */
    public validateEntry(entry: string, index: number): {
        isValid: boolean;
        errors: string[];
        warnings: string[];
        type: 'toc' | 'paragraph' | 'unknown';
    } {
        const errors: string[] = [];
        const warnings: string[] = [];

        // Basic entry validation
        if (typeof entry !== 'string') {
            errors.push('Entry must be a string');
            return { isValid: false, errors, warnings, type: 'unknown' };
        }

        if (entry.trim().length === 0) {
            errors.push('Entry cannot be empty');
            return { isValid: false, errors, warnings, type: 'unknown' };
        }

        // Determine entry type and validate accordingly
        if (this.isTOCEntry(entry)) {
            const tocValidation = this.validateTOCEntry(entry, index);
            errors.push(...tocValidation.errors);
            warnings.push(...tocValidation.warnings);
            return {
                isValid: tocValidation.isValid,
                errors,
                warnings,
                type: 'toc',
            };
        } else if (this.isParagraphEntry(entry)) {
            const paragraphValidation = this.validateParagraphEntry(entry, index);
            errors.push(...paragraphValidation.errors);
            warnings.push(...paragraphValidation.warnings);
            return {
                isValid: paragraphValidation.isValid,
                errors,
                warnings,
                type: 'paragraph',
            };
        } else {
            warnings.push('Entry type could not be determined');
            return { isValid: true, errors, warnings, type: 'unknown' };
        }
    }

    /**
     * Check if entry is a TOC entry
     */
    private isTOCEntry(entry: string): boolean {
        const trimmed = entry.trim();
        
        // TOC entries typically have:
        // 1. Chapter/section numbers (e.g., "1.", "1.1.", "Chapter 1")
        // 2. Title-like formatting
        // 3. No paragraph-specific markers
        
        const tocPatterns = [
            /^\d+\./, // "1.", "2.", etc.
            /^\d+\.\d+/, // "1.1.", "2.3.", etc.
            /^Chapter\s+\d+/i, // "Chapter 1", "CHAPTER 2", etc.
            /^Section\s+\d+/i, // "Section 1", "SECTION 2", etc.
            /^Part\s+\d+/i, // "Part 1", "PART 2", etc.
            /^Book\s+\d+/i, // "Book 1", "BOOK 2", etc.
        ];

        return tocPatterns.some(pattern => pattern.test(trimmed));
    }

    /**
     * Check if entry is a paragraph entry
     */
    private isParagraphEntry(entry: string): boolean {
        const trimmed = entry.trim();
        
        // Paragraph entries typically have:
        // 1. Paragraph numbers (e.g., "§1", "¶1", "P1")
        // 2. Short content indicators
        // 3. Specific paragraph markers
        
        const paragraphPatterns = [
            /^§\d+/, // "§1", "§2", etc.
            /^¶\d+/, // "¶1", "¶2", etc.
            /^P\d+/, // "P1", "P2", etc.
            /^Paragraph\s+\d+/i, // "Paragraph 1", "PARAGRAPH 2", etc.
        ];

        return paragraphPatterns.some(pattern => pattern.test(trimmed));
    }

    /**
     * Validate TOC entry
     */
    private validateTOCEntry(entry: string, index: number): TOCValidationResult {
        const errors: string[] = [];
        const warnings: string[] = [];

        // Extract TOC level
        const level = this.getTOCLevel(entry);
        
        // Check for common TOC issues
        if (entry.length > 200) {
            warnings.push('TOC entry is very long (may be paragraph content)');
        }

        if (entry.length < 3) {
            warnings.push('TOC entry is very short');
        }

        // Check for proper formatting
        if (!/^[A-Za-z0-9§¶]/.test(entry.trim())) {
            warnings.push('TOC entry should start with alphanumeric character or special marker');
        }

        // Check for subsections
        const hasSubsections = /\d+\.\d+/.test(entry);

        return {
            isValid: errors.length === 0,
            errors,
            level,
            hasSubsections,
        };
    }

    /**
     * Validate paragraph entry
     */
    private validateParagraphEntry(entry: string, index: number): ParagraphValidationResult {
        const errors: string[] = [];
        const warnings: string[] = [];

        // Extract paragraph number
        const paragraphNumber = this.getParagraphNumber(entry);
        
        // Check for common paragraph issues
        if (entry.length > 1000) {
            warnings.push('Paragraph entry is very long (may be full content)');
        }

        if (entry.length < 10) {
            warnings.push('Paragraph entry is very short');
        }

        // Check for content indicators
        const hasContent = entry.length > 20 && !this.isTOCEntry(entry);

        return {
            isValid: errors.length === 0,
            errors,
            paragraphNumber,
            hasContent,
        };
    }

    /**
     * Get TOC level from entry
     */
    private getTOCLevel(entry: string): number {
        const trimmed = entry.trim();
        
        // Count dots to determine level
        const dotCount = (trimmed.match(/\./g) || []).length;
        
        if (/^Chapter\s+\d+/i.test(trimmed)) return 1;
        if (/^Section\s+\d+/i.test(trimmed)) return 2;
        if (/^Part\s+\d+/i.test(trimmed)) return 1;
        if (/^Book\s+\d+/i.test(trimmed)) return 1;
        
        return Math.min(dotCount + 1, 5); // Cap at level 5
    }

    /**
     * Get paragraph number from entry
     */
    private getParagraphNumber(entry: string): number {
        const trimmed = entry.trim();
        
        // Extract number from various paragraph formats
        const patterns = [
            /^§(\d+)/, // "§1" -> 1
            /^¶(\d+)/, // "¶1" -> 1
            /^P(\d+)/, // "P1" -> 1
            /^Paragraph\s+(\d+)/i, // "Paragraph 1" -> 1
        ];

        for (const pattern of patterns) {
            const match = trimmed.match(pattern);
            if (match) {
                return parseInt(match[1], 10);
            }
        }

        return 0; // Default if no number found
    }

    /**
     * Validate structure consistency
     */
    private validateStructureConsistency(structure: BookManifestInfo['bookStructure']): {
        errors: string[];
        warnings: string[];
        suggestions: string[];
    } {
        const errors: string[] = [];
        const warnings: string[] = [];
        const suggestions: string[] = [];

        // Check for duplicate entries
        const seenEntries = new Set<string>();
        for (let i = 0; i < structure.length; i++) {
            const entry = structure[i].trim();
            if (seenEntries.has(entry)) {
                warnings.push(`Duplicate entry found at index ${i}: "${entry}"`);
            } else {
                seenEntries.add(entry);
            }
        }

        // Check TOC hierarchy consistency
        const tocEntries = structure
            .map((entry, index) => ({ entry, index }))
            .filter(({ entry }) => this.isTOCEntry(entry));

        for (let i = 1; i < tocEntries.length; i++) {
            const prevLevel = this.getTOCLevel(tocEntries[i - 1].entry);
            const currLevel = this.getTOCLevel(tocEntries[i].entry);
            
            if (currLevel > prevLevel + 1) {
                warnings.push(`TOC hierarchy jump at index ${tocEntries[i].index}: level ${prevLevel} to ${currLevel}`);
            }
        }

        // Check paragraph numbering consistency
        const paragraphEntries = structure
            .map((entry, index) => ({ entry, index, number: this.getParagraphNumber(entry) }))
            .filter(({ entry }) => this.isParagraphEntry(entry));

        const paragraphNumbers = paragraphEntries.map(p => p.number).filter(n => n > 0);
        if (paragraphNumbers.length > 0) {
            const expectedNumbers = Array.from({ length: Math.max(...paragraphNumbers) }, (_, i) => i + 1);
            const missingNumbers = expectedNumbers.filter(n => !paragraphNumbers.includes(n));
            
            if (missingNumbers.length > 0) {
                warnings.push(`Missing paragraph numbers: ${missingNumbers.join(', ')}`);
            }
        }

        return { errors, warnings, suggestions };
    }

    /**
     * Validate structure completeness
     */
    private validateCompleteness(structure: BookManifestInfo['bookStructure']): {
        errors: string[];
        warnings: string[];
        suggestions: string[];
    } {
        const errors: string[] = [];
        const warnings: string[] = [];
        const suggestions: string[] = [];

        const tocCount = structure.filter(entry => this.isTOCEntry(entry)).length;
        const paragraphCount = structure.filter(entry => this.isParagraphEntry(entry)).length;

        // Check for minimum structure requirements
        if (tocCount === 0) {
            warnings.push('No TOC entries found - structure may be incomplete');
        }

        if (paragraphCount === 0) {
            warnings.push('No paragraph entries found - structure may be incomplete');
        }

        // Check for balanced structure
        if (tocCount > 0 && paragraphCount === 0) {
            suggestions.push('Consider adding paragraph entries for better structure');
        }

        if (paragraphCount > 0 && tocCount === 0) {
            suggestions.push('Consider adding TOC entries for better organization');
        }

        // Check for reasonable entry counts
        if (structure.length < 5) {
            warnings.push('Very few structure entries - may be incomplete');
        }

        if (structure.length > 1000) {
            warnings.push('Very many structure entries - may need consolidation');
        }

        return { errors, warnings, suggestions };
    }

    /**
     * Validate specific TOC entry format
     */
    public validateTOCFormat(entry: string): {
        isValid: boolean;
        errors: string[];
        level: number;
        suggestedFormat: string;
    } {
        const errors: string[] = [];
        const level = this.getTOCLevel(entry);
        let suggestedFormat = entry;

        // Check for common formatting issues
        if (!/^\d+\./.test(entry.trim()) && !/^Chapter\s+\d+/i.test(entry.trim())) {
            errors.push('TOC entry should start with number or "Chapter"');
            suggestedFormat = `1. ${entry.trim()}`;
        }

        if (entry.length > 100) {
            errors.push('TOC entry is too long');
            suggestedFormat = entry.substring(0, 100) + '...';
        }

        return {
            isValid: errors.length === 0,
            errors,
            level,
            suggestedFormat,
        };
    }

    /**
     * Validate specific paragraph entry format
     */
    public validateParagraphFormat(entry: string): {
        isValid: boolean;
        errors: string[];
        paragraphNumber: number;
        suggestedFormat: string;
    } {
        const errors: string[] = [];
        const paragraphNumber = this.getParagraphNumber(entry);
        let suggestedFormat = entry;

        // Check for common formatting issues
        if (!/^[§¶P]/.test(entry.trim()) && !/^Paragraph\s+\d+/i.test(entry.trim())) {
            errors.push('Paragraph entry should start with §, ¶, P, or "Paragraph"');
            suggestedFormat = `§1 ${entry.trim()}`;
        }

        if (entry.length > 500) {
            errors.push('Paragraph entry is too long');
            suggestedFormat = entry.substring(0, 500) + '...';
        }

        return {
            isValid: errors.length === 0,
            errors,
            paragraphNumber,
            suggestedFormat,
        };
    }
} 