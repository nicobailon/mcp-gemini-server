// Import config types for services as they are added
import * as path from "path";
import { ExampleServiceConfig, GeminiServiceConfig } from "../types/index.js";
import { configureFilePathSecurity } from "../utils/filePathSecurity.js";
import { logger } from "../utils/logger.js";

// Define the structure for all configurations managed
interface ManagedConfigs {
  exampleService: Required<ExampleServiceConfig>;
  geminiService: GeminiServiceConfig;
  github: {
    apiToken: string;
  };
  allowedOutputPaths: string[];
  mcpConfig: {
    host: string;
    port: number;
    connectionToken: string;
    clientId: string;
    logLevel?: "debug" | "info" | "warn" | "error";
    transport?: "stdio" | "sse";
  };
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
      github: {
        // Default GitHub API token is empty; will be loaded from environment variable
        apiToken: "",
      },
      allowedOutputPaths: [],
      mcpConfig: {
        // Initialize MCP config
        host: "localhost",
        port: 8080,
        connectionToken: "", // Must be set via env
        clientId: "gemini-sdk-client-default", // Must be set via env
        logLevel: "info",
        transport: "stdio",
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
    // Skip validation in test environment
    if (process.env.NODE_ENV === "test") {
      logger.info(
        "Skipping environment variable validation in test environment"
      );
      return;
    }

    const requiredVars = [
      "GOOGLE_GEMINI_API_KEY",
      "MCP_SERVER_HOST",
      "MCP_SERVER_PORT",
      "MCP_CONNECTION_TOKEN",
      "MCP_CLIENT_ID",
    ];
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

  public getGeminiServiceConfig(): GeminiServiceConfig {
    // Return a copy to prevent accidental modification
    return { ...this.config.geminiService };
  }

  // Getter for MCP Configuration
  public getMcpConfig(): Required<ManagedConfigs["mcpConfig"]> {
    // Return a copy to ensure type safety and prevent modification
    // Cast to Required because we validate essential fields are set from env vars.
    // Optional fields will have their defaults.
    return { ...this.config.mcpConfig } as Required<
      ManagedConfigs["mcpConfig"]
    >;
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

  /**
   * Returns the GitHub API token for GitHub API requests
   * @returns The configured GitHub API token or undefined if not set
   */
  public getGitHubApiToken(): string | undefined {
    return this.config.github.apiToken || undefined;
  }

  /**
   * Returns the list of allowed output paths for file writing
   * @returns A copy of the configured allowed output paths array
   */
  public getAllowedOutputPaths(): string[] {
    // Return a copy to prevent accidental modification
    return [...this.config.allowedOutputPaths];
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

    // Load GitHub API token if provided
    if (process.env.GITHUB_API_TOKEN) {
      this.config.github.apiToken = process.env.GITHUB_API_TOKEN;
      logger.info("[ConfigurationManager] GitHub API token configured");
    } else {
      logger.warn(
        "[ConfigurationManager] GITHUB_API_TOKEN environment variable not set. GitHub code review features may not work properly."
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
          "[ConfigurationManager] Invalid image formats specified in GOOGLE_GEMINI_SUPPORTED_IMAGE_FORMATS. Using default."
        );
      }
    }

    // Load default thinking budget if provided
    if (process.env.GOOGLE_GEMINI_DEFAULT_THINKING_BUDGET) {
      const budget = parseInt(
        process.env.GOOGLE_GEMINI_DEFAULT_THINKING_BUDGET,
        10
      );
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

    // Load MCP Configuration
    if (process.env.MCP_SERVER_HOST) {
      this.config.mcpConfig.host = process.env.MCP_SERVER_HOST;
    }
    if (process.env.MCP_SERVER_PORT) {
      const port = parseInt(process.env.MCP_SERVER_PORT, 10);
      if (!isNaN(port) && port > 0 && port < 65536) {
        this.config.mcpConfig.port = port;
      } else {
        logger.warn(
          `[ConfigurationManager] Invalid MCP_SERVER_PORT: '${process.env.MCP_SERVER_PORT}'. Using default ${this.config.mcpConfig.port}.`
        );
      }
    }
    if (process.env.MCP_CONNECTION_TOKEN) {
      this.config.mcpConfig.connectionToken = process.env.MCP_CONNECTION_TOKEN;
    }
    if (process.env.MCP_CLIENT_ID) {
      this.config.mcpConfig.clientId = process.env.MCP_CLIENT_ID;
    }
    if (process.env.MCP_LOG_LEVEL) {
      const logLevel = process.env.MCP_LOG_LEVEL.toLowerCase();
      if (["debug", "info", "warn", "error"].includes(logLevel)) {
        this.config.mcpConfig.logLevel = logLevel as
          | "debug"
          | "info"
          | "warn"
          | "error";
      } else {
        logger.warn(
          `[ConfigurationManager] Invalid MCP_LOG_LEVEL: '${process.env.MCP_LOG_LEVEL}'. Using default '${this.config.mcpConfig.logLevel}'.`
        );
      }
    }
    if (process.env.MCP_TRANSPORT) {
      const transport = process.env.MCP_TRANSPORT.toLowerCase();
      if (["stdio", "sse"].includes(transport)) {
        this.config.mcpConfig.transport = transport as "stdio" | "sse";
      } else {
        logger.warn(
          `[ConfigurationManager] Invalid MCP_TRANSPORT: '${process.env.MCP_TRANSPORT}'. Using default '${this.config.mcpConfig.transport}'.`
        );
      }
    }
    logger.info("[ConfigurationManager] MCP configuration loaded.");

    // Load allowed output paths if provided
    // Initialize to an empty array to ensure it's always string[]
    this.config.allowedOutputPaths = [];
    const allowedOutputPathsEnv = process.env.ALLOWED_OUTPUT_PATHS;

    if (allowedOutputPathsEnv && allowedOutputPathsEnv.trim().length > 0) {
      const pathsArray = allowedOutputPathsEnv
        .split(",")
        .map((p) => p.trim()) // Trim whitespace from each path
        .filter((p) => p.length > 0); // Filter out any empty strings resulting from split

      if (pathsArray.length > 0) {
        this.config.allowedOutputPaths = pathsArray.map((p) => path.resolve(p)); // Resolve to absolute paths
        logger.info(
          `[ConfigurationManager] Allowed output paths configured: ${this.config.allowedOutputPaths.join(
            ", "
          )}`
        );
      } else {
        // This case handles if ALLOWED_OUTPUT_PATHS was something like ",," or " , "
        logger.warn(
          "[ConfigurationManager] ALLOWED_OUTPUT_PATHS environment variable was provided but contained no valid paths after trimming. File writing might be restricted."
        );
      }
    } else {
      logger.warn(
        "[ConfigurationManager] ALLOWED_OUTPUT_PATHS environment variable not set or is empty. File writing might be restricted or disabled."
      );
    }
  }
}
