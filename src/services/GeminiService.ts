import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import type { SafetySetting as GoogleSafetySetting } from "@google/genai";
import { ConfigurationManager } from "../config/ConfigurationManager.js";
import { logger } from "../utils/logger.js";
import {
  FileMetadata,
  CachedContentMetadata,
  ImageGenerationResult,
} from "../types/index.js";
import {
  GeminiApiError,
  GeminiContentFilterError,
  GeminiModelError,
  GeminiValidationError,
  mapGeminiError,
  GeminiErrorMessages,
} from "../utils/geminiErrors.js";
import {
  GeminiGitDiffService,
  GitDiffReviewParams,
} from "./gemini/GeminiGitDiffService.js";
import { GitHubApiService } from "./gemini/GitHubApiService.js";

// Import specialized services
import {
  GeminiFileService,
  ListFilesResponseType,
} from "./gemini/GeminiFileService.js";
import { GeminiChatService } from "./gemini/GeminiChatService.js";
import { GeminiContentService } from "./gemini/GeminiContentService.js";
import { GeminiCacheService } from "./gemini/GeminiCacheService.js";
import { FileSecurityService } from "../utils/FileSecurityService.js";
import {
  ChatSession,
  Content,
  Tool,
  ToolConfig,
  GenerationConfig,
  SafetySetting,
  FileId,
  CacheId,
  FunctionCall,
  Part,
  ImagePart,
} from "./gemini/GeminiTypes.js";

/**
 * Service for interacting with the Google Gemini API.
 * This is a facade that delegates to specialized services for different functionality.
 */
export class GeminiService {
  private genAI: GoogleGenAI;
  private defaultModelName?: string;

  // Specialized services
  private fileService: GeminiFileService;
  private chatService: GeminiChatService;
  private contentService: GeminiContentService;
  private cacheService: GeminiCacheService;
  private fileSecurityService: FileSecurityService;
  private gitDiffService: GeminiGitDiffService;
  private gitHubApiService: GitHubApiService;

  constructor() {
    const configManager = ConfigurationManager.getInstance();
    const config = configManager.getGeminiServiceConfig();

    if (!config.apiKey) {
      throw new Error("Gemini API key is required");
    }

    // Initialize with the apiKey property in an object as required in v0.10.0
    this.genAI = new GoogleGenAI({ apiKey: config.apiKey });
    this.defaultModelName = config.defaultModel;

    // Initialize file security service first as it's used by other services
    // Set secure base path if configured
    const secureBasePath = configManager.getSecureFileBasePath();
    if (secureBasePath) {
      this.fileSecurityService = new FileSecurityService(
        [secureBasePath],
        secureBasePath
      );
      logger.info(
        `GeminiService initialized with secure file base path: ${secureBasePath}`
      );
    } else {
      this.fileSecurityService = new FileSecurityService();
      logger.warn(
        "GeminiService initialized without a secure file base path. File operations will require explicit path validation."
      );
    }

    // Initialize specialized services
    this.fileService = new GeminiFileService(
      this.genAI,
      this.fileSecurityService
    );
    this.contentService = new GeminiContentService(
      this.genAI,
      this.defaultModelName,
      this.fileSecurityService,
      config.defaultThinkingBudget
    );
    this.chatService = new GeminiChatService(this.genAI, this.defaultModelName);
    this.cacheService = new GeminiCacheService(this.genAI);
    this.gitDiffService = new GeminiGitDiffService(
      this.genAI,
      this.defaultModelName,
      1024 * 1024, // 1MB default
      [
        "package-lock.json",
        "yarn.lock",
        "*.min.js",
        "*.min.css",
        "node_modules/**",
        "dist/**",
        "build/**",
        "*.lock",
        "**/*.map",
      ],
      config.defaultThinkingBudget
    );

    // Initialize GitHub API service with token from config manager
    const githubApiToken = configManager.getGitHubApiToken();
    this.gitHubApiService = new GitHubApiService(githubApiToken);
  }

  /**
   * Uploads a file to be used with the Gemini API.
   * The file path is validated for security before reading.
   *
   * @param filePath The validated absolute path to the file
   * @param options Optional metadata like displayName and mimeType
   * @returns Promise resolving to file metadata including the name and URI
   */
  public async uploadFile(
    filePath: string,
    options?: { displayName?: string; mimeType?: string }
  ): Promise<FileMetadata> {
    return this.fileService.uploadFile(filePath, options);
  }

  /**
   * Lists files that have been uploaded to the Gemini API.
   *
   * @param pageSize Optional maximum number of files to return
   * @param pageToken Optional token for pagination
   * @returns Promise resolving to an object with files array and optional nextPageToken
   */
  public async listFiles(
    pageSize?: number,
    pageToken?: string
  ): Promise<{ files: FileMetadata[]; nextPageToken?: string }> {
    return this.fileService.listFiles(pageSize, pageToken);
  }

  /**
   * Gets a specific file's metadata from the Gemini API.
   *
   * @param fileId The ID of the file to retrieve (format: "files/{file_id}")
   * @returns Promise resolving to the file metadata
   */
  public async getFile(fileId: FileId): Promise<FileMetadata> {
    return this.fileService.getFile(fileId);
  }

  /**
   * Deletes a file from the Gemini API.
   *
   * @param fileId The ID of the file to delete (format: "files/{file_id}")
   * @returns Promise resolving to an object with success flag
   */
  public async deleteFile(fileId: FileId): Promise<{ success: boolean }> {
    return this.fileService.deleteFile(fileId);
  }

  /**
   * Validates a file path to ensure it's secure.
   * This prevents path traversal attacks by ensuring paths:
   * 1. Are absolute
   * 2. Don't contain path traversal elements (../)
   * 3. Are within a permitted base directory (optional)
   *
   * @param filePath The absolute file path to validate
   * @param basePath Optional base path to restrict access to (if provided)
   * @returns The validated file path
   * @throws Error if the path is invalid or outside permitted boundaries
   */
  public validateFilePath(filePath: string, basePath?: string): string {
    try {
      return this.fileSecurityService.validateAndResolvePath(filePath, {
        basePath: basePath,
      });
    } catch (error) {
      // Convert ValidationError to Error for backward compatibility
      if (error instanceof Error) {
        throw new Error(error.message);
      }
      throw error;
    }
  }

  /**
   * Sets the secure base directory for file operations.
   * All file operations will be restricted to this directory.
   *
   * @param basePath The absolute path to restrict file operations to
   */
  public setSecureBasePath(basePath: string): void {
    this.fileSecurityService.setSecureBasePath(basePath);
  }

  /**
   * Analyze content of an image to extract information such as charts, diagrams, etc.
   *
   * @param imagePart The image part to analyze
   * @param prompt Prompt guiding the analysis
   * @param structuredOutput Whether to return structured JSON
   * @param modelName Optional model name
   * @param safetySettings Optional safety settings
   * @returns Analysis results
   */
  public async analyzeContent(
    imagePart: ImagePart,
    prompt: string,
    structuredOutput?: boolean,
    modelName?: string,
    safetySettings?: SafetySetting[]
  ): Promise<any> {
    throw new GeminiValidationError(
      "analyzeContent method is not implemented",
      "NOT_IMPLEMENTED",
      {
        method: "analyzeContent",
        message: "This method requires full implementation to analyze image content",
        suggestion: "Use geminiGenerateContent tool with image input instead",
      }
    );
  }

  /**
   * Detect objects in an image
   *
   * @param imagePart The image part to analyze
   * @param promptAddition Additional prompt to guide detection
   * @param modelName Optional model name
   * @param safetySettings Optional safety settings
   * @returns Detection results
   */
  public async detectObjects(
    imagePart: ImagePart,
    promptAddition?: string,
    modelName?: string,
    safetySettings?: SafetySetting[]
  ): Promise<any> {
    // This is a stub method to satisfy TypeScript
    // In a real implementation, this would call the content service
    logger.warn("GeminiService.detectObjects called but not fully implemented");

    // Use a simpler approach to avoid TypeScript errors
    logger.warn("GeminiService.detectObjects: Using mock implementation");

    return {
      objects: [
        {
          label: "Mock Object 1",
          boundingBox: {
            yMin: 0.1,
            xMin: 0.1,
            yMax: 0.9,
            xMax: 0.9,
          },
          confidence: 0.95,
        },
      ],
      rawText:
        "This is a mock implementation of detectObjects. The actual implementation would detect objects in the image.",
    };
  }

  /**
   * Generate an image from a text prompt using Gemini's Imagen 3.1 model
   *
   * This method generates images based on a text prompt using Google's Imagen 3.1 model.
   * It supports various parameters to customize the generation process, including
   * resolution, number of images, safety settings, and style options.
   *
   * @param prompt - Text description of the image to generate. Should be detailed and specific.
   * @param modelName - Optional model to use (defaults to imagen-3.1-generate-003 if not specified)
   * @param resolution - Image resolution: 512x512, 1024x1024, or 1536x1536 (default: 1024x1024)
   * @param numberOfImages - Number of images to generate (1-8, default: 1)
   * @param safetySettings - Content filtering options for blocking potentially harmful content
   * @param negativePrompt - Elements to exclude from the generated image
   * @param stylePreset - Visual style to apply (e.g., "photographic", "digital-art", "anime")
   * @param seed - Optional seed for reproducible generation (integer value)
   * @param styleStrength - Strength of the style preset (0.0-1.0, default: 0.5)
   * @returns Promise resolving to generated images with metadata
   * @throws {GeminiValidationError} If parameters are invalid
   * @throws {GeminiContentFilterError} If content is filtered by safety settings
   * @throws {GeminiQuotaError} If API quota is exceeded
   * @throws {GeminiModelError} If the model encounters issues generating the image
   * @throws {GeminiNetworkError} If a network error occurs
   * @throws {GeminiApiError} For any other errors
   */
  public async generateImage(
    prompt: string,
    modelName?: string,
    resolution?: "512x512" | "1024x1024" | "1536x1536",
    numberOfImages?: number,
    safetySettings?: SafetySetting[],
    negativePrompt?: string,
    stylePreset?: string,
    seed?: number,
    styleStrength?: number
  ): Promise<ImageGenerationResult> {
    // Log with truncated prompt for privacy/security
    logger.debug(`Generating image with prompt: ${prompt.substring(0, 30)}...`);

    try {
      // Import validation schemas and error handling
      const { validateImageGenerationParams, DEFAULT_SAFETY_SETTINGS } =
        await import("./gemini/GeminiValidationSchemas.js");

      // Validate parameters using Zod schemas
      const validatedParams = validateImageGenerationParams(
        prompt,
        modelName,
        resolution,
        numberOfImages,
        safetySettings,
        negativePrompt,
        stylePreset,
        seed,
        styleStrength
      );

      // Default model for image generation if not specified
      // Using the latest Imagen 3.1 model for improved quality (as of April 2025)
      const defaultImageModel = "imagen-3.1-generate-003";
      const effectiveModel = validatedParams.modelName || defaultImageModel;

      // Get the imagen model from the SDK
      // Use the models property with the type from our declaration file
      const genAIModels = this.genAI.models;

      const model = genAIModels.getGenerativeModel({
        model: effectiveModel,
      });

      // Define a type for image generation config parameters
      interface ImageGenerationConfig {
        resolution: string;
        numberOfImages?: number;
        negativePrompt?: string;
        stylePreset?: string;
        seed?: number;
        styleStrength?: number;
        [key: string]: unknown; // For future flexibility while keeping type safety
      }

      // Prepare generation parameters
      const generationConfig: ImageGenerationConfig = {
        // Use validated parameters with defaults
        resolution: validatedParams.resolution || "1024x1024",
        numberOfImages: validatedParams.numberOfImages,
      };

      // Add optional parameters if provided
      if (validatedParams.negativePrompt) {
        generationConfig.negativePrompt = validatedParams.negativePrompt;
      }

      if (validatedParams.stylePreset) {
        generationConfig.stylePreset = validatedParams.stylePreset;
      }

      if (validatedParams.seed !== undefined) {
        generationConfig.seed = validatedParams.seed;
      }

      if (validatedParams.styleStrength !== undefined) {
        generationConfig.styleStrength = validatedParams.styleStrength;
      }

      // Apply default safety settings if none provided
      const effectiveSafetySettings =
        validatedParams.safetySettings || DEFAULT_SAFETY_SETTINGS;

      // Generate the images
      const result = await model.generateImages({
        prompt: validatedParams.prompt,
        safetySettings: effectiveSafetySettings as GoogleSafetySetting[],
        ...generationConfig,
      });

      // Validate response
      if (!result.images || result.images.length === 0) {
        throw new GeminiModelError(
          GeminiErrorMessages.UNSUPPORTED_FORMAT,
          effectiveModel
        );
      }

      // Check for safety issues in response
      if (result.promptSafetyMetadata?.blocked) {
        throw new GeminiContentFilterError(
          GeminiErrorMessages.CONTENT_FILTERED,
          // The API response might not include reasons, but our error expects it
          result.promptSafetyMetadata?.safetyRatings?.map(
            (rating) => `${rating.category}: ${rating.probability}`
          ) || []
        );
      }

      // Extract width and height from resolution
      const [width, height] = (validatedParams.resolution || "1024x1024")
        .split("x")
        .map((dim) => parseInt(dim, 10));

      // Format the result according to our interface
      const formattedResult: ImageGenerationResult = {
        images: result.images.map(
          (img: { data?: string; mimeType?: string }) => ({
            base64Data: img.data || "",
            mimeType: img.mimeType || "image/png",
            width,
            height,
          })
        ),
        promptSafetyMetadata: result.promptSafetyMetadata
          ? {
              blocked: result.promptSafetyMetadata.blocked ?? false,
              reasons: result.promptSafetyMetadata.safetyRatings?.map(
                (rating) => `${rating.category}: ${rating.probability}`
              ),
              safetyRatings: result.promptSafetyMetadata.safetyRatings?.map(
                (rating) => ({
                  category: rating.category,
                  severity: rating.category as any, // Map to expected format
                  probability: rating.probability as any,
                })
              ),
            }
          : undefined,
        metadata: {
          model: effectiveModel,
          generationConfig,
        },
      };

      // Validate output data integrity
      this.validateGeneratedImages(formattedResult);

      return formattedResult;
    } catch (error: unknown) {
      // Map to appropriate error type
      throw mapGeminiError(error, "generateImage");
    }
  }

  /**
   * Validates generated images to ensure they meet quality and safety standards
   * @param result - The image generation result to validate
   * @throws {GeminiValidationError} If validation fails
   */
  private validateGeneratedImages(result: ImageGenerationResult): void {
    // Check that each image has proper data
    for (const [index, image] of result.images.entries()) {
      // Verify base64 data is present and valid
      if (!image.base64Data || image.base64Data.length < 100) {
        throw new GeminiValidationError(
          `Image ${index} has invalid or missing data`,
          "base64Data"
        );
      }

      // Verify MIME type is supported
      const supportedMimeTypes = ["image/png", "image/jpeg", "image/webp"];
      if (!supportedMimeTypes.includes(image.mimeType)) {
        throw new GeminiValidationError(
          `Image ${index} has unsupported MIME type: ${image.mimeType}`,
          "mimeType"
        );
      }

      // Verify dimensions are positive numbers
      if (image.width <= 0 || image.height <= 0) {
        throw new GeminiValidationError(
          `Image ${index} has invalid dimensions: ${image.width}x${image.height}`,
          "dimensions"
        );
      }
    }
  }

  /**
   * Gets the current secure base directory if set
   */
  public getSecureBasePath(): string | undefined {
    return this.fileSecurityService.getSecureBasePath();
  }

  /**
   * Streams content generation using the Gemini model.
   * Returns an async generator that yields text chunks as they are generated.
   *
   * @param params An object containing all necessary parameters for content generation
   * @returns An async generator yielding text chunks as they become available
   */
  public async *generateContentStream(
    params: any // Use any temporarily until we can properly fix typing
  ): AsyncGenerator<string> {
    yield* this.contentService.generateContentStream(params);
  }

  /**
   * Generates content using the Gemini model.
   *
   * @param params An object containing all necessary parameters for content generation
   * @returns A promise resolving to the generated text content
   */
  public async generateContent(params: any): Promise<string> {
    // Use any temporarily until we can properly fix typing
    return this.contentService.generateContent(params);
  }

  /**
   * Starts a new stateful chat session with the Gemini model.
   *
   * @param params Parameters for starting a chat session
   * @returns A unique session ID to identify this chat session
   */
  public startChatSession(params: StartChatParams = {}): string {
    return this.chatService.startChatSession(params);
  }

  /**
   * Sends a message to an existing chat session.
   * Uses the generated content API directly since we're managing chat state ourselves.
   *
   * @param params Parameters for sending a message
   * @returns Promise resolving to the chat response
   */
  public async sendMessageToSession(
    params: SendMessageParams
  ): Promise<GenerateContentResponse> {
    return this.chatService.sendMessageToSession(params);
  }

  /**
   * Sends the result of a function call back to the chat session.
   *
   * @param params Parameters for sending a function result
   * @returns Promise resolving to the chat response
   */
  public async sendFunctionResultToSession(
    params: SendFunctionResultParams
  ): Promise<GenerateContentResponse> {
    return this.chatService.sendFunctionResultToSession(params);
  }

  /**
   * Creates a cached content entry in the Gemini API.
   *
   * @param modelName The model to use for this cached content
   * @param contents The conversation contents to cache
   * @param options Additional options for the cache (displayName, systemInstruction, ttl, tools, toolConfig)
   * @returns Promise resolving to the cached content metadata
   */
  public async createCache(
    modelName: string,
    contents: Content[],
    options?: {
      displayName?: string;
      systemInstruction?: Content | string;
      ttl?: string;
      tools?: Tool[];
      toolConfig?: ToolConfig;
    }
  ): Promise<CachedContentMetadata> {
    return this.cacheService.createCache(modelName, contents, options);
  }

  /**
   * Lists cached content entries in the Gemini API.
   *
   * @param pageSize Optional maximum number of entries to return
   * @param pageToken Optional token for pagination
   * @returns Promise resolving to an object with caches array and optional nextPageToken
   */
  public async listCaches(
    pageSize?: number,
    pageToken?: string
  ): Promise<{ caches: CachedContentMetadata[]; nextPageToken?: string }> {
    return this.cacheService.listCaches(pageSize, pageToken);
  }

  /**
   * Gets a specific cached content entry's metadata from the Gemini API.
   *
   * @param cacheId The ID of the cached content to retrieve (format: "cachedContents/{id}")
   * @returns Promise resolving to the cached content metadata
   */
  public async getCache(cacheId: CacheId): Promise<CachedContentMetadata> {
    return this.cacheService.getCache(cacheId);
  }

  /**
   * Updates a cached content entry in the Gemini API.
   *
   * @param cacheId The ID of the cached content to update (format: "cachedContents/{id}")
   * @param updates The updates to apply to the cached content (ttl, displayName)
   * @returns Promise resolving to the updated cached content metadata
   */
  public async updateCache(
    cacheId: CacheId,
    updates: { ttl?: string; displayName?: string }
  ): Promise<CachedContentMetadata> {
    return this.cacheService.updateCache(cacheId, updates);
  }

  /**
   * Deletes a cached content entry from the Gemini API.
   *
   * @param cacheId The ID of the cached content to delete (format: "cachedContents/{id}")
   * @returns Promise resolving to an object with success flag
   */
  public async deleteCache(cacheId: CacheId): Promise<{ success: boolean }> {
    return this.cacheService.deleteCache(cacheId);
  }

  /**
   * Routes a message to the most appropriate model based on a routing prompt.
   * This is useful when you have multiple specialized models and want to automatically
   * select the best one for the specific query type.
   *
   * @param params Parameters for routing a message across models
   * @returns Promise resolving to an object with the chat response and the chosen model
   * @throws {GeminiApiError} If routing fails or all models are unavailable
   */
  public async routeMessage(
    params: RouteMessageParams
  ): Promise<{ response: GenerateContentResponse; chosenModel: string }> {
    return this.chatService.routeMessage(params);
  }

  /**
   * Reviews a git diff and generates analysis using Gemini models
   *
   * @param params Parameters for the git diff review
   * @returns Promise resolving to the review text
   */
  public async reviewGitDiff(params: GitDiffReviewParams): Promise<string> {
    return this.gitDiffService.reviewDiff(params);
  }

  /**
   * Streams a git diff review content using Gemini models
   *
   * @param params Parameters for the git diff review
   * @returns AsyncGenerator yielding review content chunks as they become available
   */
  public async *reviewGitDiffStream(
    params: GitDiffReviewParams
  ): AsyncGenerator<string> {
    yield* this.gitDiffService.reviewDiffStream(params);
  }

  /**
   * Reviews a GitHub repository and generates analysis using Gemini models.
   *
   * IMPORTANT: This method uses a special approach to analyze repository contents by
   * creating a diff against an empty tree. While effective for getting an overview of
   * the repository, be aware of these limitations:
   *
   * 1. Token Usage: This approach consumes a significant number of tokens, especially
   *    for large repositories, as it treats the entire repository as one large diff.
   *
   * 2. Performance Impact: For very large repositories, this may result in slow
   *    response times and potential timeout errors.
   *
   * 3. Cost Considerations: The token consumption directly impacts API costs.
   *    Consider using the maxFilesToInclude and excludePatterns options to limit scope.
   *
   * 4. Scale Issues: Repositories with many files or large files may exceed context
   *    limits of the model, resulting in incomplete analysis.
   *
   * For large repositories, consider reviewing specific directories or files instead,
   * or focusing on a particular branch or PR.
   *
   * @param params Parameters for the GitHub repository review
   * @returns Promise resolving to the review text
   */
  public async reviewGitHubRepository(params: {
    owner: string;
    repo: string;
    branch?: string;
    modelName?: string;
    reasoningEffort?: "none" | "low" | "medium" | "high";
    reviewFocus?:
      | "security"
      | "performance"
      | "architecture"
      | "bugs"
      | "general";
    maxFilesToInclude?: number;
    excludePatterns?: string[];
    prioritizeFiles?: string[];
    customPrompt?: string;
  }): Promise<string> {
    try {
      const {
        owner,
        repo,
        branch,
        modelName,
        reasoningEffort = "medium",
        reviewFocus = "general",
        maxFilesToInclude = 50,
        excludePatterns = [],
        prioritizeFiles,
        customPrompt,
      } = params;

      // Get repository overview using GitHub API
      const repoOverview = await this.gitHubApiService.getRepositoryOverview(
        owner,
        repo
      );

      // Get default branch if not specified
      const targetBranch = branch || repoOverview.defaultBranch;

      // Create repository context for Gemini prompt
      const repositoryContext = `Repository: ${owner}/${repo}
Primary Language: ${repoOverview.language}
Languages: ${repoOverview.languages.map((l) => `${l.name} (${l.percentage}%)`).join(", ")}
Description: ${repoOverview.description || "No description"}
Default Branch: ${repoOverview.defaultBranch}
Target Branch: ${targetBranch}
Stars: ${repoOverview.stars}
Forks: ${repoOverview.forks}`;

      // Get content from repository files that match our criteria
      // For now, we'll use a git diff approach by getting a comparison diff
      // between the empty state and the target branch
      const diff = await this.gitHubApiService.getComparisonDiff(
        owner,
        repo,
        // Use a known empty reference as the base
        "4b825dc642cb6eb9a060e54bf8d69288fbee4904",
        targetBranch
      );

      // Use the git diff service to analyze the repository content
      return this.gitDiffService.reviewDiff({
        diffContent: diff,
        modelName,
        reviewFocus,
        repositoryContext,
        diffOptions: {
          maxFilesToInclude,
          excludePatterns,
          prioritizeFiles,
        },
        reasoningEffort,
        customPrompt,
      });
    } catch (error: unknown) {
      logger.error("Error reviewing GitHub repository:", error);
      throw error;
    }
  }

  /**
   * Reviews a GitHub Pull Request and generates analysis using Gemini models
   *
   * @param params Parameters for the GitHub PR review
   * @returns Promise resolving to the review text
   */
  public async reviewGitHubPullRequest(params: {
    owner: string;
    repo: string;
    prNumber: number;
    modelName?: string;
    reasoningEffort?: "none" | "low" | "medium" | "high";
    reviewFocus?:
      | "security"
      | "performance"
      | "architecture"
      | "bugs"
      | "general";
    filesOnly?: boolean;
    excludePatterns?: string[];
    customPrompt?: string;
  }): Promise<string> {
    try {
      const {
        owner,
        repo,
        prNumber,
        modelName,
        reasoningEffort = "medium",
        reviewFocus = "general",
        filesOnly = false,
        excludePatterns = [],
        customPrompt,
      } = params;

      // Get PR details using GitHub API
      const pullRequest = await this.gitHubApiService.getPullRequest(
        owner,
        repo,
        prNumber
      );

      // Create repository context for Gemini prompt
      const repositoryContext = `Repository: ${owner}/${repo}
Pull Request: #${prNumber} - ${pullRequest.title}
Author: ${pullRequest.user.login}
Base Branch: ${pullRequest.base.ref}
Head Branch: ${pullRequest.head.ref}
Files Changed: ${pullRequest.changed_files}
Additions: ${pullRequest.additions}
Deletions: ${pullRequest.deletions}
Description: ${pullRequest.body || "No description"}`;

      // Get PR diff using GitHub API
      const diff = await this.gitHubApiService.getPullRequestDiff(
        owner,
        repo,
        prNumber
      );

      // Use the git diff service to analyze the PR
      return this.gitDiffService.reviewDiff({
        diffContent: diff,
        modelName,
        reviewFocus,
        repositoryContext,
        diffOptions: {
          excludePatterns,
        },
        reasoningEffort,
        customPrompt,
      });
    } catch (error: unknown) {
      logger.error("Error reviewing GitHub Pull Request:", error);
      throw error;
    }
  }
}

// Define interfaces directly to avoid circular dependencies
export interface GenerateContentParams {
  prompt: string;
  modelName?: string;
  generationConfig?: GenerationConfig;
  safetySettings?: SafetySetting[];
  systemInstruction?: Content | string;
  cachedContentName?: string;
  fileReferenceOrInlineData?: FileId | ImagePart | string;
  inlineDataMimeType?: string;
}

export interface StartChatParams {
  modelName?: string;
  history?: Content[];
  generationConfig?: GenerationConfig;
  safetySettings?: SafetySetting[];
  tools?: Tool[];
  systemInstruction?: Content | string;
  cachedContentName?: string;
}

export interface SendMessageParams {
  sessionId: string;
  message: string;
  generationConfig?: GenerationConfig;
  safetySettings?: SafetySetting[];
  tools?: Tool[];
  toolConfig?: ToolConfig;
  cachedContentName?: string;
}

export interface SendFunctionResultParams {
  sessionId: string;
  functionResponse: string;
  functionCall?: FunctionCall;
}

/**
 * Interface for the routing parameters when sending messages to multiple models
 */
export interface RouteMessageParams {
  message: string;
  models: string[];
  routingPrompt?: string;
  defaultModel?: string;
  generationConfig?: GenerationConfig;
  safetySettings?: SafetySetting[];
  systemInstruction?: Content | string;
}

// Re-export other types for backwards compatibility
export type { ListFilesResponseType } from "./gemini/GeminiFileService.js";
export type {
  ChatSession,
  Content,
  Tool,
  ToolConfig,
  GenerationConfig,
  SafetySetting,
  Part,
  FunctionCall,
  FileId,
  CacheId,
} from "./gemini/GeminiTypes.js";
