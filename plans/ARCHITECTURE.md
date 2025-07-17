# Book Cleaner CLI Architecture

## Overview

The Book Cleaner CLI is a Node.js/TypeScript application that provides a comprehensive text cleaning pipeline for books. It transforms raw book sources (PDFs, text files, EPUB) into clean, readable Markdown format with comprehensive metadata. It also takes already processed input, to run it again (e.g. because of changed structure files or improved AI steps)

## Tech Stack

-   **Runtime**: Node.js 22 LTS+
-   **Language**: TypeScript
-   **Linter/Formatter**: Biomejs
-   **AI Processing**: DeepSeek API with deepseek.chat model
-   **PDF Processing**: Scribe.js
-   **Logging**: Pino logger with tagged logging for granular control
-   **CLI Framework**: Commander.js
-   **File Processing**: Node.js fs/promises API

## Project Structure

```
book-cleaner-cli/
├── src/
│   ├── commands/
│   │   └── clean-book.ts           # Main CLI command
│   ├── phases/
│   │   ├── phase1/                 # Text loading & metadata generation
│   │   │   ├── loaders/
│   │   │   │   ├── pdf-loader.ts
│   │   │   │   ├── text-loader.ts
│   │   │   │   └── epub-loader.ts
│   │   │   ├── extractors/
│   │   │   │   ├── text-extractor.ts
│   │   │   │   ├── ocr-processor.ts
│   │   │   │   └── metadata-extractor.ts
│   │   │   ├── processors/
│   │   │   │   ├── patch-processor.ts
│   │   │   │   ├── author-text-extractor.ts
│   │   │   │   ├── line-merger.ts
│   │   │   │   ├── page-break-handler.ts
│   │   │   │   ├── chapter-recognizer.ts
│   │   │   │   ├── paragraph-reconstructor.ts
│   │   │   │   └── footnote-extractor.ts
│   │   │   └── index.ts
│   │   ├── phase2/                 # Text normalization & AI cleaning
│   │   │   ├── normalizers/
│   │   │   │   ├── heading-normalizer.ts
│   │   │   │   ├── footnote-converter.ts
│   │   │   │   └── paragraph-corrector.ts
│   │   │   ├── replacers/
│   │   │   │   ├── safe-replacements.ts
│   │   │   │   └── patch-applier.ts
│   │   │   ├── ai-cleaners/
│   │   │   │   ├── debris-cleaner.ts
│   │   │   │   └── spell-checker.ts
│   │   │   └── index.ts
│   │   ├── phase3/                 # Evaluation & analysis
│   │   │   ├── analyzers/
│   │   │   │   ├── change-analyzer.ts
│   │   │   │   └── quality-assessor.ts
│   │   │   └── index.ts
│   │   └── phase4/                 # Future: AI enhancements
│   │       ├── generators/
│   │       │   ├── person-directory.ts
│   │       │   ├── bibliography.ts
│   │       │   └── glossary.ts
│   │       └── index.ts
│   ├── services/
│   │   ├── deepseek-service.ts     # DeepSeek API integration
│   │   ├── file-service.ts         # File I/O operations
│   │   ├── config-service.ts       # Configuration loading and management
│   │   └── metadata-service.ts     # Metadata management
│   ├── utils/
│   │   ├── logger.ts               # Tagged pino logger
│   │   ├── config.ts              # Configuration management
│   │   ├── constants.ts           # Application constants
│   │   ├── validators.ts          # Input validation
│   │   └── filename-parser.ts     # Filename metadata extraction
│   ├── types/
│   │   ├── book.ts                # Book-related types
│   │   ├── metadata.ts            # Metadata types
│   │   └── pipeline.ts            # Pipeline types
│   └── index.ts                   # Main entry point
├── config/
│   ├── patches/                   # Patch files
│   │   ├── after-data-loading.patch
│   │   └── individual-patches/
│   ├── replacements/
│   │   └── safe-replacements.csv
│   └── templates/
│       ├── footnotes.yaml
│       └── paragraphs.txt
├── configs/                       # Book-specific configuration files
│   ├── Rudolf_Steiner#Goethes_Naturwissenschaftliche_Schriften.config
│   ├── Rudolf_Steiner#Einleitungen_zu_Goethes_Naturwissenschaftlichen_Schriften.config
│   ├── Plato#The_Republic.config
│   └── default.config            # Default configuration template
├── tests/
│   ├── unit/
│   ├── integration/
│   └── fixtures/
├── docs/
│   ├── ARCHITECTURE.md
│   ├── API.md
│   └── EXAMPLES.md
├── package.json
├── tsconfig.json
├── biome.json
└── README.md
```

## Command Line Interface

### Main Command: `clean-book`

```bash
npx clean-book <input-file> [options]
```

#### Input File Naming Convention

The input filename should follow this pattern to automatically extract metadata:

```
<author>#<title>[#<book-index>].<extension>
```

**Examples:**

-   `Rudolf_Steiner#Goethes_Naturwissenschaftliche_Schriften.pdf`
-   `Rudolf_Steiner#Einleitungen_zu_Goethes_Naturwissenschaftlichen_Schriften#1.pdf`
-   `Plato#The_Republic#7.epub`

**Parsing Rules:**

-   **Author**: First segment before the first `#`
-   **Title**: Second segment between first and second `#`
-   **Book Index**: Optional third segment after second `#` (e.g., GA numbers, volume numbers)
-   **Underscores** in segments are converted to spaces
-   **Metadata precedence**: CLI options override filename-derived metadata

#### Options:

-   `--output-dir, -o`: Output directory for cleaned files
-   `--text-before-first-chapter`: Text to identify content before first chapter
-   `--text-after-last-chapter`: Text to identify content after last chapter
-   `--book-index`: Book index for metadata (overrides filename)
-   `--log-level`: Global log level (error, warning, info, verbose, debug)
-   `--phase-log-levels`: JSON object for phase-specific log levels
-   `--dry-run`: Preview changes without writing the result file
-   `--phases`: Comma-separated list of phases to run (default: all)

#### Configuration File Auto-Loading

Configuration files are automatically loaded from the `configs/` directory based on the filename:

-   **Pattern**: `configs/<author>#<title>.config`
-   **Fallback**: `configs/default.config` if book-specific config doesn't exist
-   **No CLI parameter needed**: Configuration is determined automatically from filename
-   **Repository managed**: Config files are part of the repository for version control

#### Examples:

```bash
# Using filename convention for metadata
npx clean-book "Rudolf_Steiner#Goethes_Naturwissenschaftliche_Schriften#GA_1.pdf"

# With specific text boundaries
npx clean-book "Rudolf_Steiner#Goethes_Naturwissenschaftliche_Schriften#GA_1.pdf" \
  --text-before-first-chapter "müsse, um ihm erkennend beizukommen." \
  --text-after-last-chapter "Daten zur Herausgabe" \
  --output-dir ./output

# With custom log levels
npx clean-book "Rudolf_Steiner#Goethes_Naturwissenschaftliche_Schriften#GA_1.pdf" \
  --log-level info \
  --phase-log-levels '{"phase1": "debug", "phase2": "verbose"}'
```

## Processing Phases

### Phase 1: Text Loading & Metadata Generation

**Objective**: Extract and normalize raw text content, generate structural metadata

#### Steps:

1. **Source Detection & Loading**

    - Auto-detect file type (PDF, TXT, EPUB)
    - Load appropriate processor
    - Validate file integrity

2. **Text Extraction**

    - PDF: Extract embedded text using Scribe.js
    - PDF: Perform OCR on images and perform a comparison with embedded text
    - TXT: Read and normalize encoding
    - EPUB: Extract from XHTML content

3. **Patch Application**

    - Apply known fixes from `after-data-loading.patch`
    - Handle publisher-specific formatting issues
    - Remove copyright notices, page numbers, etc.

4. **Author Content Extraction**

    - Identify content boundaries using `--text-before-first-chapter` and `--text-after-last-chapter`
    - Extract only author-written content
    - Remove prefaces, appendices, publisher content

5. **Text Normalization**

    - Merge fragmented lines
    - Handle page breaks and hyphenation
    - Normalize whitespace and character encoding

6. **Structure Recognition**

    - Identify chapters and subchapters
    - Recognize heading hierarchy
    - Detect paragraph boundaries

7. **Metadata Extraction**
    - Extract footnotes → `footnotes.yaml`
    - Generate paragraph index → `paragraphs.txt`
    - Create table of contents structure

#### Outputs:

-   `raw-text.md`: Normalized author text
-   `footnotes.yaml`: Extracted footnotes with references
-   `paragraphs.txt`: Paragraph index with first lines
-   `structure.json`: Document structure metadata

### Phase 2: Text Normalization & AI Cleaning

**Objective**: Apply systematic text improvements and AI-powered cleaning

#### Steps:

1. **Heading Normalization**

    - Convert to Markdown heading syntax (`#`, `##`, `###`)
    - Ensure consistent hierarchy
    - Generate anchor links

2. **Footnote Processing**

    - Convert inline footnotes to endnotes
    - Maintain reference integrity
    - Format according to markdown standards

3. **Paragraph Correction**

    - Apply corrections from paragraph reference file
    - Fix paragraph splitting errors
    - Maintain logical text flow

4. **Safe Text Replacements**

    - Apply replacements from `safe-replacements.csv`
    - Handle German spelling modernization (ß → ss)
    - Fix hyphenation and archaic spellings

5. **AI Text Cleaning**

    - Remove graphics debris (Fig., Abb., etc.)
    - Clean OCR artifacts
    - Fix formatting inconsistencies
    - Preserve author's original meaning

6. **AI Spell Checking**

    - Correct spelling errors
    - Maintain historical/archaic terms when appropriate
    - Preserve technical terminology

7. **Individual Patches**
    - Apply book-specific patches
    - Handle unique formatting issues
    - Custom corrections

#### Outputs:

-   `normalized-text.md`: Cleaned and normalized text
-   `replacements-log.json`: Applied replacements log
-   `ai-cleaning-log.json`: AI cleaning actions log

### Phase 3: Evaluation & Analysis

**Objective**: Assess cleaning quality and document changes

#### Steps:

1. **Change Analysis**

    - Compare each stage output
    - Quantify text modifications
    - Identify potential issues

2. **Quality Assessment**

    - Validate markdown syntax
    - Check internal link integrity
    - Assess readability improvements

3. **Report Generation**
    - Create change summary
    - Generate quality metrics
    - Document any manual review needed

#### Outputs:

-   `evaluation-report.md`: Comprehensive analysis
-   `change-summary.json`: Detailed change log
-   `quality-metrics.json`: Quality assessment results

### Phase 4: AI Enhancements (Future)

**Objective**: Generate supplementary materials using AI

#### Planned Features:

1. **Person Directory**

    - Extract person mentions
    - Generate short biographies
    - Link to relevant images

2. **Bibliography**

    - Identify cited works
    - Generate formatted bibliography
    - Add download links where available

3. **Glossary**
    - Extract technical terms
    - Generate definitions
    - Cross-reference usage

## Logging Architecture

### Tagged Logging System

The application uses Pino logger with a sophisticated tagging system for granular log control:

#### Log Tags:

-   `phase1`: Overall Phase 1 operations
-   `phase1.pdf`: PDF processing
-   `phase1.ocr`: OCR operations
-   `phase1.structure`: Structure recognition
-   `phase1.metadata`: Metadata extraction
-   `phase2`: Overall Phase 2 operations
-   `phase2.ai`: AI cleaning operations
-   `phase2.replacements`: Text replacements
-   `phase2.normalization`: Text normalization
-   `phase3`: Evaluation operations
-   `phase4`: AI enhancement operations
-   `deepseek`: DeepSeek API interactions
-   `file`: File I/O operations
-   `config`: Configuration loading

#### Log Levels:

-   `error`: Critical errors that stop processing
-   `warning`: Issues that don't stop processing but need attention
-   `info`: General progress information
-   `verbose`: Detailed operation information
-   `debug`: Detailed debugging information

#### Configuration:

```typescript
// Logger configuration
const logConfig = {
    level: 'info', // Global level
    tagLevels: {
        'phase1.pdf': 'debug',
        'phase2.ai': 'verbose',
        deepseek: 'info',
        file: 'warning',
    },
};
```

## Configuration System

### Configuration File Auto-Loading

Configuration files are automatically loaded based on the input filename:

1. **Book-specific config**: `configs/<author>#<title>.config`
2. **Default config**: `configs/default.config` (fallback)
3. **No CLI parameter needed**: Configuration is determined automatically
4. **Repository managed**: All config files are versioned and part of the repository

### Configuration File Format

```yaml
# configs/Rudolf_Steiner#Goethes_Naturwissenschaftliche_Schriften.config
output:
    format: 'markdown'
    includeMetadata: true
    preserveFootnotes: true

processing:
    maxFileSize: '100MB'
    ocrEnabled: true
    aiCleaningEnabled: true

deepseek:
    apiKey: '${DEEPSEEK_API_KEY}'
    model: 'deepseek-chat'
    maxTokens: 8000
    temperature: 0.1

patches:
    afterDataLoading: './config/patches/after-data-loading.patch'
    safeReplacements: './config/replacements/safe-replacements.csv'

# Book-specific text boundaries
textBoundaries:
    beforeFirstChapter: 'müsse, um ihm erkennend beizukommen.'
    afterLastChapter: 'Daten zur Herausgabe'

logging:
    level: 'info'
    tagLevels:
        'phase1': 'info'
        'phase2.ai': 'verbose'
        'deepseek': 'info'
```

### Configuration Examples

```yaml
# configs/default.config - Default configuration template
output:
    format: 'markdown'
    includeMetadata: true
    preserveFootnotes: true

processing:
    maxFileSize: '100MB'
    ocrEnabled: true
    aiCleaningEnabled: true

deepseek:
    apiKey: '${DEEPSEEK_API_KEY}'
    model: 'deepseek-chat'
    maxTokens: 8000
    temperature: 0.1

patches:
    afterDataLoading: './config/patches/after-data-loading.patch'
    safeReplacements: './config/replacements/safe-replacements.csv'

logging:
    level: 'info'
    tagLevels:
        'phase1': 'info'
        'phase2.ai': 'verbose'
        'deepseek': 'info'
```

```yaml
# configs/Plato#The_Republic.config - Book-specific configuration
output:
    format: 'markdown'
    includeMetadata: true
    preserveFootnotes: true

processing:
    maxFileSize: '50MB'
    ocrEnabled: false # Text-only PDF
    aiCleaningEnabled: true

deepseek:
    apiKey: '${DEEPSEEK_API_KEY}'
    model: 'deepseek-chat'
    maxTokens: 6000
    temperature: 0.05 # More conservative for philosophical texts

# Ancient Greek text specific boundaries
textBoundaries:
    beforeFirstChapter: 'BOOK I'
    afterLastChapter: 'END OF THE REPUBLIC'

logging:
    level: 'verbose'
    tagLevels:
        'phase1': 'debug'
        'phase2.ai': 'info'
        'deepseek': 'debug'
```

## API Design

### Core Interfaces

```typescript
// types/book.ts
export interface BookSource {
    type: 'pdf' | 'txt' | 'epub';
    path: string;
    size: number;
    encoding?: string;
}

export interface FilenameMetadata {
    author: string;
    title: string;
    bookIndex?: string;
    extension: string;
    originalFilename: string;
}

export interface BookMetadata {
    title: string;
    author: string;
    bookIndex?: string;
    language: string;
    chapters: Chapter[];
    footnotes: Footnote[];
    paragraphs: ParagraphIndex[];
}

export interface BookConfig {
    output: {
        format: string;
        includeMetadata: boolean;
        preserveFootnotes: boolean;
    };
    processing: {
        maxFileSize: string;
        ocrEnabled: boolean;
        aiCleaningEnabled: boolean;
    };
    deepseek: {
        apiKey: string;
        model: string;
        maxTokens: number;
        temperature: number;
    };
    patches: {
        afterDataLoading: string;
        safeReplacements: string;
    };
    textBoundaries?: {
        beforeFirstChapter?: string;
        afterLastChapter?: string;
    };
    logging: {
        level: string;
        tagLevels: Record<string, string>;
    };
}

export interface Chapter {
    id: string;
    title: string;
    level: number;
    startLine: number;
    endLine: number;
    subChapters: Chapter[];
}

export interface Footnote {
    index: number;
    indexInText: number;
    marker: string[];
    text: string[];
}

export interface ParagraphIndex {
    chapterTitle: string;
    firstLine: string;
    lineNumber: number;
}
```

### Service Interfaces

```typescript
// services/deepseek-service.ts
export interface DeepSeekService {
    cleanText(text: string, context: CleaningContext): Promise<string>;
    checkSpelling(text: string): Promise<SpellingResult>;
    extractStructure(text: string): Promise<StructureResult>;
}

// services/file-service.ts
export interface FileService {
    readFile(path: string): Promise<Buffer>;
    writeFile(path: string, content: string): Promise<void>;
    ensureDir(path: string): Promise<void>;
    validatePath(path: string): boolean;
    parseFilenameMetadata(filename: string): FilenameMetadata | null;
    loadConfigForBook(author: string, title: string): Promise<BookConfig>;
}

// services/config-service.ts
export interface ConfigService {
    loadBookConfig(author: string, title: string): Promise<BookConfig>;
    loadDefaultConfig(): Promise<BookConfig>;
    resolveConfigPath(author: string, title: string): string;
}
```

## Error Handling

### Error Types

```typescript
export class BookCleanerError extends Error {
    constructor(message: string, public code: string, public phase?: string, public step?: string) {
        super(message);
        this.name = 'BookCleanerError';
    }
}

export class FileProcessingError extends BookCleanerError {
    constructor(message: string, public filePath: string) {
        super(message, 'FILE_PROCESSING_ERROR');
    }
}

export class AIProcessingError extends BookCleanerError {
    constructor(message: string, public aiModel: string) {
        super(message, 'AI_PROCESSING_ERROR');
    }
}
```

### Error Recovery

-   Graceful degradation when AI services are unavailable
-   Fallback to manual cleaning when AI cleaning fails
-   Resume processing from last successful checkpoint
-   Detailed error reporting with context

## Performance Considerations

### Memory Management

-   Stream processing for large files
-   Chunked AI processing to avoid token limits
-   Efficient PDF parsing with Scribe.js
-   Memory monitoring and garbage collection

### Concurrency

-   Parallel processing where possible
-   Rate limiting for AI API calls
-   Worker threads for CPU-intensive tasks
-   Batch processing for multiple files

### Caching

-   Cache AI responses for repeated patterns
-   File checksum-based processing cache
-   Metadata caching for large documents
-   Configuration caching

## Security Considerations

### Input Validation

-   File type validation
-   Content sanitization
-   Path traversal prevention
-   Size limitations

### API Security

-   Secure API key management
-   Rate limiting
-   Request/response validation
-   Error information filtering

## Testing Strategy

### Overview

The testing strategy follows a multi-layered approach to ensure reliability, performance, and correctness of the book cleaning pipeline. Given the complexity of text processing, AI integration, and file handling, comprehensive testing is critical.

### Test Categories

#### 1. Unit Tests

**Scope**: Individual functions, classes, and modules in isolation

**Framework**: Jest with TypeScript support

**Coverage Requirements**: Minimum 90% code coverage

**Test Structure**:

```typescript
// tests/unit/phases/phase1/extractors/text-extractor.test.ts
describe('TextExtractor', () => {
    describe('extractFromPDF', () => {
        it('should extract text from PDF with embedded text', async () => {
            // Test implementation
        });

        it('should handle PDFs with mixed text and images', async () => {
            // Test implementation
        });

        it('should throw error for corrupted PDF files', async () => {
            // Test implementation
        });
    });
});

// tests/unit/services/file-service.test.ts
describe('FileService', () => {
    describe('parseFilenameMetadata', () => {
        it('should parse filename with author, title, and book index', () => {
            const result = fileService.parseFilenameMetadata(
                'Rudolf_Steiner#Goethes_Naturwissenschaftliche_Schriften#GA_1.pdf',
            );
            expect(result).toEqual({
                author: 'Rudolf Steiner',
                title: 'Goethes Naturwissenschaftliche Schriften',
                bookIndex: 'GA 1',
                extension: 'pdf',
                originalFilename:
                    'Rudolf_Steiner#Goethes_Naturwissenschaftliche_Schriften#GA_1.pdf',
            });
        });

        it('should parse filename without book index', () => {
            const result = fileService.parseFilenameMetadata('Plato#The_Republic.epub');
            expect(result).toEqual({
                author: 'Plato',
                title: 'The Republic',
                bookIndex: undefined,
                extension: 'epub',
                originalFilename: 'Plato#The_Republic.epub',
            });
        });

        it('should return null for invalid filename format', () => {
            const result = fileService.parseFilenameMetadata('invalid-filename.pdf');
            expect(result).toBeNull();
        });
    });

    describe('loadConfigForBook', () => {
        it('should load book-specific config when it exists', async () => {
            const config = await fileService.loadConfigForBook(
                'Rudolf Steiner',
                'Goethes Naturwissenschaftliche Schriften',
            );
            expect(config).toHaveProperty('textBoundaries');
            expect(config.textBoundaries.beforeFirstChapter).toBe(
                'müsse, um ihm erkennend beizukommen.',
            );
        });

        it('should fall back to default config when book-specific config does not exist', async () => {
            const config = await fileService.loadConfigForBook('Unknown Author', 'Unknown Book');
            expect(config).toHaveProperty('processing');
            expect(config.processing.maxFileSize).toBe('100MB');
        });
    });
});

// tests/unit/services/config-service.test.ts
describe('ConfigService', () => {
    describe('resolveConfigPath', () => {
        it('should resolve path for book-specific config', () => {
            const path = configService.resolveConfigPath(
                'Rudolf Steiner',
                'Goethes Naturwissenschaftliche Schriften',
            );
            expect(path).toBe(
                'configs/Rudolf_Steiner#Goethes_Naturwissenschaftliche_Schriften.config',
            );
        });

        it('should handle special characters in author/title', () => {
            const path = configService.resolveConfigPath('Author & Co.', 'Book: A Story');
            expect(path).toBe('configs/Author___Co_#Book__A_Story.config');
        });
    });

    describe('loadBookConfig', () => {
        it('should load and parse YAML config correctly', async () => {
            const config = await configService.loadBookConfig('Test Author', 'Test Book');
            expect(config).toHaveProperty('output');
            expect(config).toHaveProperty('processing');
            expect(config).toHaveProperty('deepseek');
        });
    });
});
```

**Key Areas**:

-   **Text Processing Functions**: Line merging, paragraph reconstruction, heading normalization
-   **Utility Functions**: Configuration parsing, validation, file operations
-   **Service Interfaces**: DeepSeek API calls, file operations, metadata extraction
-   **Filename Parsing**: Author/title/book-index extraction from filenames
-   **Error Handling**: Custom error types, error recovery mechanisms
-   **Data Transformations**: Text replacements, structure recognition, footnote processing

#### 2. Integration Tests

**Scope**: Testing interaction between multiple components

**Framework**: Jest with test containers for external dependencies

**Test Structure**:

```typescript
// tests/integration/phases/phase1-integration.test.ts
describe('Phase 1 Integration', () => {
    it('should process PDF through complete Phase 1 pipeline', async () => {
        const result = await phase1Pipeline.process({
            source: 'test-files/sample.pdf',
            config: testConfig,
        });

        expect(result.rawText).toContain('expected content');
        expect(result.footnotes).toHaveLength(5);
        expect(result.chapters).toHaveLength(3);
    });
});
```

**Key Areas**:

-   **Phase Integration**: Complete phase workflows with real data
-   **Service Integration**: DeepSeek API with rate limiting and error handling
-   **File Processing**: PDF, TXT, EPUB processing with various file types
-   **Configuration Loading**: Auto-loading book-specific configs, fallback to defaults
-   **Database Operations**: Metadata storage and retrieval

#### 3. End-to-End (E2E) Tests

**Scope**: Complete CLI workflows from input to output

**Framework**: Custom test harness with CLI execution

**Test Structure**:

```typescript
// tests/e2e/cli-workflows.test.ts
describe('CLI Workflows', () => {
    it('should process book from PDF to final markdown', async () => {
        const result = await runCLI([
            'test-files/sample.pdf',
            '--author',
            'Test Author',
            '--title',
            'Test Book',
            '--output-dir',
            './test-output',
        ]);

        expect(result.exitCode).toBe(0);
        expect(fs.existsSync('./test-output/final-text.md')).toBe(true);
        expect(fs.existsSync('./test-output/footnotes.yaml')).toBe(true);
    });
});
```

**Key Areas**:

-   **Complete Pipeline**: Input file → Final cleaned output
-   **CLI Arguments**: All command-line options and combinations
-   **Output Validation**: Generated files structure and content
-   **Error Scenarios**: Invalid inputs, missing files, API failures
-   **Performance Benchmarks**: Processing time for different file sizes

#### 4. Performance Tests

**Scope**: Performance characteristics and resource usage

**Framework**: Jest with custom performance measurement utilities

**Test Structure**:

```typescript
// tests/performance/processing-benchmarks.test.ts
describe('Processing Performance', () => {
    it('should process large PDF within acceptable time limits', async () => {
        const startTime = Date.now();
        const result = await processLargePDF('test-files/large-book.pdf');
        const processingTime = Date.now() - startTime;

        expect(processingTime).toBeLessThan(60000); // 1 minute
        expect(result.memoryUsage).toBeLessThan(500 * 1024 * 1024); // 500MB
    });
});
```

**Key Areas**:

-   **Memory Usage**: Peak memory consumption during processing
-   **Processing Speed**: Time benchmarks for different file sizes
-   **AI API Performance**: Response times and rate limiting
-   **Concurrent Processing**: Multiple file processing performance
-   **Resource Cleanup**: Memory leaks and file handle management

#### 5. AI Service Tests

**Scope**: DeepSeek API integration and AI-powered text cleaning

**Framework**: Jest with mock services and real API testing

**Test Structure**:

```typescript
// tests/ai/deepseek-service.test.ts
describe('DeepSeek Service', () => {
    describe('with mocked API', () => {
        it('should clean text removing graphics debris', async () => {
            mockDeepSeekAPI.mockResolvedValue({
                cleanedText: 'Clean text without Fig. references',
            });

            const result = await deepSeekService.cleanText('Text with Fig. 1 debris');
            expect(result).not.toContain('Fig.');
        });
    });

    describe('with real API', () => {
        it('should handle rate limiting gracefully', async () => {
            // Test with real API calls
        });
    });
});
```

**Key Areas**:

-   **Mock Testing**: Predictable AI responses for consistent testing
-   **Real API Testing**: Limited tests with actual DeepSeek API
-   **Error Handling**: API failures, rate limiting, network issues
-   **Response Validation**: AI output quality and format checking
-   **Retry Logic**: Exponential backoff and failure recovery

#### 6. File Processing Tests

**Scope**: File handling across different formats and edge cases

**Framework**: Jest with comprehensive test file library

**Test Structure**:

```typescript
// tests/file-processing/pdf-processing.test.ts
describe('PDF Processing', () => {
    const testFiles = [
        'text-only.pdf',
        'mixed-content.pdf',
        'image-heavy.pdf',
        'corrupted.pdf',
        'password-protected.pdf',
    ];

    testFiles.forEach((filename) => {
        it(`should handle ${filename} appropriately`, async () => {
            // Test implementation
        });
    });
});
```

**Key Areas**:

-   **Format Variety**: PDF, TXT, EPUB with different characteristics
-   **Edge Cases**: Corrupted files, password protection, unusual encodings
-   **Size Limits**: Very large files, empty files, minimal content
-   **Character Encoding**: UTF-8, UTF-16, legacy encodings
-   **Structure Variations**: Different chapter numbering, footnote formats

### Test Data Management

#### Test File Repository

```
tests/
├── fixtures/
│   ├── pdfs/
│   │   ├── Rudolf_Steiner#Goethes_Naturwissenschaftliche_Schriften#GA_1.pdf
│   │   ├── Plato#The_Republic.pdf                    # Basic text extraction
│   │   ├── Aristotle#Nicomachean_Ethics#Book_I.pdf   # Text + images
│   │   ├── Kant#Kritik_der_reinen_Vernunft.pdf       # German language content
│   │   ├── Hegel#Phenomenology_of_Spirit.pdf         # Many footnotes
│   │   └── corrupted-file.pdf                        # Error testing
│   ├── txt/
│   │   ├── Author_Name#Book_Title.txt
│   │   ├── legacy-encoding.txt
│   │   └── large-text.txt
│   ├── epub/
│   │   ├── Homer#The_Odyssey.epub
│   │   └── complex-structure.epub
│   ├── expected-outputs/
│   │   ├── Rudolf_Steiner#Goethes_Naturwissenschaftliche_Schriften#GA_1/
│   │   │   ├── raw-text.md
│   │   │   ├── footnotes.yaml
│   │   │   └── structure.json
│   │   └── Plato#The_Republic/
│   │       ├── raw-text.md
│   │       ├── footnotes.yaml
│   │       └── structure.json
│   ├── configs/
│   │   ├── Rudolf_Steiner#Goethes_Naturwissenschaftliche_Schriften.config
│   │   ├── Plato#The_Republic.config
│   │   ├── default.config
│   │   └── test-minimal.config
│   └── config/
│       ├── test-config.yaml
│       ├── minimal-config.yaml
│       └── full-config.yaml
```

#### Test Data Generation

```typescript
// tests/utils/test-data-generator.ts
export class TestDataGenerator {
    static generatePDFWithFootnotes(footnoteCount: number): Buffer {
        // Generate PDF with specified number of footnotes
    }

    static generateLargeTextFile(sizeInMB: number): string {
        // Generate large text file for performance testing
    }

    static generateDeepSeekResponse(inputText: string): DeepSeekResponse {
        // Generate predictable AI responses for testing
    }
}
```

### Test Automation

#### Continuous Integration Pipeline

```yaml
# .github/workflows/test.yml
name: Test Pipeline

on: [push, pull_request]

jobs:
    unit-tests:
        runs-on: ubuntu-latest
        steps:
            - uses: actions/checkout@v3
            - uses: actions/setup-node@v3
              with:
                  node-version: '22'
            - run: npm ci
            - run: npm run test:unit
            - run: npm run test:coverage

    integration-tests:
        runs-on: ubuntu-latest
        needs: unit-tests
        steps:
            - uses: actions/checkout@v3
            - uses: actions/setup-node@v3
              with:
                  node-version: '22'
            - run: npm ci
            - run: npm run test:integration
        env:
            DEEPSEEK_API_KEY: ${{ secrets.DEEPSEEK_API_KEY }}

    e2e-tests:
        runs-on: ubuntu-latest
        needs: integration-tests
        steps:
            - uses: actions/checkout@v3
            - uses: actions/setup-node@v3
              with:
                  node-version: '22'
            - run: npm ci
            - run: npm run test:e2e

    performance-tests:
        runs-on: ubuntu-latest
        needs: unit-tests
        steps:
            - uses: actions/checkout@v3
            - uses: actions/setup-node@v3
              with:
                  node-version: '22'
            - run: npm ci
            - run: npm run test:performance
```

#### Test Scripts

```json
{
    "scripts": {
        "test": "jest",
        "test:unit": "jest --testPathPattern=/unit/",
        "test:integration": "jest --testPathPattern=/integration/",
        "test:e2e": "jest --testPathPattern=/e2e/",
        "test:performance": "jest --testPathPattern=/performance/",
        "test:coverage": "jest --coverage",
        "test:watch": "jest --watch",
        "test:debug": "node --inspect-brk node_modules/.bin/jest --runInBand"
    }
}
```

### Test Configuration

#### Jest Configuration

```typescript
// jest.config.ts
export default {
    preset: 'ts-jest',
    testEnvironment: 'node',
    roots: ['<rootDir>/src', '<rootDir>/tests'],
    testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
    collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts', '!src/index.ts'],
    coverageThreshold: {
        global: {
            branches: 90,
            functions: 90,
            lines: 90,
            statements: 90,
        },
    },
    setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
    testTimeout: 30000,
    maxWorkers: 4,
};
```

#### Test Environment Setup

```typescript
// tests/setup.ts
import { Logger } from 'pino';
import { TestDataGenerator } from './utils/test-data-generator';

// Global test setup
beforeAll(async () => {
    // Initialize test environment
    await TestDataGenerator.setupTestFiles();

    // Configure logging for tests
    process.env.LOG_LEVEL = 'error';

    // Setup mock services
    jest.mock('../src/services/deepseek-service');
});

afterAll(async () => {
    // Cleanup test environment
    await TestDataGenerator.cleanupTestFiles();
});
```

### Quality Assurance

#### Test Quality Metrics

-   **Code Coverage**: Minimum 90% line coverage
-   **Test Coverage**: All critical paths must have tests
-   **Performance Benchmarks**: Processing time limits for different file sizes
-   **Error Coverage**: All error conditions must be tested
-   **AI Response Validation**: Output quality checks for AI-generated content

#### Test Review Process

1. **Code Review**: All test code must be reviewed
2. **Test Data Review**: Test files and expected outputs reviewed
3. **Performance Review**: Performance test results monitored
4. **Documentation Review**: Test documentation kept current

#### Test Maintenance

-   **Regular Updates**: Test data updated with new edge cases
-   **Performance Monitoring**: Benchmark results tracked over time
-   **Mock Service Updates**: AI service mocks updated with API changes
-   **Test File Rotation**: Large test files managed and rotated

### Testing Tools and Dependencies

```json
{
    "devDependencies": {
        "@types/jest": "^29.5.0",
        "jest": "^29.5.0",
        "ts-jest": "^29.1.0",
        "supertest": "^6.3.0",
        "nock": "^13.3.0",
        "tmp": "^0.2.1",
        "mock-fs": "^5.2.0",
        "memfs": "^4.1.0",
        "jest-extended": "^4.0.0",
        "jest-performance": "^1.0.0"
    }
}
```

### Test Reporting

#### Coverage Reports

-   **HTML Report**: Detailed coverage visualization
-   **JSON Report**: Machine-readable coverage data
-   **LCOV Report**: Integration with code analysis tools
-   **Console Report**: Quick overview during development

#### Performance Reports

-   **Benchmark Results**: Processing time trends
-   **Memory Usage**: Peak memory consumption tracking
-   **API Performance**: DeepSeek API response times
-   **Resource Utilization**: CPU and I/O usage patterns

This comprehensive testing strategy ensures reliability, performance, and maintainability of the book cleaning pipeline while providing confidence in the AI-powered text processing capabilities.

## Deployment & Distribution

### NPM Package

-   CLI executable
-   TypeScript definitions
-   Configuration templates
-   Documentation

### Docker Support

-   Containerized deployment
-   Environment configuration
-   Volume mounting for configs
-   Health checks

## Future Enhancements

### Phase 4 Implementation

-   Person directory generation
-   Bibliography extraction
-   Glossary creation
-   Cross-reference linking

### Additional Features

-   Web interface
-   Batch processing
-   Plugin system
-   Custom AI models
-   Multiple output formats

### Performance Optimizations

-   Parallel processing
-   Streaming workflows
-   Advanced caching
-   GPU acceleration for OCR

## Development Guidelines

### Code Standards

-   TypeScript strict mode
-   Biomejs formatting
-   Comprehensive JSDoc comments
-   Error-first callbacks
-   Async/await patterns

### Git Workflow

-   Feature branches
-   Conventional commits
-   Automated testing
-   Code review requirements

### Documentation

-   API documentation
-   Usage examples
-   Troubleshooting guides
-   Performance benchmarks
    ()
