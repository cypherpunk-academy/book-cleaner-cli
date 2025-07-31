# Step 3: Book Structure Inference

## Overview

Step 3 performs AI-powered book structure inference to correct and enhance Table of Contents (TOC) and paragraph starts by analyzing text content against existing book structure definitions.

## Purpose

- **Primary**: Correct and enhance book structure (TOC and paragraph entries)
- **Secondary**: Identify missing structure entries
- **Tertiary**: Validate structure consistency and completeness

## Components

### BookStructureAnalyzer
Main orchestrator that coordinates the entire structure inference process:
- Loads existing book structure from book-manifest.yaml
- Processes text in overlapping chunks
- Coordinates AI analysis via DeepSeek Chat
- Applies corrections and saves updated structure

### StructureValidator
Validates book structure entries and consistency:
- Validates individual TOC and paragraph entries
- Checks structure hierarchy consistency
- Ensures completeness and format compliance
- Provides suggestions for improvements

### ExecutionSummary
Tracks execution metrics and progress:
- Monitors chunk processing progress
- Tracks success/failure rates
- Provides detailed execution reports
- Estimates remaining processing time

## Input

- **Text Source**: OCR text file (*.ocr), CLI-specified text file, or extracted text from Step 2
- **Book Structure**: Existing TOC and paragraph entries from book-manifest.yaml
- **Options**: Configuration for chunking, AI analysis, and validation

## Output

- **Corrected Structure**: Updated TOC and paragraph entries
- **New Entries**: Discovered missing structure entries
- **Corrections**: Applied fixes to existing entries
- **Validation Report**: Structure consistency and completeness analysis

## Process Flow

1. **Load Structure**: Read existing book structure from manifest
2. **Validate Input**: Check structure format and consistency
3. **Chunk Text**: Divide inference text into overlapping chunks
4. **AI Analysis**: Send chunks to DeepSeek Chat for structure matching
5. **Merge Results**: Combine chunk responses into unified result
6. **Apply Corrections**: Update structure with AI-suggested changes
7. **Validate Output**: Check corrected structure for consistency
8. **Save Results**: Update book-manifest.yaml with corrected structure

## Configuration Options

```typescript
interface StructureInferenceOptions {
    chunkSize: number;           // Default: 5000 characters
    overlapPercentage: number;   // Default: 20%
    maxRetries: number;          // Default: 3
    confidenceThreshold: number; // Default: 0.7
    enableNewEntries: boolean;   // Default: true
    enableCorrections: boolean;  // Default: true
}
```

## CLI Integration

### Parameter
- `--infer-text <filename>`: Optional path to text file for structure inference

### Usage Examples
```bash
# Use OCR text from previous steps
clean-book input.pdf

# Use specific text file for inference
clean-book --infer-text path/to/text.txt input.pdf

# Use with custom options
clean-book --infer-text text.txt --chunk-size 3000 --confidence 0.8 input.pdf
```

## Text Source Priority

1. **Primary**: OCR text file (*.ocr) from previous pipeline steps
2. **Secondary**: Text file specified via `--infer-text` parameter
3. **Fallback**: Extracted text from Step 2 (Text Extraction)

## AI Integration

### DeepSeek Chat Model
- **Endpoint**: Uses DEEPSEEK_REST_API_URI environment variable
- **API Key**: Uses DEEPSEEK_REST_API_KEY environment variable
- **Model**: DeepSeek Chat for structure analysis
- **Prompt Strategy**: Structured prompts for TOC and paragraph matching

### Prompt Template
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
```

## Structure Entry Types

### TOC Entries
- **Format**: Chapter/section numbers (e.g., "1.", "1.1.", "Chapter 1")
- **Validation**: Hierarchy consistency, proper formatting
- **Examples**: "1. Introduction", "1.1. Background", "Chapter 2: Methods"

### Paragraph Entries
- **Format**: Paragraph markers (e.g., "§1", "¶1", "P1")
- **Validation**: Sequential numbering, content indicators
- **Examples**: "§1 First paragraph", "¶2 Second paragraph", "P3 Third paragraph"

## Error Handling

### DeepSeek Service Failures
- **Strategy**: Exit application (per project rules)
- **Implementation**: No fallback mechanisms
- **Logging**: Detailed error information before exit

### Text Processing Errors
- **Strategy**: Graceful degradation
- **Implementation**: Continue with available chunks
- **Logging**: Warning messages with error details

### Structure Validation Failures
- **Strategy**: Partial updates
- **Implementation**: Save valid entries, report issues
- **Logging**: Error details with recommendations

## Performance Considerations

### Chunking Strategy
- **Memory Usage**: Process chunks sequentially to minimize memory
- **Processing Time**: Sequential processing to avoid API rate limits
- **Overlap**: 20% overlap to handle boundary conditions

### Caching
- **Chunk Results**: Cache DeepSeek responses for debugging
- **Structure Updates**: Incremental updates to avoid full rewrites

### Progress Tracking
- **Real-time Updates**: Progress reporting for long-running operations
- **Detailed Logging**: Comprehensive logging for debugging

## Validation Rules

### TOC Validation
- Must start with number or "Chapter"
- Maximum length: 200 characters
- Hierarchy consistency (no level jumps > 1)
- No duplicate entries

### Paragraph Validation
- Must start with paragraph marker (§, ¶, P, or "Paragraph")
- Maximum length: 1000 characters
- Sequential numbering
- Content indicators present

### Structure Consistency
- No duplicate entries
- Proper hierarchy progression
- Balanced TOC and paragraph distribution
- Reasonable entry counts (5-1000 entries)

## Success Criteria

### Functional Requirements
- CLI parameter `--infer-text` works correctly
- Text source priority functions properly
- Book structure inference produces accurate corrections
- Structure updates are saved correctly

### Quality Requirements
- 90%+ accuracy in TOC and paragraph matching
- Proper handling of edge cases and errors
- Comprehensive logging and error reporting
- Performance suitable for book-sized content

### Integration Requirements
- Seamless integration with existing pipeline
- Proper error handling and exit strategies
- Configuration system compatibility
- Documentation and usage examples

## Migration from Text Auto Correction

This step replaces the previous "Text Auto Correction" functionality with AI-powered book structure inference. The transformation includes:

- **Replaced**: Text quality enhancement with structure correction
- **Enhanced**: AI integration for intelligent analysis
- **Added**: Structure validation and consistency checking
- **Improved**: Progress tracking and detailed reporting

## Dependencies

- **DeepSeek Service**: For AI-powered structure analysis
- **BookStructureService**: For structure loading and saving
- **TextChunker**: For text processing
- **LoggerService**: For comprehensive logging
- **Constants**: For configuration and error codes

## Testing

### Unit Tests
- BookStructureAnalyzer: Test orchestration logic
- StructureValidator: Test validation rules
- ExecutionSummary: Test metrics and progress tracking

### Integration Tests
- End-to-end structure inference with sample books
- DeepSeek Chat API integration testing
- Pipeline integration testing

### Test Data
- Sample book structures with TOC and paragraph issues
- OCR text files with various quality levels
- Edge cases (missing entries, incorrect formatting) 