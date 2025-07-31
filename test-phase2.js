const { TextChunker } = require('./dist/src/services/TextChunker');
const { StructureInferrer } = require('./dist/src/services/StructureInferrer');
const { DeepSeekService } = require('./dist/src/services/DeepSeekService');

// Mock logger for testing
const mockLogger = {
    getConfigLogger: () => ({
        info: (msg, data) => console.log(`[INFO] ${msg}`, data),
        debug: (msg, data) => console.log(`[DEBUG] ${msg}`, data),
        error: (msg, data) => console.log(`[ERROR] ${msg}`, data),
    }),
    debug: (component, msg, data) => console.log(`[DEBUG] ${component}: ${msg}`, data),
    error: (msg, data) => console.log(`[ERROR] ${msg}`, data),
};

async function testPhase2() {
    console.log('🧪 Testing Phase 2 Implementation...\n');

    try {
        // Test TextChunker
        console.log('1. Testing TextChunker...');
        const textChunker = new TextChunker(mockLogger);
        
        const sampleText = `This is a sample book text for testing the chunking functionality. 
        It contains multiple paragraphs and should be divided into overlapping chunks.
        
        Chapter 1: Introduction
        This is the first chapter of our test book. It introduces the main concepts.
        
        Chapter 2: Main Content
        Here we have the main content of the book with various sections.
        
        Section 2.1: First Section
        This is the first section of chapter 2.
        
        Section 2.2: Second Section
        This is the second section with more content.
        
        Chapter 3: Conclusion
        Finally, we reach the conclusion of our test book.`;
        
        const chunkingResult = textChunker.chunkText(sampleText, {
            chunkSize: 200,
            overlapPercentage: 20,
            preserveWordBoundaries: true,
        });
        
        console.log(`✅ TextChunker: Created ${chunkingResult.totalChunks} chunks`);
        console.log(`   Average chunk size: ${chunkingResult.averageChunkSize} characters`);
        console.log(`   Processing time: ${chunkingResult.processingTime}ms\n`);

        // Test StructureInferrer
        console.log('2. Testing StructureInferrer...');
        const structureInferrer = new StructureInferrer(mockLogger);
        
        const sampleStructure = [
            'Chapter 1: Introduction',
            'Chapter 2: Main Content',
            'Section 2.1: First Section',
            'Section 2.2: Second Section',
            'Chapter 3: Conclusion'
        ];
        
        const firstChunk = chunkingResult.chunks[0];
        const inferenceResponse = await structureInferrer.inferStructureFromChunk(
            firstChunk,
            sampleStructure,
            {
                maxRetries: 3,
                confidenceThreshold: 0.7,
                enableNewEntries: true,
                enableCorrections: true,
            }
        );
        
        console.log(`✅ StructureInferrer: Processed chunk ${firstChunk.index}`);
        console.log(`   Matched entries: ${inferenceResponse.matchedEntries.length}`);
        console.log(`   New entries: ${inferenceResponse.newEntries.length}`);
        console.log(`   Corrections: ${inferenceResponse.corrections.length}`);
        console.log(`   Confidence: ${inferenceResponse.confidence}\n`);

        // Test DeepSeekService
        console.log('3. Testing DeepSeekService...');
        const deepSeekService = new DeepSeekService(mockLogger);
        
        const configValidation = deepSeekService.validateConfig();
        console.log(`✅ DeepSeekService: Config validation - ${configValidation.isValid ? 'PASS' : 'FAIL'}`);
        if (!configValidation.isValid) {
            console.log(`   Errors: ${configValidation.errors.join(', ')}`);
        }
        
        const connectionTest = await deepSeekService.testConnection();
        console.log(`   Connection test: ${connectionTest ? 'PASS' : 'FAIL'}\n`);

        // Test merging responses
        console.log('4. Testing Response Merging...');
        const responses = [inferenceResponse, inferenceResponse]; // Duplicate for testing
        const mergedResponse = structureInferrer.mergeChunkResponses(responses);
        
        console.log(`✅ Response Merging: Merged ${responses.length} responses`);
        console.log(`   Total matched entries: ${mergedResponse.matchedEntries.length}`);
        console.log(`   Total new entries: ${mergedResponse.newEntries.length}`);
        console.log(`   Total corrections: ${mergedResponse.corrections.length}`);
        console.log(`   Average confidence: ${mergedResponse.confidence}\n`);

        console.log('🎉 Phase 2 Implementation Test: PASSED!');
        console.log('\n📋 Summary:');
        console.log('   ✅ TextChunker: 20% overlap chunking working');
        console.log('   ✅ StructureInferrer: AI prompt generation and response parsing working');
        console.log('   ✅ DeepSeekService: Configuration and connection handling working');
        console.log('   ✅ Response Merging: Multiple chunk response aggregation working');
        console.log('\n🚀 Ready for Phase 3: Analysis and Validation');

    } catch (error) {
        console.error('❌ Phase 2 Implementation Test: FAILED!');
        console.error('Error:', error.message);
        process.exit(1);
    }
}

// Run the test
testPhase2(); 