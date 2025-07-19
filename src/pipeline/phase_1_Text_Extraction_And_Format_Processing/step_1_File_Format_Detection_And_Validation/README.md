# Step 1.1: File Format Detection & Validation

## Overview

Step 1.1 performs comprehensive file format detection and validation that goes beyond simple file extension checking. It validates actual file content, structure, and processing capabilities to ensure reliable text extraction.

## Features

- **Magic Number Detection**: Analyzes file headers to identify true file formats
- **Extension Validation**: Compares detected format with file extension
- **Format-Specific Validation**: Deep validation for PDF, EPUB, and text files
- **Security Checks**: File size limits and corruption detection
- **Confidence Scoring**: Quantifies detection reliability
- **Comprehensive Error Reporting**: Detailed issues and recommendations

## Supported Formats

### PDF Files
- **Text-based PDFs**: Files with embedded text content
- **Image-based PDFs**: Files requiring OCR processing
- **Hybrid PDFs**: Mixed text and image content
- **Validation**: PDF structure integrity, page count, content analysis
- **Size Limit**: 10MB maximum

### EPUB Files
- **EPUB 2.0/3.0**: Standard EPUB formats
- **DRM Detection**: Identifies and rejects DRM-protected files
- **Structure Validation**: Verifies container.xml, OPF files, navigation
- **Size Limit**: 5MB maximum

### Text Files
- **Encoding Detection**: UTF-8, UTF-16, Latin1, Windows-1252
- **Content Validation**: Printable character ratio analysis
- **Line Ending Normalization**: Handles different line ending formats
- **Size Limit**: 1MB maximum

## Detection Process

### Step 1: Header Analysis
```typescript
const header = await this.readFileHeader(filePath);
const magicResult = this.detectByMagicNumbers(header);
```

### Step 2: Extension Validation
```typescript
const extensionFormat = this.getFormatFromExtension(filePath);
// Check for format consistency
```

### Step 3: Size Validation
```typescript
const sizeValidation = this.validateFileSize(fileSize, format);
```

### Step 4: Format-Specific Validation
```typescript
const validationResult = await this.validateFormat(fileInfo, format);
```

### Step 5: Confidence Calculation
```typescript
const finalResult = this.calculateFinalResult(
  magicResult, extensionFormat, sizeValidation, validationResult
);
```

## Magic Numbers

The detector recognizes these file signatures:

| Format | Magic Number | Description |
|--------|-------------|-------------|
| PDF | `%PDF-1.x` | PDF version header |
| EPUB | `PK\x03\x04` | ZIP file signature |
| UTF-8 | `\xEF\xBB\xBF` | UTF-8 BOM |
| UTF-16 LE | `\xFF\xFE` | UTF-16 Little Endian BOM |

## Output Format

```typescript
interface FileFormatResult {
  format: SupportedFormat;           // Detected format
  mimeType: string;                  // MIME type
  isValid: boolean;                  // Overall validation result
  confidence: number;                // Confidence score (0-1)
  issues: string[];                  // List of issues found
  metadata: FileFormatMetadata;      // Format-specific metadata
}
```

## Configuration

Detection behavior can be configured via constants:

```typescript
FILE_SIZE_LIMITS: {
  PDF: 10 * 1024 * 1024,    // 10MB
  EPUB: 5 * 1024 * 1024,    // 5MB
  TXT: 1024 * 1024,         // 1MB
}

VALIDATION_THRESHOLDS: {
  PDF_TEXT_RATIO: 0.1,      // Minimum text content ratio
  CONFIDENCE_THRESHOLD: 0.7, // Minimum confidence for acceptance
}
```

## Testing

The detector includes comprehensive test coverage:

```bash
npm run test:format-detection
```

Test categories:
- Magic number detection accuracy
- Extension validation
- Format-specific validation
- Security and size limits
- Error handling and edge cases
- Performance with large files

## Integration

Step 1.1 is automatically executed as part of Phase 1 and provides input for Step 1.2 (Text Extraction). The detection results determine the extraction strategy and processing approach.

## Execution Tracking

The step includes detailed execution tracking via `ExecutionSummary`:

```typescript
const summary = createStep1_1ExecutionSummary(filePath, fileSize, expectedFormat);
const result = await detector.detectFormat(fileInfo);
const updated = updateStep1_1ExecutionSummary(summary, result, timings);
```

Metrics tracked:
- Detection time
- Validation time
- Header reading time
- File size and format details
- Confidence scores and issues 