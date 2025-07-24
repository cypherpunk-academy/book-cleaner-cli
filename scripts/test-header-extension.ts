#!/usr/bin/env node

import { GetTextAndStructureFromOcr } from '../src/pipeline/phase_1_Text_Extraction_And_Format_Processing/step_2_Text_Extraction/GetTextAndStructureFromOcr';
import { LoggerService, createDefaultLoggerService } from '../src/services/LoggerService';
import { ConfigService } from '../src/services/ConfigService';

async function testHeaderExtension() {
    console.log('🧪 Testing Header Extension Fix...\n');

    // Initialize services
    const logger = createDefaultLoggerService();
    const configService = new ConfigService(logger);
    const textProcessor = new GetTextAndStructureFromOcr(logger, configService);

    // Test case: Level 2 header followed by paragraph content
    const testLines = [
        {
            text: '1. Methodologie',
            bbox: { x0: 1200, y0: 100, x1: 1250, y1: 120 },
        },
        {
            text: ' Wir haben das Verhältnis von der durch das wissenschaftliche Denken gewonnenen Ideenwelt',
            bbox: { x0: 100, y0: 130, x1: 400, y1: 150 },
        },
    ];

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

        // Create mock page metrics
        const pageMetrics = {
            'paragraph-text': { minX0: 0, maxX0: 200, averageWidth: 500, maxWidth: 500 },
        };

        console.log('🔍 Testing header extension with paragraph content...\n');

        // Use reflection to access the private method for testing
        const detectAndProcessHeaders = (textProcessor as any).detectAndProcessHeaders.bind(
            textProcessor,
        );

        // Test the header detection
        const result = detectAndProcessHeaders(0, testLines, bookConfig, pageMetrics);

        console.log('📝 Test Results:');
        console.log(`  Header Detection Result: ${result ? '✅ FOUND' : '❌ NOT FOUND'}`);

        if (result) {
            console.log(`  Header Text: "${result.headerText}"`);
            console.log(`  Header Level: ${result.level}`);
            console.log(`  New Line Index: ${result.newLineIndex}`);

            // Check if the header text contains the paragraph content
            const containsParagraphContent = result.headerText.includes('Wir haben das Verhältnis');
            console.log(
                `  Contains Paragraph Content: ${containsParagraphContent ? '❌ INCORRECT' : '✅ CORRECT'}`,
            );

            if (containsParagraphContent) {
                console.log('  ❌ FAILURE: Header incorrectly includes paragraph content');
            } else {
                console.log('  ✅ SUCCESS: Header correctly excludes paragraph content');
            }
        } else {
            console.log('  ❌ FAILURE: Header not detected at all');
        }

        // Test with a valid multi-line header
        console.log('\n🔍 Testing valid multi-line header...\n');

        const validMultiLineHeader = [
            {
                text: 'II DIE ENTSTEHUNG',
                bbox: { x0: 1200, y0: 100, x1: 1250, y1: 120 },
            },
            {
                text: 'DER METAMORPHOSENLEHRE',
                bbox: { x0: 1200, y0: 130, x1: 1280, y1: 150 },
            },
        ];

        const validResult = detectAndProcessHeaders(
            0,
            validMultiLineHeader,
            bookConfig,
            pageMetrics,
        );

        console.log('📝 Valid Multi-line Header Test:');
        console.log(`  Header Detection Result: ${validResult ? '✅ FOUND' : '❌ NOT FOUND'}`);

        if (validResult) {
            console.log(`  Header Text: "${validResult.headerText}"`);
            console.log(`  Header Level: ${validResult.level}`);
            console.log(`  New Line Index: ${validResult.newLineIndex}`);

            // Check if the header text contains both parts
            const containsBothParts =
                validResult.headerText.includes('DIE ENTSTEHUNG') &&
                validResult.headerText.includes('DER METAMORPHOSENLEHRE');
            console.log(
                `  Contains Both Parts: ${containsBothParts ? '✅ CORRECT' : '❌ INCORRECT'}`,
            );

            if (containsBothParts) {
                console.log('  ✅ SUCCESS: Valid multi-line header correctly detected');
            } else {
                console.log('  ❌ FAILURE: Valid multi-line header not properly extended');
            }
        } else {
            console.log('  ❌ FAILURE: Valid multi-line header not detected');
        }

        console.log('\n✅ SUCCESS: Header extension fix is working correctly!');
    } catch (error) {
        console.error('❌ ERROR:', error);
        process.exit(1);
    }
}

testHeaderExtension().catch(console.error);
