#!/usr/bin/env node

import { GetTextAndStructureFromOcr } from '../src/services/OCRService';
import { LoggerService, createDefaultLoggerService } from '../src/services/LoggerService';
import { ConfigService } from '../src/services/ConfigService';

async function testSimpleHeader() {
    console.log('🧪 Testing Simple Header Detection...\n');

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

        console.log('🔍 Testing pattern matching directly...\n');

        // Test level 2 header pattern
        const level2Pattern = '{decimal-number}. {title}';
        const testText = '1. Methodologie';

        console.log(`📝 Testing: "${testText}" against pattern: "${level2Pattern}"`);

        const result = matchHeaderPattern(testText, level2Pattern);

        console.log(`  Result: ${result.matched ? '✅ MATCH' : '❌ NO MATCH'}`);
        if (result.matched) {
            console.log(`  Extracted values:`);
            for (const [key, value] of Object.entries(result.extractedValues)) {
                console.log(`    ${key}: "${value}"`);
            }
        }

        // Test with the problematic text
        const problematicText = '1. Methodologie  Wir haben das Verhältnis';
        console.log(`\n📝 Testing: "${problematicText}" against pattern: "${level2Pattern}"`);

        const problematicResult = matchHeaderPattern(problematicText, level2Pattern);

        console.log(`  Result: ${problematicResult.matched ? '✅ MATCH' : '❌ NO MATCH'}`);
        if (problematicResult.matched) {
            console.log(`  Extracted values:`);
            for (const [key, value] of Object.entries(problematicResult.extractedValues)) {
                console.log(`    ${key}: "${value}"`);
            }
        }

        console.log('\n✅ SUCCESS: Pattern matching test completed!');
    } catch (error) {
        console.error('❌ ERROR:', error);
        process.exit(1);
    }
}

testSimpleHeader().catch(console.error);
