/**
 * Utility for handling dynamic chalk imports to fix ESM/CommonJS compatibility
 */

// Cache the chalk instance to avoid repeated dynamic imports
let chalkInstance: typeof import("chalk").default | null = null;

/**
 * Get chalk instance using dynamic import
 * This resolves the ESM/CommonJS compatibility issue
 */
async function getChalk(): Promise<typeof import("chalk").default> {
  if (!chalkInstance) {
    const chalkModule = await import("chalk");
    chalkInstance = chalkModule.default;
  }
  return chalkInstance;
}

/**
 * Console logging utilities with colored output
 */
export class ChalkUtils {
  /**
   * Log success message in green
   */
  static async success(message: string): Promise<void> {
    const chalk = await getChalk();
    console.log(chalk.green(message));
  }

  /**
   * Log info message in blue
   */
  static async info(message: string): Promise<void> {
    const chalk = await getChalk();
    console.log(chalk.blue(message));
  }

  /**
   * Log warning message in yellow
   */
  static async warn(message: string): Promise<void> {
    const chalk = await getChalk();
    console.log(chalk.yellow(message));
  }

  /**
   * Log error message in red
   */
  static async error(message: string): Promise<void> {
    const chalk = await getChalk();
    console.error(chalk.red(message));
  }

  /**
   * Log gray/dimmed message
   */
  static async gray(message: string): Promise<void> {
    const chalk = await getChalk();
    console.error(chalk.gray(message));
  }

  /**
   * Log cyan message
   */
  static async cyan(message: string): Promise<void> {
    const chalk = await getChalk();
    console.log(chalk.cyan(message));
  }

  /**
   * Get chalk instance for more complex styling
   */
  static async getChalk(): Promise<typeof import("chalk").default> {
    return getChalk();
  }
}
