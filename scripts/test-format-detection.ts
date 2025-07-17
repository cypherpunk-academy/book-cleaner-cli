import { promises as fs } from "node:fs";
import { join } from "node:path";
import { LOG_COMPONENTS, LOG_LEVELS } from "../src/constants";
import { FileFormatDetector } from "../src/pipeline/phase_1_Text_Extraction_And_Format_Processing/step_1_File_Format_Detection_And_Validation/FileFormatDetector";
import { LoggerService } from "../src/services/LoggerService";
// import { FileUtils } from '../src/utils/FileUtils';
import type { FileInfo, LoggerConfig } from "../src/types";

/**
 * Test script for PDF format detection
 */
async function testPDFFormatDetection() {
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

  // Create logger service
  const logger = new LoggerService(loggerConfig);

  // Create file format detector
  const detector = new FileFormatDetector(logger);

  // Create file utils
  // const fileUtils = new FileUtils(logger);

  // Display banners
  detector.displayPhase1Banner();
  detector.displayStep1Banner();

  // Test PDF files from fixtures
  const pdfDir = join(__dirname, "..", "tests", "fixtures", "pdfs");
  const testFiles = [
    "Novalis#Heinrich_von_Ofterdingen.pdf",
    "Rudolf_Steiner#Anthroposophie_als_Kosmosophie._Erster_Teil._Wesenszüge_des_Menschen_im_irdischen_und_kosmischen_Bereich._Der_Mensch_in_seinem_Zusammenhang_mit_dem_Kosmos_Band_VII#207.pdf",
    "Rudolf_Steiner#Einleitungen_zu_Goethes_Naturwissenschaftlichen_Schriften#1.pdf",
  ];

  console.log("📋 Testing PDF Format Detection");
  console.log("=".repeat(80));

  for (const filename of testFiles) {
    const filePath = join(pdfDir, filename);

    try {
      // Check if file exists
      const stats = await fs.stat(filePath);

      // Create FileInfo object
      const fileInfo: FileInfo = {
        path: filePath,
        name: filename,
        size: stats.size,
        format: "pdf",
        mimeType: "application/pdf",
        lastModified: stats.mtime,
      };

      console.log(`\n🔍 Testing: ${filename}`);
      console.log(`   Size: ${(stats.size / 1024 / 1024).toFixed(2)}MB`);
      console.log(`   Path: ${filePath}`);

      // Test format detection
      const result = await detector.detectFormat(fileInfo);

      // Display results
      console.log("\n📊 Detection Results:");
      console.log(`   Format: ${result.format}`);
      console.log(`   MIME Type: ${result.mimeType}`);
      console.log(`   Valid: ${result.isValid ? "✅" : "❌"}`);
      console.log(`   Confidence: ${(result.confidence * 100).toFixed(1)}%`);

      if (result.metadata) {
        console.log("\n📈 Metadata:");
        console.log(`   Page Count: ${result.metadata.pageCount || "N/A"}`);
        console.log(`   Content Type: ${result.metadata.contentType || "N/A"}`);
        console.log(
          `   Has Embedded Text: ${result.metadata.hasEmbeddedText ? "✅" : "❌"}`,
        );
        console.log(`   Version: ${result.metadata.version || "N/A"}`);
        console.log(`   Encoding: ${result.metadata.encoding || "N/A"}`);

        if (result.metadata.security) {
          console.log("\n🔒 Security:");
          console.log(
            `   Exceeds Size: ${result.metadata.security.exceedsSize ? "⚠️" : "✅"}`,
          );
          console.log(
            `   Is Corrupted: ${result.metadata.security.isCorrupted ? "⚠️" : "✅"}`,
          );
          console.log(`   Has DRM: ${result.metadata.security.hasDRM ? "⚠️" : "✅"}`);
        }
      }

      if (result.issues.length > 0) {
        console.log("\n⚠️ Issues:");
        result.issues.forEach((issue, index) => {
          console.log(`   ${index + 1}. ${issue}`);
        });
      }

      // Test magic number detection specifically
      const buffer = await fs.readFile(filePath);
      const header = buffer.subarray(0, 8);
      console.log("\n🔍 Magic Numbers:");
      console.log(`   Header (hex): ${header.toString("hex")}`);
      console.log(`   Header (ascii): ${header.toString("ascii")}`);

      console.log(`\n${"─".repeat(80)}`);
    } catch (error) {
      console.error(`\n❌ Error testing ${filename}:`, error);
      console.log(`\n${"─".repeat(80)}`);
    }
  }

  console.log("\n✅ PDF Format Detection Test Complete");
}

// Run the test
testPDFFormatDetection().catch(console.error);
