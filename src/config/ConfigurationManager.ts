// Import config types for services as they are added
import { ExampleServiceConfig, GeminiServiceConfig } from "../types/index.js"; // Import GeminiServiceConfig
import { logger } from "../utils/logger.js";
import { configureFilePathSecurity } from "../utils/filePathSecurity.js";
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
        apiKey: "",
        // defaultModel is initially undefined, loaded from env var later
        defaultModel: undefined,
        // Default image processing settings
        defaultImageResolution: "1024x1024",
        maxImageSizeMB: 10,
        supportedImageFormats: ["image/jpeg", "image/png", "image/webp"],
        // Reasoning control settings
        defaultThinkingBudget: undefined,
      },
      // Initialize other service configs with defaults:
      // yourService: {
      //   someSetting: 'default value',
      //   retryCount: 3,
      // },
    };

    this.validateRequiredEnvVars();
    this.loadEnvironmentOverrides();

    // Configure file path security
    configureFilePathSecurity();
  }

  private validateRequiredEnvVars(): void {
    const requiredVars = ["GOOGLE_GEMINI_API_KEY"];
    const missingVars = requiredVars.filter((varName) => !process.env[varName]);

    if (missingVars.length > 0) {
      throw new Error(
        `Missing required environment variables: ${missingVars.join(", ")}`
      );
    }
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
        while (ConfigurationManager.instanceLock) {
          // Small delay to prevent tight loop
          const now = Date.now();
          while (Date.now() - now < 10) {
            // Intentional minimal delay
          }
        }
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

  /**
   * Returns the secure file base path for file operations
   * @returns The configured safe file base directory or undefined if not set
   */
  public getSecureFileBasePath(): string | undefined {
    return process.env.GEMINI_SAFE_FILE_BASE_DIR;
  }

  // Add getters for other service configs:
  // public getYourServiceConfig(): Required<YourServiceConfig> {
  //   return { ...this.config.yourService };
  // }

  // --- Updaters for specific configurations (if runtime updates are needed) ---

  public updateExampleServiceConfig(
    update: Partial<ExampleServiceConfig>
  ): void {
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
      this.config.exampleService.enableDetailedLogs =
        process.env.EXAMPLE_ENABLE_LOGS.toLowerCase() === "true";
    }

    // Load safe file path base directory if provided
    if (process.env.GEMINI_SAFE_FILE_BASE_DIR) {
      logger.info(
        `Safe file base directory configured: ${process.env.GEMINI_SAFE_FILE_BASE_DIR}`
      );
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
      logger.warn(
        "[ConfigurationManager] WARNING: GOOGLE_GEMINI_API_KEY environment variable not set."
      );
    }

    // Load Default Gemini Model Name
    if (process.env.GOOGLE_GEMINI_MODEL) {
      this.config.geminiService.defaultModel = process.env.GOOGLE_GEMINI_MODEL;
      logger.info(
        `[ConfigurationManager] Default Gemini model set to: ${this.config.geminiService.defaultModel}`
      );
    } else {
      logger.info(
        "[ConfigurationManager] GOOGLE_GEMINI_MODEL environment variable not set. No default model configured."
      );
    }

    // Load image-specific settings if provided
    if (process.env.GOOGLE_GEMINI_IMAGE_RESOLUTION) {
      const resolution = process.env.GOOGLE_GEMINI_IMAGE_RESOLUTION;
      if (["512x512", "1024x1024", "1536x1536"].includes(resolution)) {
        this.config.geminiService.defaultImageResolution = resolution as
          | "512x512"
          | "1024x1024"
          | "1536x1536";
        logger.info(
          `[ConfigurationManager] Default image resolution set to: ${resolution}`
        );
      } else {
        logger.warn(
          `[ConfigurationManager] Invalid image resolution '${resolution}' specified in GOOGLE_GEMINI_IMAGE_RESOLUTION. Using default.`
        );
      }
    }

    if (process.env.GOOGLE_GEMINI_MAX_IMAGE_SIZE_MB) {
      const sizeMB = parseInt(process.env.GOOGLE_GEMINI_MAX_IMAGE_SIZE_MB, 10);
      if (!isNaN(sizeMB) && sizeMB > 0) {
        this.config.geminiService.maxImageSizeMB = sizeMB;
        logger.info(
          `[ConfigurationManager] Maximum image size set to: ${sizeMB}MB`
        );
      } else {
        logger.warn(
          `[ConfigurationManager] Invalid max image size '${process.env.GOOGLE_GEMINI_MAX_IMAGE_SIZE_MB}' specified. Using default.`
        );
      }
    }

    if (process.env.GOOGLE_GEMINI_SUPPORTED_IMAGE_FORMATS) {
      try {
        const formats = JSON.parse(
          process.env.GOOGLE_GEMINI_SUPPORTED_IMAGE_FORMATS
        );
        if (
          Array.isArray(formats) &&
          formats.every((f) => typeof f === "string")
        ) {
          this.config.geminiService.supportedImageFormats = formats;
          logger.info(
            `[ConfigurationManager] Supported image formats set to: ${formats.join(", ")}`
          );
        } else {
          throw new Error("Invalid format array");
        }
      } catch (error) {
        logger.warn(
          `[ConfigurationManager] Invalid image formats specified in GOOGLE_GEMINI_SUPPORTED_IMAGE_FORMATS. Using default.`
        );
      }
    }

    // Load default thinking budget if provided
    if (process.env.GOOGLE_GEMINI_DEFAULT_THINKING_BUDGET) {
      const budget = parseInt(process.env.GOOGLE_GEMINI_DEFAULT_THINKING_BUDGET, 10);
      if (!isNaN(budget) && budget >= 0 && budget <= 24576) {
        this.config.geminiService.defaultThinkingBudget = budget;
        logger.info(
          `[ConfigurationManager] Default thinking budget set to: ${budget} tokens`
        );
      } else {
        logger.warn(
          `[ConfigurationManager] Invalid thinking budget '${process.env.GOOGLE_GEMINI_DEFAULT_THINKING_BUDGET}' specified. Must be between 0 and 24576. Not using default thinking budget.`
        );
      }
    }
  }
}
