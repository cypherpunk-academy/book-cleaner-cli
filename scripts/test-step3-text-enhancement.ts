#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { TextEnhancer } from "../src/pipeline/phase_1_Text_Extraction_And_Format_Processing/step_3_Text_Auto_Correction/TextEnhancer";
import { LoggerService } from "../src/services/LoggerService";

/**
 * Test script for Step 3 Text Quality Enhancement
 * Tests the new preprocessing functionality including:
 * - Text-removal-patterns from manifest
 * - Paragraph structure analysis
 * - Text normalization with hyphenation handling
 */

const BOOK_NAME =
  "Rudolf Steiner#Einleitungen zu Goethes Naturwissenschaftlichen Schriften#1";
const ARTIFACTS_DIR = "book-artifacts";
// const RESULTS_DIR = "results"; // Removed - only using book-artifacts now

async function testStep3Enhancement() {
  // Initialize logger
  const logger = new LoggerService("debug");

  // Initialize text enhancer
  const textEnhancer = new TextEnhancer(logger);

  try {
    console.log("🔧 Testing Step 3: Text Quality Enhancement");
    console.log("=".repeat(60));

    // Read input files
    const txtPath = join(ARTIFACTS_DIR, BOOK_NAME, "phase1", "step2.txt");
    const ocrPath = join(ARTIFACTS_DIR, BOOK_NAME, "phase1", "step2.ocr");
    const manifestPath = join(ARTIFACTS_DIR, BOOK_NAME, "book-manifest.yaml");

    console.log(`📖 Loading text from: ${txtPath}`);
    const txtContent = readFileSync(txtPath, "utf-8");
    console.log(`   Text length: ${txtContent.length} characters`);

    console.log(`📄 Loading OCR from: ${ocrPath}`);
    const ocrContent = readFileSync(ocrPath, "utf-8");
    console.log(`   OCR length: ${ocrContent.length} characters`);

    console.log(`⚙️  Loading manifest from: ${manifestPath}`);

    // Test preprocessing on text content
    console.log(
      "\n🧹 Processing text content with manifest patterns and paragraph normalization...",
    );
    const txtResult = await textEnhancer.preprocessText(txtContent, manifestPath);

    console.log("📊 Text preprocessing results:");
    console.log(`   - Original length: ${txtContent.length}`);
    console.log(`   - Processed length: ${txtResult.processedText.length}`);
    console.log(`   - Patterns removed: ${txtResult.patternsRemoved}`);
    console.log(`   - Paragraphs found: ${txtResult.paragraphsFound}`);
    console.log(`   - Paragraphs normalized: ${txtResult.paragraphsNormalized}`);
    console.log("   - Details:");
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
    const ocrResult = await textEnhancer.preprocessText(ocrContent, manifestPath);

    console.log("📊 OCR preprocessing results:");
    console.log(`   - Original length: ${ocrContent.length}`);
    console.log(`   - Processed length: ${ocrResult.processedText.length}`);
    console.log(`   - Patterns removed: ${ocrResult.patternsRemoved}`);
    console.log(`   - Paragraphs found: ${ocrResult.paragraphsFound}`);
    console.log(`   - Paragraphs normalized: ${ocrResult.paragraphsNormalized}`);
    console.log("   - Details:");
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
    const outputTxtPath = join(ARTIFACTS_DIR, BOOK_NAME, "phase1", "step3.txt");
    const outputOcrPath = join(ARTIFACTS_DIR, BOOK_NAME, "phase1", "step3.ocr");

    console.log(`\n💾 Writing enhanced text to: ${outputTxtPath}`);
    writeFileSync(outputTxtPath, txtResult.processedText, "utf-8");

    console.log(`💾 Writing enhanced OCR to: ${outputOcrPath}`);
    writeFileSync(outputOcrPath, ocrResult.processedText, "utf-8");

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

// Run the test
testStep3Enhancement();
