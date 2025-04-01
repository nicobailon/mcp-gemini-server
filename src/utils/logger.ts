import chalk from 'chalk'; // Using chalk for colored output

// Simple console logger with levels and colors

// Define log levels (optional, for potential filtering later)
enum LogLevel {
    DEBUG,
    INFO,
    WARN,
    ERROR
}

// Basic configuration (could be enhanced)
const currentLogLevel = LogLevel.DEBUG; // Show all logs by default

export const logger = {
    debug: (message: string, ...args: unknown[]) => {
        if (currentLogLevel <= LogLevel.DEBUG) {
            console.debug(chalk.gray(`[DEBUG] `), ...args);
        }
    },
    info: (message: string, ...args: unknown[]) => {
        if (currentLogLevel <= LogLevel.INFO) {
            console.info(chalk.blue(`[INFO] `), ...args);
        }
    },
    warn: (message: string, ...args: unknown[]) => {
        if (currentLogLevel <= LogLevel.WARN) {
            console.warn(chalk.yellow(`[WARN] `), ...args);
        }
    },
    error: (message: string, ...args: unknown[]) => {
        if (currentLogLevel <= LogLevel.ERROR) {
            // Log error message and stack trace if available
            console.error(chalk.red(`[ERROR] `), ...args);
            const errorArg = args.find(arg => arg instanceof Error);
            if (errorArg instanceof Error && errorArg.stack) {
                console.error(chalk.red(errorArg.stack));
            }
        }
    }
};
