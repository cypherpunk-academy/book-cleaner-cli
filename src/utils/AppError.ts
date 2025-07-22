import type { ErrorCode, AppError as IAppError } from "@/types";

/**
 * Node.js specific Error constructor interface
 * Used for type-safe access to captureStackTrace method
 */
interface NodeErrorConstructor {
  captureStackTrace?(targetObject: object, constructorOpt?: object): void;
}

/**
 * Custom application error class with structured error information
 */
export class AppError extends Error implements IAppError {
  public readonly code: ErrorCode;
  public readonly component: string;
  public readonly operation: string;
  public readonly context?: Record<string, unknown>;
  public readonly cause?: Error;

  constructor(
    code: ErrorCode,
    component: string,
    operation: string,
    message: string,
    context?: Record<string, unknown>,
    cause?: Error,
  ) {
    super(message);

    this.name = "AppError";
    this.code = code;
    this.component = component;
    this.operation = operation;

    // Only assign optional properties if they are defined
    if (context !== undefined) {
      this.context = context;
    }
    if (cause !== undefined) {
      this.cause = cause;
    }

    // Maintain proper stack trace (Node.js specific)
    const NodeError = Error as NodeErrorConstructor;
    if (typeof NodeError.captureStackTrace === "function") {
      NodeError.captureStackTrace(this, AppError);
    }
  }

  /**
   * Get a formatted error message with context
   */
  public getFormattedMessage(): string {
    let message = `[${this.code}] ${this.component}.${this.operation}: ${this.message}`;

    if (this.context && Object.keys(this.context).length > 0) {
      const contextStr = Object.entries(this.context)
        .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
        .join(", ");
      message += ` (${contextStr})`;
    }

    if (this.cause) {
      message += ` | Caused by: ${this.cause.message}`;
    }

    return message;
  }

  /**
   * Get error details for logging
   */
  public getDetails(): Record<string, unknown> {
    return {
      code: this.code,
      component: this.component,
      operation: this.operation,
      message: this.message,
      context: this.context,
      stack: this.stack,
      cause: this.cause
        ? {
            message: this.cause.message,
            stack: this.cause.stack,
          }
        : undefined,
    };
  }

  /**
   * Convert to JSON representation
   */
  public toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      component: this.component,
      operation: this.operation,
      message: this.message,
      context: this.context,
      stack: this.stack,
      cause: this.cause
        ? {
            name: this.cause.name,
            message: this.cause.message,
            stack: this.cause.stack,
          }
        : undefined,
    };
  }

  /**
   * Check if error is of a specific type
   */
  public isType(code: ErrorCode): boolean {
    return this.code === code;
  }

  /**
   * Check if error is from a specific component
   */
  public isFromComponent(component: string): boolean {
    return this.component === component;
  }

  /**
   * Check if error is from a specific operation
   */
  public isFromOperation(operation: string): boolean {
    return this.operation === operation;
  }

  /**
   * Create a new AppError from an existing error
   */
  public static fromError(
    error: Error,
    code: ErrorCode,
    component: string,
    operation: string,
    context?: Record<string, unknown>,
  ): AppError {
    return new AppError(code, component, operation, error.message, context, error);
  }

  /**
   * Create a new AppError with additional context
   */
  public withContext(additionalContext: Record<string, unknown>): AppError {
    return new AppError(
      this.code,
      this.component,
      this.operation,
      this.message,
      { ...this.context, ...additionalContext },
      this.cause,
    );
  }

  /**
   * Create a new AppError with a different message
   */
  public withMessage(message: string): AppError {
    return new AppError(
      this.code,
      this.component,
      this.operation,
      message,
      this.context,
      this.cause,
    );
  }
}

/**
 * Type guard to check if an error is an AppError
 */
export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/**
 * Helper function to wrap async operations with error handling
 */
export async function withErrorHandling<T>(
  operation: () => Promise<T>,
  code: ErrorCode,
  component: string,
  operationName: string,
  context?: Record<string, unknown>,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (isAppError(error)) {
      throw error;
    }

    throw AppError.fromError(
      error instanceof Error ? error : new Error(String(error)),
      code,
      component,
      operationName,
      context,
    );
  }
}

/**
 * Helper function to wrap sync operations with error handling
 */
export function withSyncErrorHandling<T>(
  operation: () => T,
  code: ErrorCode,
  component: string,
  operationName: string,
  context?: Record<string, unknown>,
): T {
  try {
    return operation();
  } catch (error) {
    if (isAppError(error)) {
      throw error;
    }

    throw AppError.fromError(
      error instanceof Error ? error : new Error(String(error)),
      code,
      component,
      operationName,
      context,
    );
  }
}
