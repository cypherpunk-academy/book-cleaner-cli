# Discovering Superscript Values in Tesseract Documents

## Overview

This document explains how to identify and detect superscript characters in Tesseract OCR documents, including both built-in detection methods and custom algorithms for cases where Tesseract's native detection fails.

## Problem Statement

Tesseract's built-in superscript detection (`is_superscript: boolean`) often fails to correctly identify superscript characters, especially in cases where:
- Characters are positioned slightly higher than baseline
- Size differences are subtle
- Complex layouts interfere with detection

**Example**: The text `[WA 8, 250¹]` was being recognized as `[WA 8, 2501]` with `is_superscript: false` for the "1".

## Analysis Methods

### 1. Built-in Tesseract Detection

Tesseract.js provides symbol-level data with superscript flags:

```typescript
interface Symbol {
    text: string;
    confidence: number;
    bbox: { x0: number; y0: number; x1: number; y1: number };
    is_superscript: boolean;  // Built-in detection
    is_subscript: boolean;
    is_dropcap: boolean;
}
```

**Limitations**: Often fails for subtle superscript positioning or when size differences are minimal.

### 2. Custom Bounding Box Analysis

When Tesseract's built-in detection fails, custom analysis of bounding box data can identify superscripts based on:

#### Height Comparison
- Calculate symbol height: `height = bbox.y1 - bbox.y0`
- Compare against line average/median height
- Superscripts are typically 60-80% of normal character height

#### Vertical Position Analysis
- Compare `bbox.y0` (top position) across symbols in the same line
- Superscripts are positioned higher than baseline characters
- Look for symbols with `y0` values 2-5 pixels higher than others

#### Baseline Analysis
- Use `baseline` data from Tesseract when available
- Compare symbol position relative to text baseline
- Superscripts appear above the baseline

## Implementation Strategy

### 1. Enable Detailed Symbol Output

Configure Tesseract.js to return complete symbol-level data:

```typescript
const { data } = await worker.recognize(imageBuffer, {}, {
    text: true,
    blocks: true,
    layoutBlocks: true,
    hocr: true,
    tsv: true,
    box: true,
    unlv: true,
    osd: true,
    pdf: false,
    imageColor: false,
    imageGrey: false,
    imageBinary: false,
    debug: false,
});
```

### 2. Custom Detection Algorithm

```typescript
function detectSuperscriptByBoundingBox(symbols: Symbol[]): Symbol[] {
    const superscriptSymbols: Symbol[] = [];
    
    // Group symbols by line (similar y0 values)
    const lineGroups = groupSymbolsByLine(symbols);
    
    for (const lineGroup of lineGroups) {
        if (lineGroup.length < 2) continue;
        
        // Calculate robust height metrics
        const heights = lineGroup.map(s => s.bbox.y1 - s.bbox.y0).sort((a, b) => a - b);
        const medianHeight = heights[Math.floor(heights.length / 2)];
        
        // Exclude outliers from average calculation
        const normalHeights = heights.filter(h => h <= medianHeight * 1.5);
        const avgHeight = normalHeights.reduce((sum, h) => sum + h, 0) / normalHeights.length;
        
        // Analyze each symbol
        for (const symbol of lineGroup) {
            const symbolHeight = symbol.bbox.y1 - symbol.bbox.y0;
            
            // Check size criteria
            const isSmaller = symbolHeight < avgHeight * 0.7;
            
            // Check position criteria
            const isHigher = symbol.bbox.y0 < 
                lineGroup.reduce((min, s) => Math.min(min, s.bbox.y0), Infinity) + 3;
            
            if (isSmaller && isHigher) {
                symbol.is_superscript = true;
                symbol.is_custom_detected = true;
                superscriptSymbols.push(symbol);
            }
        }
    }
    
    return superscriptSymbols;
}
```

### 3. Line Grouping Algorithm

```typescript
function groupSymbolsByLine(symbols: Symbol[]): Symbol[][] {
    const sortedSymbols = [...symbols].sort((a, b) => a.bbox.y0 - b.bbox.y0);
    const groups: Symbol[][] = [];
    let currentGroup: Symbol[] = [];
    let lastY0 = -1;
    const tolerance = 10; // pixels tolerance for same line
    
    for (const symbol of sortedSymbols) {
        if (lastY0 === -1 || Math.abs(symbol.bbox.y0 - lastY0) <= tolerance) {
            currentGroup.push(symbol);
        } else {
            if (currentGroup.length > 0) {
                groups.push(currentGroup);
            }
            currentGroup = [symbol];
        }
        lastY0 = symbol.bbox.y0;
    }
    
    if (currentGroup.length > 0) {
        groups.push(currentGroup);
    }
    
    return groups;
}
```

## Detection Criteria

### Size Thresholds
- **Height ratio**: Symbol height < 70% of line average height
- **Outlier exclusion**: Exclude symbols > 150% of median height from baseline calculation
- **Minimum difference**: At least 20% height reduction from normal

### Position Thresholds
- **Vertical offset**: Symbol positioned at least 3px higher than lowest symbol in line
- **Baseline comparison**: Symbol center above line center
- **Tolerance**: 10px tolerance for grouping symbols on same line

### Confidence Factors
- **Multiple criteria**: Must satisfy both size and position requirements
- **Context awareness**: Consider surrounding symbols and line structure
- **Confidence scoring**: Higher confidence for larger size/position differences

## Real-World Example

### OCR Data Analysis
From `paragraphs_page_3.json`:

```json
{
  "symbols": [
    {
      "text": "2",
      "bbox": { "x0": 758, "y0": 1123, "x1": 794, "y1": 1177 }, // height: 54px
      "is_superscript": false
    },
    {
      "text": "5", 
      "bbox": { "x0": 799, "y0": 1123, "x1": 832, "y1": 1177 }, // height: 54px
      "is_superscript": false
    },
    {
      "text": "0",
      "bbox": { "x0": 839, "y0": 1123, "x1": 875, "y1": 1177 }, // height: 54px
      "is_superscript": false
    },
    {
      "text": "1", // Superscript candidate
      "bbox": { "x0": 882, "y0": 1119, "x1": 902, "y1": 1155 }, // height: 36px
      "is_superscript": false // Tesseract failed to detect
    },
    {
      "text": "]",
      "bbox": { "x0": 909, "y0": 1120, "x1": 930, "y1": 1195 }, // height: 75px
      "is_superscript": false
    }
  ]
}
```

### Analysis Results
- **Normal characters**: 54px height, y0: 1123
- **Superscript "1"**: 36px height (67% of normal), y0: 1119 (4px higher)
- **Custom detection**: ✅ Successfully identified as superscript

## Implementation Steps

### 1. Configure Tesseract
```typescript
// Enable detailed symbol output
await worker.setParameters({
    tessedit_char_whitelist: buildOCRWhitelist(), // Include superscript chars
    preserve_interword_spaces: '1',
});
```

### 2. Process Symbol Data
```typescript
// Extract symbols from OCR data
const symbols = data.symbols || [];

// Apply custom detection
const customSuperscripts = detectSuperscriptByBoundingBox(symbols);

// Combine with Tesseract's detection
const allSuperscripts = symbols.filter(s => s.is_superscript || s.is_custom_detected);
```

### 3. Log and Monitor
```typescript
console.log(`🔝 Tesseract detected ${tesseractSuperscripts.length} superscript symbols`);
console.log(`🔝 Custom detection found ${customSuperscripts.length} superscript symbols`);
```

## Best Practices

### 1. Robust Height Calculation
- Use median height instead of average to avoid outlier influence
- Exclude very large symbols (brackets, punctuation) from baseline calculation
- Consider font size variations within the same line

### 2. Precise Position Analysis
- Compare y0 (top position) rather than center positions
- Use absolute pixel differences rather than relative percentages
- Account for different character shapes and baseline variations

### 3. Context Awareness
- Group symbols by line before analysis
- Consider surrounding text and layout
- Apply different thresholds for different document types

### 4. Validation and Testing
- Test with known superscript examples
- Validate against manual annotations
- Monitor false positive/negative rates
- Adjust thresholds based on document characteristics

## Troubleshooting

### Common Issues
1. **False positives**: Lower size threshold or increase position requirement
2. **False negatives**: Increase size threshold or decrease position requirement
3. **Line grouping errors**: Adjust tolerance value for line detection
4. **Outlier influence**: Refine outlier exclusion criteria

### Debug Information
- Log symbol heights and positions
- Compare against known examples
- Monitor detection confidence scores
- Validate with visual inspection

## Conclusion

Custom superscript detection using bounding box analysis provides a reliable fallback when Tesseract's built-in detection fails. The key is combining size and position analysis with robust statistical methods to handle the variability in OCR data quality and document layouts.

The algorithm successfully identified the "1" in "250¹" as a superscript by detecting its smaller size (36px vs 54px) and higher position (y0: 1119 vs 1123), demonstrating the effectiveness of this approach for real-world OCR applications. 