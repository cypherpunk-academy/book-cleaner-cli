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
 * Log success message in green
 */
export async function success(message: string): Promise<void> {
  const chalk = await getChalk();
  console.log(chalk.green(message));
}

/**
 * Log info message in blue
 */
export async function info(message: string): Promise<void> {
  const chalk = await getChalk();
  console.log(chalk.blue(message));
}

/**
 * Log warning message in yellow
 */
export async function warn(message: string): Promise<void> {
  const chalk = await getChalk();
  console.log(chalk.yellow(message));
}

/**
 * Log error message in red
 */
export async function error(message: string): Promise<void> {
  const chalk = await getChalk();
  console.error(chalk.red(message));
}

/**
 * Log gray/dimmed message
 */
export async function gray(message: string): Promise<void> {
  const chalk = await getChalk();
  console.error(chalk.gray(message));
}

/**
 * Log cyan message
 */
export async function cyan(message: string): Promise<void> {
  const chalk = await getChalk();
  console.log(chalk.cyan(message));
}

/**
 * Get chalk instance for more complex styling
 */
export async function getChalkInstance(): Promise<typeof import("chalk").default> {
  return getChalk();
}
