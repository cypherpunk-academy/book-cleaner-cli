import { LOG_COMPONENTS } from "@/constants";
import type { LoggerService } from "@/services/LoggerService";
import type { PipelineState, ProgressCallback } from "@/types";
import { AbstractPhase } from "./AbstractPhase";

/**
 * Phase 2: Text Normalization & AI Cleaning
 *
 * This phase will handle:
 * - Text normalization and cleaning
 * - AI-powered text enhancement
 * - Structure detection and preservation
 *
 * TODO: Full implementation coming soon
 */
export class TextNormalizationPhase extends AbstractPhase {
  public override getName(): string {
    return "Text Normalization & AI Cleaning";
  }

  public override getDescription(): string {
    return "Normalizes and cleans text using AI-powered processing";
  }

  public override async execute(
    state: PipelineState,
    progressCallback?: ProgressCallback,
  ): Promise<unknown> {
    const pipelineLogger = this.logger.getPipelineLogger(
      LOG_COMPONENTS.PIPELINE_MANAGER,
    );

    pipelineLogger.info(
      {
        pipelineId: state.id,
        inputFile: state.inputFile,
      },
      "Starting text normalization phase (placeholder implementation)",
    );

    // Update progress
    if (progressCallback) {
      progressCallback({
        phase: this.getName(),
        step: "text-normalization",
        current: 0,
        total: 100,
        percentage: 0,
        message: "Normalizing text...",
      });
    }

    // Simulate processing time
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Update progress
    if (progressCallback) {
      progressCallback({
        phase: this.getName(),
        step: "text-normalization",
        current: 100,
        total: 100,
        percentage: 100,
        message: "Text normalization completed",
      });
    }

    const result = {
      phase: "text_normalization",
      success: true,
      data: {
        message: "Text normalization placeholder - implementation coming soon",
        timestamp: new Date(),
      },
      timestamp: new Date(),
    };

    pipelineLogger.info(
      {
        pipelineId: state.id,
      },
      "Text normalization phase completed (placeholder)",
    );

    return result;
  }
}
