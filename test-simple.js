// Test direct imports
const BookStructureService = require('./dist/src/services/BookStructureService/BookStructureService').BookStructureService;
const BookTypesService = require('./dist/src/services/BookStructureService/BookTypesService').BookTypesService;
const StructureAnalyzer = require('./dist/src/services/BookStructureService/StructureAnalyzer').StructureAnalyzer;
const StructureInferrer = require('./dist/src/services/BookStructureService/StructureInferrer').StructureInferrer;

console.log('✅ All services imported successfully:');
console.log('  - BookStructureService:', typeof BookStructureService);
console.log('  - BookTypesService:', typeof BookTypesService);
console.log('  - StructureAnalyzer:', typeof StructureAnalyzer);
console.log('  - StructureInferrer:', typeof StructureInferrer); 