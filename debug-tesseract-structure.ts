import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { LoggerService } from "./src/services/LoggerService";
import { OCRService } from "./src/pipeline/phase_1_Text_Extraction_And_Format_Processing/step_2_Text_Extraction/OCRService";
import type { FileInfo } from "./src/types";

async function debugTesseractStructure(): Promise<void> {
  try {
    console.log("🔍 Debug: Tesseract Structural Data Analysis");
    console.log("=".repeat(60));

    // Initialize services
    const logger = new LoggerService({
      level: "info",
      pretty: true,
      timestamp: true,
      tags: {},
    });

    const ocrService = new OCRService(logger);

    // File info for the PDF
    const fileInfo: FileInfo = {
      name: "Rudolf_Steiner#Einleitungen_zu_Goethes_Naturwissenschaftlichen_Schriften#1.pdf",
      path: "./tests/fixtures/pdfs/Rudolf_Steiner#Einleitungen_zu_Goethes_Naturwissenschaftlichen_Schriften#1.pdf",
      mimeType: "application/pdf",
      size: 1000000,
      format: "pdf" as const,
      lastModified: new Date(),
    };

    console.log("🔬 Analyzing first 5 pages with detailed structural output...");

    const result = await ocrService.performOCR(fileInfo, {
      pageRange: { start: 1, end: 5 },
      detectStructure: true,
    });

    console.log("\n📊 OCR Results Summary:");
    console.log(`   • Text length: ${result.extractedText.length}`);
    console.log(`   • Confidence: ${result.confidence}%`);
    console.log(`   • Language: ${result.language}`);

    // Create output directory
    const outputDir = "./output/debug-structure";

    // Save raw extracted text
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const rawTextPath = join(outputDir, `debug-raw-text-${timestamp}.txt`);
    writeFileSync(rawTextPath, result.extractedText, "utf8");
    console.log(`💾 Raw text saved to: ${rawTextPath}`);

    // Save structured text if available
    if (result.structuredText) {
      const structuredTextPath = join(
        outputDir,
        `debug-structured-text-${timestamp}.txt`,
      );
      writeFileSync(structuredTextPath, result.structuredText, "utf8");
      console.log(`💾 Structured text saved to: ${structuredTextPath}`);
    }

    console.log("\n🔍 Searching for problematic patterns:");

    // Look for the specific problematic cases the user mentioned
    const lines = result.extractedText.split("\n");
    const problematicPatterns = [
      "Das Bedeutsame",
      "Indem wir nun",
      "alles hier An-",
      "zeigt sich schon",
    ];

    for (const pattern of problematicPatterns) {
      console.log(`\n🎯 Looking for: "${pattern}"`);

      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(pattern)) {
          console.log(`   Found at line ${i + 1}:`);
          console.log(
            `   Context (lines ${Math.max(1, i - 1)}-${Math.min(lines.length, i + 3)}):`,
          );

          for (
            let j = Math.max(0, i - 2);
            j <= Math.min(lines.length - 1, i + 2);
            j++
          ) {
            const marker = j === i ? " >>> " : "     ";
            console.log(`${marker}${j + 1}: "${lines[j]}"`);
          }
          break;
        }
      }
    }

    console.log(
      "\n🔧 Analysis complete! Check the saved files for detailed text output.",
    );
  } catch (error) {
    console.error("❌ Debug failed:");
    console.error(error instanceof Error ? error.message : String(error));

    if (error instanceof Error && error.stack) {
      console.error("\n📋 Stack trace:");
      console.error(error.stack);
    }

    process.exit(1);
  }
}

// Handle unhandled promise rejections
process.on("unhandledRejection", (error) => {
  console.error("💥 Unhandled error:", error);
  process.exit(1);
});

debugTesseractStructure();
