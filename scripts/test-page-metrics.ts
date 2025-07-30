#!/usr/bin/env node

import { GetTextAndStructureFromOcr } from '../src/services/OCRService';
import { LoggerService, createDefaultLoggerService } from '../src/services/LoggerService';
import { ConfigService } from '../src/services/ConfigService';

// Define OCRData interface locally for testing
interface OCRData {
    text: string;
    confidence: number;
    paragraphs?: Array<{
        text: string;
        confidence: number;
        bbox: { x0: number; y0: number; x1: number; y1: number };
        lines?: Array<{
            text: string;
            confidence: number;
            bbox: { x0: number; y0: number; x1: number; y1: number };
        }>;
    }>;
}

async function testPageMetrics() {
    console.log('🧪 Testing Page Metrics with AverageWidth...\n');

    // Initialize services
    const logger = createDefaultLoggerService();
    const configService = new ConfigService(logger);
    const textProcessor = new GetTextAndStructureFromOcr(logger, configService);

    // Sample OCR data with different line widths
    const sampleOCRData: OCRData = {
        text: '',
        confidence: 0.9,
        paragraphs: [
            {
                text: 'This is a paragraph with some text',
                confidence: 0.9,
                bbox: { x0: 100, y0: 100, x1: 500, y1: 150 },
                lines: [
                    {
                        text: 'This is a paragraph',
                        confidence: 0.9,
                        bbox: { x0: 100, y0: 100, x1: 400, y1: 120 }, // width: 300
                    },
                    {
                        text: 'with some text',
                        confidence: 0.9,
                        bbox: { x0: 100, y0: 120, x1: 350, y1: 140 }, // width: 250
                    },
                ],
            },
            {
                text: 'This is a footnote',
                confidence: 0.9,
                bbox: { x0: 50, y0: 200, x1: 300, y1: 250 },
                lines: [
                    {
                        text: 'This is a footnote',
                        confidence: 0.9,
                        bbox: { x0: 50, y0: 200, x1: 300, y1: 220 }, // width: 250
                    },
                ],
            },
            {
                text: 'Another paragraph line',
                confidence: 0.9,
                bbox: { x0: 100, y0: 300, x1: 450, y1: 350 },
                lines: [
                    {
                        text: 'Another paragraph line',
                        confidence: 0.9,
                        bbox: { x0: 100, y0: 300, x1: 450, y1: 320 }, // width: 350
                    },
                ],
            },
        ],
    };

    try {
        // Load book type config
        const configs = await configService.loadBookTypesConfig();
        if (!configs) {
            throw new Error('Failed to load book types config');
        }
        const bookConfig = configs['rudolf-steiner-ga-werk'];
        if (!bookConfig) {
            throw new Error('Failed to load book type config');
        }

        // Test the page metrics analysis
        console.log('📊 Analyzing page metrics...\n');

        // Use reflection to access the private method for testing
        const analyzePageMetrics = (textProcessor as any).analyzePageMetrics.bind(textProcessor);
        const pageMetrics = analyzePageMetrics(sampleOCRData, bookConfig);

        console.log('✅ Page Metrics Results:');
        console.log('=====================================');

        for (const [type, metrics] of Object.entries(pageMetrics)) {
            const typedMetrics = metrics as {
                minX0: number;
                maxX0: number;
                averageWidth?: number;
                maxWidth?: number;
            };
            console.log(`${type}:`);
            console.log(`  minX0: ${typedMetrics.minX0}`);
            console.log(`  maxX0: ${typedMetrics.maxX0}`);
            console.log(`  averageWidth: ${typedMetrics.averageWidth?.toFixed(2) || 'N/A'}`);
            console.log(`  maxWidth: ${typedMetrics.maxWidth?.toFixed(2) || 'N/A'}`);
            console.log('');
        }

        // Verify that averageWidth is present
        const hasAverageWidth = Object.values(pageMetrics).some((metrics) => {
            const typedMetrics = metrics as {
                minX0: number;
                maxX0: number;
                averageWidth?: number;
                maxWidth?: number;
            };
            return typedMetrics.averageWidth !== undefined;
        });

        if (hasAverageWidth) {
            console.log('✅ SUCCESS: averageWidth is being calculated and included!');
        } else {
            console.log('❌ FAILURE: averageWidth is not being calculated');
        }

        // Test with a real OCR processing
        console.log('\n🔄 Testing with full OCR processing...\n');

        const scanResults = {
            textWithHeaders: '',
            footnoteText: '',
            level1HeadingsIndex: 0,
            level2HeadingsIndex: 0,
            level3HeadingsIndex: 0,
        };

        const result = await textProcessor.processOCRData(
            sampleOCRData,
            'rudolf-steiner-ga-werk',
            scanResults,
        );

        if (result.success) {
            console.log('✅ SUCCESS: Full OCR processing completed with averageWidth support!');
        } else {
            console.log('❌ FAILURE: Full OCR processing failed');
        }
    } catch (error) {
        console.error('❌ ERROR:', error);
        process.exit(1);
    }
}

testPageMetrics().catch(console.error);
