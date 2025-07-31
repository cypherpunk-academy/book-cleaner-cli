// Export all book structure related services
export { BookStructureService } from './BookStructureService';
export { BookTypesService } from './BookTypesService';
export { StructureAnalyzer } from './StructureAnalyzer';
export { StructureInferrer } from './StructureInferrer';

// Export types
export type {
    ConfigUpdateInfo,
    StructureInferenceOptions,
    StructureInferenceResult,
} from './BookStructureService';

export type { BookTypeConfig, HeaderTypeConfig, BookTypesConfig } from './BookTypesService';

export type {
    InferenceOptions,
    MatchedEntry,
    NewEntry,
    StructureCorrection,
    StructureInferenceResponse,
} from './StructureInferrer';
