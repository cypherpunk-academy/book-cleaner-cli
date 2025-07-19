#!/usr/bin/env ts-node

import { promises as fs } from "node:fs";
import * as path from "node:path";
import { LOG_COMPONENTS, LOG_LEVELS } from "../src/constants";
import { TextExtractor } from "../src/pipeline/phase_1_Text_Extraction_And_Format_Processing/step_2_Text_Extraction/TextExtractor";
import { ConfigService } from "../src/services/ConfigService";
import { LoggerService } from "../src/services/LoggerService";
import type { FileInfo, FilenameMetadata, LoggerConfig } from "../src/types";

/**
 * Test script for Step 1.2: Text Extraction Based on Book Structure
 */
async function testStep1_2() {
  console.log("🧪 Testing Step 1.2: Text Extraction Based on Book Structure\n");

  // Create logger config
  const loggerConfig: LoggerConfig = {
    level: LOG_LEVELS.INFO,
    pretty: true,
    timestamp: true,
    tags: {
      [LOG_COMPONENTS.FILE_HANDLER]: LOG_LEVELS.DEBUG,
      [LOG_COMPONENTS.PIPELINE_MANAGER]: LOG_LEVELS.INFO,
    },
  };

  // Initialize logger
  const logger = new LoggerService(loggerConfig);

  // Initialize config service and text extractor
  const configService = new ConfigService(logger, "./book-artifacts");
  const textExtractor = new TextExtractor(logger, configService, "./book-artifacts");

  // Test with a sample file
  const testFile = "Novalis#Heinrich_von_Ofterdingen.pdf";
  const testFilePath = path.join("..", testFile);

  // Check if test file exists
  try {
    await fs.access(testFilePath);
    console.log(`✅ Test file found: ${testFile}`);
  } catch {
    console.log(`❌ Test file not found: ${testFile}`);
    console.log("📝 Creating sample text file for testing...");

    // Create a sample text file for testing
    const sampleContent = `
SAMPLE BOOK CONTENT

This is text before the first chapter.
Some introductory material here.

CHAPTER 1: The Beginning

This is the actual author content that we want to extract.
It contains the main text of the book.
Multiple paragraphs of content.

CHAPTER 2: The Middle

More author content here.
Additional paragraphs.

FINAL NOTES

This is text after the last chapter.
Appendix material that should be excluded.
`;

    const sampleFilePath = path.join(process.cwd(), "sample-book.txt");
    await fs.writeFile(sampleFilePath, sampleContent, "utf-8");
    console.log(`✅ Sample file created: ${sampleFilePath}`);

    // Update test file info
    const stats = await fs.stat(sampleFilePath);
    const fileInfo: FileInfo = {
      path: sampleFilePath,
      name: "sample-book.txt",
      size: stats.size,
      format: "txt",
      mimeType: "text/plain",
      lastModified: stats.mtime,
    };

    const metadata: FilenameMetadata = {
      author: "Sample Author",
      title: "Sample Book",
      originalFilename: "sample-book.txt",
    };

    console.log("\n🔧 Testing text extraction with sample file...");

    try {
      const result = await textExtractor.extractText(
        fileInfo,
        {
          hasTextBoundaries: true,
          boundaries: {
            textBefore: "This is text before the first chapter.",
            textAfter: "This is text after the last chapter.",
          },
          fileType: "text",
          outputDir: "./output",
        },
        metadata,
      );

      console.log("\n📊 Extraction Results:");
      console.log(
        `📄 Extracted text length: ${result.extractedText.length} characters`,
      );
      console.log(`📁 Text files saved: ${result.textFiles.length}`);
      console.log(
        `🎯 Boundaries found: start=${result.boundaries.startFound}, end=${result.boundaries.endFound}`,
      );

      if (result.textFiles.length > 0) {
        console.log(`💾 Output file: ${result.textFiles[0]}`);
      }

      // Show first 200 characters of extracted text
      const preview = result.extractedText.substring(0, 200);
      console.log(`\n📝 Text preview:\n${preview}...`);

      console.log("\n✅ Step 1.2 test completed successfully!");

      // Cleanup
      await fs.unlink(sampleFilePath);
      console.log("🧹 Cleanup: Sample file removed");
    } catch (error) {
      console.error("❌ Error during text extraction:", error);

      // Cleanup on error
      try {
        await fs.unlink(sampleFilePath);
        console.log("🧹 Cleanup: Sample file removed");
      } catch {
        // Ignore cleanup errors
      }
    }
  }
}

// Run the test
if (require.main === module) {
  testStep1_2().catch(console.error);
}

export { testStep1_2 };
