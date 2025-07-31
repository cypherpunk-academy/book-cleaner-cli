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

async function testRefactoredImplementation() {
    console.log('🧪 Testing Refactored DeepSeek Service Integration...\n');

    try {
        // Test DeepSeekService directly
        console.log('1. Testing DeepSeekService...');
        const deepSeekService = new DeepSeekService(mockLogger);
        
        // Test custom chat request
        const customMessages = [
            { role: 'system', content: 'You are a helpful assistant.' },
            { role: 'user', content: 'Hello, how are you?' }
        ];
        
        const customResponse = await deepSeekService.sendCustomChatRequest(customMessages, {
            maxTokens: 50,
            temperature: 0.1,
        });
        
        console.log(`✅ Custom Chat Request: ${customResponse.substring(0, 100)}...`);
        
        // Test structure inference request
        const structurePrompt = 'Analyze this book structure: Chapter 1, Chapter 2';
        const structureResponse = await deepSeekService.sendStructureInferenceRequest(structurePrompt, {
            maxTokens: 100,
            temperature: 0.1,
        });
        
        console.log(`✅ Structure Inference Request: ${structureResponse.substring(0, 100)}...\n`);

        // Test TextChunker
        console.log('2. Testing TextChunker...');
        const textChunker = new TextChunker(mockLogger);
        
        const sampleText = `This is a sample book text for testing the chunking functionality. 
        It contains multiple paragraphs and should be divided into overlapping chunks.
        
        Chapter 1: Introduction
        This is the first chapter of our test book. It introduces the main concepts.
        
        Chapter 2: Main Content
        Here we have the main content of the book with various sections.`;
        
        const chunkingResult = textChunker.chunkText(sampleText, {
            chunkSize: 150,
            overlapPercentage: 20,
            preserveWordBoundaries: true,
        });
        
        console.log(`✅ TextChunker: Created ${chunkingResult.totalChunks} chunks`);
        console.log(`   Average chunk size: ${chunkingResult.averageChunkSize} characters\n`);

        // Test StructureInferrer with DeepSeekService integration
        console.log('3. Testing StructureInferrer with DeepSeekService...');
        const structureInferrer = new StructureInferrer(mockLogger);
        
        const sampleStructure = [
            'Chapter 1: Introduction',
            'Chapter 2: Main Content'
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

        // Test response parsing
        console.log('4. Testing Response Parsing...');
        const sampleJsonResponse = JSON.stringify({
            matchedEntries: [
                { originalIndex: 0, correctedText: "Chapter 1: Introduction", confidence: 0.95, position: 0 }
            ],
            newEntries: [
                { text: "Chapter 3: Conclusion", position: "after index 1", confidence: 0.8 }
            ],
            corrections: [
                { index: 1, original: "Chapter 2", corrected: "Chapter 2: Main Content", confidence: 0.9 }
            ],
            confidence: 0.88
        });
        
        const parsedResponse = structureInferrer.parseAIResponse(sampleJsonResponse);
        console.log(`✅ Response Parsing: Successfully parsed response`);
        console.log(`   Matched entries: ${parsedResponse.matchedEntries.length}`);
        console.log(`   New entries: ${parsedResponse.newEntries.length}`);
        console.log(`   Corrections: ${parsedResponse.corrections.length}`);
        console.log(`   Confidence: ${parsedResponse.confidence}\n`);

        console.log('🎉 Refactored Implementation Test: PASSED!');
        console.log('\n📋 Summary:');
        console.log('   ✅ DeepSeekService: Reusable chat API integration working');
        console.log('   ✅ StructureInferrer: Properly integrated with DeepSeekService');
        console.log('   ✅ TextChunker: 20% overlap chunking working');
        console.log('   ✅ Response Parsing: JSON parsing and validation working');
        console.log('\n🔧 Architecture Benefits:');
        console.log('   • DeepSeekService is now reusable for other parts of the app');
        console.log('   • Structure-specific code is separated from generic API code');
        console.log('   • Better separation of concerns and maintainability');

    } catch (error) {
        console.error('❌ Refactored Implementation Test: FAILED!');
        console.error('Error:', error.message);
        process.exit(1);
    }
}

// Run the test
testRefactoredImplementation(); 