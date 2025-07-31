/**
 * Core types and interfaces for the Book Cleaner CLI
 */

import { PAGE_METRICS_TYPES } from '@/constants';

// ==================== File and Format Types ====================

export interface FileInfo {
    path: string;
    name: string;
    size: number;
    format: SupportedFormat;
    encoding?: string;
    mimeType: string;
    lastModified: Date;
}

export interface FilenameMetadata {
    author: string;
    title: string;
    bookIndex?: string;
    originalFilename: string;
}

export type SupportedFormat = 'pdf' | 'epub' | 'txt';

// ==================== Pipeline Types ====================

export interface PipelineConfig {
    inputFile: string;
    outputDir: string;
    bookType: string;
    author?: string;
    title?: string;
    bookIndex?: string;
    verbose: boolean;
    debug: boolean;
    logLevel: LogLevel;
    skipStartMarker?: boolean;
    phases: {
        dataLoading: boolean;
        textNormalization: boolean;
        evaluation: boolean;
        aiEnhancements: boolean;
    };
}

export interface PipelineState {
    id: string;
    inputFile: string;
    outputDir: string;
    bookType: string;
    skipStartMarker?: boolean;
    currentPhase: number;
    totalPhases: number;
    status: PipelineStatus;
    startTime: Date;
    endTime?: Date;
    error?: string;
    metadata: ProcessingMetadata;
    results: PhaseResult[];
}

export type PipelineStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface PhaseResult {
    phase: number;
    name: string;
    status: PipelineStatus;
    startTime: Date;
    endTime?: Date;
    duration?: number;
    error?: string;
    output?: unknown;
    metrics?: Record<string, unknown>;
}

// ==================== Processing Types ====================

export interface ProcessingMetadata {
    author: string;
    title: string;
    bookIndex?: string;
    originalFormat: SupportedFormat;
    fileSize: number;
    totalPages?: number;
    chapters?: ChapterInfo[];
    footnotes?: FootnoteInfo[];
    textBoundaries?: TextBoundaryInfo;
    processingTime?: number;
    qualityScore?: number;
}

export interface ChapterInfo {
    number: number;
    title: string;
    startPage?: number;
    endPage?: number;
    wordCount: number;
    level: number;
}

export interface FootnoteInfo {
    id: string;
    page: number;
    text: string;
    reference: string;
}

export interface TextBoundaryInfo {
    paragraphMarkers: string[];
    sectionMarkers: string[];
    chapterMarkers: string[];
}

// ==================== Text Processing Types ====================

export interface TextExtractionResult {
    text: string;
    metadata: TextMetadata;
    quality: TextQuality;
    source: TextSource;
}

export interface TextMetadata {
    pageCount: number;
    wordCount: number;
    characterCount: number;
    encoding: string;
    language?: string;
    confidence?: number;
}

export interface TextQuality {
    score: number;
    issues: QualityIssue[];
    confidence: number;
    readability: number;
}

export interface QualityIssue {
    type: QualityIssueType;
    description: string;
    severity: 'low' | 'medium' | 'high';
    location?: {
        page?: number;
        line?: number;
        column?: number;
    };
}

export type QualityIssueType =
    | 'encoding'
    | 'corruption'
    | 'ocr_error'
    | 'formatting'
    | 'missing_text'
    | 'duplicate_text';

export type TextSource = 'embedded' | 'ocr' | 'hybrid';

// ==================== OCR Types ====================

export interface OCRResult {
    text: string;
    confidence: number;
    metadata: OCRMetadata;
    paragraphs: OCRParagraph[];
}

export interface OCRMetadata {
    engine: string;
    language: string;
    processingTime: number;
    pageCount: number;
    averageConfidence: number;
}

export interface OCRParagraph {
    text: string;
    confidence: number;
    boundingBox: BoundingBox;
    words: OCRWord[];
}

export interface BoundingBox {
    x: number;
    y: number;
    width: number;
    height: number;
}

// ==================== OCR Header Detection Types ====================

/**
 * OCR Line structure from Tesseract
 */
export type OCRLine = {
    text: string;
    confidence: number;
    bbox: { x0: number; y0: number; x1: number; y1: number };
    words?: OCRWord[];
};

/**
 * OCR Word structure from Tesseract (for header detection)
 */
export type OCRWord = {
    text: string;
    confidence: number;
    bbox: { x0: number; y0: number; x1: number; y1: number };
};

/**
 * Book type configuration structure
 */
export type BookTypeConfig = {
    description: string;
    headerTypes?: {
        level1?: HeaderTypeDefinition;
        level2?: HeaderTypeDefinition;
        level3?: HeaderTypeDefinition;
    };
    textRemovalPatterns: string[];
    metrics?: PageMetricsConfig;
};

/**
 * Header type definition
 */
export type HeaderTypeDefinition = {
    formats: HeaderFormat[];
};

/**
 * Header format
 */
export type HeaderFormat = {
    pattern: string;
    alignment?: string;
    example?: string;
    multipleLines?: boolean;
};

/**
 * Pattern match result
 */
export type PatternMatch = {
    matched: boolean;
    extractedValues: Record<string, string>;
    fullMatch: string;
};

/**
 * Header detection result
 */
export type HeaderResult = {
    headerText: string;
    level: number;
    newLineIndex: number;
};

// ==================== Page Metrics Types ====================

export interface PageMetrics {
    expectedX0: number;
    tolerance: number;
    averageWidth?: number;
}

export interface PageMetricsData {
    minX0: number;
    maxX0: number;
    averageWidth?: number;
    maxWidth?: number;
}

export interface PageMetricsConfig {
    [PAGE_METRICS_TYPES.PARAGRAPH_TEXT]: PageMetrics;
    [PAGE_METRICS_TYPES.PARAGRAPH_START]: PageMetrics;
    [PAGE_METRICS_TYPES.FOOTNOTE_TEXT]: PageMetrics;
    [PAGE_METRICS_TYPES.FOOTNOTE_START]: PageMetrics;
    [PAGE_METRICS_TYPES.QUOTE_TEXT]: PageMetrics;
}

// ==================== Document Processing Types ====================

export interface MammothMessage {
    type: 'warning' | 'error';
    message: string;
    error?: unknown;
}

export interface PDFValidationResult extends ValidationResult {
    contentType: 'text_based' | 'image_based' | 'hybrid' | 'empty';
    hasEmbeddedText: boolean;
    pageCount: number;
    textSample?: string;
}

export interface EPUBData {
    metadata: {
        title?: string;
        creator?: string;
        description?: string;
        language?: string;
        publisher?: string;
        date?: string;
    };
    flow: Array<{
        id: string;
        href: string;
        mime?: string;
    }>;
    toc: Array<{
        title: string;
        href: string;
    }>;
    on: (event: string, callback: (error?: Error) => void) => void;
    getChapter: (chapterId: string, callback: (error: Error | null, text?: string) => void) => void;
    parse: () => void;
}

// ==================== Configuration Types ====================

/**
 * Raw book structure YAML interface
 */
export interface BookManifest {
    author?: string;
    title?: string;
    'book-index'?: string;
    'text-before-first-chapter'?: string;
    'text-after-last-chapter'?: string;
    [key: string]: unknown;
}

/**
 * Comprehensive book manifest information extracted from YAML files
 * Consolidates BookStructureInfo and BookManifest with all YAML structure types
 */
export interface BookManifestInfo {
    // Basic book metadata
    author: string;
    title: string;
    bookIndex?: string;

    // Text boundary markers for extraction
    textBeforeFirstChapter?: string;
    textAfterLastChapter?: string;

    // Original file information
    original?: {
        format?: string;
        size?: number;
        pages?: number;
        'book-type'?: string;
    };

    // Book structure information (simple array format)
    'book-structure'?: string[];

    // Footnotes information
    footnotes?: string[];

    // Additional metadata (for extensibility)
    [key: string]: unknown;
}

/**
 * Book structure section (header with paragraphs)
 */
export interface BookStructureSection {
    header: string; // The header text (e.g., "# I EINLEITUNG", "## Metamorphose")
    paragraphs: string[]; // Array of first 5 words of each paragraph
}

/**
 * Book structure item (chapter, sub-chapter, paragraph, etc.)
 */
export interface BookStructureItem {
    type: 'chapter' | 'sub-chapter' | 'paragraph';
    title?: string | null;
    number?: string | null;
    content?: BookStructureItem[];
    firstFiveWords?: string | null;
}

/**
 * Book footnote information
 */
export interface BookFootnote {
    index: number;
    originalIndex: number;
    marker: string[];
    footnote: string[];
}

export interface BookConfig {
    author: string;
    title: string;
    textBoundaries: TextBoundaryConfig;
    processing: ProcessingConfig;
    ai: AIConfig;
    output: OutputConfig;
}

export interface TextBoundaryConfig {
    paragraphMarkers: string[];
    sectionMarkers: string[];
    chapterMarkers: string[];
    footnoteMarkers: string[];
}

export interface ProcessingConfig {
    ocr: OCRConfig;
    textCleaning: TextCleaningConfig;
    quality: QualityConfig;
}

export type OCREngine = 'tesseract' | 'paddleocr';

export interface OCRConfig {
    enabled: boolean;
    engine: OCREngine;
    language: string;
    confidence: number;
    preprocessor: {
        deskew: boolean;
        denoise: boolean;
        enhance: boolean;
    };
}

export interface TextCleaningConfig {
    removeHeaders: boolean;
    removeFooters: boolean;
    normalizeWhitespace: boolean;
    fixEncoding: boolean;
    modernizeSpelling: boolean;
}

export interface QualityConfig {
    minimumConfidence: number;
    requireManualReview: boolean;
    failOnLowQuality: boolean;
}

export type AIProvider = 'deepseek' | 'openai' | 'anthropic';

export interface AIConfig {
    provider: AIProvider;
    model: string;
    apiKey: string;
    baseUrl?: string;
    temperature: number;
    maxTokens: number;
    retries: number;
    timeout: number;
}

export type OutputFormat = 'markdown' | 'html' | 'text';

export interface OutputConfig {
    format: OutputFormat;
    includeMetadata: boolean;
    includeFootnotes: boolean;
    includeTableOfContents: boolean;
    filenamePattern: string;
}

// ==================== Logging Types ====================

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface LoggerConfig {
    level: LogLevel;
    pretty: boolean;
    timestamp: boolean;
    tags: Record<string, LogLevel>;
}

export interface LogContext {
    component: string;
    operation: string;
    correlationId?: string;
    metadata?: Record<string, unknown>;
}

// ==================== Error Types ====================

export interface AppError extends Error {
    code: string;
    component: string;
    operation: string;
    context?: Record<string, unknown>;
    cause?: Error;
}

export type ErrorCode =
    | 'FILE_NOT_FOUND'
    | 'INVALID_FORMAT'
    | 'EXTRACTION_FAILED'
    | 'OCR_FAILED'
    | 'CONFIG_INVALID'
    | 'PIPELINE_FAILED'
    | 'API_ERROR'
    | 'VALIDATION_ERROR';

// ==================== Progress Types ====================

export interface ProgressInfo {
    current: number;
    total: number;
    percentage: number;
    message: string;
    phase: string;
    step: string;
    estimatedTimeRemaining?: number;
}

export type ProgressCallback = (progress: ProgressInfo) => void;

// ==================== CLI Types ====================

export interface CLIOptions {
    inputFile: string;
    outputDir?: string;
    bookType: string;
    verbose?: boolean;
    debug?: boolean;
    logLevel?: LogLevel;
    config?: string;
    skipStartMarker?: boolean;
}

export interface CLIContext {
    options: CLIOptions;
    config: PipelineConfig;
    logger: unknown; // Will be typed properly in LoggerService
}

// ==================== Utility Types ====================

export type Awaitable<T> = T | Promise<T>;

export type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

export type RequiredKeys<T> = {
    [K in keyof T]-?: Record<string, never> extends Pick<T, K> ? never : K;
}[keyof T];

export type OptionalKeys<T> = {
    [K in keyof T]-?: Record<string, never> extends Pick<T, K> ? K : never;
}[keyof T];

export type DeepPartial<T> = {
    [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type NonEmptyArray<T> = [T, ...T[]];

// ==================== Structure Analysis Types ====================

export interface StructureAnalysisResult {
    filename: string;
    format: SupportedFormat;
    metadata: BookMetadata;
    structure: BookStructure;
    quality: StructureQuality;
    analysis: StructureAnalysis;
    extractedText: string;
    analysisTime: number;
}

export interface BookMetadata {
    title?: string;
    author?: string;
    publisher?: string;
    language?: string;
    pageCount?: number;
    wordCount: number;
    characterCount: number;
    encoding?: string;
    creationDate?: Date;
    detectedLanguage: string;
}

export interface BookStructure {
    headers: StructureHeader[];
    footnotes: StructureFootnote[];
    paragraphs: StructureParagraph[];
    dialogues: StructureDialogue[];
    tableOfContents?: TableOfContents;
    hierarchy: StructureHierarchy;
}

export interface StructureHeader {
    id: string;
    type: 'chapter' | 'lecture' | 'section' | 'subsection';
    level: number;
    title: string;
    number?: string;
    pageNumber?: number;
    lineNumber: number;
    confidence: number;
    pattern: string;
    startPosition: number;
    endPosition: number;
    wordCount: number;
    children: StructureHeader[];
}

export interface StructureFootnote {
    id: string;
    reference: string;
    text: string;
    pageNumber?: number;
    lineNumber: number;
    confidence: number;
    pattern: string;
    position: number;
    type: 'numeric' | 'alphabetic' | 'symbol' | 'superscript';
}

export interface StructureParagraph {
    id: string;
    text: string;
    type: 'regular' | 'numbered' | 'bulleted' | 'indented';
    level: number;
    lineNumber: number;
    wordCount: number;
    hasSpecialFormatting: boolean;
    markers: string[];
}

export interface StructureDialogue {
    id: string;
    speaker: string;
    text: string;
    lineNumber: number;
    speakerNote?: string;
    confidence: number;
}

export interface TableOfContents {
    entries: TOCEntry[];
    startPage?: number;
    endPage?: number;
    confidence: number;
}

export interface TOCEntry {
    title: string;
    level: number;
    pageNumber?: number;
    children: TOCEntry[];
}

export interface StructureHierarchy {
    maxLevel: number;
    totalSections: number;
    chapterCount: number;
    sectionCount: number;
    subsectionCount: number;
    hasConsistentNumbering: boolean;
    numberingStyle: 'numeric' | 'roman' | 'alphabetic' | 'mixed';
}

export interface StructureQuality {
    score: number;
    confidence: number;
    issues: StructureIssue[];
    completeness: number;
    consistency: number;
}

export interface StructureIssue {
    type:
        | 'missing_headers'
        | 'inconsistent_numbering'
        | 'orphaned_footnotes'
        | 'malformed_structure';
    description: string;
    severity: 'low' | 'medium' | 'high';
    location?: {
        line?: number;
        page?: number;
    };
}

export interface StructureAnalysis {
    headerPatterns: PatternAnalysis[];
    footnotePatterns: PatternAnalysis[];
    paragraphPatterns: PatternAnalysis[];
    dialoguePatterns: PatternAnalysis[];
    structuralFeatures: StructuralFeature[];
    recommendations: string[];
}

export interface PatternAnalysis {
    pattern: string;
    matches: number;
    confidence: number;
    examples: string[];
}

export interface StructuralFeature {
    type: string;
    description: string;
    count: number;
    confidence: number;
    examples: string[];
}

// ==================== File Format Detection Types ====================

export interface FileFormatResult {
    format: SupportedFormat;
    mimeType: string;
    isValid: boolean;
    confidence: number;
    issues: string[];
    metadata: FileFormatMetadata;
}

export interface FileFormatMetadata {
    hasEmbeddedText?: boolean;
    encoding?: string;
    version?: string;
    pageCount?: number;
    contentType?: string;
    fileSize: number;
    hasImages?: boolean;
    estimatedImageCount?: number;
    imagePages?: number[];
    textPages?: number[];
    textCoverage?: number;
    security?: {
        hasDRM?: boolean;
        isCorrupted?: boolean;
        exceedsSize?: boolean;
    };
}

export interface ValidationResult {
    isValid: boolean;
    issues: ValidationIssue[];
    metadata: Record<string, unknown>;
}

export interface ValidationIssue {
    type: 'error' | 'warning' | 'info';
    message: string;
    details?: Record<string, unknown>;
}

export interface MagicNumberResult {
    format: SupportedFormat | null;
    confidence: number;
    detectedAt: number;
}

export interface PDFValidationResult extends ValidationResult {
    metadata: {
        pageCount: number;
        hasEmbeddedText: boolean;
        contentType: 'text_based' | 'image_based' | 'hybrid' | 'empty';
        version: string;
        title?: string;
        author?: string;
        creationDate?: Date;
        textCoverage: number; // Percentage of pages with text
        hasImages: boolean;
        estimatedImageCount: number;
        imagePages: number[];
        textPages: number[];
    };
}

export interface EPUBValidationResult extends ValidationResult {
    metadata: {
        version: string;
        hasChapters: boolean;
        hasDRM: boolean;
        title?: string;
        author?: string;
        publisher?: string;
        language?: string;
        chapterCount: number;
        hasTableOfContents: boolean;
    };
}

export interface TextValidationResult extends ValidationResult {
    metadata: {
        encoding: string;
        lineCount: number;
        wordCount: number;
        characterCount: number;
        hasEncodingIssues: boolean;
        hasBinaryContent: boolean;
        lineEndings: 'unix' | 'windows' | 'mac' | 'mixed';
    };
}
