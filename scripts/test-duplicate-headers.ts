#!/usr/bin/env node

import { GetTextAndStructureFromOcr } from '../src/services/OCRService';
import { LoggerService, createDefaultLoggerService } from '../src/services/LoggerService';
import { ConfigService } from '../src/services/ConfigService';

async function testDuplicateHeaders() {
    console.log('🧪 Testing Duplicate Headers Problem...\n');

    // Initialize services
    const logger = createDefaultLoggerService();
    const configService = new ConfigService(logger);
    const textProcessor = new GetTextAndStructureFromOcr(logger, configService);

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

        console.log('🔍 Testing pattern matching for problematic text...\n');

        const testTexts = [
            'WISSEN UND HANDELN IM LICHTE DER GOETHESCHEN DENKVWEISE',
            'DER GOETHESCHEN DENKVWEISE',
            'DER GOETHESCHEN DENKVWEISE 1. Methodologie',
        ];

        for (const testText of testTexts) {
            console.log(`📝 Testing: "${testText}"`);

            const result = matchHeaderPattern(testText, '{title-in-capital-letters}');

            if (result.matched) {
                console.log(`  ✅ MATCH: "${result.fullMatch}"`);
            } else {
                console.log(`  ❌ NO MATCH`);
            }
        }

        // Test the specific case from the logs
        console.log('\n🔍 Testing the specific case from logs...\n');

        const specificCases = [
            'WISSEN UND HANDELN IM LICHTE DER GOETHESCHEN DENKVWEISE',
            'DER GOETHESCHEN DENKVWEISE 1. Methodologie',
        ];

        for (const testText of specificCases) {
            console.log(`📝 Testing: "${testText}"`);

            const result = matchHeaderPattern(testText, '{title-in-capital-letters}');

            if (result.matched) {
                console.log(`  ✅ MATCH: "${result.fullMatch}"`);
            } else {
                console.log(`  ❌ NO MATCH`);
            }
        }

        // Test if the fix prevents the duplicate header issue
        console.log('\n🔍 Testing if the fix prevents duplicate headers...\n');

        // Simulate the scenario where both texts are processed
        const header1 = 'WISSEN UND HANDELN IM LICHTE DER GOETHESCHEN DENKVWEISE';
        const header2 = 'DER GOETHESCHEN DENKVWEISE 1. Methodologie';

        const result1 = matchHeaderPattern(header1, '{title-in-capital-letters}');
        const result2 = matchHeaderPattern(header2, '{title-in-capital-letters}');

        console.log(`Header 1: "${header1}"`);
        console.log(`  Result: ${result1.matched ? '✅ MATCH' : '❌ NO MATCH'}`);

        console.log(`Header 2: "${header2}"`);
        console.log(`  Result: ${result2.matched ? '✅ MATCH' : '❌ NO MATCH'}`);

        if (result1.matched && !result2.matched) {
            console.log('\n✅ SUCCESS: Duplicate header issue is fixed!');
            console.log('   - First header is recognized correctly');
            console.log('   - Second header (with trailing content) is not recognized');
        } else if (result1.matched && result2.matched) {
            console.log('\n❌ ISSUE: Both headers are still being recognized');
            console.log('   - This could lead to duplicate headers');
        } else {
            console.log('\n⚠️  WARNING: Neither header is being recognized');
        }

        console.log('\n✅ SUCCESS: Duplicate header analysis completed!');
    } catch (error) {
        console.error('❌ ERROR:', error);
        process.exit(1);
    }
}

testDuplicateHeaders().catch(console.error);
