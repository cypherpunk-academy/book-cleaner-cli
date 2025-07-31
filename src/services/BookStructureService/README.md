# BookStructureService Directory

This directory contains all services related to book structure management, analysis, and inference.

## Services Overview

### BookStructureService.ts
**Purpose**: Main service for managing book structure YAML files and manifest operations.

**Key Responsibilities**:
- Load and cache book manifests
- Create and update book structure files
- Validate book structure entries
- Compare structure entries for similarity
- **NEW**: AI-powered structure inference using DeepSeek Chat

**Key Methods**:
- `loadBookManifest()` - Load and cache book manifest
- `createBookStructure()` - Create new book structure file
- `updateBookManifest()` - Update cached manifest and save to file
- `inferBookStructure()` - AI-powered structure correction (TOC and paragraphs)
- `validateStructureEntries()` - Validate TOC and paragraph entries
- `compareStructureEntries()` - Compare structure entries for similarity

### BookTypesService.ts
**Purpose**: Service for managing book types and their configurations.

**Key Responsibilities**:
- Load book types configuration from `book-types.yaml`
- Provide text removal patterns for different book types
- Manage header type configurations
- Cache book type configurations

**Key Methods**:
- `loadBookTypes()` - Load book types configuration
- `getTextRemovalPatterns()` - Get patterns for specific book type
- `getHeaderTypeConfig()` - Get header configuration for book type
- `getAvailableBookTypes()` - List all available book types

### StructureAnalyzer.ts
**Purpose**: Service for analyzing book structure and extracting hierarchical information.

**Key Responsibilities**:
- Analyze headers, footnotes, paragraphs, and dialogues
- Build hierarchy from detected headers
- Assess structure quality and identify issues
- Generate structural recommendations

**Key Methods**:
- `analyzeStructure()` - Main analysis method
- `analyzeHeaders()` - Detect chapter, lecture, section headers
- `analyzeFootnotes()` - Identify footnote patterns
- `analyzeParagraphs()` - Analyze paragraph structure
- `buildHierarchy()` - Create hierarchical structure
- `assessStructureQuality()` - Evaluate structure quality

### StructureInferrer.ts
**Purpose**: AI-powered service for structure inference and correction.

**Key Responsibilities**:
- Generate DeepSeek Chat prompts for structure analysis
- Process AI responses for structure matching
- Handle text chunking and response merging
- Manage structure corrections and new entries

**Key Methods**:
- `inferStructureFromChunk()` - Process text chunk with AI
- `generatePrompt()` - Create DeepSeek Chat prompts
- `parseAIResponse()` - Parse and validate AI responses
- `mergeChunkResponses()` - Merge multiple chunk results
- `validateOptions()` - Validate inference configuration

## Architecture

```
BookStructureService/
├── index.ts                    # Main exports
├── README.md                   # This documentation
├── BookStructureService.ts     # Core manifest management
├── BookTypesService.ts         # Book type configurations
├── StructureAnalyzer.ts        # Structure analysis
└── StructureInferrer.ts        # AI-powered inference
```

## Dependencies

### Internal Dependencies
- `TextChunker` - For text chunking in AI inference
- `DeepSeekService` - For AI API integration
- `LoggerService` - For structured logging
- `ConfigService` - For configuration management

### External Dependencies
- `js-yaml` - YAML parsing and generation
- `uuid` - Unique ID generation
- `node:fs` - File system operations
- `node:path` - Path manipulation

## Usage Examples

### Basic Book Structure Management
```typescript
import { BookStructureService } from '@/services/BookStructureService';

const bookStructureService = new BookStructureService(logger);
const manifest = await bookStructureService.loadBookManifest(metadata);
```

### AI-Powered Structure Inference
```typescript
import { BookStructureService } from '@/services/BookStructureService';

const result = await bookStructureService.inferBookStructure(
    metadata,
    textSource,
    {
        chunkSize: 5000,
        overlapPercentage: 20,
        maxRetries: 3,
        confidenceThreshold: 0.7,
        enableNewEntries: true,
        enableCorrections: true,
    }
);
```

### Book Type Configuration
```typescript
import { BookTypesService } from '@/services/BookStructureService';

const bookTypesService = new BookTypesService(logger, configService);
const patterns = await bookTypesService.getTextRemovalPatterns('rudolf-steiner-ga-werk');
```

### Structure Analysis
```typescript
import { StructureAnalyzer } from '@/services/BookStructureService';

const analyzer = new StructureAnalyzer(logger);
const analysis = await analyzer.analyzeStructure(fileInfo, extractedText, metadata);
```

## Integration with Pipeline

These services are integrated into the book cleaning pipeline:

1. **DataLoadingPhase** - Uses BookStructureService for manifest loading
2. **TextExtractor** - Uses BookStructureService for structure validation
3. **TextEnhancer** - Uses BookTypesService for text removal patterns
4. **Step 3 (Structure Inference)** - Uses StructureInferrer for AI-powered corrections

## Configuration

### Environment Variables
- `DEEPSEEK_REST_API_KEY` - DeepSeek Chat API key
- `DEEPSEEK_REST_API_URI` - DeepSeek Chat API endpoint

### Configuration Files
- `book-artifacts/default-book-manifest.yaml` - Default manifest template
- `book-artifacts/book-types.yaml` - Book type configurations
- `book-artifacts/{author}#{title}/book-manifest.yaml` - Book-specific manifests

## Error Handling

All services follow the project's error handling patterns:
- Use `AppError` for application-specific errors
- Include context and cause chaining
- Exit application on DeepSeek API failures (per project rules)
- Graceful degradation for missing files or configurations

## Testing

Each service can be tested independently:
- Unit tests for individual methods
- Integration tests for service interactions
- Mock external dependencies (file system, API calls)
- Test error conditions and edge cases 