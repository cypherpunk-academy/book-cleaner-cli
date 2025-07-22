import type { LoggerService } from "../services/LoggerService";
import type { PipelineState, ProgressCallback } from "../types";

/**
 * Abstract base class for all pipeline phases
 */
export abstract class AbstractPhase {
  protected readonly logger: LoggerService;
  protected metrics: Record<string, unknown> = {};

  constructor(logger: LoggerService) {
    this.logger = logger;
  }

  /**
   * Get the name of this phase
   */
  public abstract getName(): string;

  /**
   * Execute the phase
   */
  public abstract execute(
    state: PipelineState,
    progressCallback?: ProgressCallback,
  ): Promise<unknown>;

  /**
   * Get phase metrics
   */
  public getMetrics(): Record<string, unknown> {
    return { ...this.metrics };
  }

  /**
   * Reset phase metrics
   */
  protected resetMetrics(): void {
    this.metrics = {};
  }

  /**
   * Update phase metrics
   */
  protected updateMetrics(key: string, value: unknown): void {
    this.metrics[key] = value;
  }

  /**
   * Cleanup phase resources (optional)
   */
  public async cleanup?(): Promise<void>;

  /**
   * Validate phase prerequisites (optional)
   */
  protected async validatePrerequisites?(state: PipelineState): Promise<void>;

  /**
   * Get phase description (optional)
   */
  public getDescription?(): string;

  /**
   * Get estimated duration in milliseconds (optional)
   */
  public getEstimatedDuration?(): number;
}
