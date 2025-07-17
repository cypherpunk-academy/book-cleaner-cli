/**
 * Core types and interfaces for the Book Cleaner CLI
 */

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

export type SupportedFormat = 'pdf' | 'epub' | 'txt' | 'docx';

// ==================== Pipeline Types ====================

export interface PipelineConfig {
    inputFile: string;
    outputDir: string;
    author?: string;
    title?: string;
    bookIndex?: string;
    verbose: boolean;
    debug: boolean;
    logLevel: LogLevel;
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

export interface OCRWord {
    text: string;
    confidence: number;
    boundingBox: BoundingBox;
}

export interface BoundingBox {
    x: number;
    y: number;
    width: number;
    height: number;
}

// ==================== Configuration Types ====================

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
    author?: string;
    title?: string;
    bookIndex?: string;
    verbose?: boolean;
    debug?: boolean;
    logLevel?: LogLevel;
    config?: string;
    phases?: string[];
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
