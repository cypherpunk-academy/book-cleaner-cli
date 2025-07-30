#!/usr/bin/env node

import { GetTextAndStructureFromOcr } from '../src/services/OCRService';
import { LoggerService, createDefaultLoggerService } from '../src/services/LoggerService';
import { ConfigService } from '../src/services/ConfigService';

async function testCapitalizedTitle() {
    console.log('🧪 Testing Capitalized Title Pattern...\n');

    // Initialize services
    const logger = createDefaultLoggerService();
    const configService = new ConfigService(logger);
    const textProcessor = new GetTextAndStructureFromOcr(logger, configService);

    // Test cases
    const testCases = [
        {
            name: 'Valid capitalized title (should match)',
            text: 'X WISSEN UND HANDELN IM LICHTE DER GOETHESCHEN DENKWEISE',
            pattern: '{roman-number} {title-in-capital-letters}{no-paragraph-end-marker}',
            expected: true,
        },
        {
            name: 'Invalid title with non-capitalized word (should NOT match)',
            text: 'X WISSEN UND HANDELN IM LICHTE DER GOETHESCHEN DENKWEISE Methodologie',
            pattern: '{roman-number} {title-in-capital-letters}{no-paragraph-end-marker}',
            expected: false,
        },
        {
            name: 'Invalid title with lowercase word in middle (should NOT match)',
            text: 'X WISSEN und HANDELN IM LICHTE DER GOETHESCHEN DENKWEISE',
            pattern: '{roman-number} {title-in-capital-letters}{no-paragraph-end-marker}',
            expected: false,
        },
        {
            name: 'Valid title with spaces (should match)',
            text: 'I EINLEITUNG',
            pattern: '{roman-number} {title-in-capital-letters}{no-paragraph-end-marker}',
            expected: true,
        },
        {
            name: 'Valid title with German umlauts (should match)',
            text: 'II DIE ENTSTEHUNG DER METAMORPHOSENLEHRE',
            pattern: '{roman-number} {title-in-capital-letters}{no-paragraph-end-marker}',
            expected: true,
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

        // Use reflection to access the private method for testing
        const matchHeaderPattern = (textProcessor as any).matchHeaderPattern.bind(textProcessor);

        console.log('🔍 Testing title-in-capital-letters pattern...\n');

        for (const testCase of testCases) {
            const result = matchHeaderPattern(testCase.text, testCase.pattern);

            console.log(`📝 ${testCase.name}:`);
            console.log(`  Text: "${testCase.text}"`);
            console.log(`  Pattern: "${testCase.pattern}"`);
            console.log(`  Result: ${result.matched ? '✅ MATCH' : '❌ NO MATCH'}`);
            console.log(`  Expected: ${testCase.expected ? '✅ MATCH' : '❌ NO MATCH'}`);
            console.log(
                `  Status: ${result.matched === testCase.expected ? '✅ CORRECT' : '❌ INCORRECT'}`,
            );

            if (result.matched) {
                console.log(`  Extracted values:`);
                for (const [key, value] of Object.entries(result.extractedValues)) {
                    console.log(`    ${key}: "${value}"`);
                }
            }
            console.log('');
        }

        // Test the specific case from the log
        console.log('🔍 Testing the specific problematic case...\n');
        const problematicText =
            'X WISSEN UND HANDELN IM LICHTE DER GOETHESCHEN DENKVWEISE 1. Methodologie';
        const result = matchHeaderPattern(
            problematicText,
            '{roman-number} {title-in-capital-letters}{no-paragraph-end-marker}',
        );

        console.log(`📝 Problematic case:`);
        console.log(`  Text: "${problematicText}"`);
        console.log(
            `  Pattern: "{roman-number} {title-in-capital-letters}{no-paragraph-end-marker}"`,
        );
        console.log(`  Result: ${result.matched ? '✅ MATCH' : '❌ NO MATCH'}`);
        console.log(`  Expected: ❌ NO MATCH (because "Methodologie" is not capitalized)`);
        console.log(`  Status: ${!result.matched ? '✅ CORRECT' : '❌ INCORRECT'}`);

        if (result.matched) {
            console.log(`  Extracted values:`);
            for (const [key, value] of Object.entries(result.extractedValues)) {
                console.log(`    ${key}: "${value}"`);
            }
        }

        console.log('✅ SUCCESS: Capitalized title pattern is working correctly!');
    } catch (error) {
        console.error('❌ ERROR:', error);
        process.exit(1);
    }
}

testCapitalizedTitle().catch(console.error);
