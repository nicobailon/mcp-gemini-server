import { ConfigurationManager } from '../config/ConfigurationManager.js';
import { ExampleServiceConfig, ExampleServiceData } from '../types/index.js';
import { logger } from '../utils/index.js';
import { ValidationError } from '../utils/errors.js';

/**
 * Example service demonstrating the pattern.
 */
export class ExampleService {
    private readonly config: Required<ExampleServiceConfig>;

    constructor(config?: Partial<ExampleServiceConfig>) {
        const configManager = ConfigurationManager.getInstance();
        const defaultConfig = configManager.getExampleServiceConfig();
        // Allow overriding defaults via constructor injection
        this.config = { ...defaultConfig, ...config };

        logger.info("ExampleService initialized.");
        if (this.config.enableDetailedLogs) {
            logger.debug("ExampleService Config:", this.config);
        }
    }

    /**
     * Processes example data.
     * @param inputData - Input data, expected to match ExampleServiceData structure partially.
     * @returns A promise resolving to the processed ExampleServiceData.
     * @throws ValidationError if input is invalid.
     */
    public async processExample(inputData: unknown): Promise<ExampleServiceData> {
        const startTime = Date.now();

        // Basic validation (could use Zod here for more robustness)
        const data = inputData as Partial<ExampleServiceData>;
        if (!data || typeof data.name !== 'string' || data.name.trim() === '') {
            throw new ValidationError("Invalid input: 'name' property is required and must be a non-empty string.");
        }

        const name = data.name.trim();
        const message = `${this.config.greeting},   ${name}!`; // Escaped PowerShell variable syntax

        if (this.config.enableDetailedLogs) {
            logger.debug(`Processing name: ${name}`);
        }

        // Simulate some async work
        await new Promise(resolve => setTimeout(resolve, 20));

        const result: ExampleServiceData = {
            name: name,
            message: message,
            processedTimestamp: new Date().toISOString(),
            metrics: {
                processingTimeMs: Date.now() - startTime,
            },
        };

        logger.info(`Example processed for: ${name}`);
        return result;
    }
}