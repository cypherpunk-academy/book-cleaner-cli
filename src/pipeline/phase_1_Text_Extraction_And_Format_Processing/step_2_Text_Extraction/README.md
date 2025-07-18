# Step 1.2: Text Extraction Based on Book Structure

## Overview

Step 1.2 extracts author content from files based on configured boundaries in the book structure YAML files. It supports different file types and automatically prompts users for missing boundary values.

## Features

- **Boundary-based extraction**: Extracts text based on page numbers or text markers
- **Multiple file type support**: Handles PDF, EPUB, and text files
- **Interactive prompts**: Asks users for missing boundary values
- **Auto-save configuration**: Updates book structure YAML files with user input
- **Multiple output formats**: Saves `.txt` files and `.ocr` files for hybrid processing

## File Type Support

### Files with Pages
- **PDF-text**: Extract text from specific page ranges
- **PDF-ocr**: OCR text from specific page ranges
- **PDF-text-ocr**: Hybrid approach - extract text AND OCR (saves both `.txt` and `.ocr` files)

### Files without Pages
- **Text**: Extract text between specific text markers
- **EPUB**: Extract text between specific text markers

## Configuration

The step uses book structure YAML files in the `book-structure/` directory. The configuration format depends on whether the file has pages:

### For Files with Pages
```yaml
author: "Author Name"
title: "Book Title"
first-author-content-page: 5
last-author-content-page: 120
```

### For Files without Pages
```yaml
author: "Author Name"
title: "Book Title"
text-before-first-chapter: "INTRODUCTION"
text-after-last-chapter: "APPENDIX"
```

## Usage

```typescript
import { TextExtractor } from './TextExtractor';
import { LoggerService } from '../../../services/LoggerService';

const logger = new LoggerService(loggerConfig);
const extractor = new TextExtractor(logger, './book-structure');

const result = await extractor.extractText(fileInfo, metadata, {
  hasPages: true,
  boundaries: {
    firstPage: 5,
    lastPage: 120,
  },
  fileType: 'pdf-text',
  outputDir: './results',
});
```

## User Interaction

When boundary values are missing, the step will prompt the user:

### For Page-based Files
```
📖 Book: Author Name - Book Title
📄 This file has pages. Please specify the author content boundaries:
First author content page: 5
Last author content page: 120
```

### For Text-based Files
```
📖 Book: Author Name - Book Title
📝 This file has no pages. Please specify the text boundaries:
Text before first chapter: INTRODUCTION
Text after last chapter: APPENDIX
```

## Output Files

Results are saved to the `results/` directory with the naming pattern:
- `{Author}#{Title}#{BookIndex}_phase1_step2.txt`
- `{Author}#{Title}#{BookIndex}_phase1_step2.ocr` (for PDF-text-ocr only)

## Example

For a book "Heinrich von Ofterdingen" by "Novalis":

**Input file**: `Novalis#Heinrich_von_Ofterdingen.pdf`
**Book structure**: `book-structure/Novalis#Heinrich von Ofterdingen.yaml`
**Output files**:
- `results/Novalis#Heinrich von Ofterdingen_phase1_step2.txt`
- `results/Novalis#Heinrich von Ofterdingen_phase1_step2.ocr` (if PDF-text-ocr)

## Implementation Details

### TextExtractor Class
- Main class handling text extraction logic
- Supports all file types with appropriate extraction methods
- Manages user prompts and configuration updates
- Handles file I/O for results

### ExecutionSummary
- Tracks extraction progress and metrics
- Records processing time, characters processed, and file information
- Provides detailed logging for debugging

### Error Handling
- Comprehensive error handling with proper error codes
- Graceful handling of missing files or invalid configurations
- User-friendly error messages

## Testing

Run the test script to verify functionality:

```bash
npm run test:step1-2
```

The test creates a sample text file and demonstrates the extraction process with text boundaries. 