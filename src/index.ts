#!/usr/bin/env node

import { CleanBookCommand } from '@/cli/CleanBookCommand';
import { APP_NAME, APP_VERSION, ENV_VARS, LOG_LEVELS } from '@/constants';
import { createDefaultLoggerService } from '@/services/LoggerService';
import type { LogLevel } from '@/types';
import { AppError } from '@/utils/AppError';
import {
    error as chalkError,
    cyan,
    getChalkInstance,
    gray,
    info,
    success,
    warn,
} from '@/utils/ChalkUtils';
import { program } from 'commander';

/**
 * Main entry point for the Book Cleaner CLI
 */
async function main(): Promise<void> {
    // Create default logger for main process
    const logger = createDefaultLoggerService(
        (process.env[ENV_VARS.LOG_LEVEL] as LogLevel) || LOG_LEVELS.INFO,
        process.env[ENV_VARS.NODE_ENV] !== 'production',
    );

    try {
        // Setup global error handlers
        process.on('uncaughtException', async (error: Error) => {
            const chalk = await getChalkInstance();
            console.error(chalk.red('Uncaught Exception:'), error.message);
            logger.error('MAIN', 'Uncaught exception', {
                error: error.message,
                stack: error.stack,
            });
            process.exit(1);
        });

        process.on(
            'unhandledRejection',
            async (reason: unknown, promise: Promise<unknown>) => {
                const chalk = await getChalkInstance();
                console.error(
                    chalk.red('Unhandled Rejection at:'),
                    promise,
                    'reason:',
                    reason,
                );
                logger.error('MAIN', 'Unhandled rejection', {
                    reason: String(reason),
                });
                process.exit(1);
            },
        );

        // Setup graceful shutdown
        process.on('SIGINT', async () => {
            await warn('\n⚠️  Received SIGINT. Shutting down gracefully...');
            logger.info('MAIN', 'Received SIGINT, shutting down gracefully');

            // Flush logs before exit
            logger.flush();
            process.exit(0);
        });

        process.on('SIGTERM', async () => {
            await warn('\n⚠️  Received SIGTERM. Shutting down gracefully...');
            logger.info('MAIN', 'Received SIGTERM, shutting down gracefully');

            // Flush logs before exit
            logger.flush();
            process.exit(0);
        });

        // Configure the main program
        program
            .name(APP_NAME.toLowerCase().replace(/\s+/g, '-'))
            .description(
                'Transform raw book sources into clean, readable Markdown with comprehensive metadata',
            )
            .version(APP_VERSION);

        // Create and register the clean-book command
        const cleanBookCommand = new CleanBookCommand();
        program.addCommand(cleanBookCommand.createCommand());

        // Add help command
        program
            .command('help [command]')
            .description('Display help for a command')
            .action((command) => {
                if (command) {
                    program.help();
                } else {
                    program.help();
                }
            });

        // Parse command line arguments
        await program.parseAsync(process.argv);

        // If no command was provided, show help
        if (process.argv.length <= 2) {
            program.help();
        }
    } catch (error) {
        // Handle known application errors
        if (error instanceof AppError) {
            const chalk = await getChalkInstance();
            console.error(chalk.red('✗ Application Error:'), error.message);

            if (error.context) {
                await gray(`Context: ${JSON.stringify(error.context, null, 2)}`);
            }

            if (error.cause) {
                await gray(`Caused by: ${error.cause.message}`);
            }

            logger.error('MAIN', 'Application error', {
                error: error.getDetails(),
            });
        } else {
            // Handle unexpected errors
            const errorMessage = error instanceof Error ? error.message : String(error);
            const chalk = await getChalkInstance();
            console.error(chalk.red('✗ Unexpected Error:'), errorMessage);

            logger.error('MAIN', 'Unexpected error', {
                error: errorMessage,
                stack: error instanceof Error ? error.stack : undefined,
            });
        }

        // Exit with error code
        process.exit(1);
    }
}

// Handle process crash
process.on('uncaughtException', async (error) => {
    const chalk = await getChalkInstance();
    console.error(chalk.red('Fatal Error:'), error);
    process.exit(1);
});

// Run the main function
if (require.main === module) {
    main().catch(async (error) => {
        const chalk = await getChalkInstance();
        console.error(chalk.red('Fatal Error:'), error);
        process.exit(1);
    });
}

export { main };
