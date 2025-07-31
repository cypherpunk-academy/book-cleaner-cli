# Book Cleaner CLI - Implementation Plan (Updated)

## Overview

This document outlines the implementation plan for the Book Cleaner CLI project, a Node.js/TypeScript application that transforms raw book sources (PDFs, text files, EPUB) into clean, readable Markdown format with comprehensive metadata.

**Current Status (January 2025):** The project has advanced significantly beyond the original plan. Phase 1 and most core functionality is complete, with OCR processing fully operational. The focus now shifts to implementing the new step 1.2 approach with user review workflow, OCR caching, AI-powered text normalization, and Phase 2-4 implementations.

## Current Implementation Status ✅

### ✅ COMPLETED PHASES

#### Phase 1: Project Foundation & Base Architecture - COMPLETE
- [x] **1.1 Project Setup** - TypeScript, Biome, Jest, CI/CD all configured
- [x] **1.2 Core Infrastructure** - Pino logging, ConfigService, CLI framework, error handling complete
- [x] **1.3 Pipeline Framework** - PipelineManager, AbstractPhase, step architecture complete

#### Phase 2: Text Extraction & Format Processing - COMPLETE
- [x] **2.1 File Format Detection & Validation** - Complete with security validation
- [x] **2.2 PDF Text Extraction** - Complete with hybrid text+OCR processing
- [x] **2.3 EPUB Text Extraction** - Complete with structure preservation
- [x] **2.4 Plain Text Processing** - Complete with encoding detection

#### Phase 3: OCR Integration & Text Comparison - COMPLETE
- [x] **3.1 OCR Service Integration** - Tesseract.js integrated with structured recognition
- [x] **3.2 Text Comparison Engine** - Complete quality assessment and comparison
- [x] **3.3 Smart Text Selection** - Intelligent text selection between sources

#### Phase 4: Basic Pipeline Implementation - COMPLETE
- [x] **4.1 Phase 1 Pipeline Implementation** - DataLoadingPhase fully functional
- [x] **4.2 Configuration System Integration** - BookStructureService with YAML configs
- [x] **4.3 CLI Interface Completion** - CleanBookCommand operational

### 🔄 UPDATED IMPLEMENTATIONS (Needs Implementation)

#### Phase 1: Step 1.2 - NEW APPROACH - OCR Structure Retrieval & User Review
- [ ] **1.2.1 Book Manifest Detection** - Check for existing book-manifest.yaml
- [ ] **1.2.2 OCR Structure Discovery** - Perform OCR when no manifest exists
- [ ] **1.2.3 Footnote Detection** - Detect footnotes from OCR results
- [ ] **1.2.4 User Review Workflow** - Exit with clear message for user review
- [ ] **1.2.5 Manifest Creation** - Generate initial book-manifest.yaml with discovered structure

#### Phase 2: Text Normalization & AI Cleaning - PLACEHOLDER
- [ ] **2.1 DeepSeek API Integration** - Text cleaning and normalization
- [ ] **2.2 Structured Text Processing** - Heading normalization, paragraph cleanup
- [ ] **2.3 German Text Optimization** - Umlaut handling, philosophical text processing

#### Phase 3: Evaluation & Analysis - PLACEHOLDER
- [ ] **3.1 Quality Metrics** - Comprehensive quality scoring
- [ ] **3.2 Analysis Reports** - Processing statistics and recommendations

#### Phase 4: AI Enhancements - PLACEHOLDER
- [ ] **4.1 Content Enhancement** - AI-powered improvements
- [ ] **4.2 Metadata Enrichment** - Enhanced book structure analysis

## 🎯 IMMEDIATE PRIORITIES

### Priority 1: Step 1.2 User Review Workflow Implementation

**Duration:** 1-2 weeks
**Status:** CRITICAL - New approach requires implementation

The current step 1.2 needs to be updated to implement the new user review workflow where it exits after structure discovery for user review.

**Current Step 1.2 Behavior:**
- Always performs text extraction
- Prompts for boundaries if missing
- Continues through pipeline

**New Step 1.2 Behavior:**
- Check if book-manifest.yaml exists in book-artifacts
- If NO manifest: Perform OCR, detect structure, create manifest, EXIT for user review
- If manifest exists: Use existing structure, continue normally

**Required Implementation:**

#### 1.1 Book Manifest Detection System
**Deliverables:**
- [ ] Implement book-manifest.yaml existence check in TextExtractor
- [ ] Add manifest path resolution logic
- [ ] Create manifest validation and loading functions
- [ ] Integration with existing BookStructureService

**Key Components:**
```typescript
// New methods needed in TextExtractor:
async checkBookManifestExists(metadata: FilenameMetadata): Promise<boolean>
async loadExistingBookManifest(metadata: FilenameMetadata): Promise<BookManifest>
async createInitialBookManifest(metadata: FilenameMetadata, discoveredStructure: DiscoveredStructure): Promise<void>
async exitForUserReview(metadata: FilenameMetadata, discoveredStructure: DiscoveredStructure): Promise<never>
```

#### 1.2 OCR Structure Discovery
**Deliverables:**
- [ ] Enhanced OCR processing for structure discovery
- [ ] Footnote detection from OCR results using detectFootnotesFromOcr.ts
- [ ] Chapter and heading detection from OCR
- [ ] Structure metadata extraction and formatting

**Structure Discovery Process:**
```typescript
interface DiscoveredStructure {
    chapters: ChapterInfo[];
    footnotes: FootnoteInfo[];
    pageBoundaries: PageBoundaryInfo;
    textBoundaries: TextBoundaryInfo;
    metadata: BookMetadata;
}
```

#### 1.3 User Review Workflow
**Deliverables:**
- [ ] Clear exit message with instructions
- [ ] Generated book-manifest.yaml with discovered structure
- [ ] User-friendly guidance for manual review
- [ ] Validation of user-updated manifest on next run

**Exit Message Example:**
```
✅ Structure Discovery Complete!

📖 Book: Rudolf Steiner - Goethes Naturwissenschaftliche Schriften
📄 Discovered structure:
   - Chapters: 12 chapters detected
   - Footnotes: 45 footnotes found
   - Page boundaries: Pages 5-120 contain author content
   - Text boundaries: "müsse, um ihm erkennend beizukommen." to "Daten zur Herausgabe"

📝 Next steps:
   1. Review the generated book-manifest.yaml file
   2. Update any incorrect structure information
   3. Re-run the command to continue processing

📍 Manifest location: book-artifacts/Rudolf_Steiner#Goethes_Naturwissenschaftliche_Schriften#GA_1/book-manifest.yaml
```

#### 1.4 Integration Points
- [ ] Update DataLoadingPhase to handle step 1.2 exit conditions
- [ ] Modify PipelineManager to support early exit with user review
- [ ] Update CLI to provide clear feedback about review process
- [ ] Add validation for user-updated manifests

### Priority 2: OCR Caching Implementation

**Duration:** 1-2 weeks
**Status:** HIGH PRIORITY - Currently OCR reprocesses every time

The book-artifacts structure exists but OCR caching is not implemented. This causes expensive OCR reprocessing on every run.

**Current Book-Artifacts Structure:**
```
book-artifacts/
├── default-book-manifest.yaml
└── <author>#<title>#<book-index>/
    ├── book-manifest.yaml (✅ populated)
    ├── phase1/ (❌ empty - needs OCR cache)
    ├── phase2/ (empty)
    └── phase3/ (empty)
```

**Required Implementation:**

#### 2.1 OCR Cache System
**Deliverables:**
- [ ] Implement OCR result caching in `phase1/` directory
- [ ] Cache structure: `phase1/ocr-cache.json` with metadata
- [ ] Cache validation based on file hash and processing parameters
- [ ] Cache expiration and invalidation logic
- [ ] Integration with existing OCRService.ts

**Key Components:**
```typescript
// New files needed:
src/services/CacheService.ts              // Generic caching service
src/services/OCRCacheService.ts           // OCR-specific caching
src/types/CacheTypes.ts                   // Cache interfaces
```

**Cache Structure in book-artifacts:**
```
<author>#<title>#<book-index>/phase1/
├── ocr-cache.json                 // OCR results and metadata
├── ocr-processing-info.json       // Processing parameters used
├── file-hash.txt                 // Original file hash for validation
└── pages/                        // Optional: individual page results
    ├── page-001.json
    ├── page-002.json
    └── ...
```

#### 2.2 Integration Points
- [ ] Update `OCRService.performOCR()` to check cache first
- [ ] Update `TextExtractor` to use cached results when available
- [ ] Add cache invalidation when file changes detected
- [ ] Add CLI option to force cache refresh: `--no-cache`

#### 2.3 Cache Benefits
- **Performance:** Avoid expensive OCR reprocessing (300+ page books take 10+ minutes)
- **Consistency:** Same OCR results across runs
- **Development:** Faster iteration during development
- **Cost Efficiency:** Reduce computational costs

### Priority 3: Complete Phase 2 (Text Normalization)

**Duration:** 2-3 weeks
**Status:** HIGH PRIORITY

#### 3.1 DeepSeek API Integration
**Deliverables:**
- [ ] Implement DeepSeek API client with error handling
- [ ] Text cleaning prompts optimized for German philosophical texts
- [ ] Batch processing for large documents
- [ ] Rate limiting and retry logic
- [ ] **Exit on failure policy** (no fallbacks per user rules)

**Key Components:**
```typescript
src/services/DeepSeekService.ts           // API client
src/services/TextNormalizationService.ts  // Text processing orchestrator
src/templates/DeepSeekPrompts.ts          // Optimized prompts
```

#### 3.2 Structured Text Processing
**Deliverables:**
- [ ] Heading level normalization (H1, H2, H3)
- [ ] Paragraph structure optimization
- [ ] Footnote processing and formatting
- [ ] German umlaut and special character handling

#### 3.3 Integration with Existing Pipeline
- [ ] Replace TextNormalizationPhase placeholder
- [ ] Update PipelineManager to include real Phase 2
- [ ] Results saved to `results/` directory with intermediate outputs
- [ ] Integration with book-artifacts for caching normalized results

### Priority 4: Testing & Quality Assurance

**Duration:** 1-2 weeks
**Status:** MEDIUM PRIORITY

#### 4.1 Comprehensive Test Suite
**Current Status:** Basic test framework exists, needs comprehensive tests

**Deliverables:**
- [ ] Unit tests for step 1.2 user review workflow
- [ ] Unit tests for OCR caching system
- [ ] Integration tests for complete pipeline
- [ ] Test fixtures for various book formats
- [ ] Performance benchmarking tests
- [ ] Error handling tests

**Testing Structure:**
```
tests/
├── unit/
│   ├── pipeline/step1-2-user-review.test.ts
│   ├── services/CacheService.test.ts
│   ├── services/OCRCacheService.test.ts
│   └── pipeline/DataLoadingPhase.test.ts
├── integration/
│   ├── pipeline/complete-pipeline.test.ts
│   ├── user-review/user-review-workflow.test.ts
│   └── caching/ocr-cache-integration.test.ts
├── performance/
│   └── ocr-performance.test.ts
└── fixtures/
    ├── pdfs/sample-books/
    ├── book-manifests/
    └── expected-outputs/
```

### Priority 5: Documentation Updates

**Duration:** 1 week
**Status:** LOW PRIORITY

**Deliverables:**
- [ ] Update README.md with user review workflow
- [ ] API documentation for new step 1.2 behavior
- [ ] Usage examples for user review process
- [ ] Developer setup guide updates

## 📋 UPDATED PROJECT STRUCTURE

**Current Structure (Reflects Reality):**
```
src/
├── cli/
│   └── CleanBookCommand.ts              # ✅ Complete CLI interface
├── constants.ts                         # ✅ All constants centralized
├── handlers/                           # ✅ Error and utility handlers
├── index.ts                            # ✅ Main entry point
├── pipeline/
│   ├── AbstractPhase.ts                # ✅ Base phase class
│   ├── PipelineManager.ts              # ✅ Complete orchestrator
│   ├── DataLoadingPhase.ts             # ✅ Phase 1 implementation
│   ├── TextNormalizationPhase.ts       # 🔄 Placeholder
│   ├── EvaluationPhase.ts              # 🔄 Placeholder  
│   ├── AIEnhancementsPhase.ts          # 🔄 Placeholder
│   └── phase_1_Text_Extraction_And_Format_Processing/
│       ├── step_1_File_Format_Detection_And_Validation/
│       │   ├── FileFormatDetector.ts   # ✅ Complete
│       │   └── ExecutionSummary.ts     # ✅ Complete
│       ├── step_2_Text_Extraction/
│       │   ├── TextExtractor.ts        # 🔄 NEEDS UPDATE: User review workflow
│       │   ├── detectFootnotesFromOcr.ts # ✅ Complete footnote detection
│       │   └── ExecutionSummary.ts     # ✅ Complete
│       ├── step_3_Text_Quality_Enhancement/
│       │   ├── TextComparator.ts       # ✅ Complete
│       │   ├── QualityValidator.ts     # ✅ Complete
│       │   └── TextEnhancer.ts         # ✅ Complete
│       └── step_4_Structure_Recognition/
│           ├── ChapterRecognizer.ts    # 🔄 Partial
│           └── ExecutionSummary.ts     # 🔄 Basic
├── services/
│   ├── LoggerService.ts                # ✅ Complete with tagged logging
│   ├── ConfigService.ts                # ✅ Complete YAML config loading
│   ├── BookStructureService.ts         # ✅ Complete book structure management
│   ├── StructureAnalyzer.ts            # ✅ Complete analysis service
│   ├── CacheService.ts                 # ❌ NEEDS IMPLEMENTATION
│   ├── OCRCacheService.ts              # ❌ NEEDS IMPLEMENTATION
│   └── DeepSeekService.ts              # ❌ NEEDS IMPLEMENTATION
├── types/
│   ├── index.ts                        # ✅ Complete type definitions
│   ├── CacheTypes.ts                   # ❌ NEEDS IMPLEMENTATION
│   └── UserReviewTypes.ts              # ❌ NEEDS IMPLEMENTATION
└── utils/
    ├── FileUtils.ts                    # ✅ Complete file operations
    ├── AppError.ts                     # ✅ Complete error handling
    └── ChalkUtils.ts                   # ✅ Complete CLI formatting
```

**Book-Artifacts Structure (Current + Planned):**
```
book-artifacts/
├── default-book-manifest.yaml         # ✅ Template
└── <author>#<title>#<book-index>/
    ├── book-manifest.yaml              # ✅ Populated with metadata
    ├── phase1/                         # ❌ NEEDS OCR CACHE IMPLEMENTATION
    │   ├── ocr-cache.json             # 📋 Planned: OCR results cache
    │   ├── ocr-processing-info.json   # 📋 Planned: Processing parameters
    │   └── file-hash.txt              # 📋 Planned: File validation
    ├── phase2/                         # 📋 Future: Normalized text cache
    └── phase3/                         # 📋 Future: Enhanced text cache
```

## 🚀 IMPLEMENTATION ROADMAP

### Sprint 1: Step 1.2 User Review Workflow (Weeks 1-2)
- [ ] Implement book manifest detection system
- [ ] Add OCR structure discovery functionality
- [ ] Create user review exit workflow
- [ ] Update TextExtractor with new behavior
- [ ] Testing and validation

### Sprint 2: OCR Caching (Weeks 3-4)
- [ ] Design and implement OCR caching system
- [ ] Integration with existing OCRService
- [ ] Testing and validation
- [ ] CLI cache management options

### Sprint 3: DeepSeek Integration (Weeks 5-6)  
- [ ] DeepSeek API client implementation
- [ ] Text normalization service
- [ ] German text optimization
- [ ] Phase 2 pipeline integration

### Sprint 4: Testing & Documentation (Weeks 7-8)
- [ ] Comprehensive test suite
- [ ] Performance benchmarking
- [ ] Documentation updates
- [ ] User acceptance testing

### Sprint 5: Phase 3-4 Implementation (Weeks 9-12)
- [ ] Evaluation phase implementation
- [ ] AI enhancements phase
- [ ] Final integration testing
- [ ] Production readiness

## 📊 SUCCESS METRICS

### Immediate (Step 1.2 User Review):
- [ ] 100% successful structure discovery for new books
- [ ] Clear user guidance for manifest review
- [ ] Zero pipeline failures due to missing structure
- [ ] User satisfaction with review workflow

### Short-term (OCR Caching):
- [ ] OCR processing time reduced from 10+ minutes to <30 seconds on cache hit
- [ ] Cache hit rate >90% for repeated processing
- [ ] Zero false cache hits (perfect invalidation)

### Medium-term (Phase 2):
- [ ] DeepSeek integration working reliably
- [ ] Text normalization improving readability scores by >20%
- [ ] German text processing accuracy >95%

### Long-term (Complete Pipeline):
- [ ] End-to-end processing time <5 minutes for cached books
- [ ] Quality scores >85% for processed texts
- [ ] 100% pipeline success rate for supported formats

## 🔧 DEVELOPMENT GUIDELINES

### Step 1.2 User Review Requirements:
- **Manifest Detection:** Check book-artifacts for existing book-manifest.yaml
- **Structure Discovery:** OCR-based structure detection when no manifest exists
- **User Exit:** Clear exit message with instructions for manual review
- **Manifest Creation:** Generate initial manifest with discovered structure
- **Validation:** Validate user-updated manifest on subsequent runs

### OCR Caching Requirements:
- **Cache Invalidation:** File hash + processing parameters change
- **Cache Structure:** JSON format with metadata for easy inspection
- **Error Handling:** Graceful fallback to fresh OCR on cache corruption
- **CLI Integration:** `--no-cache` flag for forced reprocessing

### DeepSeek Integration Requirements:
- **Failure Policy:** Exit application on API failure (no fallbacks)
- **Rate Limiting:** Respect API limits with backoff
- **Prompt Optimization:** German philosophical text specific prompts
- **Batch Processing:** Handle large documents efficiently

### Code Quality Standards:
- **No `any` types:** Maintain strict TypeScript typing [[memory:3633241]]
- **Constants centralization:** All string constants in `constants.ts` [[memory:3633241]]
- **Intermediate results:** Always save to `results/` directory [[memory:3652284]]
- **Pipeline caching:** Use `book-artifacts/` for expensive operations

## 🎯 NEXT ACTIONS

1. **Start Step 1.2 User Review Implementation** (This week)
   - Design book manifest detection system
   - Implement OCR structure discovery
   - Create user review exit workflow
   - Update TextExtractor with new behavior
   
2. **Plan OCR Caching Implementation** (Next sprint)
   - Design cache data structures
   - Implement CacheService and OCRCacheService
   - Update OCRService to check cache first
   
3. **Plan DeepSeek Integration** (Future sprint)
   - Research optimal prompts for German philosophical texts
   - Design API client with proper error handling
   - Plan text normalization algorithms

4. **Testing Strategy** (Ongoing)
   - Set up test fixtures with real book samples
   - Implement performance benchmarking
   - Create integration test suite

This updated plan reflects the new step 1.2 approach with user review workflow and provides a clear roadmap for implementing the crucial user interaction improvements and completing the remaining phases.
