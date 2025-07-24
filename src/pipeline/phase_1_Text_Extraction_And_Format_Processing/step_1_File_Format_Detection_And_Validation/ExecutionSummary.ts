import { v4 as uuidv4 } from 'uuid';
import type { FileFormatResult } from '../../../types';

/**
 * Step 1.1 Execution Summary
 */
export interface Step1_1ExecutionSummary {
    stepName: string;
    stepId: string;
    startTime: Date;
    endTime?: Date;
    duration?: number;
    status: 'pending' | 'running' | 'completed' | 'failed';
    input: {
        filePath: string;
        fileSize: number;
        expectedFormat: string;
    };
    output?: {
        detectedFormat: string;
        confidence: number;
        isValid: boolean;
        issues: string[];
        contentType?: string;
    };
    metrics?: {
        detectionTimeMs: number;
        validationTimeMs: number;
        headerReadTimeMs: number;
    };
    error?: string;
}

/**
 * Create a new Step 1.1 execution summary
 */
export function createStep1_1ExecutionSummary(
    filePath: string,
    fileSize: number,
    expectedFormat: string,
): Step1_1ExecutionSummary {
    return {
        stepName: 'File Format Detection & Validation',
        stepId: uuidv4(),
        startTime: new Date(),
        status: 'pending',
        input: {
            filePath,
            fileSize,
            expectedFormat,
        },
    };
}

/**
 * Update execution summary with results
 */
export function updateStep1_1ExecutionSummary(
    summary: Step1_1ExecutionSummary,
    result: FileFormatResult,
    detectionTimeMs: number,
    validationTimeMs: number,
    headerReadTimeMs: number,
): Step1_1ExecutionSummary {
    const endTime = new Date();
    const duration = endTime.getTime() - summary.startTime.getTime();

    // Build output object conditionally to respect exactOptionalPropertyTypes
    const output: Step1_1ExecutionSummary['output'] = {
        detectedFormat: result.format,
        confidence: result.confidence,
        isValid: result.isValid,
        issues: result.issues,
    };

    // Only include optional properties if they have values
    if (result.metadata?.contentType) {
        output.contentType = result.metadata.contentType;
    }

    return {
        ...summary,
        endTime,
        duration,
        status: 'completed',
        output,
        metrics: {
            detectionTimeMs,
            validationTimeMs,
            headerReadTimeMs,
        },
    };
}

/**
 * Update execution summary with error
 */
export function updateStep1_1ExecutionSummaryWithError(
    summary: Step1_1ExecutionSummary,
    error: string,
): Step1_1ExecutionSummary {
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
