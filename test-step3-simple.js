#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");

// Constants from constants.ts
const PARAGRAPH_END_MARKERS = ["!", "?", ".»", "!»", "?»"];
const MIN_PARAGRAPHS_FOR_ANALYSIS = 7;
const HYPHEN_LINE_ENDING = "-";
const PARAGRAPH_SEPARATOR = "\n\n";

const BOOK_NAME =
  "Rudolf Steiner#Einleitungen zu Goethes Naturwissenschaftlichen Schriften#1";

/**
 * Load text-removal-patterns from manifest and apply them to text
 */
function applyManifestPatterns(text, manifestPath) {
  let processedText = text;
  const removedPatterns = [];

  try {
    // Load manifest file
    const manifestContent = fs.readFileSync(manifestPath, "utf-8");
    const manifest = yaml.load(manifestContent);

    // Extract text-removal-patterns
    const patterns = manifest["text-removal-patterns"];

    if (patterns && Array.isArray(patterns)) {
      for (const pattern of patterns) {
        if (typeof pattern === "string") {
          // Convert pattern to regex (assuming they are in /pattern/ format)
          const regexMatch = pattern.match(/^\/(.+)\/([gimuy]*)$/);
          if (regexMatch) {
            const regexPattern = regexMatch[1];
            const flags = regexMatch[2] || "";
            const regex = new RegExp(regexPattern, flags);
            const beforeLength = processedText.length;
            processedText = processedText.replace(regex, "");

            if (processedText.length < beforeLength) {
              removedPatterns.push(pattern);
            }
          } else {
            // Treat as literal string if not in regex format
            if (processedText.includes(pattern)) {
              // Use global replace instead of replaceAll for compatibility
              const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
              processedText = processedText.replace(new RegExp(escaped, "g"), "");
              removedPatterns.push(pattern);
            }
          }
        }
      }
    }
  } catch (error) {
    console.warn(`Failed to load or apply manifest patterns: ${error.message}`);
  }

  return { processedText, removedPatterns };
}

/**
 * Analyze paragraph structure to determine if normalization is needed
 */
function analyzeParagraphStructure(text) {
  // Split text into paragraphs (double newlines or more)
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
  const totalParagraphs = paragraphs.length;

  // Check if we have enough paragraphs for analysis
  if (totalParagraphs < MIN_PARAGRAPHS_FOR_ANALYSIS) {
    return {
      totalParagraphs,
      paragraphsWithEndMarkers: 0,
      needsNormalization: true, // Always normalize if we have too few paragraphs
    };
  }

  // Check first 10 paragraphs for end markers
  const paragraphsToCheck = Math.min(10, totalParagraphs);
  let paragraphsWithEndMarkers = 0;

  for (let i = 0; i < paragraphsToCheck; i++) {
    const paragraph = paragraphs[i].trim();
    if (paragraph.length > 0) {
      for (const marker of PARAGRAPH_END_MARKERS) {
        if (paragraph.endsWith(marker)) {
          paragraphsWithEndMarkers++;
          break;
        }
      }
    }
  }

  // If most paragraphs (at least 70%) have end markers, consider them well-structured
  const threshold = Math.ceil(paragraphsToCheck * 0.7);
  const needsNormalization = paragraphsWithEndMarkers < threshold;

  return {
    totalParagraphs,
    paragraphsWithEndMarkers,
    needsNormalization,
  };
}

/**
 * Determine if a line should be joined with the next line
 */
function shouldJoinLine(currentLine, nextLine) {
  if (!nextLine || nextLine.trim().length === 0) {
    return false;
  }

  const trimmedLine = currentLine.trim();

  // Check if line ends with one of the paragraph end markers
  for (const marker of PARAGRAPH_END_MARKERS) {
    if (trimmedLine.endsWith(marker)) {
      return false; // Don't join if line ends with a sentence/paragraph marker
    }
  }

  // Check if line ends with hyphen (should always join)
  if (trimmedLine.endsWith(HYPHEN_LINE_ENDING)) {
    return true;
  }

  // Default: join if line doesn't end with sentence terminators
  return true;
}

/**
 * Normalize paragraphs by joining lines and handling hyphenation
 */
function normalizeParagraphs(text) {
  const lines = text.split("\n");
  const normalizedLines = [];
  let currentParagraph = "";

  let linesJoined = 0;
  let hyphensRemoved = 0;
  let paragraphsCreated = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Skip empty lines
    if (line.length === 0) {
      // If we have a current paragraph, finish it
      if (currentParagraph.trim().length > 0) {
        normalizedLines.push(currentParagraph.trim());
        currentParagraph = "";
        paragraphsCreated++;
      }
      continue;
    }

    // Check if line should be joined with the next line
    const nextLine = i + 1 < lines.length ? lines[i + 1] : undefined;
    const shouldJoinWithNext = shouldJoinLine(line, nextLine);

    if (shouldJoinWithNext) {
      // Handle hyphenation at end of line
      if (line.endsWith(HYPHEN_LINE_ENDING)) {
        const nextLineContent = nextLine ? nextLine.trim() : "";
        const nextFirstChar = nextLineContent.charAt(0);

        if (nextFirstChar && nextFirstChar === nextFirstChar.toLowerCase()) {
          // Next line starts with lowercase, remove hyphen
          currentParagraph += line.slice(0, -1); // Remove hyphen
          hyphensRemoved++;
        } else {
          // Keep hyphen
          currentParagraph += line;
        }
      } else {
        currentParagraph += line + " ";
      }
      linesJoined++;
    } else {
      // Line ends a sentence/paragraph
      currentParagraph += line;
      normalizedLines.push(currentParagraph.trim());
      currentParagraph = "";
      paragraphsCreated++;
    }
  }

  // Add any remaining paragraph
  if (currentParagraph.trim().length > 0) {
    normalizedLines.push(currentParagraph.trim());
    paragraphsCreated++;
  }

  // Join paragraphs with double newlines
  const normalizedText = normalizedLines.join(PARAGRAPH_SEPARATOR);

  return {
    normalizedText,
    normalizationStats: {
      linesJoined,
      hyphensRemoved,
      paragraphsCreated,
    },
  };
}

/**
 * Preprocess text with manifest-based pattern removal and paragraph normalization
 */
function preprocessText(text, manifestPath) {
  console.log(
    `Processing text of length ${text.length} with manifest: ${manifestPath}`,
  );

  // Step 1: Load and apply text-removal-patterns from manifest
  const { processedText: patternCleanedText, removedPatterns } = applyManifestPatterns(
    text,
    manifestPath,
  );

  // Step 2: Analyze paragraph structure
  const paragraphAnalysis = analyzeParagraphStructure(patternCleanedText);

  // Step 3: Normalize paragraphs if needed
  const { normalizedText, normalizationStats } = paragraphAnalysis.needsNormalization
    ? normalizeParagraphs(patternCleanedText)
    : {
        normalizedText: patternCleanedText,
        normalizationStats: { linesJoined: 0, hyphensRemoved: 0, paragraphsCreated: 0 },
      };

  return {
    processedText: normalizedText,
    patternsRemoved: removedPatterns.length,
    paragraphsFound: paragraphAnalysis.totalParagraphs,
    paragraphsNormalized: paragraphAnalysis.needsNormalization,
    processingDetails: {
      removedPatterns,
      paragraphAnalysis,
      normalizationStats,
    },
  };
}

async function main() {
  try {
    console.log("🔧 Testing Step 3: Text Quality Enhancement");
    console.log("=".repeat(60));

    // Read input files
    const txtPath = path.join("book-artifacts", BOOK_NAME, "phase1", "step2.txt");
    const ocrPath = path.join("book-artifacts", BOOK_NAME, "phase1", "step2.ocr");
    const manifestPath = path.join("book-artifacts", BOOK_NAME, "book-manifest.yaml");

    console.log(`📖 Loading text from: ${txtPath}`);
    const txtContent = fs.readFileSync(txtPath, "utf-8");
    console.log(`   Text length: ${txtContent.length} characters`);

    console.log(`📄 Loading OCR from: ${ocrPath}`);
    const ocrContent = fs.readFileSync(ocrPath, "utf-8");
    console.log(`   OCR length: ${ocrContent.length} characters`);

    console.log(`⚙️  Loading manifest from: ${manifestPath}`);

    // Test preprocessing on text content
    console.log(
      "\n🧹 Processing text content with manifest patterns and paragraph normalization...",
    );
    const txtResult = preprocessText(txtContent, manifestPath);

    console.log("📊 Text preprocessing results:");
    console.log(`   - Original length: ${txtContent.length}`);
    console.log(`   - Processed length: ${txtResult.processedText.length}`);
    console.log(`   - Patterns removed: ${txtResult.patternsRemoved}`);
    console.log(`   - Paragraphs found: ${txtResult.paragraphsFound}`);
    console.log(`   - Paragraphs normalized: ${txtResult.paragraphsNormalized}`);
    console.log(`   - Details:`);
    console.log(
      `     * Removed patterns: ${txtResult.processingDetails.removedPatterns.join(", ")}`,
    );
    console.log(
      `     * Total paragraphs: ${txtResult.processingDetails.paragraphAnalysis.totalParagraphs}`,
    );
    console.log(
      `     * Paragraphs with end markers: ${txtResult.processingDetails.paragraphAnalysis.paragraphsWithEndMarkers}`,
    );
    console.log(
      `     * Lines joined: ${txtResult.processingDetails.normalizationStats.linesJoined}`,
    );
    console.log(
      `     * Hyphens removed: ${txtResult.processingDetails.normalizationStats.hyphensRemoved}`,
    );
    console.log(
      `     * Paragraphs created: ${txtResult.processingDetails.normalizationStats.paragraphsCreated}`,
    );

    // Test preprocessing on OCR content
    console.log(
      "\n🔍 Processing OCR content with manifest patterns and paragraph normalization...",
    );
    const ocrResult = preprocessText(ocrContent, manifestPath);

    console.log("📊 OCR preprocessing results:");
    console.log(`   - Original length: ${ocrContent.length}`);
    console.log(`   - Processed length: ${ocrResult.processedText.length}`);
    console.log(`   - Patterns removed: ${ocrResult.patternsRemoved}`);
    console.log(`   - Paragraphs found: ${ocrResult.paragraphsFound}`);
    console.log(`   - Paragraphs normalized: ${ocrResult.paragraphsNormalized}`);
    console.log(`   - Details:`);
    console.log(
      `     * Removed patterns: ${ocrResult.processingDetails.removedPatterns.join(", ")}`,
    );
    console.log(
      `     * Total paragraphs: ${ocrResult.processingDetails.paragraphAnalysis.totalParagraphs}`,
    );
    console.log(
      `     * Paragraphs with end markers: ${ocrResult.processingDetails.paragraphAnalysis.paragraphsWithEndMarkers}`,
    );
    console.log(
      `     * Lines joined: ${ocrResult.processingDetails.normalizationStats.linesJoined}`,
    );
    console.log(
      `     * Hyphens removed: ${ocrResult.processingDetails.normalizationStats.hyphensRemoved}`,
    );
    console.log(
      `     * Paragraphs created: ${ocrResult.processingDetails.normalizationStats.paragraphsCreated}`,
    );

    // Write results
    const outputTxtPath = path.join("book-artifacts", BOOK_NAME, "phase1", "step3.txt");
    const outputOcrPath = path.join("book-artifacts", BOOK_NAME, "phase1", "step3.ocr");

    console.log(`\n💾 Writing enhanced text to: ${outputTxtPath}`);
    fs.writeFileSync(outputTxtPath, txtResult.processedText, "utf-8");

    console.log(`💾 Writing enhanced OCR to: ${outputOcrPath}`);
    fs.writeFileSync(outputOcrPath, ocrResult.processedText, "utf-8");

    // Results directory removed - only using book-artifacts now

    // Show some sample output
    console.log("\n📝 Sample of enhanced text (first 500 characters):");
    console.log("-".repeat(50));
    console.log(txtResult.processedText.substring(0, 500));
    console.log("-".repeat(50));

    console.log("\n✅ Step 3 Text Enhancement completed successfully!");
  } catch (error) {
    console.error("\n❌ Step 3 Text Enhancement failed:");
    console.error(error);
    process.exit(1);
  }
}

main();
