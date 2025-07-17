/**
 * Constants for the Book Cleaner CLI
 * All string constants should be defined here to avoid magic strings in code
 */

// ==================== Application Constants ====================

export const APP_NAME = "Book Cleaner CLI";
export const APP_VERSION = "1.0.0";
export const APP_DESCRIPTION =
  "Transform raw book sources into clean, readable Markdown with comprehensive metadata";

// ==================== File and Format Constants ====================

export const SUPPORTED_FORMATS = ["pdf", "epub", "txt"] as const;

export const MIME_TYPES = {
  PDF: "application/pdf",
  EPUB: "application/epub+zip",
  TXT: "text/plain",
} as const;

export const FILE_EXTENSIONS = {
  PDF: ".pdf",
  EPUB: ".epub",
  TXT: ".txt",
} as const;

// ==================== Pipeline Constants ====================

export const PIPELINE_PHASES = {
  DATA_LOADING: "data_loading",
  TEXT_NORMALIZATION: "text_normalization",
  EVALUATION: "evaluation",
  AI_ENHANCEMENTS: "ai_enhancements",
} as const;

export const PIPELINE_PHASE_NAMES = {
  [PIPELINE_PHASES.DATA_LOADING]: "Data Loading & Preprocessing",
  [PIPELINE_PHASES.TEXT_NORMALIZATION]: "Text Normalization & AI Cleaning",
  [PIPELINE_PHASES.EVALUATION]: "Evaluation & Analysis",
  [PIPELINE_PHASES.AI_ENHANCEMENTS]: "AI Enhancements",
} as const;

export const PIPELINE_STATUS = {
  PENDING: "pending",
  RUNNING: "running",
  COMPLETED: "completed",
  FAILED: "failed",
  CANCELLED: "cancelled",
} as const;

// ==================== Configuration Constants ====================

export const DEFAULT_CONFIG_DIR = "configs";
export const DEFAULT_CONFIG_FILE = "default.config";
export const CONFIG_FILE_EXTENSION = ".config";

export const DEFAULT_OUTPUT_DIR = "output";
export const DEFAULT_LOG_LEVEL = "info";
export const DEFAULT_FILENAME_PATTERN = "{author}#{title}[#{bookIndex}]-{timestamp}";

// ==================== Logging Constants ====================

export const LOG_LEVELS = {
  DEBUG: "debug",
  INFO: "info",
  WARN: "warn",
  ERROR: "error",
  FATAL: "fatal",
} as const;

export const LOG_TAGS = {
  PIPELINE: "pipeline",
  FILE_PROCESSING: "file_processing",
  TEXT_EXTRACTION: "text_extraction",
  OCR: "ocr",
  CONFIG: "config",
  CLI: "cli",
  ERROR: "error",
} as const;

export const LOG_COMPONENTS = {
  PIPELINE_MANAGER: "PipelineManager",
  FILE_HANDLER: "FileHandler",
  TEXT_EXTRACTOR: "TextExtractor",
  OCR_SERVICE: "OCRService",
  CONFIG_SERVICE: "ConfigService",
  LOGGER_SERVICE: "LoggerService",
  CLI_COMMAND: "CLICommand",
} as const;

// ==================== Error Constants ====================

export const ERROR_CODES = {
  FILE_NOT_FOUND: "FILE_NOT_FOUND",
  INVALID_FORMAT: "INVALID_FORMAT",
  EXTRACTION_FAILED: "EXTRACTION_FAILED",
  OCR_FAILED: "OCR_FAILED",
  CONFIG_INVALID: "CONFIG_INVALID",
  PIPELINE_FAILED: "PIPELINE_FAILED",
  API_ERROR: "API_ERROR",
  VALIDATION_ERROR: "VALIDATION_ERROR",
} as const;

export const ERROR_MESSAGES = {
  [ERROR_CODES.FILE_NOT_FOUND]: "The specified file was not found: {path}",
  [ERROR_CODES.INVALID_FORMAT]: "Unsupported file format: {format}",
  [ERROR_CODES.EXTRACTION_FAILED]: "Failed to extract text from file: {path}",
  [ERROR_CODES.OCR_FAILED]: "OCR processing failed for file: {path}",
  [ERROR_CODES.CONFIG_INVALID]: "Invalid configuration: {details}",
  [ERROR_CODES.PIPELINE_FAILED]: "Pipeline execution failed: {phase}",
  [ERROR_CODES.API_ERROR]: "API call failed: {endpoint}",
  [ERROR_CODES.VALIDATION_ERROR]: "Validation failed: {field}",
} as const;

// ==================== OCR Constants ====================

export const OCR_ENGINES = {
  TESSERACT: "tesseract",
  PADDLEOCR: "paddleocr",
} as const;

export const OCR_LANGUAGES = {
  ENGLISH: "eng",
  GERMAN: "deu",
  FRENCH: "fra",
  SPANISH: "spa",
  ITALIAN: "ita",
  AUTO: "auto",
} as const;

export const OCR_CONFIDENCE_THRESHOLDS = {
  LOW: 0.5,
  MEDIUM: 0.7,
  HIGH: 0.9,
} as const;

// ==================== Text Processing Constants ====================

export const TEXT_SOURCES = {
  EMBEDDED: "embedded",
  OCR: "ocr",
  HYBRID: "hybrid",
} as const;

export const QUALITY_ISSUE_TYPES = {
  ENCODING: "encoding",
  CORRUPTION: "corruption",
  OCR_ERROR: "ocr_error",
  FORMATTING: "formatting",
  MISSING_TEXT: "missing_text",
  DUPLICATE_TEXT: "duplicate_text",
} as const;

export const QUALITY_SEVERITIES = {
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
} as const;

// ==================== Default Text Boundaries ====================

export const DEFAULT_PARAGRAPH_MARKERS = [
  "\\n\\n",
  "\\r\\n\\r\\n",
  "\\n\\r\\n\\r",
] as const;

export const DEFAULT_SECTION_MARKERS = ["***", "---", "===", "~~~"] as const;

export const DEFAULT_CHAPTER_MARKERS = [
  "Kapitel",
  "Chapter",
  "Teil",
  "Part",
  "Abschnitt",
  "Section",
] as const;

export const DEFAULT_FOOTNOTE_MARKERS = [
  "\\d+\\)",
  "\\d+\\.",
  "\\*\\d+",
  "\\[\\d+\\]",
] as const;

// ==================== AI Provider Constants ====================

export const AI_PROVIDERS = {
  DEEPSEEK: "deepseek",
  OPENAI: "openai",
  ANTHROPIC: "anthropic",
} as const;

export const AI_MODELS = {
  DEEPSEEK: {
    CHAT: "deepseek-chat",
    CODER: "deepseek-coder",
  },
  OPENAI: {
    GPT35_TURBO: "gpt-3.5-turbo",
    GPT4: "gpt-4",
    GPT4_TURBO: "gpt-4-turbo",
  },
  ANTHROPIC: {
    CLAUDE_3_HAIKU: "claude-3-haiku-20240307",
    CLAUDE_3_SONNET: "claude-3-sonnet-20240229",
    CLAUDE_3_OPUS: "claude-3-opus-20240229",
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
  MARKDOWN: "markdown",
  HTML: "html",
  TEXT: "text",
} as const;

export const OUTPUT_EXTENSIONS = {
  [OUTPUT_FORMATS.MARKDOWN]: ".md",
  [OUTPUT_FORMATS.HTML]: ".html",
  [OUTPUT_FORMATS.TEXT]: ".txt",
} as const;

// ==================== Progress Constants ====================

export const PROGRESS_PHASES = {
  INITIALIZATION: "Initialization",
  FILE_LOADING: "File Loading",
  TEXT_EXTRACTION: "Text Extraction",
  OCR_PROCESSING: "OCR Processing",
  QUALITY_ASSESSMENT: "Quality Assessment",
  TEXT_CLEANING: "Text Cleaning",
  METADATA_GENERATION: "Metadata Generation",
  OUTPUT_GENERATION: "Output Generation",
} as const;

// ==================== Validation Constants ====================

export const VALIDATION_PATTERNS = {
  AUTHOR_TITLE_SEPARATOR: "#",
  BOOK_INDEX_PREFIX: "#",
  FILENAME_CHARS: /^[a-zA-Z0-9_\-#\s\.]+$/,
  CHAPTER_NUMBER: /^(\d+)\.?(\d+)?$/,
  FOOTNOTE_REFERENCE: /^\d+$/,
  FILENAME_METADATA: /^(.+)#(.+?)(?:#(.+?))?$/,
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
  CLEAN_BOOK: "clean-book",
  VERSION: "version",
  HELP: "help",
} as const;

export const CLI_OPTIONS = {
  INPUT_FILE: "input-file",
  OUTPUT_DIR: "output-dir",
  AUTHOR: "author",
  TITLE: "title",
  BOOK_INDEX: "book-index",
  VERBOSE: "verbose",
  DEBUG: "debug",
  LOG_LEVEL: "log-level",
  CONFIG: "config",
  PHASES: "phases",
} as const;

export const CLI_ALIASES = {
  [CLI_OPTIONS.OUTPUT_DIR]: "o",
  [CLI_OPTIONS.AUTHOR]: "a",
  [CLI_OPTIONS.TITLE]: "t",
  [CLI_OPTIONS.BOOK_INDEX]: "b",
  [CLI_OPTIONS.VERBOSE]: "v",
  [CLI_OPTIONS.DEBUG]: "d",
  [CLI_OPTIONS.LOG_LEVEL]: "l",
  [CLI_OPTIONS.CONFIG]: "c",
  [CLI_OPTIONS.PHASES]: "p",
} as const;

// ==================== File System Constants ====================

export const TEMP_DIR_PREFIX = "book-cleaner-";
export const BACKUP_DIR_NAME = "backup";
export const LOG_DIR_NAME = "logs";
export const CACHE_DIR_NAME = "cache";

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
  DEEPSEEK_API_KEY: "DEEPSEEK_API_KEY",
  OPENAI_API_KEY: "OPENAI_API_KEY",
  ANTHROPIC_API_KEY: "ANTHROPIC_API_KEY",
  LOG_LEVEL: "LOG_LEVEL",
  DEBUG: "DEBUG",
  NODE_ENV: "NODE_ENV",
  CONFIG_DIR: "CONFIG_DIR",
  OUTPUT_DIR: "OUTPUT_DIR",
  TEMP_DIR: "TEMP_DIR",
} as const;

// ==================== Regex Patterns ====================

export const REGEX_PATTERNS = {
  FILENAME_METADATA: /^(.+)#(.+?)(?:#(.+?))?\.(.+)$/,
  CHAPTER_HEADING: /^(?:Kapitel|Chapter|Teil|Part)\s+(\d+)(?:\.(\d+))?/i,
  FOOTNOTE_REFERENCE: /\[(\d+)\]|\((\d+)\)|(\d+)\)/g,
  PARAGRAPH_BREAK: /\n\s*\n/g,
  MULTIPLE_SPACES: /\s{2,}/g,
  LEADING_TRAILING_SPACES: /^\s+|\s+$/g,
  UNICODE_WHITESPACE: /[\u00A0\u2000-\u200A\u2028\u2029]/g,
} as const;

// ==================== Message Templates ====================

export const MESSAGE_TEMPLATES = {
  PROCESSING_START: "Starting processing of {filename}",
  PROCESSING_COMPLETE: "Processing completed successfully in {duration}ms",
  PROCESSING_ERROR: "Processing failed: {error}",
  PHASE_START: "Starting phase {phase}: {name}",
  PHASE_COMPLETE: "Phase {phase} completed in {duration}ms",
  PHASE_ERROR: "Phase {phase} failed: {error}",
  FILE_LOADED: "File loaded: {filename} ({size} bytes)",
  TEXT_EXTRACTED: "Text extracted: {words} words, {characters} characters",
  OCR_COMPLETED: "OCR processing completed with {confidence}% confidence",
  QUALITY_ASSESSED: "Quality assessment: {score}/100",
  CONFIG_LOADED: "Configuration loaded from {path}",
  OUTPUT_GENERATED: "Output generated: {path}",
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
  FOOTNOTE_PATTERNS: [
    /\[(\d+)\]/g,
    /\((\d+)\)/g,
    /(\d+)\)/g,
    /\*(\d+)/g,
    /¹|²|³|⁴|⁵|⁶|⁷|⁸|⁹|⁰/g,
  ],
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
  PARAGRAPH_INDICATORS: [
    /^\s*\d+\.\s+/,
    /^\s*[a-z]\)\s+/,
    /^\s*\*\s+/,
    /^\s*-\s+/,
    /^\s*•\s+/,
  ],
} as const;

export const STRUCTURE_ANALYSIS_TYPES = {
  CHAPTER: "chapter",
  LECTURE: "lecture",
  SECTION: "section",
  SUBSECTION: "subsection",
  PARAGRAPH: "paragraph",
  FOOTNOTE: "footnote",
  DIALOGUE: "dialogue",
  QUOTE: "quote",
  TABLE_OF_CONTENTS: "table_of_contents",
  INDEX: "index",
  BIBLIOGRAPHY: "bibliography",
  APPENDIX: "appendix",
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
  TEXT_BASED: "text_based",
  IMAGE_BASED: "image_based",
  HYBRID: "hybrid",
  EMPTY: "empty",
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
    "╔══════════════════════════════════════════════════════════════════════════════════════╗",
    "║                          📚 Phase 1: Text Extraction & Format Processing             ║",
    "╚══════════════════════════════════════════════════════════════════════════════════════╝",
  ],
  STEP_1_1: "🔍 Step 1.1: File Format Detection & Validation",
} as const;
