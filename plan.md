# Implementation Plan: GetTextAndStructureFromOcr.ts

## Overview
Create a new class to process OCR data from Tesseract and extract structured content (headers, paragraphs, footnotes) based on book-type configurations from `book-types.yaml`.

## Class Structure

### GetTextAndStructureFromOcr
**Location**: `src/pipeline/phase_1_Text_Extraction_And_Format_Processing/step_2_Text_Extraction/GetTextAndStructureFromOcr.ts`

#### Dependencies
- `@/services/ConfigService` - Load book-type configurations
- `@/constants` - ROMAN_NUMERALS, GERMAN_ORDINALS, OCR_PAGE_WIDTH
- `date-fns` - Date parsing for {long-date} placeholder
- OCR data interfaces from `OCRService.ts`

#### Core Methods

##### 1. `constructor(logger: LoggerService, configService: ConfigService)`
- Initialize with logger and config service
- Set up placeholder pattern mappings

##### 2. `processOCRData(ocrData: OCRData, bookType: string, scanResults: ScanResults): ProcessedTextResult`
**Main processing method**
- Load book-type configuration
- Process paragraphs sequentially using existing scanResults for state tracking
- Extract headers, clean text, detect footnotes
- Update scanResults.textWithHeaders with new content
- Return structured result

##### 3. `loadBookTypeConfig(bookType: string): BookTypeConfig`
- Load configuration from book-types.yaml
- Validate required fields (header-types, text-removal-patterns)
- Return parsed configuration object

##### 4. `detectAndProcessHeaders(paragraph: OCRParagraph, bookConfig: BookTypeConfig): HeaderResult | null`
**Header Detection Logic**
- Check if paragraph is centered using baseline coordinates
- Try to match against level1, level2, level3 header patterns
- Validate ordinal sequence (must increment by exactly 1)
- Return header info or null if not a header

##### 5. `isTextCentered(paragraph: OCRParagraph): boolean`
**Centering Detection**
- Calculate paragraph width: `bbox.x1 - bbox.x0`
- Calculate center position: `(bbox.x0 + bbox.x1) / 2`
- Check if center is approximately `OCR_PAGE_WIDTH / 2` (±tolerance)

##### 6. `matchHeaderPattern(text: string, pattern: string): PatternMatch | null`
**Pattern Matching Engine**
- Replace placeholders with regex patterns
- Match text against generated regex
- Extract captured groups for validation
- Return match result with extracted values

##### 7. `buildPlaceholderRegex(pattern: string): string`
**Placeholder Translation**
- `{roman-number}` → `(I|II|III|IV|V|...)`  (from ROMAN_NUMERALS)
- `{title-in-capital-letters}` → `([A-ZÄÖÜ][A-ZÄÖÜ\s]+)`
- `{decimal-number}` → `(\d+)`
- `{title}` → `([^.]+)`
- `{german-ordinal}` → `(ERSTER|ZWEITER|DRITTER|...)` (from GERMAN_ORDINALS)
- `{place}` → `([A-ZÄÖÜ][a-zäöüß]+(?:\s+[A-ZÄÖÜ][a-zäöüß]+)*)`
- `{long-date}` → `(\d{1,2}\.\s+(?:Januar|Februar|...|Dezember)\s+\d{4})`

##### 8. `validateHeaderSequence(headerLevel: number, extractedNumber: number, scanResults: ScanResults): boolean`
**Ordinal Sequence Validation**
- Use existing scanResults object to track: level1HeadingsIndex, level2HeadingsIndex, level3HeadingsIndex
- Ensure extracted number = scanResults.levelXHeadingsIndex + 1
- Update scanResults index after successful validation
- Throw error if sequence is broken

##### 9. `applyTextRemovalPatterns(text: string, patterns: string[]): string`
**Text Cleaning**
- Apply each regex pattern from text-removal-patterns
- Remove matches (copyright notices, page numbers, etc.)
- Return cleaned text

##### 10. `buildStructuredText(processedParagraphs: ProcessedParagraph[]): string`
**Final Text Assembly**
- Combine headers with proper markdown markers (# ## ###)
- Add paragraph text with proper spacing
- Include footnote markers where detected

## Data Structures

### ScanResults (Existing Structure)
```typescript
// This structure already exists in OCRService.ts and will be used to track progress
interface ScanResults {
  textWithHeaders: string;      // Accumulated text with markdown headers
  footnoteText: string;         // Accumulated footnote text  
  level1HeadingsIndex: number;  // Current count of level 1 headers
  level2HeadingsIndex: number;  // Current count of level 2 headers
  level3HeadingsIndex: number;  // Current count of level 3 headers
}
```

### BookTypeConfig
```typescript
interface BookTypeConfig {
  description: string;
  headerTypes: {
    level1?: HeaderTypeDefinition;
    level2?: HeaderTypeDefinition;
    level3?: HeaderTypeDefinition;
  };
  textRemovalPatterns: string[];
}

interface HeaderTypeDefinition {
  formats: HeaderFormat[];
}

interface HeaderFormat {
  pattern: string;
  alignment?: string;
  example?: string;
}
```

### ProcessedTextResult
```typescript
interface ProcessedTextResult {
  structuredText: string;
  headers: DetectedHeader[];
  cleanedParagraphs: ProcessedParagraph[];
  footnotes: DetectedFootnote[];
  statistics: {
    totalParagraphs: number;
    detectedHeaders: number;
    removedTextPatterns: number;
  };
}
```

### ProcessedParagraph
```typescript
interface ProcessedParagraph {
  originalText: string;
  cleanedText: string;
  isHeader: boolean;
  headerLevel?: number;
  confidence: number;
  position: BoundingBox;
}
```

### DetectedHeader
```typescript
interface DetectedHeader {
  level: number;
  text: string;
  ordinalValue: number;
  matchedPattern: string;
  confidence: number;
  position: BoundingBox;
}
```

## Processing Flow

### 1. Initialization
- Load book-type configuration
- Initialize sequence tracking variables
- Set up text cleaning patterns

### 2. Paragraph Processing Loop (Per Page)
```
For each paragraph in current page OCR data:
  1. Check if paragraph is centered
  2. If centered:
     - Try to match against header patterns (level1 → level2 → level3)
     - If match found:
       - Validate ordinal sequence against scanResults.levelXHeadingsIndex
       - If valid: 
         * Increment appropriate scanResults.levelXHeadingsIndex
         * Add markdown header to scanResults.textWithHeaders
         * Continue to next paragraph
       - If invalid sequence: Exit with error
  3. Apply text removal patterns to paragraph text
  4. Add cleaned paragraph text to scanResults.textWithHeaders
  5. Process footnotes and add to scanResults.footnoteText
```

### 3. Cross-Page State Tracking
- scanResults persists across all pages in the document
- Header sequence validation continues seamlessly from page to page
- textWithHeaders accumulates all processed content with proper formatting
- footnoteText accumulates all footnotes found throughout the document

### 4. Final Assembly
- scanResults.textWithHeaders contains the complete structured document
- scanResults.footnoteText contains all footnotes
- No additional assembly needed - content is built incrementally

### 5. Error Handling
- Invalid ordinal sequence → Process exit with error
- Missing book-type configuration → Default to generic processing
- OCR confidence too low → Warning but continue processing

## Integration Points

### OCRService.ts Modifications
```typescript
// In processPDFWithOCR method, around line 507 in the page processing loop
// Initialize the text processor once before the loop
const textProcessor = new GetTextAndStructureFromOcr(logger, configService);

// Inside the page processing loop (for each page):
try {
    const { data } = await worker.recognize(pageBuffer);
    
    // Process OCR data with existing scanResults tracking
    const processedResult = await textProcessor.processOCRData(data, bookType, scanResults);
    
    // scanResults.textWithHeaders is automatically updated by the processor
    // scanResults.level1HeadingsIndex, level2HeadingsIndex, level3HeadingsIndex track sequence
    
    // Continue with existing logic...
} catch (pageError) {
    // Existing error handling
}
```

### Configuration Loading
- Extend ConfigService to load book-types.yaml
- Add method `getBookTypeConfig(bookType: string)`
- Cache configurations for performance

## Testing Strategy

### Unit Tests
1. **Pattern Matching Tests**
   - Test each placeholder type individually
   - Verify regex generation accuracy
   - Test edge cases and malformed patterns

2. **Header Detection Tests**
   - Test centering detection with various coordinates
   - Verify ordinal sequence validation
   - Test header level detection

3. **Text Cleaning Tests**
   - Verify removal patterns work correctly
   - Test multiple patterns application
   - Ensure important text is preserved

4. **Integration Tests**
   - Full OCR data processing
   - Multiple book types
   - Various header combinations

### Test Data
- Create mock OCR data with known header structures
- Test with real Rudolf Steiner GA samples
- Include edge cases (missing headers, broken sequences)

## Performance Considerations

### Optimization Strategies
1. **Pattern Compilation**: Pre-compile regex patterns for reuse
2. **Configuration Caching**: Cache loaded book-type configs
3. **Early Exit**: Stop header matching after first successful match
4. **Batch Processing**: Process multiple paragraphs efficiently

### Memory Management
- Process paragraphs in chunks for large documents
- Clean up temporary objects after processing
- Avoid storing entire OCR data in memory unnecessarily

## Error Recovery

### Graceful Degradation
- If header pattern matching fails → Continue as regular paragraph
- If ordinal sequence is broken → Log error and exit (as requested)
- If book-type config missing → Use generic processing
- If text cleaning fails → Use original text with warning

## Future Extensions

### Expandable Design
1. **Footnote Detection**: Extend to process footnote patterns
2. **Table Detection**: Add support for tabular data
3. **Image Captions**: Process figure and table captions
4. **Multi-language**: Support non-German book types
5. **Custom Patterns**: Allow user-defined header patterns

This implementation will provide a robust foundation for structured text extraction while maintaining flexibility for different book types and formats. 