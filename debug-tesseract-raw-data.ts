import { writeFileSync } from "node:fs";
import { join } from "node:path";
import Tesseract from "tesseract.js";
import pdf2pic from "pdf2pic";

interface TesseractRawData {
  text: string;
  confidence: number;
  blocks: Array<{
    text: string;
    confidence: number;
    baseline: { x0: number; y0: number; x1: number; y1: number };
    bbox: { x0: number; y0: number; x1: number; y1: number };
    paragraphs: Array<{
      text: string;
      confidence: number;
      baseline: { x0: number; y0: number; x1: number; y1: number };
      bbox: { x0: number; y0: number; x1: number; y1: number };
      lines: Array<{
        text: string;
        confidence: number;
        baseline: { x0: number; y0: number; x1: number; y1: number };
        bbox: { x0: number; y0: number; x1: number; y1: number };
        words: Array<{
          text: string;
          confidence: number;
          baseline: { x0: number; y0: number; x1: number; y1: number };
          bbox: { x0: number; y0: number; x1: number; y1: number };
        }>;
      }>;
    }>;
  }>;
}

interface PageData {
  pageNumber: number;
  rawText: string;
  confidence: number;
  processingTime: number;
  blocks: number;
  paragraphs: number;
  lines: number;
  words: number;
  tesseractData: TesseractRawData;
}

async function debugTesseractRawData(): Promise<void> {
  try {
    console.log("🔬 Tesseract Raw Data Extraction");
    console.log("=".repeat(50));
    console.log("📄 Processing: Rudolf Steiner PDF (first 10 pages)");
    console.log("🎯 Goal: Extract complete Tesseract data structure");

    const pdfPath =
      "./tests/fixtures/pdfs/Rudolf_Steiner#Einleitungen_zu_Goethes_Naturwissenschaftlichen_Schriften#1.pdf";
    const outputDir = "./output/debug-structure";
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

    // Initialize Tesseract worker
    console.log("\n⚙️  Initializing Tesseract worker...");
    const worker = await Tesseract.createWorker("deu", 1, {
      logger: (m: any) => {
        if (m.status === "recognizing text") {
          process.stdout.write(`\r   Processing: ${Math.round(m.progress * 100)}%`);
        }
      },
    });

    await worker.setParameters({
      tessedit_pageseg_mode: Tesseract.PSM.AUTO,
      preserve_interword_spaces: "1",
    });

    // Convert PDF pages to images
    console.log("\n📄 Converting PDF to images...");
    const convert = pdf2pic.fromPath(pdfPath, {
      density: 300,
      saveFilename: "page",
      savePath: `${outputDir}/temp-images`,
      format: "png",
      width: 2480,
      height: 3508,
    });

    const pagesData: PageData[] = [];

    // Process each page
    for (let pageNum = 1; pageNum <= 10; pageNum++) {
      console.log(`\n📖 Processing page ${pageNum}/10...`);

      const startTime = Date.now();

      try {
        // Convert page to image
        const result = await convert(pageNum, { responseType: "buffer" });
        if (!result.buffer) {
          console.log(`⚠️  Failed to convert page ${pageNum} to image`);
          continue;
        }

        // Perform OCR with structured data
        console.log(`   🔍 Running OCR on page ${pageNum}...`);
        const ocrResult = await worker.recognize(result.buffer);

        const processingTime = Date.now() - startTime;

        // Extract structured data
        const tesseractData = ocrResult.data as TesseractRawData;

        // Count structural elements
        const blocks = tesseractData.blocks?.length || 0;
        const paragraphs =
          tesseractData.blocks?.reduce(
            (sum, block) => sum + (block.paragraphs?.length || 0),
            0,
          ) || 0;
        const lines =
          tesseractData.blocks?.reduce(
            (sum, block) =>
              sum +
              (block.paragraphs?.reduce(
                (pSum, para) => pSum + (para.lines?.length || 0),
                0,
              ) || 0),
            0,
          ) || 0;
        const words =
          tesseractData.blocks?.reduce(
            (sum, block) =>
              sum +
              (block.paragraphs?.reduce(
                (pSum, para) =>
                  pSum +
                  (para.lines?.reduce(
                    (lSum, line) => lSum + (line.words?.length || 0),
                    0,
                  ) || 0),
                0,
              ) || 0),
            0,
          ) || 0;

        const pageData: PageData = {
          pageNumber: pageNum,
          rawText: tesseractData.text || "",
          confidence: tesseractData.confidence || 0,
          processingTime,
          blocks,
          paragraphs,
          lines,
          words,
          tesseractData,
        };

        pagesData.push(pageData);

        console.log(
          `   ✅ Page ${pageNum}: ${Math.round(tesseractData.confidence || 0)}% confidence, ${blocks} blocks, ${paragraphs} paragraphs, ${lines} lines`,
        );
      } catch (error) {
        console.log(
          `   ❌ Failed to process page ${pageNum}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    await worker.terminate();

    // Save complete data to JSON
    const jsonOutputPath = join(outputDir, `first-ten-pages-${timestamp}.json`);
    const jsonData = {
      metadata: {
        sourceFile: pdfPath,
        pages: pagesData.length,
        extractedAt: new Date().toISOString(),
        totalProcessingTime: pagesData.reduce(
          (sum, page) => sum + page.processingTime,
          0,
        ),
      },
      summary: {
        averageConfidence:
          pagesData.reduce((sum, page) => sum + page.confidence, 0) / pagesData.length,
        totalBlocks: pagesData.reduce((sum, page) => sum + page.blocks, 0),
        totalParagraphs: pagesData.reduce((sum, page) => sum + page.paragraphs, 0),
        totalLines: pagesData.reduce((sum, page) => sum + page.lines, 0),
        totalWords: pagesData.reduce((sum, page) => sum + page.words, 0),
        totalTextLength: pagesData.reduce((sum, page) => sum + page.rawText.length, 0),
      },
      pages: pagesData,
    };

    writeFileSync(jsonOutputPath, JSON.stringify(jsonData, null, 2), "utf8");
    console.log(`\n💾 Complete data saved to: ${jsonOutputPath}`);

    // Save summary text for easy reading
    const textSummary = pagesData
      .map(
        (page) =>
          `\n=== PAGE ${page.pageNumber} ===\n` +
          `Confidence: ${Math.round(page.confidence)}%\n` +
          `Structure: ${page.blocks} blocks, ${page.paragraphs} paragraphs, ${page.lines} lines, ${page.words} words\n` +
          `Processing: ${page.processingTime}ms\n` +
          `Text preview (first 500 chars):\n` +
          `${page.rawText.substring(0, 500)}...\n`,
      )
      .join("\n");

    const textOutputPath = join(outputDir, `first-ten-pages-summary-${timestamp}.txt`);
    writeFileSync(textOutputPath, textSummary, "utf8");
    console.log(`💾 Text summary saved to: ${textOutputPath}`);

    // Display summary
    console.log("\n📊 EXTRACTION SUMMARY");
    console.log("=".repeat(30));
    console.log(`✅ Pages processed: ${pagesData.length}/10`);
    console.log(
      `📊 Average confidence: ${Math.round(jsonData.summary.averageConfidence)}%`,
    );
    console.log(
      `🔤 Total text length: ${jsonData.summary.totalTextLength.toLocaleString()} characters`,
    );
    console.log(`📋 Structure found:`);
    console.log(`   • ${jsonData.summary.totalBlocks} blocks`);
    console.log(`   • ${jsonData.summary.totalParagraphs} paragraphs`);
    console.log(`   • ${jsonData.summary.totalLines} lines`);
    console.log(`   • ${jsonData.summary.totalWords} words`);
    console.log(
      `⏱️  Total processing time: ${Math.round(jsonData.metadata.totalProcessingTime / 1000)}s`,
    );

    console.log("\n🎉 Raw data extraction complete!");
    console.log("📁 Check the JSON file for complete Tesseract data structure");
  } catch (error) {
    console.error("\n❌ Extraction failed:");
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

debugTesseractRawData();
