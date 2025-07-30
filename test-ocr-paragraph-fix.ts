import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { LoggerService } from './src/services/LoggerService';
import { OCRService } from './src/services/OCRService';
import type { FileInfo } from './src/types';

async function testOCRParagraphFix() {
    console.log('🧪 Testing OCR Paragraph Reconstruction Fix');
    console.log('📄 Processing first 10 pages of Rudolf Steiner PDF');
    console.log('='.repeat(70));

    // Initialize logger and OCR service
    const logger = new LoggerService({
        level: 'info',
        pretty: true,
        timestamp: true,
        tags: {},
    });

    const ocrService = new OCRService(logger, {} as any);

    // Define the test file
    const testFile: FileInfo = {
        path: './tests/fixtures/pdfs/Rudolf_Steiner#Einleitungen_zu_Goethes_Naturwissenschaftlichen_Schriften#1.pdf',
        name: 'Rudolf_Steiner#Einleitungen_zu_Goethes_Naturwissenschaftlichen_Schriften#1.pdf',
        format: 'pdf',
        size: 15728640, // Approximate size
        mimeType: 'application/pdf',
        lastModified: new Date(),
    };

    try {
        console.log(`📖 Processing: ${testFile.name}`);
        console.log(`📂 Path: ${testFile.path}`);
        console.log();

        const startTime = Date.now();

        // Process with OCR - limit to first 10 pages by using page range
        const result = await ocrService.performOCR(
            testFile,
            {
                language: 'deu',
                detectStructure: true,
                enhanceImage: true,
                timeout: 600000, // 10 minutes
                pageRange: {
                    start: 1,
                    end: 10,
                },
            },
            'default',
            undefined,
        );

        const endTime = Date.now();
        const processingTime = endTime - startTime;

        console.log('✅ OCR Processing Complete!');
        console.log();
        console.log('📊 Results Summary:');
        console.log(`   • Pages processed: ${result.pageCount}`);
        console.log(`   • Processing time: ${Math.round(processingTime / 1000)}s`);
        console.log(
            `   • Text length: ${result.structuredText.length.toLocaleString()} characters`,
        );

        if (result.errors && result.errors.length > 0) {
            console.log(`   • Errors: ${result.errors.length}`);
            result.errors.forEach((error, index) => {
                console.log(`     ${index + 1}. ${error}`);
            });
        }

        console.log();

        // Save results to files
        const outputDir = './output/ocr-test';
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

        // Save structured text
        const textOutputPath = join(
            outputDir,
            `steiner-einleitungen-pages1-10-${timestamp}.txt`,
        );
        writeFileSync(textOutputPath, result.structuredText, 'utf8');
        console.log(`💾 Text saved to: ${textOutputPath}`);

        // Save structured text if available
        if (result.structuredText && result.structuredText.trim().length > 0) {
            const structuredOutputPath = join(
                outputDir,
                `steiner-einleitungen-pages1-10-structured-${timestamp}.txt`,
            );
            writeFileSync(structuredOutputPath, result.structuredText, 'utf8');
            console.log(`💾 Structured text saved to: ${structuredOutputPath}`);
        }

        // Show first few paragraphs as preview
        console.log();
        console.log('📖 Text Preview (first 1000 characters):');
        console.log('-'.repeat(50));
        console.log(`${result.structuredText.substring(0, 1000)}...`);
        console.log('-'.repeat(50));

        // Look for the specific issue we're trying to fix
        console.log();
        console.log('🔍 Checking for paragraph joining issues:');
        const lines = result.structuredText.split('\n');
        let issuesFound = 0;

        for (let i = 0; i < Math.min(lines.length, 50); i++) {
            const line = lines[i].trim();
            // Look for lines that end with a period and continue with a capital letter
            if (line.match(/\.\s+[A-ZÄÖÜ]/)) {
                console.log(`   ⚠️  Line ${i + 1}: "${line.substring(0, 80)}..."`);
                issuesFound++;
                if (issuesFound >= 5) {
                    console.log(
                        `   ... and ${Math.max(0, lines.length - i - 1)} more lines to check`,
                    );
                    break;
                }
            }
        }

        if (issuesFound === 0) {
            console.log('   ✅ No obvious paragraph joining issues found in preview!');
        } else {
            console.log(
                `   ⚠️  Found ${issuesFound} potential paragraph joining issues`,
            );
        }

        console.log();
        console.log('🎉 Test completed successfully!');
    } catch (error) {
        console.error('❌ Test failed:');
        console.error(error instanceof Error ? error.message : String(error));

        if (error instanceof Error && error.stack) {
            console.error('\n📋 Stack trace:');
            console.error(error.stack);
        }

        process.exit(1);
    }
}

// Run the test
testOCRParagraphFix().catch((error) => {
    console.error('💥 Unhandled error:', error);
    process.exit(1);
});
