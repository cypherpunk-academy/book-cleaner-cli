/**
 * Constants for the Book Cleaner CLI
 * All string constants should be defined here to avoid magic strings in code
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ==================== Application Constants ====================

// Read version from package.json
let packageJson: { version: string } = { version: '0.1.0' };

// For now, hardcode the version to fix the immediate issue
// TODO: Fix package.json path resolution for dynamic version loading
packageJson = { version: '0.1.0' };

export const APP_NAME = 'Book Cleaner CLI';
export const APP_VERSION = packageJson.version;
export const APP_DESCRIPTION =
    'Transform raw book sources into clean, readable Markdown with comprehensive metadata';

// ==================== File and Format Constants ====================

export const SUPPORTED_FORMATS = ['pdf', 'epub', 'txt'] as const;

export const MIME_TYPES = {
    PDF: 'application/pdf',
    EPUB: 'application/epub+zip',
    TXT: 'text/plain',
} as const;

export const FILE_EXTENSIONS = {
    PDF: '.pdf',
    EPUB: '.epub',
    TXT: '.txt',
} as const;

// ==================== Pipeline Constants ====================

export const PIPELINE_PHASES = {
    DATA_LOADING: 'data_loading',
    TEXT_NORMALIZATION: 'text_normalization',
    EVALUATION: 'evaluation',
    AI_ENHANCEMENTS: 'ai_enhancements',
} as const;

export const PIPELINE_PHASE_NAMES = {
    [PIPELINE_PHASES.DATA_LOADING]: 'Data Loading & Preprocessing',
    [PIPELINE_PHASES.TEXT_NORMALIZATION]: 'Text Normalization & AI Cleaning',
    [PIPELINE_PHASES.EVALUATION]: 'Evaluation & Analysis',
    [PIPELINE_PHASES.AI_ENHANCEMENTS]: 'AI Enhancements',
} as const;

export const PIPELINE_STATUS = {
    PENDING: 'pending',
    RUNNING: 'running',
    COMPLETED: 'completed',
    FAILED: 'failed',
    CANCELLED: 'cancelled',
} as const;

// ==================== Configuration Constants ====================

export const DEFAULT_ARTIFACTS_DIR = 'book-artifacts';
export const DEFAULT_BOOK_MANIFEST_FILE = 'default-book-manifest.yaml';
export const BOOK_MANIFEST_FILE = 'book-manifest.yaml';
export const CONFIG_FILE_EXTENSION = '.yaml';

export const DEFAULT_OUTPUT_DIR = 'output';
export const DEFAULT_LOG_LEVEL = 'info';
export const DEFAULT_FILENAME_PATTERN = '{author}#{title}[#{bookIndex}]-{timestamp}';

// ==================== Book Artifacts Structure Constants ====================

export const ARTIFACTS_STRUCTURE = {
    BASE_DIR: DEFAULT_ARTIFACTS_DIR,
    DEFAULT_MANIFEST: DEFAULT_BOOK_MANIFEST_FILE,
    BOOK_MANIFEST: BOOK_MANIFEST_FILE,
    PHASE_DIRS: {
        PHASE1: 'phase1',
        PHASE2: 'phase2',
        PHASE3: 'phase3',
    },
    CACHE_FILES: {
        OCR_CACHE: 'ocr-cache.txt',
        TEXT_CACHE: 'text-cache.txt',
        FINAL_RESULT: 'final-result.md',
        PROCESSING_METADATA: 'processing-metadata.json',
    },
} as const;

// ==================== Logging Constants ====================

export const LOG_LEVELS = {
    DEBUG: 'debug',
    INFO: 'info',
    WARN: 'warn',
    ERROR: 'error',
    FATAL: 'fatal',
} as const;

export const LOG_TAGS = {
    PIPELINE: 'pipeline',
    FILE_PROCESSING: 'file_processing',
    TEXT_EXTRACTION: 'text_extraction',
    OCR: 'ocr',
    CONFIG: 'config',
    CLI: 'cli',
    ERROR: 'error',
} as const;

export const LOG_COMPONENTS = {
    PIPELINE_MANAGER: 'PipelineManager',
    FILE_HANDLER: 'FileHandler',
    TEXT_EXTRACTOR: 'TextExtractor',
    OCR_SERVICE: 'OCRService',
    CONFIG_SERVICE: 'ConfigService',
    LOGGER_SERVICE: 'LoggerService',
    CLI_COMMAND: 'CLICommand',
} as const;

// ==================== Error Constants ====================

export const ERROR_CODES = {
    FILE_NOT_FOUND: 'FILE_NOT_FOUND',
    INVALID_FORMAT: 'INVALID_FORMAT',
    EXTRACTION_FAILED: 'EXTRACTION_FAILED',
    OCR_FAILED: 'OCR_FAILED',
    CONFIG_INVALID: 'CONFIG_INVALID',
    PIPELINE_FAILED: 'PIPELINE_FAILED',
    API_ERROR: 'API_ERROR',
    VALIDATION_ERROR: 'VALIDATION_ERROR',
} as const;

export const ERROR_MESSAGES = {
    [ERROR_CODES.FILE_NOT_FOUND]: 'The specified file was not found: {path}',
    [ERROR_CODES.INVALID_FORMAT]: 'Unsupported file format: {format}',
    [ERROR_CODES.EXTRACTION_FAILED]: 'Failed to extract text from file: {path}',
    [ERROR_CODES.OCR_FAILED]: 'OCR processing failed for file: {path}',
    [ERROR_CODES.CONFIG_INVALID]: 'Invalid configuration: {details}',
    [ERROR_CODES.PIPELINE_FAILED]: 'Pipeline execution failed: {phase}',
    [ERROR_CODES.API_ERROR]: 'API call failed: {endpoint}',
    [ERROR_CODES.VALIDATION_ERROR]: 'Validation failed: {field}',
} as const;

// ==================== OCR Constants ====================

export const OCR_ENGINES = {
    TESSERACT: 'tesseract',
    PADDLEOCR: 'paddleocr',
} as const;

export const OCR_LANGUAGES = {
    ENGLISH: 'eng',
    GERMAN: 'deu',
    FRENCH: 'fra',
    SPANISH: 'spa',
    ITALIAN: 'ita',
    AUTO: 'auto',
} as const;

export const OCR_CONFIDENCE_THRESHOLDS = {
    LOW: 0.5,
    MEDIUM: 0.7,
    HIGH: 0.9,
} as const;

export const OCR_PAGE_WIDTH = 2480; // A4 at 300 DPI
export const OCR_PAGE_HEIGHT = 3508;

// Header width validation
export const HEADER_MAX_WIDTH_RATIO = 0.9; // Headers can only use max 90% of normal text width

// Page layout metrics - relative x0 positions for different text types
export const PAGE_METRICS_TYPES = {
    PARAGRAPH_TEXT: 'paragraph-text',
    PARAGRAPH_START: 'paragraph-start',
    FOOTNOTE_TEXT: 'footnote-text',
    FOOTNOTE_START: 'footnote-start',
    QUOTE_TEXT: 'quote-text',
} as const;

// ==================== Text Processing Constants ====================

export const TEXT_SOURCES = {
    EMBEDDED: 'embedded',
    OCR: 'ocr',
    HYBRID: 'hybrid',
} as const;

export const QUALITY_ISSUE_TYPES = {
    ENCODING: 'encoding',
    CORRUPTION: 'corruption',
    OCR_ERROR: 'ocr_error',
    FORMATTING: 'formatting',
    MISSING_TEXT: 'missing_text',
    DUPLICATE_TEXT: 'duplicate_text',
} as const;

export const QUALITY_SEVERITIES = {
    LOW: 'low',
    MEDIUM: 'medium',
    HIGH: 'high',
} as const;

// ==================== Default Text Boundaries ====================

export const DEFAULT_PARAGRAPH_MARKERS = ['\\n\\n', '\\r\\n\\r\\n', '\\n\\r\\n\\r'] as const;

export const DEFAULT_SECTION_MARKERS = ['***', '---', '===', '~~~'] as const;

export const DEFAULT_CHAPTER_MARKERS = [
    'Kapitel',
    'Chapter',
    'Teil',
    'Part',
    'Abschnitt',
    'Section',
] as const;

export const DEFAULT_FOOTNOTE_MARKERS = ['\\d+\\)', '\\d+\\.', '\\*\\d+', '\\[\\d+\\]'] as const;

// ==================== AI Provider Constants ====================

export const AI_PROVIDERS = {
    DEEPSEEK: 'deepseek',
    OPENAI: 'openai',
    ANTHROPIC: 'anthropic',
} as const;

export const AI_MODELS = {
    DEEPSEEK: {
        CHAT: 'deepseek-chat',
        CODER: 'deepseek-coder',
    },
    OPENAI: {
        GPT35_TURBO: 'gpt-3.5-turbo',
        GPT4: 'gpt-4',
        GPT4_TURBO: 'gpt-4-turbo',
    },
    ANTHROPIC: {
        CLAUDE_3_HAIKU: 'claude-3-haiku-20240307',
        CLAUDE_3_SONNET: 'claude-3-sonnet-20240229',
        CLAUDE_3_OPUS: 'claude-3-opus-20240229',
    },
} as const;

export const DEFAULT_AI_CONFIG = {
    TEMPERATURE: 0.1,
    MAX_TOKENS: 4000,
    RETRIES: 3,
    TIMEOUT: 30000,
} as const;

// ==================== Output Format Constants ====================

export const OUTPUT_FORMATS = {
    MARKDOWN: 'markdown',
    HTML: 'html',
    TEXT: 'text',
} as const;

export const OUTPUT_EXTENSIONS = {
    [OUTPUT_FORMATS.MARKDOWN]: '.md',
    [OUTPUT_FORMATS.HTML]: '.html',
    [OUTPUT_FORMATS.TEXT]: '.txt',
} as const;

// ==================== Progress Constants ====================

export const PROGRESS_PHASES = {
    INITIALIZATION: 'Initialization',
    FILE_LOADING: 'File Loading',
    TEXT_EXTRACTION: 'Text Extraction',
    OCR_PROCESSING: 'OCR Processing',
    QUALITY_ASSESSMENT: 'Quality Assessment',
    TEXT_CLEANING: 'Text Cleaning',
    METADATA_GENERATION: 'Metadata Generation',
    OUTPUT_GENERATION: 'Output Generation',
} as const;

// ==================== Validation Constants ====================

export const VALIDATION_PATTERNS = {
    AUTHOR_TITLE_SEPARATOR: '#',
    BOOK_INDEX_PREFIX: '#',
    FILENAME_CHARS: /^[a-zA-Z0-9_\-#\s\.]+$/,
    CHAPTER_NUMBER: /^(\d+)\.?(\d+)?$/,
    FOOTNOTE_REFERENCE: /^\d+$/,
    FILENAME_METADATA: /^([^#]+)#([^#]+)(?:#([^#]+))?$/,
} as const;

export const VALIDATION_LIMITS = {
    MAX_FILENAME_LENGTH: 255,
    MAX_AUTHOR_LENGTH: 100,
    MAX_TITLE_LENGTH: 200,
    MAX_BOOK_INDEX_LENGTH: 20,
    MIN_TEXT_LENGTH: 100,
    MAX_TEXT_LENGTH: 10000000, // 10MB
    MAX_CHAPTERS: 1000,
    MAX_FOOTNOTES: 10000,
} as const;

// ==================== CLI Constants ====================

export const CLI_COMMANDS = {
    CLEAN_BOOK: 'clean-book',
    VERSION: 'version',
    HELP: 'help',
} as const;

export const CLI_OPTIONS = {
    INPUT_FILE: 'input-file',
    OUTPUT_DIR: 'output-dir',
    BOOK_TYPE: 'book-type',
    VERBOSE: 'verbose',
    DEBUG: 'debug',
    LOG_LEVEL: 'log-level',
    CONFIG: 'config',
} as const;

export const CLI_ALIASES = {
    [CLI_OPTIONS.OUTPUT_DIR]: 'o',
    [CLI_OPTIONS.BOOK_TYPE]: 'b',
    [CLI_OPTIONS.VERBOSE]: 'v',
    [CLI_OPTIONS.DEBUG]: 'd',
    [CLI_OPTIONS.LOG_LEVEL]: 'l',
    [CLI_OPTIONS.CONFIG]: 'c',
} as const;

// Valid book types
export const BOOK_TYPES = {
    RUDOLF_STEINER_GA_WERK: 'rudolf-steiner-ga-werk',
    RUDOLF_STEINER_GA_VORTRAG: 'rudolf-steiner-ga-vortrag',
    GOOGLE_PLAY_EBOOK: 'google-play-ebook',
} as const;

export const VALID_BOOK_TYPES = Object.values(BOOK_TYPES) as readonly string[];

// ==================== File System Constants ====================

export const TEMP_DIR_PREFIX = 'book-cleaner-';
export const BACKUP_DIR_NAME = 'backup';
export const LOG_DIR_NAME = 'logs';
export const CACHE_DIR_NAME = 'cache';

export const FILE_PERMISSIONS = {
    READ: 0o444,
    WRITE: 0o644,
    EXECUTE: 0o755,
} as const;

// ==================== Performance Constants ====================

export const PERFORMANCE_LIMITS = {
    MAX_MEMORY_USAGE: 2 * 1024 * 1024 * 1024, // 2GB
    MAX_PROCESSING_TIME: 30 * 60 * 1000, // 30 minutes
    MAX_FILE_SIZE: 100 * 1024 * 1024, // 100MB
    CHUNK_SIZE: 64 * 1024, // 64KB
    CONCURRENT_OPERATIONS: 4,
} as const;

export const RETRY_CONFIG = {
    MAX_RETRIES: 3,
    INITIAL_DELAY: 1000,
    BACKOFF_FACTOR: 2,
    MAX_DELAY: 10000,
} as const;

// ==================== Environment Variables ====================

export const ENV_VARS = {
    DEEPSEEK_API_KEY: 'DEEPSEEK_API_KEY',
    OPENAI_API_KEY: 'OPENAI_API_KEY',
    ANTHROPIC_API_KEY: 'ANTHROPIC_API_KEY',
    LOG_LEVEL: 'LOG_LEVEL',
    DEBUG: 'DEBUG',
    NODE_ENV: 'NODE_ENV',
    CONFIG_DIR: 'CONFIG_DIR',
    OUTPUT_DIR: 'OUTPUT_DIR',
    TEMP_DIR: 'TEMP_DIR',
} as const;

// ==================== Regex Patterns ====================

export const REGEX_PATTERNS = {
    FILENAME_METADATA: /^([^#]+)#([^#]+)(?:#([^#]+))?\.(.+)$/,
    CHAPTER_HEADING: /^(?:Kapitel|Chapter|Teil|Part)\s+(\d+)(?:\.(\d+))?/i,
    FOOTNOTE_REFERENCE: /\[(\d+)\]|\((\d+)\)|(\d+)\)/g,
    PARAGRAPH_BREAK: /\n\s*\n/g,
    MULTIPLE_SPACES: /\s{2,}/g,
    LEADING_TRAILING_SPACES: /^\s+|\s+$/g,
    UNICODE_WHITESPACE: /[\u00A0\u2000-\u200A\u2028\u2029]/g,
} as const;

// ==================== Message Templates ====================

export const MESSAGE_TEMPLATES = {
    PROCESSING_START: 'Starting processing of {filename}',
    PROCESSING_COMPLETE: 'Processing completed successfully in {duration}ms',
    PROCESSING_ERROR: 'Processing failed: {error}',
    PHASE_START: 'Starting phase {phase}: {name}',
    PHASE_COMPLETE: 'Phase {phase} completed in {duration}ms',
    PHASE_ERROR: 'Phase {phase} failed: {error}',
    FILE_LOADED: 'File loaded: {filename} ({size} bytes)',
    TEXT_EXTRACTED: 'Text extracted: {words} words, {characters} characters',
    OCR_COMPLETED: 'OCR processing completed with {confidence}% confidence',
    QUALITY_ASSESSED: 'Quality assessment: {score}/100',
    CONFIG_LOADED: 'Configuration loaded from {path}',
    OUTPUT_GENERATED: 'Output generated: {path}',
} as const;

// ==================== Structure Analysis Constants ====================

export const STRUCTURE_ANALYSIS_PATTERNS = {
    CHAPTER_HEADERS: [
        /^(Kapitel|Teil|Part|Abschnitt)\s+(\d+|[IVXLCDM]+)(?:\s*[:\.]?\s*(.+))?$/i,
        /^(\d+|[IVXLCDM]+)\.\s*(.+)$/i,
        /^(\d+|[IVXLCDM]+)\s+(.+)$/i,
    ],
    LECTURE_HEADERS: [
        /^(Vortrag|Lecture|Vorlesung)\s+(\d+|[IVXLCDM]+)(?:\s*[:\.]?\s*(.+))?$/i,
        /^(\d+)\.\s*(Vortrag|Lecture|Vorlesung)(?:\s*[:\.]?\s*(.+))?$/i,
        /^(Vortrag|Lecture|Vorlesung)\s+vom\s+(.+)$/i,
    ],
    SECTION_HEADERS: [
        /^(Abschnitt|Section|Unterkapitel)\s+(\d+|[IVXLCDM]+)(?:\s*[:\.]?\s*(.+))?$/i,
        /^(\d+)\.(\d+)\s+(.+)$/i,
        /^[A-Z][a-z]*\s+[A-Z][a-z]*$/,
    ],
    FOOTNOTE_PATTERNS: [/\[(\d+)\]/g, /\((\d+)\)/g, /(\d+)\)/g, /\*(\d+)/g, /¹|²|³|⁴|⁵|⁶|⁷|⁸|⁹|⁰/g],
    FOOTNOTE_MARKERS: [
        /^(\d+)\s*[\)\.]?\s*(.+)$/,
        /^\[(\d+)\]\s*(.+)$/,
        /^\*(\d+)\s*(.+)$/,
        /^¹|²|³|⁴|⁵|⁶|⁷|⁸|⁹|⁰\s*(.+)$/,
    ],
    DIALOGUE_MARKERS: [
        /^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s*[:]\s*(.+)$/,
        /^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s*\((.+?)\)\s*[:]\s*(.+)$/,
    ],
    PARAGRAPH_INDICATORS: [/^\s*\d+\.\s+/, /^\s*[a-z]\)\s+/, /^\s*\*\s+/, /^\s*-\s+/, /^\s*•\s+/],
} as const;

export const STRUCTURE_ANALYSIS_TYPES = {
    CHAPTER: 'chapter',
    LECTURE: 'lecture',
    SECTION: 'section',
    SUBSECTION: 'subsection',
    PARAGRAPH: 'paragraph',
    FOOTNOTE: 'footnote',
    DIALOGUE: 'dialogue',
    QUOTE: 'quote',
    TABLE_OF_CONTENTS: 'table_of_contents',
    INDEX: 'index',
    BIBLIOGRAPHY: 'bibliography',
    APPENDIX: 'appendix',
} as const;

export const STRUCTURE_ANALYSIS_LEVELS = {
    TITLE: 0,
    CHAPTER: 1,
    SECTION: 2,
    SUBSECTION: 3,
    PARAGRAPH: 4,
    FOOTNOTE: 5,
} as const;

export const STRUCTURE_ANALYSIS_CONFIDENCE = {
    VERY_HIGH: 0.95,
    HIGH: 0.8,
    MEDIUM: 0.6,
    LOW: 0.4,
    VERY_LOW: 0.2,
} as const;

// ==================== File Format Detection Constants ====================

export const MAGIC_NUMBERS = {
    PDF: [0x25, 0x50, 0x44, 0x46], // %PDF
    EPUB: [0x50, 0x4b, 0x03, 0x04], // ZIP signature
    UTF8_BOM: [0xef, 0xbb, 0xbf], // UTF-8 BOM
    UTF16_LE: [0xff, 0xfe], // UTF-16 LE BOM
} as const;

export const FILE_SIZE_LIMITS = {
    PDF: 25 * 1024 * 1024, // 25MB
    EPUB: 5 * 1024 * 1024, // 5MB
    TXT: 1 * 1024 * 1024, // 1MB
} as const;

export const PDF_CONTENT_TYPES = {
    TEXT_BASED: 'text_based',
    IMAGE_BASED: 'image_based',
    HYBRID: 'hybrid',
    EMPTY: 'empty',
} as const;

export const FORMAT_DETECTION_CONFIDENCE = {
    VERY_HIGH: 0.95,
    HIGH: 0.8,
    MEDIUM: 0.6,
    LOW: 0.4,
    VERY_LOW: 0.2,
} as const;

export const VALIDATION_THRESHOLDS = {
    TEXT_PRINTABLE_RATIO: 0.7, // 70% printable characters for text files
    BINARY_CONTENT_RATIO: 0.1, // 10% binary content threshold
    MIN_TEXT_LENGTH: 100, // Minimum text length for valid content
    MAX_HEADER_SIZE: 1024, // Maximum header size to read for detection
} as const;

export const BANNER_MESSAGES = {
    PHASE_1_START: [
        '╔══════════════════════════════════════════════════════════════════════════════════════╗',
        '║                          📚 Phase 1: Text Extraction & Format Processing             ║',
        '╚══════════════════════════════════════════════════════════════════════════════════════╝',
    ],
    STEP_1_1: '🔍 Step 1.1: File Format Detection & Validation',
} as const;

// ==================== Text Quality Enhancement Constants ====================

export const PARAGRAPH_END_MARKERS = ['!', '?', '.»', '!»', '?»'] as const;
export const MIN_PARAGRAPHS_FOR_ANALYSIS = 7;

export const TEXT_QUALITY_ENHANCEMENT = {
    MIN_PARAGRAPHS_FOR_ANALYSIS,
    PARAGRAPH_END_MARKERS,
    HYPHEN_LINE_ENDING: '-',
    PARAGRAPH_SEPARATOR: '\n\n',
} as const;

/**
 * List of common German abbreviations that do NOT indicate sentence endings.
 * Used for paragraph and sentence boundary detection.
 * Source: scripts/book-cli/book_pipeline/config/constants.py
 */
export const GERMAN_ABBREVIATIONS_NON_ENDING = [
    'z. b.',
    'z.b.',
    'u. a.',
    'u.a.',
    'd. h.',
    'd.h.',
    'u. s. w.',
    'u.s.w.',
    'usw.',
    'etc.',
    'bzw.',
    'ca.',
    'vgl.',
    'ggf.',
    'evtl.',
    'inkl.',
    'exkl.',
    'zzgl.',
    'bzgl.',
    'gem.',
    'nr.',
    'abs.',
    'art.',
    'bd.',
    'hrsg.',
    'verf.',
    'aufl.',
    'f.',
    'ff.',
    'anm.',
    'orig.',
    'übers.',
    'bearb.',
    'hg.',
    'kap.',
    'fig.',
    'tab.',
    'taf.',
    'dgl.',
    'desgl.',
    'ebd.',
    'o.ä.',
    'u.ä.',
    'u.dgl.',
    'u.desgl.',
    'i.d.r.',
    'z.zt.',
    'u.u.',
    'u.v.a.',
    'u.v.m.',
    'sog.',
    'insb.',
    'insbes.',
    'allg.',
    'entspr.',
    'ungef.',
    'max.',
    'min.',
    'mögl.',
    'unmögl.',
    'wahrsch.',
    'vermutl.',
] as const;

export const PARAGRAPH_NUMBER_SYMBOLS = [
    // Unicode circled numbers for paragraph numbering (matches Python constants.py)
    '①',
    '②',
    '③',
    '④',
    '⑤',
    '⑥',
    '⑦',
    '⑧',
    '⑨',
    '⑩',
    '⑪',
    '⑫',
    '⑬',
    '⑭',
    '⑮',
    '⑯',
    '⑰',
    '⑱',
    '⑲',
    '⑳',
    '㉑',
    '㉒',
    '㉓',
    '㉔',
    '㉕',
    '㉖',
    '㉗',
    '㉘',
    '㉙',
    '㉚',
    '㉛',
    '㉜',
    '㉝',
    '㉞',
    '㉟',
    '㊱',
    '㊲',
    '㊳',
    '㊴',
    '㊵',
    '㊶',
    '㊷',
    '㊸',
    '㊹',
    '㊺',
    '㊻',
    '㊼',
    '㊽',
    '㊾',
    '㊿',
] as const;

export const ROMAN_NUMERALS = {
    I: 1,
    II: 2,
    III: 3,
    IV: 4,
    V: 5,
    VI: 6,
    VII: 7,
    VIII: 8,
    IX: 9,
    X: 10,
    XI: 11,
    XII: 12,
    XIII: 13,
    XIV: 14,
    XV: 15,
    XVI: 16,
    XVII: 17,
    XVIII: 18,
    XIX: 19,
    XX: 20,
    XXI: 21,
    XXII: 22,
    XXIII: 23,
    XXIV: 24,
    XXV: 25,
    XXVI: 26,
    XXVII: 27,
    XXVIII: 28,
    XXIX: 29,
    XXX: 30,
    XXXI: 31,
    XXXII: 32,
    XXXIII: 33,
    XXXIV: 34,
    XXXV: 35,
    XXXVI: 36,
    XXXVII: 37,
    XXXVIII: 38,
    XXXIX: 39,
    XL: 40,
    XLI: 41,
    XLII: 42,
    XLIII: 43,
    XLIV: 44,
    XLV: 45,
    XLVI: 46,
    XLVII: 47,
    XLVIII: 48,
    XLIX: 49,
    L: 50,
    LI: 51,
    LII: 52,
    LIII: 53,
    LIV: 54,
    LV: 55,
    LVI: 56,
    LVII: 57,
    LVIII: 58,
    LIX: 59,
    LX: 60,
    LXI: 61,
    LXII: 62,
    LXIII: 63,
    LXIV: 64,
    LXV: 65,
    LXVI: 66,
    LXVII: 67,
    LXVIII: 68,
    LXIX: 69,
    LXX: 70,
    LXXI: 71,
    LXXII: 72,
    LXXIII: 73,
    LXXIV: 74,
    LXXV: 75,
    LXXVI: 76,
    LXXVII: 77,
    LXXVIII: 78,
    LXXIX: 79,
    LXXX: 80,
    LXXXI: 81,
    LXXXII: 82,
    LXXXIII: 83,
    LXXXIV: 84,
    LXXXV: 85,
    LXXXVI: 86,
    LXXXVII: 87,
    LXXXVIII: 88,
    LXXXIX: 89,
    XC: 90,
    XCI: 91,
    XCII: 92,
    XCIII: 93,
    XCIV: 94,
    XCV: 95,
    XCVI: 96,
    XCVII: 97,
    XCVIII: 98,
    XCIX: 99,
    C: 100,
} as const;

/**
 * German ordinals for section/chapter detection in Rudolf Steiner GA works.
 * Used for recognizing lecture/chapter headers like "ERSTER VORTRAG", "ZWEITER VORTRAG", etc.
 * Covers ordinals from 1 (ERSTER) up to 50 (FÜNFZIGSTER).
 */
export const GERMAN_ORDINALS = {
    erster: 1,
    zweiter: 2,
    dritter: 3,
    vierter: 4,
    fünfter: 5,
    sechster: 6,
    siebter: 7,
    siebenter: 7,
    achter: 8,
    neunter: 9,
    zehnter: 10,
    elfter: 11,
    zwölfter: 12,
    dreizehnter: 13,
    vierzehnter: 14,
    fünfzehnter: 15,
    sechzehnter: 16,
    siebzehnter: 17,
    achtzehnter: 18,
    neunzehnter: 19,
    zwanzigster: 20,
    einundzwanzigster: 21,
    zweiundzwanzigster: 22,
    dreiundzwanzigster: 23,
    vierundzwanzigster: 24,
    fünfundzwanzigster: 25,
    sechsundzwanzigster: 26,
    siebenundzwanzigster: 27,
    achtundzwanzigster: 28,
    neunundzwanzigster: 29,
    dreißigster: 30,
    einunddreißigster: 31,
    zweiunddreißigster: 32,
    dreiunddreißigster: 33,
    vierunddreißigster: 34,
    fünfunddreißigster: 35,
    sechsunddreißigster: 36,
    siebenunddreißigster: 37,
    achtunddreißigster: 38,
    neununddreißigster: 39,
    vierzigster: 40,
    einundvierzigster: 41,
    zweiundvierzigster: 42,
    dreiundvierzigster: 43,
    vierundvierzigster: 44,
    fünfundvierzigster: 45,
    sechsundvierzigster: 46,
    siebenundvierzigster: 47,
    achtundvierzigster: 48,
    neunundvierzigster: 49,
    fünfzigster: 50,
} as const;
