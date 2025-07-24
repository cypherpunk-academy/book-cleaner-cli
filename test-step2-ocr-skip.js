#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const BOOK_NAME =
    'Rudolf Steiner#Einleitungen zu Goethes Naturwissenschaftlichen Schriften#1';
const BOOK_ARTIFACTS_DIR = 'book-artifacts';
const PHASE1_DIR = path.join(BOOK_ARTIFACTS_DIR, BOOK_NAME, 'phase1');
const STEP2_OCR_FILE = path.join(PHASE1_DIR, 'step2.ocr');
const STEP2_TXT_FILE = path.join(PHASE1_DIR, 'step2.txt');

console.log('🔧 Testing Step 2: OCR Skip Logic');
console.log('============================================================');

// Check if files exist
const ocrExists = fs.existsSync(STEP2_OCR_FILE);
const txtExists = fs.existsSync(STEP2_TXT_FILE);

console.log(`📄 step2.ocr exists: ${ocrExists}`);
console.log(`📄 step2.txt exists: ${txtExists}`);

if (ocrExists) {
    const content = fs.readFileSync(STEP2_OCR_FILE, 'utf-8');
    console.log(`   OCR file size: ${content.length} characters`);
    console.log(`   First 100 chars: ${content.substring(0, 100)}...`);
} else {
    console.log('❌ step2.ocr does not exist - OCR would be performed');
}

if (txtExists) {
    const content = fs.readFileSync(STEP2_TXT_FILE, 'utf-8');
    console.log(`   TXT file size: ${content.length} characters`);
    console.log(`   First 100 chars: ${content.substring(0, 100)}...`);
}

console.log('\n💡 To test OCR skip logic:');
console.log(
    '1. Delete step2.ocr: rm "book-artifacts/Rudolf Steiner#Einleitungen zu Goethes Naturwissenschaftlichen Schriften#1/phase1/step2.ocr"',
);
console.log('2. Run Step 2 - OCR will be performed');
console.log('3. Run Step 2 again - existing OCR file should be used (skip OCR)');

console.log('\n✅ OCR Skip Logic test completed!');
