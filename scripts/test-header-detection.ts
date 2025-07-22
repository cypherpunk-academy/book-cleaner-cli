#!/usr/bin/env node

import { GetTextAndStructureFromOcr } from '../src/pipeline/phase_1_Text_Extraction_And_Format_Processing/step_2_Text_Extraction/GetTextAndStructureFromOcr';
import { LoggerService } from '../src/services/LoggerService';
import { ConfigService } from '../src/services/ConfigService';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

async function testHeaderDetection() {
    console.log('🧪 Testing Header Detection Improvements...\n');

    // Initialize services
    const logger = new LoggerService();
    const configService = new ConfigService(logger);
    const textProcessor = new GetTextAndStructureFromOcr(logger, configService);

    // Sample OCR data that represents the problematic cases
    const sampleOCRData = {
        text: '',
        confidence: 0.9,
        paragraphs: [
            {
                text: '# I\n\nEINLEITUNGAm 18. August des Jahres 1787 schrieb Goethe von Italien aus an Knebel',
                confidence: 0.9,
                bbox: { x0: 100, y0: 100, x1: 500, y1: 150 },
                lines: [
                    {
                        text: '# I',
                        confidence: 0.9,
                        bbox: { x0: 100, y0: 100, x1: 150, y1: 120 },
                    },
                    {
                        text: 'EINLEITUNGAm 18. August des Jahres 1787 schrieb Goethe von Italien aus an Knebel',
                        confidence: 0.9,
                        bbox: { x0: 100, y0: 130, x1: 500, y1: 150 },
                    },
                ],
            },
            {
                text: '# X\n\nWISSEN UND HANDELN IM LICHTE DER GOETHESCHEN DENKVWEISE',
                confidence: 0.9,
                bbox: { x0: 100, y0: 200, x1: 500, y1: 250 },
                lines: [
                    {
                        text: '# X',
                        confidence: 0.9,
                        bbox: { x0: 100, y0: 200, x1: 150, y1: 220 },
                    },
                    {
                        text: 'WISSEN UND HANDELN IM LICHTE DER GOETHESCHEN DENKVWEISE',
                        confidence: 0.9,
                        bbox: { x0: 100, y0: 230, x1: 500, y1: 250 },
                    },
                ],
            },
            {
                text: '## 1. Meth\n\nWir haben das Verhältnis von der durch das wissenschaftliche Denken gewonnenen Ideenwelt',
                confidence: 0.9,
                bbox: { x0: 100, y0: 300, x1: 500, y1: 350 },
                lines: [
                    {
                        text: '## 1. Meth',
                        confidence: 0.9,
                        bbox: { x0: 100, y0: 300, x1: 200, y1: 320 },
                    },
                    {
                        text: 'Wir haben das Verhältnis von der durch das wissenschaftliche Denken gewonnenen Ideenwelt',
                        confidence: 0.9,
                        bbox: { x0: 100, y0: 330, x1: 500, y1: 350 },
                    },
                ],
            },
        ],
    };

    // Test the header detection
    const scanResults = {
        textWithHeaders: '',
        footnoteText: '',
        level1HeadingsIndex: 0,
        level2HeadingsIndex: 0,
        level3HeadingsIndex: 0,
    };

    try {
        const result = await textProcessor.processOCRData(
            sampleOCRData,
            'rudolf-steiner-ga-werk',
            scanResults,
        );

        console.log('✅ Header Detection Test Results:');
        console.log('=====================================');
        console.log('Processed Text:');
        console.log(result.textWithHeaders);
        console.log('\nFootnotes:');
        console.log(result.footnoteText);
        console.log('\nHeader Indices:');
        console.log(`Level 1: ${result.level1HeadingsIndex}`);
        console.log(`Level 2: ${result.level2HeadingsIndex}`);
        console.log(`Level 3: ${result.level3HeadingsIndex}`);

        // Check for specific improvements
        const hasProperHeaders =
            result.textWithHeaders.includes('# I') &&
            result.textWithHeaders.includes('EINLEITUNG') &&
            result.textWithHeaders.includes('# X') &&
            result.textWithHeaders.includes(
                'WISSEN UND HANDELN IM LICHTE DER GOETHESCHEN DENKVWEISE',
            ) &&
            result.textWithHeaders.includes('## 1. Meth');

        if (hasProperHeaders) {
            console.log('\n✅ SUCCESS: Headers are properly detected and formatted!');
        } else {
            console.log('\n❌ FAILURE: Headers are not properly detected or formatted.');
        }

        // Check for the specific issues mentioned
        const hasGluedText = result.textWithHeaders.includes('EINLEITUNGAm');
        const hasShortHeader =
            result.textWithHeaders.includes('## 1. Meth') &&
            !result.textWithHeaders.includes('Methodologie');

        if (!hasGluedText) {
            console.log('✅ SUCCESS: Fixed glued text issue (EINLEITUNG and Am are separated)');
        } else {
            console.log('❌ FAILURE: Glued text issue still exists');
        }

        if (!hasShortHeader) {
            console.log('✅ SUCCESS: Header content is properly extracted');
        } else {
            console.log('❌ FAILURE: Header content is still too short');
        }
    } catch (error) {
        console.error('❌ Error during header detection test:', error);
    }
}

// Run the test
testHeaderDetection().catch(console.error);
