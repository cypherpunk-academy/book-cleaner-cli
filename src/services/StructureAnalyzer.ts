import {
    ERROR_CODES,
    LOG_COMPONENTS,
    STRUCTURE_ANALYSIS_CONFIDENCE,
    STRUCTURE_ANALYSIS_LEVELS,
    STRUCTURE_ANALYSIS_PATTERNS,
} from '@/constants';
import type { LoggerService } from '@/services/LoggerService';
import type {
    BookMetadata,
    BookStructure,
    FileInfo,
    PatternAnalysis,
    StructuralFeature,
    StructureAnalysis,
    StructureAnalysisResult,
    StructureDialogue,
    StructureFootnote,
    StructureHeader,
    StructureHierarchy,
    StructureIssue,
    StructureParagraph,
    StructureQuality,
} from '@/types';
import { AppError } from '@/utils/AppError';
import { v4 as uuidv4 } from 'uuid';

/**
 * Service for analyzing book structure and extracting hierarchical information
 */
export class StructureAnalyzer {
    private readonly logger: LoggerService;

    constructor(logger: LoggerService) {
        this.logger = logger;
    }

    /**
     * Analyze book structure from extracted text
     */
    public async analyzeStructure(
        fileInfo: FileInfo,
        extractedText: string,
        metadata: BookMetadata,
    ): Promise<StructureAnalysisResult> {
        const startTime = Date.now();
        const analysisLogger = this.logger.getTextExtractionLogger(LOG_COMPONENTS.PIPELINE_MANAGER);

        analysisLogger.info(
            {
                filename: fileInfo.name,
                format: fileInfo.format,
                textLength: extractedText.length,
            },
            'Starting structure analysis',
        );

        try {
            const lines = extractedText.split('\n');

            // Analyze different structural elements
            const headers = this.analyzeHeaders(lines);
            const footnotes = this.analyzeFootnotes(lines);
            const paragraphs = this.analyzeParagraphs(lines);
            const dialogues = this.analyzeDialogues(lines);
            const hierarchy = this.buildHierarchy(headers);

            const structure: BookStructure = {
                headers,
                footnotes,
                paragraphs,
                dialogues,
                hierarchy,
            };

            const quality = this.assessStructureQuality(structure, lines);
            const analysis = this.analyzePatterns(structure, lines);

            const result: StructureAnalysisResult = {
                filename: fileInfo.name,
                format: fileInfo.format,
                metadata,
                structure,
                quality,
                analysis,
                extractedText,
                analysisTime: Date.now() - startTime,
            };

            analysisLogger.info(
                {
                    filename: fileInfo.name,
                    headersFound: headers.length,
                    footnotesFound: footnotes.length,
                    dialoguesFound: dialogues.length,
                    qualityScore: quality.score,
                    analysisTime: result.analysisTime,
                },
                'Structure analysis completed',
            );

            return result;
        } catch (error) {
            throw new AppError(
                ERROR_CODES.EXTRACTION_FAILED,
                LOG_COMPONENTS.PIPELINE_MANAGER,
                'analyzeStructure',
                `Failed to analyze structure: ${fileInfo.path}`,
                { filename: fileInfo.name, format: fileInfo.format },
                error instanceof Error ? error : new Error(String(error)),
            );
        }
    }

    /**
     * Analyze headers in the text
     */
    private analyzeHeaders(lines: string[]): StructureHeader[] {
        const headers: StructureHeader[] = [];

        for (let i = 0; i < lines.length; i++) {
            const rawLine = lines[i];
            if (!rawLine) continue;
            const line = rawLine.trim();
            if (line.length === 0) continue;

            // Check each header pattern
            for (const pattern of STRUCTURE_ANALYSIS_PATTERNS.CHAPTER_HEADERS) {
                const match = line.match(pattern);
                if (match) {
                    const header = this.createHeader(match, line, i, 'chapter', pattern.source);
                    if (header) headers.push(header);
                    break;
                }
            }

            for (const pattern of STRUCTURE_ANALYSIS_PATTERNS.LECTURE_HEADERS) {
                const match = line.match(pattern);
                if (match) {
                    const header = this.createHeader(match, line, i, 'lecture', pattern.source);
                    if (header) headers.push(header);
                    break;
                }
            }

            for (const pattern of STRUCTURE_ANALYSIS_PATTERNS.SECTION_HEADERS) {
                const match = line.match(pattern);
                if (match) {
                    const header = this.createHeader(match, line, i, 'section', pattern.source);
                    if (header) headers.push(header);
                    break;
                }
            }
        }

        return headers;
    }

    /**
     * Create a header from regex match
     */
    private createHeader(
        match: RegExpMatchArray,
        line: string,
        lineNumber: number,
        type: 'chapter' | 'lecture' | 'section' | 'subsection',
        pattern: string,
    ): StructureHeader | null {
        try {
            const id = uuidv4();
            const title = this.extractTitle(match, line);
            const number = this.extractNumber(match);
            const level = this.determineLevel(type, number);
            const confidence = this.calculateHeaderConfidence(match, line, type);

            const header: StructureHeader = {
                id,
                type,
                level,
                title,
                lineNumber,
                confidence,
                pattern,
                startPosition: 0,
                endPosition: line.length,
                wordCount: title.split(/\s+/).length,
                children: [],
            };

            if (number !== undefined) {
                header.number = number;
            }

            return header;
        } catch (_error) {
            return null;
        }
    }

    /**
     * Extract title from regex match
     */
    private extractTitle(match: RegExpMatchArray, line: string): string {
        // Try to get title from various capture groups
        for (let i = match.length - 1; i >= 1; i--) {
            const matchPart = match[i];
            if (matchPart && matchPart.trim().length > 0) {
                const candidate = matchPart.trim();
                if (candidate.length > 1 && !/^\d+$/.test(candidate)) {
                    return candidate;
                }
            }
        }
        return line.trim();
    }

    /**
     * Extract number from regex match
     */
    private extractNumber(match: RegExpMatchArray): string | undefined {
        // Look for numeric or roman numeral patterns
        for (let i = 1; i < match.length; i++) {
            const matchPart = match[i];
            if (matchPart && (/^\d+$/.test(matchPart) || /^[IVXLCDM]+$/i.test(matchPart))) {
                return matchPart;
            }
        }
        return undefined;
    }

    /**
     * Determine hierarchy level
     */
    private determineLevel(type: string, _number?: string): number {
        switch (type) {
            case 'chapter':
                return STRUCTURE_ANALYSIS_LEVELS.CHAPTER;
            case 'lecture':
                return STRUCTURE_ANALYSIS_LEVELS.CHAPTER;
            case 'section':
                return STRUCTURE_ANALYSIS_LEVELS.SECTION;
            case 'subsection':
                return STRUCTURE_ANALYSIS_LEVELS.SUBSECTION;
            default:
                return STRUCTURE_ANALYSIS_LEVELS.PARAGRAPH;
        }
    }

    /**
     * Calculate header confidence
     */
    private calculateHeaderConfidence(match: RegExpMatchArray, line: string, type: string): number {
        let confidence = STRUCTURE_ANALYSIS_CONFIDENCE.MEDIUM;

        // Boost confidence for well-formed headers
        if (match[1] && match[2]) confidence += 0.2;
        if (line.trim().length < 100) confidence += 0.1;
        if (type === 'chapter' && /kapitel|chapter/i.test(line)) confidence += 0.2;
        if (type === 'lecture' && /vortrag|lecture|vorlesung/i.test(line)) confidence += 0.2;

        return Math.min(1.0, confidence);
    }

    /**
     * Analyze footnotes in the text
     */
    private analyzeFootnotes(lines: string[]): StructureFootnote[] {
        const footnotes: StructureFootnote[] = [];

        for (let i = 0; i < lines.length; i++) {
            const rawLine = lines[i];
            if (!rawLine) continue;
            const line = rawLine.trim();
            if (line.length === 0) continue;

            // Check for footnote markers
            for (const pattern of STRUCTURE_ANALYSIS_PATTERNS.FOOTNOTE_MARKERS) {
                const match = line.match(pattern);
                if (match) {
                    const footnote = this.createFootnote(match, line, i, pattern.source);
                    if (footnote) footnotes.push(footnote);
                    break;
                }
            }
        }

        return footnotes;
    }

    /**
     * Create a footnote from regex match
     */
    private createFootnote(
        match: RegExpMatchArray,
        line: string,
        lineNumber: number,
        pattern: string,
    ): StructureFootnote | null {
        try {
            const reference = match[1] || match[0];
            const text = match[2] || line.substring(match[0].length).trim();
            const type = this.determineFootnoteType(reference);

            return {
                id: uuidv4(),
                reference,
                text,
                lineNumber,
                confidence: STRUCTURE_ANALYSIS_CONFIDENCE.MEDIUM,
                pattern,
                position: match.index || 0,
                type,
            };
        } catch (_error) {
            return null;
        }
    }

    /**
     * Determine footnote type
     */
    private determineFootnoteType(
        reference: string,
    ): 'numeric' | 'alphabetic' | 'symbol' | 'superscript' {
        if (/^\d+$/.test(reference)) return 'numeric';
        if (/^[a-zA-Z]$/.test(reference)) return 'alphabetic';
        if (/^[¹²³⁴⁵⁶⁷⁸⁹⁰]$/.test(reference)) return 'superscript';
        return 'symbol';
    }

    /**
     * Analyze paragraphs in the text
     */
    private analyzeParagraphs(lines: string[]): StructureParagraph[] {
        const paragraphs: StructureParagraph[] = [];
        let currentParagraph: string[] = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            if (!line || line.trim().length === 0) {
                if (currentParagraph.length > 0) {
                    const paragraph = this.createParagraph(
                        currentParagraph,
                        i - currentParagraph.length,
                    );
                    if (paragraph) paragraphs.push(paragraph);
                    currentParagraph = [];
                }
            } else {
                currentParagraph.push(line);
            }
        }

        // Handle final paragraph
        if (currentParagraph.length > 0) {
            const paragraph = this.createParagraph(
                currentParagraph,
                lines.length - currentParagraph.length,
            );
            if (paragraph) paragraphs.push(paragraph);
        }

        return paragraphs;
    }

    /**
     * Create a paragraph from lines
     */
    private createParagraph(lines: string[], startLineNumber: number): StructureParagraph | null {
        const text = lines.join(' ').trim();
        if (text.length === 0) return null;

        const firstLine = lines[0];
        if (!firstLine) return null;

        const type = this.determineParagraphType(firstLine);
        const level = this.determineParagraphLevel(firstLine);
        const markers = this.extractParagraphMarkers(firstLine);

        return {
            id: uuidv4(),
            text,
            type,
            level,
            lineNumber: startLineNumber,
            wordCount: text.split(/\s+/).length,
            hasSpecialFormatting: markers.length > 0,
            markers,
        };
    }

    /**
     * Determine paragraph type
     */
    private determineParagraphType(
        firstLine: string,
    ): 'regular' | 'numbered' | 'bulleted' | 'indented' {
        if (/^\s*\d+\.\s+/.test(firstLine)) return 'numbered';
        if (/^\s*[•*-]\s+/.test(firstLine)) return 'bulleted';
        if (/^\s{4,}/.test(firstLine)) return 'indented';
        return 'regular';
    }

    /**
     * Determine paragraph level
     */
    private determineParagraphLevel(firstLine: string): number {
        const leadingSpaces = firstLine.match(/^\s*/)?.[0].length || 0;
        return Math.floor(leadingSpaces / 4);
    }

    /**
     * Extract paragraph markers
     */
    private extractParagraphMarkers(firstLine: string): string[] {
        const markers: string[] = [];

        for (const pattern of STRUCTURE_ANALYSIS_PATTERNS.PARAGRAPH_INDICATORS) {
            const match = firstLine.match(pattern);
            if (match) {
                markers.push(match[0]);
            }
        }

        return markers;
    }

    /**
     * Analyze dialogues in the text
     */
    private analyzeDialogues(lines: string[]): StructureDialogue[] {
        const dialogues: StructureDialogue[] = [];

        for (let i = 0; i < lines.length; i++) {
            const rawLine = lines[i];
            if (!rawLine) continue;
            const line = rawLine.trim();
            if (line.length === 0) continue;

            for (const pattern of STRUCTURE_ANALYSIS_PATTERNS.DIALOGUE_MARKERS) {
                const match = line.match(pattern);
                if (match) {
                    const dialogue = this.createDialogue(match, line, i);
                    if (dialogue) dialogues.push(dialogue);
                    break;
                }
            }
        }

        return dialogues;
    }

    /**
     * Create a dialogue from regex match
     */
    private createDialogue(
        match: RegExpMatchArray,
        _line: string,
        lineNumber: number,
    ): StructureDialogue | null {
        try {
            const speaker = match[1];
            const speakerNote = match[2];
            const text = match[3] || match[2];

            if (!speaker || !text) return null;

            const dialogue: StructureDialogue = {
                id: uuidv4(),
                speaker,
                text,
                lineNumber,
                confidence: STRUCTURE_ANALYSIS_CONFIDENCE.HIGH,
            };

            if (speakerNote) {
                dialogue.speakerNote = speakerNote;
            }

            return dialogue;
        } catch (_error) {
            return null;
        }
    }

    /**
     * Build hierarchy from headers
     */
    private buildHierarchy(headers: StructureHeader[]): StructureHierarchy {
        const levels = headers.map((h) => h.level);
        const maxLevel = Math.max(...levels, 0);
        const chapterCount = headers.filter((h) => h.type === 'chapter').length;
        const sectionCount = headers.filter((h) => h.type === 'section').length;
        const subsectionCount = headers.filter((h) => h.type === 'subsection').length;

        const numberingStyle = this.determineNumberingStyle(headers);
        const hasConsistentNumbering = this.checkNumberingConsistency(headers);

        return {
            maxLevel,
            totalSections: headers.length,
            chapterCount,
            sectionCount,
            subsectionCount,
            hasConsistentNumbering,
            numberingStyle,
        };
    }

    /**
     * Determine numbering style
     */
    private determineNumberingStyle(
        headers: StructureHeader[],
    ): 'numeric' | 'roman' | 'alphabetic' | 'mixed' {
        const styles = new Set<string>();

        for (const header of headers) {
            if (header.number) {
                if (/^\d+$/.test(header.number)) styles.add('numeric');
                else if (/^[IVXLCDM]+$/i.test(header.number)) styles.add('roman');
                else if (/^[A-Z]$/i.test(header.number)) styles.add('alphabetic');
            }
        }

        if (styles.size === 0) return 'numeric';
        if (styles.size === 1) return Array.from(styles)[0] as 'numeric' | 'roman' | 'alphabetic';
        return 'mixed';
    }

    /**
     * Check numbering consistency
     */
    private checkNumberingConsistency(headers: StructureHeader[]): boolean {
        const typeGroups = headers.reduce(
            (groups, header) => {
                const currentGroup = groups[header.type];
                if (!currentGroup) {
                    groups[header.type] = [];
                }
                groups[header.type]?.push(header);
                return groups;
            },
            {} as Record<string, StructureHeader[]>,
        );

        for (const type in typeGroups) {
            const group = typeGroups[type];
            if (!group || group.length <= 1) continue;

            const numbers = group.map((h) => h.number).filter((n) => n !== undefined);
            if (numbers.length !== group.length) return false;

            // Check if numeric sequence is consistent
            const numericNumbers = numbers
                .filter((n): n is string => typeof n === 'string' && /^\d+$/.test(n))
                .map((n) => Number.parseInt(n, 10));
            if (numericNumbers.length > 1) {
                numericNumbers.sort((a, b) => a - b);
                for (let i = 1; i < numericNumbers.length; i++) {
                    const current = numericNumbers[i];
                    const previous = numericNumbers[i - 1];
                    if (current === undefined || previous === undefined) continue;
                    if (current !== previous + 1) return false;
                }
            }
        }

        return true;
    }

    /**
     * Assess structure quality
     */
    private assessStructureQuality(structure: BookStructure, lines: string[]): StructureQuality {
        const issues: StructureIssue[] = [];
        let score = 100;
        const confidence = STRUCTURE_ANALYSIS_CONFIDENCE.HIGH;

        // Check for basic structure
        if (structure.headers.length === 0) {
            issues.push({
                type: 'missing_headers',
                description: 'No headers found in document',
                severity: 'high',
            });
            score -= 30;
        }

        // Check numbering consistency
        if (!structure.hierarchy.hasConsistentNumbering) {
            issues.push({
                type: 'inconsistent_numbering',
                description: 'Inconsistent numbering scheme detected',
                severity: 'medium',
            });
            score -= 15;
        }

        // Check for orphaned footnotes
        const footnoteRefs = structure.footnotes.map((f) => f.reference);
        const textContent = lines.join(' ');
        for (const ref of footnoteRefs) {
            if (!textContent.includes(`[${ref}]`) && !textContent.includes(`(${ref})`)) {
                issues.push({
                    type: 'orphaned_footnotes',
                    description: `Footnote ${ref} has no reference in text`,
                    severity: 'low',
                });
                score -= 5;
            }
        }

        const completeness = Math.min(1.0, structure.headers.length / 10);
        const consistency = structure.hierarchy.hasConsistentNumbering ? 1.0 : 0.5;

        return {
            score: Math.max(0, score),
            confidence,
            issues,
            completeness,
            consistency,
        };
    }

    /**
     * Analyze patterns in the structure
     */
    private analyzePatterns(structure: BookStructure, lines: string[]): StructureAnalysis {
        const headerPatterns = this.analyzeHeaderPatterns(structure.headers);
        const footnotePatterns = this.analyzeFootnotePatterns(structure.footnotes);
        const paragraphPatterns = this.analyzeParagraphPatterns(structure.paragraphs);
        const dialoguePatterns = this.analyzeDialoguePatterns(structure.dialogues);

        const structuralFeatures = this.identifyStructuralFeatures(structure, lines);
        const recommendations = this.generateRecommendations(structure);

        return {
            headerPatterns,
            footnotePatterns,
            paragraphPatterns,
            dialoguePatterns,
            structuralFeatures,
            recommendations,
        };
    }

    /**
     * Analyze header patterns
     */
    private analyzeHeaderPatterns(headers: StructureHeader[]): PatternAnalysis[] {
        const patterns = new Map<string, { count: number; examples: string[] }>();

        for (const header of headers) {
            if (!patterns.has(header.pattern)) {
                patterns.set(header.pattern, { count: 0, examples: [] });
            }
            const pattern = patterns.get(header.pattern);
            if (pattern) {
                pattern.count++;
                if (pattern.examples.length < 3) {
                    pattern.examples.push(header.title);
                }
            }
        }

        return Array.from(patterns.entries()).map(([pattern, data]) => ({
            pattern,
            matches: data.count,
            confidence:
                data.count > 1
                    ? STRUCTURE_ANALYSIS_CONFIDENCE.HIGH
                    : STRUCTURE_ANALYSIS_CONFIDENCE.MEDIUM,
            examples: data.examples,
        }));
    }

    /**
     * Analyze footnote patterns
     */
    private analyzeFootnotePatterns(footnotes: StructureFootnote[]): PatternAnalysis[] {
        const patterns = new Map<string, { count: number; examples: string[] }>();

        for (const footnote of footnotes) {
            if (!patterns.has(footnote.pattern)) {
                patterns.set(footnote.pattern, { count: 0, examples: [] });
            }
            const pattern = patterns.get(footnote.pattern);
            if (!pattern) continue;
            pattern.count++;
            if (pattern.examples.length < 3) {
                pattern.examples.push(footnote.reference);
            }
        }

        return Array.from(patterns.entries()).map(([pattern, data]) => ({
            pattern,
            matches: data.count,
            confidence:
                data.count > 1
                    ? STRUCTURE_ANALYSIS_CONFIDENCE.HIGH
                    : STRUCTURE_ANALYSIS_CONFIDENCE.MEDIUM,
            examples: data.examples,
        }));
    }

    /**
     * Analyze paragraph patterns
     */
    private analyzeParagraphPatterns(paragraphs: StructureParagraph[]): PatternAnalysis[] {
        const typeCount = paragraphs.reduce(
            (counts, p) => {
                counts[p.type] = (counts[p.type] || 0) + 1;
                return counts;
            },
            {} as Record<string, number>,
        );

        return Object.entries(typeCount).map(([type, count]) => ({
            pattern: `${type}_paragraph`,
            matches: count,
            confidence:
                count > 5
                    ? STRUCTURE_ANALYSIS_CONFIDENCE.HIGH
                    : STRUCTURE_ANALYSIS_CONFIDENCE.MEDIUM,
            examples: paragraphs
                .filter((p) => p.type === type)
                .slice(0, 3)
                .map((p) => p.text.substring(0, 50)),
        }));
    }

    /**
     * Analyze dialogue patterns
     */
    private analyzeDialoguePatterns(dialogues: StructureDialogue[]): PatternAnalysis[] {
        const speakers = new Map<string, number>();

        for (const dialogue of dialogues) {
            speakers.set(dialogue.speaker, (speakers.get(dialogue.speaker) || 0) + 1);
        }

        return [
            {
                pattern: 'dialogue_format',
                matches: dialogues.length,
                confidence:
                    dialogues.length > 0
                        ? STRUCTURE_ANALYSIS_CONFIDENCE.HIGH
                        : STRUCTURE_ANALYSIS_CONFIDENCE.LOW,
                examples: Array.from(speakers.keys()).slice(0, 5),
            },
        ];
    }

    /**
     * Identify structural features
     */
    private identifyStructuralFeatures(
        _structure: BookStructure,
        lines: string[],
    ): StructuralFeature[] {
        const features: StructuralFeature[] = [];

        // Table of contents detection
        const tocLines = lines.filter((line) =>
            /inhaltsverzeichnis|table of contents|contents/i.test(line),
        );
        if (tocLines.length > 0) {
            features.push({
                type: 'table_of_contents',
                description: 'Table of contents detected',
                count: tocLines.length,
                confidence: STRUCTURE_ANALYSIS_CONFIDENCE.HIGH,
                examples: tocLines.slice(0, 3),
            });
        }

        // Bibliography detection
        const bibLines = lines.filter((line) =>
            /literaturverzeichnis|bibliography|references|sources/i.test(line),
        );
        if (bibLines.length > 0) {
            features.push({
                type: 'bibliography',
                description: 'Bibliography section detected',
                count: bibLines.length,
                confidence: STRUCTURE_ANALYSIS_CONFIDENCE.HIGH,
                examples: bibLines.slice(0, 3),
            });
        }

        // Index detection
        const indexLines = lines.filter((line) =>
            /^(index|register|stichwortverzeichnis)/i.test(line),
        );
        if (indexLines.length > 0) {
            features.push({
                type: 'index',
                description: 'Index section detected',
                count: indexLines.length,
                confidence: STRUCTURE_ANALYSIS_CONFIDENCE.HIGH,
                examples: indexLines.slice(0, 3),
            });
        }

        return features;
    }

    /**
     * Generate recommendations
     */
    private generateRecommendations(structure: BookStructure): string[] {
        const recommendations: string[] = [];

        if (structure.headers.length === 0) {
            recommendations.push(
                'Consider adding chapter or section headers for better organization',
            );
        }

        if (structure.footnotes.length > 0 && structure.footnotes.length > 20) {
            recommendations.push(
                'Large number of footnotes detected - consider consolidating or moving to endnotes',
            );
        }

        if (!structure.hierarchy.hasConsistentNumbering) {
            recommendations.push('Standardize numbering scheme across all headers');
        }

        if (structure.dialogues.length > 0) {
            recommendations.push(
                'Dialogue format detected - ensure consistent speaker identification',
            );
        }

        return recommendations;
    }
}
