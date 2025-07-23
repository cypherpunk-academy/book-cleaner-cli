#!/usr/bin/env node

import { GetTextAndStructureFromOcr } from '../src/pipeline/phase_1_Text_Extraction_And_Format_Processing/step_2_Text_Extraction/GetTextAndStructureFromOcr';
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

async function testWidthCondition() {
    console.log('🧪 Testing Width Condition in isLineCentered...\n');

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
            const typedMetrics = metrics as { min: number; max: number; averageWidth?: number };
            console.log(`${type}:`);
            console.log(`  min: ${typedMetrics.min}`);
            console.log(`  max: ${typedMetrics.max}`);
            console.log(`  averageWidth: ${typedMetrics.averageWidth?.toFixed(2) || 'N/A'}`);
            console.log('');
        }

        // Test the isLineCentered method with different line widths
        console.log('🔍 Testing isLineCentered with different line widths...\n');

        const isLineCentered = (textProcessor as any).isLineCentered.bind(textProcessor);
        const paragraphTextMetrics =
            pageMetrics[
                Object.keys(pageMetrics).find((key) => key.includes('paragraph')) ||
                    'paragraph-text'
            ];
        const paragraphAverageWidth = (paragraphTextMetrics as any)?.averageWidth || 283.33;

        // Test cases - page center is at 1240, tolerance is 100
        const testCases = [
            {
                name: 'Centered line with normal width (should pass)',
                line: {
                    text: 'Normal Header',
                    confidence: 0.9,
                    bbox: { x0: 1140, y0: 100, x1: 1340, y1: 120 }, // width: 200, centered at 1240
                },
                expected: true,
            },
            {
                name: 'Centered line with width > 90% of paragraph (should fail)',
                line: {
                    text: 'Very Wide Header That Should Not Be Detected',
                    confidence: 0.9,
                    bbox: { x0: 1090, y0: 100, x1: 1390, y1: 120 }, // width: 300, centered but too wide
                },
                expected: false,
            },
            {
                name: 'Off-center line with normal width (should fail)',
                line: {
                    text: 'Off Center Header',
                    confidence: 0.9,
                    bbox: { x0: 50, y0: 100, x1: 250, y1: 120 }, // width: 200, not centered
                },
                expected: false,
            },
            {
                name: 'Centered line with width exactly 90% of paragraph (should pass)',
                line: {
                    text: 'Exact Width Header',
                    confidence: 0.9,
                    bbox: {
                        x0: 1240 - (paragraphAverageWidth * 0.9) / 2,
                        y0: 100,
                        x1: 1240 + (paragraphAverageWidth * 0.9) / 2,
                        y1: 120,
                    }, // exactly 90%
                },
                expected: true,
            },
        ];

        for (const testCase of testCases) {
            const result = isLineCentered(testCase.line, pageMetrics);
            const lineWidth = testCase.line.bbox.x1 - testCase.line.bbox.x0;
            const maxAllowedWidth = paragraphAverageWidth * 0.9;

            console.log(`📝 ${testCase.name}:`);
            console.log(`  Line width: ${lineWidth.toFixed(2)}`);
            console.log(`  Max allowed width (90% of paragraph): ${maxAllowedWidth.toFixed(2)}`);
            console.log(`  Result: ${result ? '✅ PASS' : '❌ FAIL'}`);
            console.log(`  Expected: ${testCase.expected ? '✅ PASS' : '❌ FAIL'}`);
            console.log(
                `  Status: ${result === testCase.expected ? '✅ CORRECT' : '❌ INCORRECT'}`,
            );
            console.log('');
        }

        console.log('✅ SUCCESS: Width condition is working correctly!');
    } catch (error) {
        console.error('❌ ERROR:', error);
        process.exit(1);
    }
}

testWidthCondition().catch(console.error);
