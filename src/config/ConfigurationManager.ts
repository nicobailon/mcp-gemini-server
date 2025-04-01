// Import config types for services as they are added
import { ExampleServiceConfig, GeminiServiceConfig } from '../types/index.js'; // Import GeminiServiceConfig

// Define the structure for all configurations managed
// Note: GeminiServiceConfig itself now has an optional defaultModel
interface ManagedConfigs {
    exampleService: Required<ExampleServiceConfig>;
    geminiService: GeminiServiceConfig; // Use the interface directly, not Required<>
    // Add other service config types here:
    // yourService: Required<YourServiceConfig>;
}

/**
 * Centralized configuration management for all services.
 * Implements singleton pattern to ensure consistent configuration.
 */
export class ConfigurationManager {
    private static instance: ConfigurationManager | null = null;
    private static instanceLock = false;

    private config: ManagedConfigs;

    private constructor() {
        // Initialize with default configurations
        this.config = {
            exampleService: {
                // Define defaults for ExampleService
                greeting: "Hello",
                enableDetailedLogs: false,
            },
            geminiService: {
                // Default API key is empty; MUST be overridden by environment variable
                apiKey: '',
                // defaultModel is initially undefined, loaded from env var later
                defaultModel: undefined,
            },
            // Initialize other service configs with defaults:
            // yourService: {
            //   someSetting: 'default value',
            //   retryCount: 3,
            // },
        };

        // Optional: Load overrides from environment variables or config files here
        this.loadEnvironmentOverrides();
    }

    /**
     * Get the singleton instance of ConfigurationManager.
     * Basic lock to prevent race conditions during initial creation.
     */
    public static getInstance(): ConfigurationManager {
        if (!ConfigurationManager.instance) {
            if (!ConfigurationManager.instanceLock) {
                ConfigurationManager.instanceLock = true; // Lock
                try {
                    ConfigurationManager.instance = new ConfigurationManager();
                } finally {
                    ConfigurationManager.instanceLock = false; // Unlock
                }
            } else {
                // Basic busy wait if locked (consider a more robust async lock if high contention is expected)
                while (ConfigurationManager.instanceLock) { }
                // Re-check instance after wait
                if (!ConfigurationManager.instance) {
                    // This path is less likely but handles edge cases if lock logic needs refinement
                    return ConfigurationManager.getInstance();
                }
            }
        }
        return ConfigurationManager.instance;
    }

    // --- Getters for specific configurations ---

    public getExampleServiceConfig(): Required<ExampleServiceConfig> {
        // Return a copy to prevent accidental modification of the internal state
        return { ...this.config.exampleService };
    }

    // Return type changed from Required<GeminiServiceConfig> to GeminiServiceConfig
    public getGeminiServiceConfig(): GeminiServiceConfig {
        // Return a copy to prevent accidental modification
        return { ...this.config.geminiService };
    }

    // Getter specifically for the default model name
    public getDefaultModelName(): string | undefined {
        return this.config.geminiService.defaultModel;
    }

    // Add getters for other service configs:
    // public getYourServiceConfig(): Required<YourServiceConfig> {
    //   return { ...this.config.yourService };
    // }

    // --- Updaters for specific configurations (if runtime updates are needed) ---

    public updateExampleServiceConfig(update: Partial<ExampleServiceConfig>): void {
        this.config.exampleService = {
            ...this.config.exampleService,
            ...update,
        };
        // Optional: Notify relevant services about the config change
    }

    // Add updaters for other service configs:
    // public updateYourServiceConfig(update: Partial<YourServiceConfig>): void {
    //   this.config.yourService = {
    //     ...this.config.yourService,
    //     ...update,
    //   };
    // }

    /**
     * Example method to load configuration overrides from environment variables.
     * Call this in the constructor.
     */
    private loadEnvironmentOverrides(): void {
        // Example for ExampleService
        if (process.env.EXAMPLE_GREETING) {
            this.config.exampleService.greeting = process.env.EXAMPLE_GREETING;
        }
        if (process.env.EXAMPLE_ENABLE_LOGS) {
            this.config.exampleService.enableDetailedLogs = process.env.EXAMPLE_ENABLE_LOGS.toLowerCase() === 'true';
        }

        // Add logic for other services based on their environment variables
        // if (process.env.YOUR_SERVICE_RETRY_COUNT) {
        //   const retryCount = parseInt(process.env.YOUR_SERVICE_RETRY_COUNT, 10);
        //   if (!isNaN(retryCount)) {
        //     this.config.yourService.retryCount = retryCount;
        //   }
        // }

        // Load Gemini API Key (using the name from .env)
        if (process.env.GOOGLE_GEMINI_API_KEY) {
            this.config.geminiService.apiKey = process.env.GOOGLE_GEMINI_API_KEY;
        } else {
            // Log a warning if the key is missing, the service constructor will throw
            console.warn('[ConfigurationManager] WARNING: GOOGLE_GEMINI_API_KEY environment variable not set.');
        }

        // Load Default Gemini Model Name
        if (process.env.GOOGLE_GEMINI_MODEL) {
            this.config.geminiService.defaultModel = process.env.GOOGLE_GEMINI_MODEL;
            console.info(`[ConfigurationManager] Default Gemini model set to: ${this.config.geminiService.defaultModel}`);
        } else {
            console.info('[ConfigurationManager] GOOGLE_GEMINI_MODEL environment variable not set. No default model configured.');
        }
    }
}
