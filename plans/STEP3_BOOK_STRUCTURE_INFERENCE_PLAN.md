# Step 3: Book Structure Inference Plan

## Overview

This plan outlines the transformation of Phase 1, Step 3 from "Text Auto Correction" to "Book Structure Inference". The new step will use AI-powered analysis to correct and enhance book structure (Table of Contents and paragraph starts) by analyzing text content against existing book structure definitions.

## Current State Analysis

### Current Step 3: Text Auto Correction
- **Purpose**: Quality enhancement of extracted text
- **Components**: TextQualityAnalyzer, TextEnhancer, QualityValidator
- **Input**: Text content from Step 2
- **Output**: Enhanced text with quality improvements

### New Step 3: Book Structure Inference
- **Purpose**: AI-powered book structure correction (TOC and paragraph starts)
- **Components**: BookStructureAnalyzer, StructureInferrer, StructureValidator
- **Input**: Text content + existing book structure + optional OCR text
- **Output**: Corrected book structure (TOC and paragraph starts)

## Functional Requirements

### 1. CLI Parameter Addition
- **Parameter**: `--infer-text <filename>`
- **Type**: Optional string
- **Description**: Path to text file for structure inference
- **Usage**: `clean-book --infer-text path/to/text.txt input.pdf`

### 2. Text Source Priority
1. **Primary**: OCR text file (*.ocr) if available from previous steps
2. **Secondary**: Text file specified via `--infer-text` parameter
3. **Fallback**: Extracted text from Step 2

### 3. Book Structure Analysis Process
1. Load existing book structure from book-manifest.yaml
2. Divide inference text into overlapping chunks (20% overlap)
3. Send chunks to DeepSeek Chat model for structure matching
4. Process AI responses to correct TOC and paragraph starts
5. Save updated book structure

## Technical Architecture

### 1. New Components

#### BookStructureAnalyzer
- **Purpose**: Main orchestrator for structure inference
- **Responsibilities**:
  - Load and validate book structure
  - Coordinate text chunking and AI analysis
  - Process AI responses
  - Update book structure

#### TextChunker
- **Purpose**: Divide text into overlapping chunks
- **Responsibilities**:
  - Implement 20% overlap strategy
  - Handle text boundaries gracefully
  - Maintain chunk metadata

#### StructureInferrer
- **Purpose**: AI-powered structure analysis
- **Responsibilities**:
  - Generate DeepSeek Chat prompts
  - Process AI responses
  - Match text chunks to TOC and paragraph entries
  - Handle missing or incorrect entries

#### StructureValidator
- **Purpose**: Validate inferred structure
- **Responsibilities**:
  - Check structure consistency
  - Validate entry formats
  - Ensure completeness

### 2. DeepSeek Chat Integration

#### Environment Variables
- `DEEPSEEK_REST_API_KEY`: API key for DeepSeek Chat model
- `DEEPSEEK_REST_API_URI`: API endpoint URI for DeepSeek Chat

#### Prompt Engineering
```typescript
interface StructureInferencePrompt {
  bookStructure: BookStructureEntry[];
  textChunk: string;
  chunkIndex: number;
  totalChunks: number;
  instructions: string;
}
```

#### AI Response Processing
```typescript
interface StructureInferenceResponse {
  matchedEntries: MatchedEntry[];
  newEntries: BookStructureEntry[];
  corrections: StructureCorrection[];
  confidence: number;
}
```

### 3. Data Flow

```
Input Text (OCR/CLI) → TextChunker → StructureInferrer → DeepSeek Chat
                                                           ↓
Book Structure ← StructureValidator ← BookStructureAnalyzer ← AI Response
```

## Implementation Plan

### Phase 1: Core Infrastructure (Week 1) ✅ COMPLETED

#### 1.1 CLI Parameter Integration ✅
- [x] Add `--infer-text` parameter to CleanBookCommand
- [x] Implement parameter validation and file existence checks
- [x] Update command help and documentation

#### 1.2 Text Source Management ✅
- [x] Create TextSourceManager service
- [x] Implement OCR file detection logic
- [x] Add CLI text file loading functionality
- [x] Create fallback to Step 2 extracted text

#### 1.3 BookStructureService Enhancement ✅
- [x] Add `inferBookStructure()` method
- [x] Implement TOC and paragraph validation methods
- [x] Add structure update and save functionality
- [x] Create structure comparison utilities

### Phase 2: Text Processing (Week 2) ✅ COMPLETED

#### 2.1 TextChunker Implementation ✅
- [x] Create TextChunker class
- [x] Implement 20% overlap algorithm
- [x] Add chunk metadata tracking
- [x] Handle text boundary conditions

#### 2.2 StructureInferrer Development ✅
- [x] Create StructureInferrer class
- [x] Implement DeepSeek Chat prompt generation
- [x] Add AI response parsing
- [x] Create TOC and paragraph matching algorithms

#### 2.3 DeepSeek Chat Integration ✅
- [x] Extend existing DeepSeek service with chat model support
- [x] Add structure inference endpoints using DEEPSEEK_REST_API_KEY and DEEPSEEK_REST_API_URI
- [x] Implement retry and error handling
- [x] Add response validation

### Phase 3: Analysis and Validation (Week 3)

#### 3.1 BookStructureAnalyzer
- [ ] Create main orchestrator class
- [ ] Implement chunk processing pipeline
- [ ] Add structure update logic
- [ ] Create progress tracking

#### 3.2 StructureValidator
- [ ] Create TOC and paragraph validation rules
- [ ] Implement consistency checks
- [ ] Add format validation
- [ ] Create completeness analysis

#### 3.3 ExecutionSummary
- [ ] Update ExecutionSummary for new step
- [ ] Add structure inference metrics
- [ ] Implement progress reporting
- [ ] Create detailed logging

### Phase 4: Integration and Testing (Week 4)

#### 4.1 Pipeline Integration
- [ ] Update step 3 index.ts exports
- [ ] Modify DataLoadingPhase to use new step
- [ ] Update pipeline flow and dependencies
- [ ] Add step 3 configuration options

#### 4.2 Testing and Validation
- [ ] Create comprehensive test suite
- [ ] Add integration tests
- [ ] Test with various book structures
- [ ] Validate AI response handling

#### 4.3 Documentation and Cleanup
- [ ] Update README.md for new step
- [ ] Add usage examples
- [ ] Update architecture documentation
- [ ] Clean up old text correction code

## Detailed Component Specifications

### 1. BookStructureAnalyzer

```typescript
export class BookStructureAnalyzer {
  constructor(
    private readonly logger: LoggerService,
    private readonly bookStructureService: BookStructureService,
    private readonly deepSeekService: DeepSeekService
  ) {}

  async inferBookStructure(
    metadata: FilenameMetadata,
    textSource: string,
    options: StructureInferenceOptions
  ): Promise<StructureInferenceResult> {
    // Implementation for TOC and paragraph correction
  }
}
```

### 2. TextChunker

```typescript
export class TextChunker {
  constructor(private readonly overlapPercentage: number = 20) {}

  chunkText(text: string, chunkSize: number): TextChunk[] {
    // Implementation with 20% overlap
  }
}
```

### 3. StructureInferrer

```typescript
export class StructureInferrer {
  constructor(private readonly deepSeekService: DeepSeekService) {}

  async inferStructureFromChunk(
    chunk: TextChunk,
    bookStructure: BookStructureEntry[],
    options: InferenceOptions
  ): Promise<StructureInferenceResponse> {
    // Implementation for TOC and paragraph matching
  }
}
```

## DeepSeek Chat Prompt Strategy

### Base Prompt Template
```
You are analyzing a book structure to correct Table of Contents (TOC) and paragraph starts. Given the current book structure entries and a text chunk, your task is to:

1. Match text in the chunk to existing TOC and paragraph entries
2. Identify any missing entries that should be added
3. Correct any errors in existing entries
4. Return results in the exact format specified

Book Structure (TOC and Paragraphs):
{bookStructure}

Text Chunk ({chunkIndex}/{totalChunks}):
{textChunk}

Instructions:
- Match entries in the order they appear in the book structure
- Focus on TOC entries (chapter titles, sections) and paragraph starts
- Handle slight variations in spelling, formatting, and line breaks
- If text is cut off at chunk boundaries, omit incomplete entries
- Add missing entries that are clearly identifiable
- Return corrected entries in the exact format from the book structure
- Provide confidence scores for each match

Return your response as JSON with the following structure:
{
  "matchedEntries": [
    {
      "originalIndex": 0,
      "correctedText": "exact text from book structure",
      "confidence": 0.95
    }
  ],
  "newEntries": [
    {
      "text": "new entry text",
      "position": "after index 5"
    }
  ],
  "corrections": [
    {
      "index": 2,
      "original": "incorrect text",
      "corrected": "corrected text"
    }
  ]
}
```

## Error Handling Strategy

### 1. DeepSeek Chat Service Failures
- **Strategy**: Exit application (per project rules)
- **Implementation**: No fallback mechanisms
- **Logging**: Detailed error information before exit

### 2. Text Processing Errors
- **Strategy**: Graceful degradation
- **Implementation**: Continue with available chunks
- **Logging**: Warning messages with error details

### 3. Structure Validation Failures
- **Strategy**: Partial updates
- **Implementation**: Save valid TOC and paragraph entries, report issues
- **Logging**: Error details with recommendations

## Configuration Options

### StructureInferenceOptions
```typescript
interface StructureInferenceOptions {
  chunkSize: number;           // Default: 5000 characters
  overlapPercentage: number;   // Default: 20
  maxRetries: number;          // Default: 3
  confidenceThreshold: number; // Default: 0.7
  enableNewEntries: boolean;   // Default: true
  enableCorrections: boolean;  // Default: true
}
```

## Testing Strategy

### 1. Unit Tests
- TextChunker: Test chunking algorithm with various text sizes
- StructureInferrer: Test prompt generation and response parsing
- StructureValidator: Test validation rules and edge cases

### 2. Integration Tests
- End-to-end structure inference with sample books
- DeepSeek Chat API integration testing
- Pipeline integration testing

### 3. Test Data
- Sample book structures with TOC and paragraph issues
- OCR text files with various quality levels
- Edge cases (missing entries, incorrect formatting)

## Performance Considerations

### 1. Chunking Strategy
- **Memory Usage**: Process chunks sequentially to minimize memory
- **Processing Time**: Parallel chunk processing where possible
- **API Limits**: Respect DeepSeek Chat rate limits

### 2. Caching
- **Chunk Results**: Cache DeepSeek Chat responses for debugging
- **Structure Updates**: Incremental updates to avoid full rewrites

### 3. Progress Tracking
- **Real-time Updates**: Progress reporting for long-running operations
- **Detailed Logging**: Comprehensive logging for debugging

## Migration Strategy

### 1. Code Migration
- **Preserve**: Keep existing text correction code for reference
- **Replace**: Update step 3 exports and pipeline integration
- **Cleanup**: Remove unused text correction components after validation

### 2. Configuration Migration
- **Update**: Modify step 3 configuration options
- **Preserve**: Keep existing configuration structure
- **Extend**: Add new structure inference options

### 3. Documentation Migration
- **Update**: Replace step 3 README with new functionality
- **Preserve**: Archive old documentation for reference
- **Extend**: Add new usage examples and API documentation

## Success Criteria

### 1. Functional Requirements
- [ ] CLI parameter `--infer-text` works correctly
- [ ] Text source priority (OCR → CLI → Step 2) functions properly
- [ ] Book structure inference produces accurate TOC and paragraph corrections
- [ ] Structure updates are saved correctly

### 2. Quality Requirements
- [ ] 90%+ accuracy in TOC and paragraph matching
- [ ] Proper handling of edge cases and errors
- [ ] Comprehensive logging and error reporting
- [ ] Performance suitable for book-sized content

### 3. Integration Requirements
- [ ] Seamless integration with existing pipeline
- [ ] Proper error handling and exit strategies
- [ ] Configuration system compatibility
- [ ] Documentation and usage examples

## Risk Assessment

### 1. Technical Risks
- **DeepSeek Chat Service Reliability**: Mitigated by proper error handling and exit strategy
- **Text Processing Complexity**: Mitigated by iterative development and testing
- **Performance Issues**: Mitigated by chunking strategy and progress tracking

### 2. Integration Risks
- **Pipeline Compatibility**: Mitigated by careful migration strategy
- **Configuration Conflicts**: Mitigated by backward compatibility
- **Documentation Gaps**: Mitigated by comprehensive documentation updates

### 3. Quality Risks
- **Inference Accuracy**: Mitigated by validation and testing
- **Error Handling**: Mitigated by comprehensive error strategies
- **User Experience**: Mitigated by clear progress reporting and logging

## Timeline Summary

- **Week 1**: Core infrastructure and CLI integration
- **Week 2**: Text processing and DeepSeek integration
- **Week 3**: Analysis, validation, and orchestration
- **Week 4**: Integration, testing, and documentation

**Total Duration**: 4 weeks
**Effort**: High complexity, significant AI integration
**Dependencies**: DeepSeek Chat service (DEEPSEEK_REST_API_KEY, DEEPSEEK_REST_API_URI), existing pipeline infrastructure 