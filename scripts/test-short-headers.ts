#!/usr/bin/env node

import { GetTextAndStructureFromOcr } from '../src/services/OCRService';
import { matchHeaderPattern } from '../src/services/OCRService';
import { LoggerService, createDefaultLoggerService } from '../src/services/LoggerService';
import { ConfigService } from '../src/services/ConfigService';

async function testShortHeaders() {
    console.log('🧪 Testing Short Uppercase Headers...\n');

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

        // Use the imported function directly

        console.log('🔍 Testing short uppercase headers...\n');

        // Test level 1 header patterns
        const level1Patterns = [
            '{roman-number} {title-in-capital-letters}',
            '{roman-number}',
            '{title-in-capital-letters}',
        ];

        const testCases = ['I', 'X', 'I EINLEITUNG', 'X WISSEN', 'II DIE ENTSTEHUNG', 'VORTRAG'];

        for (const testText of testCases) {
            console.log(`📝 Testing: "${testText}"`);

            let matched = false;
            for (const pattern of level1Patterns) {
                const result = matchHeaderPattern(testText, pattern, logger.getOCRLogger('test'));
                if (result.matched) {
                    console.log(`  ✅ MATCH with pattern: "${pattern}"`);
                    console.log(`     Extracted values:`);
                    for (const [key, value] of Object.entries(result.extractedValues)) {
                        console.log(`       ${key}: "${value}"`);
                    }
                    matched = true;
                    break;
                }
            }

            if (!matched) {
                console.log(`  ❌ NO MATCH with any pattern`);
            }
            console.log('');
        }

        // Test the specific regex pattern directly
        console.log('🔍 Testing title-in-capital-letters regex directly...\n');

        const titleInCapitalLettersRegex = '([A-ZÄÖÜ][A-ZÄÖÜ ]*)';
        const testRegex = new RegExp(`^${titleInCapitalLettersRegex}$`);

        for (const testText of testCases) {
            const match = testText.match(testRegex);
            console.log(`📝 Testing: "${testText}" with regex: "${titleInCapitalLettersRegex}"`);
            if (match) {
                console.log(`  ✅ MATCH: "${match[1]}"`);
            } else {
                console.log(`  ❌ NO MATCH`);
            }
        }

        console.log('\n✅ SUCCESS: Short header analysis completed!');
    } catch (error) {
        console.error('❌ ERROR:', error);
        process.exit(1);
    }
}

testShortHeaders().catch(console.error);
