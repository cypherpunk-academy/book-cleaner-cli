# Book Cleaner CLI - Implementation Plan

## Overview

This document outlines the implementation plan for the Book Cleaner CLI project, a Node.js/TypeScript application that transforms raw book sources (PDFs, text files, EPUB) into clean, readable Markdown format with comprehensive metadata.

The implementation is divided into logical phases, each building upon the previous one to create a robust, scalable text processing pipeline.

## Phase 1: Project Foundation & Base Architecture

### 1.1 Project Setup

**Duration:** 2-3 days

**Deliverables:**

-   [ ] Initialize Node.js project with TypeScript
-   [ ] Setup package.json with dependencies
-   [ ] Configure Biomejs for linting and formatting
-   [ ] Setup Jest testing framework
-   [ ] Create initial project structure
-   [ ] Setup GitHub Actions CI/CD pipeline

**Key Files:**

```
book-cleaner-cli/
├── package.json
├── tsconfig.json
├── biome.json
├── jest.config.js
├── .github/workflows/ci.yml
└── src/
    ├── index.ts
    ├── types/
    ├── utils/
    ├── services/
    └── cli/
```

**Dependencies:**

-   TypeScript, @types/node
-   Commander.js for CLI
-   Pino for logging
-   Jest for testing
-   Biomejs for linting
-   pdf-parse, epub2, mammoth for file processing

### 1.2 Core Infrastructure

**Duration:** 3-4 days

**Deliverables:**

-   [ ] Implement tagged Pino logging system
-   [ ] Create configuration management system
-   [ ] Build CLI framework with Commander.js
-   [ ] Setup error handling and validation
-   [ ] Create base TypeScript interfaces
-   [ ] Implement file system utilities

**Key Components:**

-   `src/services/LoggerService.ts` - Tagged logging implementation
-   `src/services/ConfigService.ts` - Configuration loading and management
-   `src/cli/commands/` - CLI command structure
-   `src/types/` - Core TypeScript interfaces
-   `src/utils/FileUtils.ts` - File system operations

**Testing:**

-   Unit tests for all core services
-   CLI command testing framework
-   Configuration loading tests

### 1.3 Pipeline Framework

**Duration:** 2-3 days

**Deliverables:**

-   [ ] Create abstract pipeline architecture
-   [ ] Implement phase management system
-   [ ] Build progress tracking and reporting
-   [ ] Create pipeline state management
-   [ ] Setup inter-phase data flow

**Key Components:**

-   `src/pipeline/PipelineManager.ts` - Main pipeline orchestrator
-   `src/pipeline/phases/` - Abstract phase classes
-   `src/pipeline/state/` - Pipeline state management
-   `src/services/ProgressService.ts` - Progress tracking

## Phase 2: Text Extraction & Format Processing

### 2.1 File Format Detection & Validation

**Duration:** 3-4 days

**Overview:**
Implement comprehensive file format detection that goes beyond simple extension checking to validate actual file content, structure, and processing capabilities. This prevents security issues and processing failures while optimizing the pipeline for different file types.

**Supported Formats:**

-   **PDF**: Text-based, image-based, or hybrid content (max 10MB)
-   **EPUB**: Standard EPUB 2.0/3.0 (DRM-protected files rejected)
-   **TXT**: Plain text files with encoding detection

**Deliverables:**

**Core Detection System:**

-   [ ] Implement magic number detection for format identification
-   [ ] Create file header analysis (first 16 bytes minimum)
-   [ ] Build extension vs. content validation with mismatch warnings
-   [ ] Implement file size validation (10MB limit for PDFs)
-   [ ] Create confidence scoring system for format detection

**Format-Specific Validation:**

**PDF Validation:**

-   [ ] Detect PDF magic number (`%PDF-1.x`) and version
-   [ ] Validate PDF structure integrity using pdf-parse
-   [ ] Classify PDF content type:
    -   Text-based: Contains extractable embedded text
    -   Image-based: Requires OCR processing
    -   Hybrid: Mixed content requiring both approaches
-   [ ] Extract basic metadata (page count, creation date, title/author)
-   [ ] Assess text extraction quality and coverage

**EPUB Validation:**

-   [ ] Validate ZIP file structure (magic number `PK\x03\x04`)
-   [ ] Verify EPUB-specific files (META-INF/container.xml, \*.opf)
-   [ ] Detect EPUB version (2.0 vs 3.0) for appropriate parsing
-   [ ] **DRM Detection & Rejection:**
    -   Check for DRM indicators in rights metadata
    -   Scan for encrypted content files
    -   Validate accessibility of text content
    -   Generate clear error messages for DRM-protected files
-   [ ] Validate table of contents and chapter structure
-   [ ] Extract embedded metadata (title, author, publisher, language)

**Text File Validation:**

-   [ ] Implement encoding detection (UTF-8, UTF-16, Latin1)
-   [ ] Validate text content vs. binary data (printable character ratio)
-   [ ] Check for Byte Order Mark (BOM) handling
-   [ ] Detect and handle different line ending formats
-   [ ] Validate minimum content length (>100 characters)
-   [ ] Check for common encoding issues (replacement characters)

**Security & Error Handling:**

-   [ ] Implement file size limits and validation
-   [ ] Prevent path traversal attacks in filename parsing
-   [ ] Validate file permissions and accessibility
-   [ ] Create comprehensive error messages with actionable guidance
-   [ ] Handle corrupted or malformed files gracefully
-   [ ] Implement timeout mechanisms for large file processing

**Metadata Extraction:**

-   [ ] Parse filename patterns: `<author>#<title>[#<book-index>].<extension>`
-   [ ] Extract and validate author, title, and book index
-   [ ] Handle special characters and encoding in filenames
-   [ ] Generate default metadata for files without embedded info
-   [ ] Validate metadata consistency across filename and content

**Key Components:**

```typescript
src/services/
├── FileFormatDetector.ts       // Main detection service
├── FilenameParser.ts           // Metadata extraction from filenames
├── SecurityValidator.ts        // File security and size validation
└── FormatValidators/
    ├── PDFValidator.ts         // PDF-specific validation
    ├── EPUBValidator.ts        // EPUB validation and DRM detection
    └── TextValidator.ts        // Text file encoding and content validation

src/types/
├── FileFormat.ts               // Format detection result types
├── ValidationResult.ts         // Validation outcome types
└── SecurityTypes.ts           // Security validation types

src/constants/
└── FormatConstants.ts          // Magic numbers, size limits, patterns
```

**Implementation Details:**

**Magic Number Detection:**

```typescript
const MAGIC_NUMBERS = {
    PDF: [0x25, 0x50, 0x44, 0x46], // %PDF
    EPUB: [0x50, 0x4b, 0x03, 0x04], // ZIP signature
    UTF8_BOM: [0xef, 0xbb, 0xbf], // UTF-8 BOM
    UTF16_LE: [0xff, 0xfe], // UTF-16 LE BOM
};
```

**File Size Validation:**

-   PDF files: Maximum 10MB (configurable)
-   EPUB files: Maximum 5MB (typical size)
-   Text files: Maximum 1MB (reasonable limit)

**Error Message Examples:**

```
- "File format mismatch: Extension suggests PDF but content is ZIP"
- "EPUB file is DRM-protected and cannot be processed"
- "PDF file exceeds maximum size limit of 10MB"
- "Text file contains binary content and cannot be processed"
- "File appears to be corrupted or malformed"
```

**Testing:**

**Format Detection Tests:**

-   [ ] Magic number detection accuracy (100% for supported formats)
-   [ ] Extension vs. content mismatch detection
-   [ ] Corrupted file handling
-   [ ] Security validation (oversized files, malicious content)
-   [ ] Performance testing with large files (up to 10MB)

**Format-Specific Tests:**

-   [ ] PDF content type classification (text/image/hybrid)
-   [ ] EPUB DRM detection accuracy
-   [ ] Text encoding detection (UTF-8, Latin1, Windows-1252)
-   [ ] Filename parsing with various patterns and edge cases
-   [ ] Metadata extraction accuracy and consistency

**Edge Cases:**

-   [ ] Empty files and minimum size validation
-   [ ] Files with multiple extensions (e.g., .txt.pdf)
-   [ ] Unicode characters in filenames
-   [ ] Files with missing or invalid metadata
-   [ ] Network-mounted files and permission issues

**Success Criteria:**

-   100% accuracy for supported format detection
-   Zero false positives for DRM-protected EPUB detection
-   Sub-second validation for files up to 10MB
-   Clear, actionable error messages for all failure cases
-   Graceful handling of all file corruption scenarios

### 2.2 PDF Text Extraction

**Duration:** 4-5 days

**Deliverables:**

-   [ ] Implement PDF text extraction using pdf-parse
-   [ ] Build embedded text quality assessment
-   [ ] Create page-by-page text extraction
-   [ ] Implement text structure preservation
-   [ ] Handle PDF metadata extraction

**Key Components:**

-   `src/handlers/PDFHandler.ts`
-   `src/services/PDFTextExtractor.ts`
-   `src/services/TextQualityAssessor.ts`
-   `src/utils/PDFUtils.ts`

**Features:**

-   Extract embedded text with position data
-   Assess text quality and completeness
-   Handle multi-column layouts
-   Extract PDF metadata (title, author, creation date)
-   Preserve paragraph and section structure

### 2.3 EPUB Text Extraction

**Duration:** 3-4 days

**Deliverables:**

-   [ ] Implement EPUB parsing and text extraction
-   [ ] Handle EPUB structure and navigation
-   [ ] Extract embedded images and media
-   [ ] Process EPUB metadata
-   [ ] Handle different EPUB versions

**Key Components:**

-   `src/handlers/EPUBHandler.ts`
-   `src/services/EPUBProcessor.ts`
-   `src/utils/EPUBUtils.ts`

**Features:**

-   Parse EPUB structure (OPF, NCX, XHTML)
-   Extract text content preserving structure
-   Handle embedded CSS and formatting
-   Extract table of contents
-   Process EPUB metadata

### 2.4 Plain Text Processing

**Duration:** 2-3 days

**Deliverables:**

-   [ ] Implement plain text file processing
-   [ ] Create encoding detection and handling
-   [ ] Build text structure analysis
-   [ ] Handle different text formats
-   [ ] Implement text cleanup utilities

**Key Components:**

-   `src/handlers/TextHandler.ts`
-   `src/services/TextProcessor.ts`
-   `src/utils/EncodingDetector.ts`

**Features:**

-   Auto-detect text encoding
-   Handle various line endings
-   Basic structure detection
-   Text normalization
-   Character encoding conversion

## Phase 3: OCR Integration & Text Comparison

### 3.1 OCR Service Integration

**Duration:** 4-5 days

**Deliverables:**

-   [ ] Integrate Tesseract OCR engine
-   [ ] Implement PDF to image conversion
-   [ ] Create OCR quality assessment
-   [ ] Build OCR result processing
-   [ ] Handle multilingual OCR

**Key Components:**

-   `src/services/OCRService.ts`
-   `src/services/ImageProcessor.ts`
-   `src/utils/OCRUtils.ts`
-   `src/types/OCRTypes.ts`

**Features:**

-   Convert PDF pages to images
-   OCR processing with Tesseract
-   Language detection and optimization
-   OCR confidence scoring
-   Result formatting and cleanup

### 3.2 Text Comparison Engine

**Duration:** 3-4 days

**Deliverables:**

-   [ ] Implement text similarity comparison
-   [ ] Create diff generation system
-   [ ] Build quality scoring algorithms
-   [ ] Handle text alignment and matching
-   [ ] Generate comparison reports

**Key Components:**

-   `src/services/TextComparator.ts`
-   `src/services/DiffGenerator.ts`
-   `src/algorithms/TextSimilarity.ts`
-   `src/types/ComparisonTypes.ts`

**Features:**

-   Compare embedded text vs OCR text
-   Generate detailed diff reports
-   Quality scoring based on comparison
-   Identify problematic sections
-   Suggest best text source

### 3.3 Smart Text Selection

**Duration:** 2-3 days

**Deliverables:**

-   [ ] Implement intelligent text selection
-   [ ] Create hybrid text combination
-   [ ] Build confidence-based selection
-   [ ] Handle section-by-section selection
-   [ ] Generate selection reports

**Key Components:**

-   `src/services/TextSelector.ts`
-   `src/algorithms/ConfidenceScoring.ts`
-   `src/services/HybridTextBuilder.ts`

**Features:**

-   Select best text source per section
-   Combine OCR and embedded text
-   Confidence-based decision making
-   Manual override capabilities
-   Selection audit trail

## Phase 4: Basic Pipeline Implementation

### 4.1 Phase 1 Pipeline Implementation

**Duration:** 5-6 days

**Deliverables:**

-   [ ] Implement complete Phase 1 pipeline
-   [ ] Integrate all text extraction services
-   [ ] Create metadata generation system
-   [ ] Build chapter recognition
-   [ ] Implement footnote extraction

**Key Components:**

-   `src/pipeline/phases/Phase1DataLoading.ts`
-   `src/services/MetadataGenerator.ts`
-   `src/services/ChapterRecognizer.ts`
-   `src/services/FootnoteExtractor.ts`

**Features:**

-   Complete text loading pipeline
-   Comprehensive metadata generation
-   Chapter and section detection
-   Footnote extraction and processing
-   Quality assessment and reporting

### 4.2 Configuration System Integration

**Duration:** 3-4 days

**Deliverables:**

-   [ ] Implement auto-loading configuration system
-   [ ] Create author-specific configurations
-   [ ] Build configuration validation
-   [ ] Handle configuration inheritance
-   [ ] Create configuration templates

**Key Components:**

-   `src/services/ConfigService.ts` (enhanced)
-   `src/validators/ConfigValidator.ts`
-   `src/templates/ConfigTemplate.ts`
-   `configs/` - Configuration files

**Features:**

-   Auto-load configs based on filename
-   Author-specific settings
-   Default configuration fallback
-   Configuration validation and error handling
-   Template-based config generation

### 4.3 CLI Interface Completion

**Duration:** 2-3 days

**Deliverables:**

-   [ ] Complete CLI command implementation
-   [ ] Add progress reporting and logging
-   [ ] Implement verbose and debug modes
-   [ ] Create output formatting options
-   [ ] Add help and documentation

**Key Components:**

-   `src/cli/commands/CleanBookCommand.ts`
-   `src/cli/formatters/` - Output formatters
-   `src/cli/helpers/` - CLI utilities

**Features:**

-   Complete clean-book command
-   Progress bars and status updates
-   Verbose logging modes
-   Multiple output formats
-   Comprehensive help system

## Phase 5: Testing & Quality Assurance

### 5.1 Comprehensive Testing Suite

**Duration:** 4-5 days

**Deliverables:**

-   [ ] Unit tests for all components (90% coverage)
-   [ ] Integration tests for file processing
-   [ ] End-to-end CLI workflow tests
-   [ ] Performance benchmarking tests
-   [ ] Error handling and edge case tests

**Testing Structure:**

```
tests/
├── unit/
│   ├── services/
│   ├── handlers/
│   └── utils/
├── integration/
│   ├── pipeline/
│   └── formats/
├── e2e/
│   └── cli/
├── performance/
└── fixtures/
    ├── pdfs/
    ├── epubs/
    └── configs/
```

### 5.2 Performance Optimization

**Duration:** 3-4 days

**Deliverables:**

-   [ ] Memory usage optimization
-   [ ] Processing speed improvements
-   [ ] Resource management enhancements
-   [ ] Caching mechanisms
-   [ ] Performance monitoring

**Key Areas:**

-   Large file processing optimization
-   Memory-efficient text handling
-   OCR processing optimization
-   Parallel processing implementation
-   Resource cleanup and management

### 5.3 Documentation & Examples

**Duration:** 2-3 days

**Deliverables:**

-   [ ] API documentation
-   [ ] Usage examples and tutorials
-   [ ] Configuration guide
-   [ ] Troubleshooting guide
-   [ ] Developer documentation

**Documentation:**

-   README.md with quick start guide
-   API reference documentation
-   Configuration examples
-   Common use cases and examples
-   Developer contribution guide

## Phase 6: Advanced Features & Phase 2 Preparation

### 6.1 Error Recovery & Resilience

**Duration:** 3-4 days

**Deliverables:**

-   [ ] Implement robust error handling
-   [ ] Create recovery mechanisms
-   [ ] Build retry logic for external services
-   [ ] Handle partial processing failures
-   [ ] Create error reporting system

### 6.2 Performance Monitoring & Metrics

**Duration:** 2-3 days

**Deliverables:**

-   [ ] Processing time tracking
-   [ ] Memory usage monitoring
-   [ ] Quality metrics collection
-   [ ] Performance reporting
-   [ ] Bottleneck identification

### 6.3 Phase 2 Foundation

**Duration:** 3-4 days

**Deliverables:**

-   [ ] Basic text normalization framework
-   [ ] DeepSeek API integration foundation
-   [ ] Safe text replacement system
-   [ ] Heading normalization utilities
-   [ ] Spell checking preparation

## Implementation Timeline

### Total Duration: 12-14 weeks

**Phase 1 (Weeks 1-2):** Foundation & Architecture
**Phase 2 (Weeks 3-5):** Text Extraction & Format Processing
**Phase 3 (Weeks 6-8):** OCR Integration & Text Comparison
**Phase 4 (Weeks 9-10):** Basic Pipeline Implementation
**Phase 5 (Weeks 11-12):** Testing & Quality Assurance
**Phase 6 (Weeks 13-14):** Advanced Features & Phase 2 Preparation

## Success Criteria

### Phase 1 Success Metrics:

-   [ ] All core services operational
-   [ ] CLI framework functional
-   [ ] Configuration system working
-   [ ] Basic pipeline structure complete

### Phase 2 Success Metrics:

-   [ ] PDF text extraction working reliably
-   [ ] EPUB processing functional
-   [ ] Text format handling complete
-   [ ] File validation system operational

### Phase 3 Success Metrics:

-   [ ] OCR integration working
-   [ ] Text comparison producing accurate results
-   [ ] Smart text selection functional
-   [ ] Quality assessment reliable

### Phase 4 Success Metrics:

-   [ ] Complete Phase 1 pipeline operational
-   [ ] Configuration system fully integrated
-   [ ] CLI interface complete and user-friendly
-   [ ] Metadata generation working

### Phase 5 Success Metrics:

-   [ ] 90%+ test coverage achieved
-   [ ] Performance benchmarks met
-   [ ] Error handling robust
-   [ ] Documentation complete

### Phase 6 Success Metrics:

-   [ ] Error recovery mechanisms working
-   [ ] Performance monitoring operational
-   [ ] Foundation for Phase 2 ready
-   [ ] System ready for production use

## Risk Mitigation

### Technical Risks:

-   **OCR Accuracy:** Implement multiple OCR engines as fallbacks
-   **Large File Processing:** Implement streaming and chunking
-   **Memory Usage:** Implement proper resource management
-   **PDF Complexity:** Handle various PDF formats and structures

### Dependencies:

-   **External Libraries:** Keep dependencies minimal and well-maintained
-   **OCR Engine:** Ensure Tesseract is properly configured
-   **Node.js Version:** Target stable LTS versions
-   **System Resources:** Monitor and optimize resource usage

### Quality Assurance:

-   **Testing:** Comprehensive test suite from early phases
-   **Code Review:** Regular code reviews and pair programming
-   **Documentation:** Keep documentation updated throughout
-   **User Feedback:** Early user testing and feedback integration

## Next Steps

1. **Phase 1.1 Start:** Initialize project structure and setup
2. **Milestone Reviews:** Weekly progress reviews and adjustments
3. **User Testing:** Early user feedback collection
4. **Performance Monitoring:** Continuous performance tracking
5. **Documentation:** Maintain documentation throughout development

This implementation plan provides a structured approach to building the Book Cleaner CLI, ensuring each phase builds upon the previous one while maintaining high quality and comprehensive testing throughout the development process.
