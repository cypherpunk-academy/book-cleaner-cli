import { v4 as uuidv4 } from 'uuid';
import type { ChapterRecognitionResult } from './ChapterRecognizer';

/**
 * Step 1.4 Execution Summary
 */
export interface Step1_4ExecutionSummary {
    stepName: string;
    stepId: string;
    startTime: Date;
    endTime?: Date;
    duration?: number;
    status: 'pending' | 'running' | 'completed' | 'failed';
    input: {
        textLength: number;
        filePath: string;
        hasStructure: boolean;
    };
    output?: {
        chaptersDetected: number;
        structureConfidence: number;
        detectionMethod: string;
        processingTime: number;
    };
    metrics?: {
        analysisTimeMs: number;
        patternsDetected: number;
        hierarchyLevels: number;
    };
    error?: string;
}

/**
 * Create a new Step 1.4 execution summary
 */
export function createStep1_4ExecutionSummary(
    textLength: number,
    filePath: string,
    hasStructure: boolean,
): Step1_4ExecutionSummary {
    return {
        stepName: 'Structure Recognition & Analysis',
        stepId: uuidv4(),
        startTime: new Date(),
        status: 'pending',
        input: {
            textLength,
            filePath,
            hasStructure,
        },
    };
}

/**
 * Update execution summary with results
 */
export function updateStep1_4ExecutionSummary(
    summary: Step1_4ExecutionSummary,
    result: ChapterRecognitionResult,
    analysisTimeMs: number,
): Step1_4ExecutionSummary {
    const endTime = new Date();
    const duration = endTime.getTime() - summary.startTime.getTime();

    return {
        ...summary,
        endTime,
        duration,
        status: 'completed',
        output: {
            chaptersDetected: result.chapters.length,
            structureConfidence: result.confidence,
            detectionMethod: result.detectionMethod,
            processingTime: result.processingTime,
        },
        metrics: {
            analysisTimeMs,
            patternsDetected: result.chapters.length,
            hierarchyLevels: Math.max(...result.chapters.map((c) => c.level), 0),
        },
    };
}

/**
 * Update execution summary with error
 */
export function updateStep1_4ExecutionSummaryWithError(
    summary: Step1_4ExecutionSummary,
    error: string,
): Step1_4ExecutionSummary {
    const endTime = new Date();
    const duration = endTime.getTime() - summary.startTime.getTime();

    return {
        ...summary,
        endTime,
        duration,
        status: 'failed',
        error,
    };
}
