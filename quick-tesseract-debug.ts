import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import pdf2pic from 'pdf2pic';
import Tesseract from 'tesseract.js';

async function quickTesseractDebug(): Promise<void> {
    try {
        console.log('🚀 Quick Tesseract Debug (3 pages)');
        console.log('='.repeat(40));

        const pdfPath =
            './tests/fixtures/pdfs/Rudolf_Steiner#Einleitungen_zu_Goethes_Naturwissenschaftlichen_Schriften#1.pdf';
        const outputDir = './output/debug-structure';
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

        // Initialize Tesseract worker
        console.log('⚙️  Initializing Tesseract...');
        const worker = await Tesseract.createWorker('deu', 1);

        await worker.setParameters({
            tessedit_pageseg_mode: Tesseract.PSM.AUTO,
            preserve_interword_spaces: '1',
        });

        // Convert PDF pages to images
        const convert = pdf2pic.fromPath(pdfPath, {
            density: 300,
            saveFilename: 'page',
            savePath: `${outputDir}/temp-images`,
            format: 'png',
            width: 2480,
            height: 3508,
        });

        const allPagesData: any[] = [];

        // Process 3 pages quickly
        for (let pageNum = 4; pageNum <= 6; pageNum++) {
            console.log(`\n📖 Processing page ${pageNum}...`);

            try {
                // Convert page to image
                const result = await convert(pageNum, { responseType: 'buffer' });
                if (!result.buffer) {
                    console.log(`⚠️  Failed to convert page ${pageNum}`);
                    continue;
                }

                // Perform OCR with structured data
                const ocrResult = await worker.recognize(result.buffer);
                const tesseractData = ocrResult.data;

                // Save individual page data immediately
                const pageJsonPath = join(
                    outputDir,
                    `page-${pageNum}-data-${timestamp}.json`,
                );
                writeFileSync(
                    pageJsonPath,
                    JSON.stringify(tesseractData, null, 2),
                    'utf8',
                );
                console.log(
                    `   💾 Page ${pageNum} data saved to: page-${pageNum}-data-${timestamp}.json`,
                );

                // Also extract key info for analysis
                const pageAnalysis = {
                    pageNumber: pageNum,
                    confidence: tesseractData.confidence,
                    rawText: tesseractData.text,
                    textLength: tesseractData.text?.length || 0,
                    blocks: tesseractData.blocks?.length || 0,
                    paragraphs:
                        tesseractData.blocks?.reduce(
                            (sum: number, block: any) =>
                                sum + (block.paragraphs?.length || 0),
                            0,
                        ) || 0,
                    lines:
                        tesseractData.blocks?.reduce(
                            (sum: number, block: any) =>
                                sum +
                                (block.paragraphs?.reduce(
                                    (pSum: number, para: any) =>
                                        pSum + (para.lines?.length || 0),
                                    0,
                                ) || 0),
                            0,
                        ) || 0,

                    // Extract first few lines of text for debugging paragraph issues
                    firstLines: tesseractData.text?.split('\n')?.slice(0, 10) || [],

                    // Check for specific patterns the user mentioned
                    hasProblematicPatterns: {
                        'Das Bedeutsame':
                            tesseractData.text?.includes('Das Bedeutsame') || false,
                        'Indem wir nun':
                            tesseractData.text?.includes('Indem wir nun') || false,
                        'alles hier An-':
                            tesseractData.text?.includes('alles hier An-') || false,
                        'zeigt sich schon':
                            tesseractData.text?.includes('zeigt sich schon') || false,
                    },
                };

                allPagesData.push(pageAnalysis);

                console.log(
                    `   ✅ Page ${pageNum}: ${Math.round(tesseractData.confidence)}% confidence, ${pageAnalysis.blocks} blocks, ${pageAnalysis.paragraphs} paragraphs`,
                );

                // Show problematic patterns if found
                for (const [pattern, found] of Object.entries(
                    pageAnalysis.hasProblematicPatterns,
                )) {
                    if (found) {
                        console.log(`   🎯 Found pattern: "${pattern}"`);
                    }
                }
            } catch (error) {
                console.log(
                    `   ❌ Failed page ${pageNum}: ${error instanceof Error ? error.message : String(error)}`,
                );
            }
        }

        await worker.terminate();

        // Save combined analysis
        const analysisPath = join(outputDir, `first-ten-pages-${timestamp}.json`);
        const combinedData = {
            metadata: {
                sourceFile: pdfPath,
                extractedAt: new Date().toISOString(),
                pagesProcessed: allPagesData.map((p) => p.pageNumber),
            },
            summary: {
                averageConfidence:
                    allPagesData.reduce((sum, page) => sum + page.confidence, 0) /
                    allPagesData.length,
                totalTextLength: allPagesData.reduce(
                    (sum, page) => sum + page.textLength,
                    0,
                ),
                totalBlocks: allPagesData.reduce((sum, page) => sum + page.blocks, 0),
                totalParagraphs: allPagesData.reduce(
                    (sum, page) => sum + page.paragraphs,
                    0,
                ),
                totalLines: allPagesData.reduce((sum, page) => sum + page.lines, 0),
            },
            pages: allPagesData,
        };

        writeFileSync(analysisPath, JSON.stringify(combinedData, null, 2), 'utf8');
        console.log(
            `\n💾 Combined analysis saved to: first-ten-pages-${timestamp}.json`,
        );

        // Show summary
        console.log('\n📊 QUICK DEBUG SUMMARY');
        console.log('='.repeat(25));
        console.log(`✅ Pages: ${allPagesData.length}`);
        console.log(
            `📊 Avg confidence: ${Math.round(combinedData.summary.averageConfidence)}%`,
        );
        console.log(
            `🔤 Total chars: ${combinedData.summary.totalTextLength.toLocaleString()}`,
        );
        console.log(
            `📋 Structure: ${combinedData.summary.totalBlocks} blocks, ${combinedData.summary.totalParagraphs} paragraphs, ${combinedData.summary.totalLines} lines`,
        );

        // Check for problematic patterns across all pages
        const foundPatterns = allPagesData.flatMap((page) =>
            Object.entries(page.hasProblematicPatterns)
                .filter(([_pattern, found]) => found)
                .map(([pattern, _found]) => ({ page: page.pageNumber, pattern })),
        );

        if (foundPatterns.length > 0) {
            console.log('\n🎯 Problematic patterns found:');
            for (const { page, pattern } of foundPatterns) {
                console.log(`   Page ${page}: "${pattern}"`);
            }
        }

        console.log(
            '\n🎉 Quick debug complete! Check JSON files for detailed structure.',
        );
    } catch (error) {
        console.error(
            '❌ Debug failed:',
            error instanceof Error ? error.message : String(error),
        );
        process.exit(1);
    }
}

quickTesseractDebug();
