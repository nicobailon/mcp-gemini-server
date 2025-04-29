import { GoogleGenAI } from "@google/genai";
import type {
  GenerationConfig,
  SafetySetting,
  Content,
  Part,
  File as GenAIFile,
  GenerateContentResponse,
  FunctionCall,
  Tool,
  ToolConfig,
  CachedContent,
} from "@google/genai";
import { ConfigurationManager } from "../config/ConfigurationManager.js";
import { GeminiApiError } from "../utils/errors.js";
import { logger } from "../utils/logger.js";
import path from "path";
import fs from "fs/promises";
import { FileMetadata, CachedContentMetadata } from "../types/index.js";
import { v4 as uuidv4 } from "uuid";

/**
 * Interface for the parameters of the generateContent method
 */
interface GenerateContentParams {
  prompt: string;
  modelName?: string;
  generationConfig?: GenerationConfig;
  safetySettings?: SafetySetting[];
  systemInstruction?: Content | string;
  cachedContentName?: string;
  fileReferenceOrInlineData?: FileMetadata | string;
  inlineDataMimeType?: string;
}

/**
 * Interface for the parameters of the startChatSession method
 */
interface StartChatParams {
  modelName?: string;
  history?: Content[];
  generationConfig?: GenerationConfig;
  safetySettings?: SafetySetting[];
  tools?: Tool[];
  systemInstruction?: Content | string;
  cachedContentName?: string;
}

/**
 * Interface for the parameters of the sendMessageToSession method
 */
interface SendMessageParams {
  sessionId: string;
  message: string;
  generationConfig?: GenerationConfig;
  safetySettings?: SafetySetting[];
  tools?: Tool[];
  toolConfig?: ToolConfig;
  cachedContentName?: string;
}

/**
 * Interface for the parameters of the sendFunctionResultToSession method
 */
interface SendFunctionResultParams {
  sessionId: string;
  functionResponse: string;
  functionCall?: FunctionCall;
}

/**
 * Interface for the chat session data structure
 */
interface ChatSession {
  model: string;
  config: {
    history?: Content[];
    generationConfig?: GenerationConfig;
    safetySettings?: SafetySetting[];
    tools?: Tool[];
    systemInstruction?: Content;
    cachedContent?: string;
  };
  history: Content[];
}

/**
 * Interface for the Gemini API list files response
 */
interface ListFilesResponseType {
  files?: GenAIFile[];
  nextPageToken?: string;
  page?: Iterable<GenAIFile>;
  hasNextPage?: () => boolean;
}

// Interface intentionally removed to fix unused variable linting error

/**
 * Service for interacting with the Google Gemini API.
 */
export class GeminiService {
  private genAI: GoogleGenAI;
  private defaultModelName?: string;
  private secureBasePath?: string;
  private chatSessions: Map<string, ChatSession> = new Map();

  constructor() {
    const configManager = ConfigurationManager.getInstance();
    const config = configManager.getGeminiServiceConfig();

    if (!config.apiKey) {
      throw new Error("Gemini API key is required");
    }

    // Initialize with the apiKey property in an object as required in v0.10.0
    this.genAI = new GoogleGenAI({ apiKey: config.apiKey });
    this.defaultModelName = config.defaultModel;

    // Set secure base path if configured
    const secureBasePath = configManager.getSecureFileBasePath();
    if (secureBasePath) {
      this.setSecureBasePath(secureBasePath);
      logger.info(
        `GeminiService initialized with secure file base path: ${secureBasePath}`
      );
    } else {
      logger.warn(
        "GeminiService initialized without a secure file base path. File operations will require explicit path validation."
      );
    }
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
    // Validate file path (redundant if already validated in tool handler but safer)
    const validatedPath = this.validateFilePath(filePath);

    // Check if file exists
    try {
      await fs.access(validatedPath);
    } catch (error) {
      throw new GeminiApiError(`File not found: ${validatedPath}`, error);
    }

    try {
      logger.debug(`Uploading file from: ${validatedPath}`);
      logger.debug(`With options: ${JSON.stringify(options)}`);

      // Read the file data
      const fileBuffer = await fs.readFile(validatedPath);

      // Determine MIME type if not provided
      let mimeType = options?.mimeType;
      if (!mimeType) {
        // If mimeType is not provided, try to determine from file extension
        const ext = path.extname(validatedPath).toLowerCase();
        const mimeMap: Record<string, string> = {
          ".jpg": "image/jpeg",
          ".jpeg": "image/jpeg",
          ".png": "image/png",
          ".gif": "image/gif",
          ".webp": "image/webp",
          ".pdf": "application/pdf",
          ".txt": "text/plain",
        };
        mimeType = mimeMap[ext] || "application/octet-stream";
      }

      // Convert Buffer to Blob for v0.10.0 compatibility
      const blob = new Blob([fileBuffer], { type: mimeType });

      // Use the correct parameters for v0.10.0
      const uploadParams = {
        file: blob, // Use Blob instead of Buffer
        mimeType: mimeType,
        displayName: options?.displayName || path.basename(validatedPath),
      };

      // Upload the file using the files API
      const fileData = await this.genAI.files.upload(uploadParams);

      // Ensure required fields exist
      if (!fileData.name) {
        throw new GeminiApiError(
          "Invalid file data received: missing required name"
        );
      }

      // Return the file metadata
      return this.mapFileResponseToMetadata(fileData);
    } catch (error: unknown) {
      logger.error(
        `Error uploading file: ${error instanceof Error ? error.message : String(error)}`,
        error
      );
      throw new GeminiApiError(
        `Failed to upload file: ${error instanceof Error ? error.message : String(error)}`,
        error
      );
    }
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
    try {
      logger.debug(
        `Listing files with pageSize: ${pageSize}, pageToken: ${pageToken}`
      );

      // Prepare list parameters for v0.10.0
      const listParams: Record<string, number | string> = {};

      if (pageSize !== undefined) {
        listParams.pageSize = pageSize;
      }

      if (pageToken) {
        listParams.pageToken = pageToken;
      }

      // Call the files.list method in v0.10.0
      const response = await this.genAI.files.list(listParams);

      const files: FileMetadata[] = [];
      let nextPageToken: string | undefined;

      // Handle the response in a more generic way to accommodate different API versions
      if (response && typeof response === "object") {
        if ("files" in response && Array.isArray(response.files)) {
          // Standard response format
          for (const file of response.files) {
            files.push(this.mapFileResponseToMetadata(file));
          }
          // Use optional chaining to safely access nextPageToken
          nextPageToken = (response as ListFilesResponseType).nextPageToken;
        } else if ("page" in response && response.page) {
          // Pager-like object
          const fileList = Array.from(response.page);
          for (const file of fileList) {
            files.push(this.mapFileResponseToMetadata(file as GenAIFile));
          }

          // Check if there's a next page
          const hasNextPage =
            typeof response === "object" &&
            "hasNextPage" in response &&
            typeof response.hasNextPage === "function"
              ? response.hasNextPage()
              : false;

          if (hasNextPage) {
            nextPageToken = "next_page_available";
          }
        } else if (Array.isArray(response)) {
          // Direct array response
          for (const file of response) {
            files.push(this.mapFileResponseToMetadata(file as GenAIFile));
          }
        }
      }

      return { files, nextPageToken };
    } catch (error: unknown) {
      logger.error(
        `Error listing files: ${error instanceof Error ? error.message : String(error)}`,
        error
      );
      throw new GeminiApiError(
        `Failed to list files: ${error instanceof Error ? error.message : String(error)}`,
        error
      );
    }
  }

  /**
   * Gets a specific file's metadata from the Gemini API.
   *
   * @param fileName The name of the file to retrieve (format: "files/{file_id}")
   * @returns Promise resolving to the file metadata
   */
  public async getFile(fileName: string): Promise<FileMetadata> {
    try {
      logger.debug(`Getting file metadata for: ${fileName}`);

      // Get the file metadata
      const fileData = await this.genAI.files.get({ name: fileName });

      return this.mapFileResponseToMetadata(fileData);
    } catch (error: unknown) {
      logger.error(
        `Error getting file: ${error instanceof Error ? error.message : String(error)}`,
        error
      );
      throw new GeminiApiError(
        `Failed to get file: ${error instanceof Error ? error.message : String(error)}`,
        error
      );
    }
  }

  /**
   * Deletes a file from the Gemini API.
   *
   * @param fileName The name of the file to delete (format: "files/{file_id}")
   * @returns Promise resolving to an object with success flag
   */
  public async deleteFile(fileName: string): Promise<{ success: boolean }> {
    try {
      logger.debug(`Deleting file: ${fileName}`);

      // Delete the file
      await this.genAI.files.delete({ name: fileName });

      return { success: true };
    } catch (error: unknown) {
      logger.error(
        `Error deleting file: ${error instanceof Error ? error.message : String(error)}`,
        error
      );
      throw new GeminiApiError(
        `Failed to delete file: ${error instanceof Error ? error.message : String(error)}`,
        error
      );
    }
  }

  /**
   * Helper method to map file response data to our FileMetadata interface
   *
   * @param fileData The file data from the Gemini API
   * @returns The mapped FileMetadata object
   */
  private mapFileResponseToMetadata(fileData: GenAIFile): FileMetadata {
    if (!fileData.name) {
      throw new Error("Invalid file data received: missing required name");
    }

    // In SDK v0.10.0, the structure might be slightly different
    // Constructing FileMetadata with fallback values where needed
    return {
      name: fileData.name,
      // Provide a fallback URI from name if not present (format may vary in v0.10.0)
      uri:
        fileData.uri ||
        `https://generativelanguage.googleapis.com/v1beta/${fileData.name}`,
      mimeType: fileData.mimeType || "application/octet-stream",
      displayName: fileData.displayName,
      sizeBytes: fileData.sizeBytes || "0",
      createTime: fileData.createTime || new Date().toISOString(),
      updateTime: fileData.updateTime || new Date().toISOString(),
      expirationTime: fileData.expirationTime,
      sha256Hash: fileData.sha256Hash || "",
      state: fileData.state || "ACTIVE",
    };
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
    // Ensure path is absolute
    if (!path.isAbsolute(filePath)) {
      throw new Error("File path must be absolute");
    }

    // Normalize path to resolve any . or .. segments
    const normalizedPath = path.normalize(filePath);

    // Check for path traversal attempts
    if (normalizedPath.includes("../") || normalizedPath.includes("..\\")) {
      throw new Error("Path contains invalid traversal sequences");
    }

    // If basePath is specified, ensure the path is within that directory
    if (basePath) {
      const normalizedBasePath = path.normalize(basePath);
      if (!normalizedPath.startsWith(normalizedBasePath)) {
        throw new Error(
          `File path must be within the allowed base directory: ${basePath}`
        );
      }
    }

    // If class has a secureBasePath set, also check against that
    if (
      this.secureBasePath &&
      !normalizedPath.startsWith(this.secureBasePath)
    ) {
      throw new Error(
        `File path must be within the configured secure base directory`
      );
    }

    return normalizedPath;
  }

  /**
   * Sets the secure base directory for file operations.
   * All file operations will be restricted to this directory.
   *
   * @param basePath The absolute path to restrict file operations to
   */
  public setSecureBasePath(basePath: string): void {
    if (!path.isAbsolute(basePath)) {
      throw new Error("Base path must be absolute");
    }

    // Store the base path in a private field
    this.secureBasePath = path.normalize(basePath);
  }

  /**
   * Gets the current secure base directory if set
   */
  public getSecureBasePath(): string | undefined {
    return this.secureBasePath;
  }

  /**
   * Generates content using the Gemini model.
   *
   * @param params An object containing all necessary parameters for content generation
   * @returns A promise resolving to the generated text content
   */
  /**
   * Streams content generation using the Gemini model.
   * Returns an async generator that yields text chunks as they are generated.
   *
   * @param params An object containing all necessary parameters for content generation
   * @returns An async generator yielding text chunks as they become available
   */
  public async *generateContentStream(
    params: GenerateContentParams
  ): AsyncGenerator<string> {
    const {
      prompt,
      modelName,
      generationConfig,
      safetySettings,
      systemInstruction,
      cachedContentName,
      fileReferenceOrInlineData,
      inlineDataMimeType,
    } = params;

    const effectiveModelName = modelName ?? this.defaultModelName;
    if (!effectiveModelName) {
      throw new GeminiApiError(
        "Model name must be provided either as a parameter or via the GOOGLE_GEMINI_MODEL environment variable."
      );
    }
    logger.debug(
      `generateContentStream called with model: ${effectiveModelName}`
    );

    // Construct base content parts array
    const contentParts: Part[] = [];
    contentParts.push({ text: prompt });

    // Add file reference or inline data if provided
    if (fileReferenceOrInlineData) {
      if (typeof fileReferenceOrInlineData === "string" && inlineDataMimeType) {
        // Handle inline base64 data
        contentParts.push({
          inlineData: {
            data: fileReferenceOrInlineData,
            mimeType: inlineDataMimeType,
          },
        });
      } else if (
        typeof fileReferenceOrInlineData === "object" &&
        "name" in fileReferenceOrInlineData &&
        fileReferenceOrInlineData.uri
      ) {
        // Handle file reference
        contentParts.push({
          fileData: {
            fileUri: fileReferenceOrInlineData.uri,
            mimeType: fileReferenceOrInlineData.mimeType,
          },
        });
      } else {
        throw new GeminiApiError(
          "Invalid file reference or inline data provided"
        );
      }
    }

    // Process systemInstruction if it's a string
    let formattedSystemInstruction: Content | undefined;
    if (systemInstruction) {
      if (typeof systemInstruction === "string") {
        formattedSystemInstruction = {
          parts: [{ text: systemInstruction }],
        };
      } else {
        formattedSystemInstruction = systemInstruction;
      }
    }

    // Create the request configuration for v0.10.0
    const requestConfig: {
      model: string;
      contents: Content[];
      generationConfig?: GenerationConfig;
      safetySettings?: SafetySetting[];
      systemInstruction?: Content;
      cachedContent?: string;
    } = {
      model: effectiveModelName,
      contents: [{ role: "user", parts: contentParts }],
    };

    // Add optional parameters if provided
    if (generationConfig) {
      requestConfig.generationConfig = generationConfig;
    }
    if (safetySettings) {
      requestConfig.safetySettings = safetySettings;
    }
    if (formattedSystemInstruction) {
      requestConfig.systemInstruction = formattedSystemInstruction;
    }
    if (cachedContentName) {
      requestConfig.cachedContent = cachedContentName;
    }

    try {
      // Call generateContentStream directly on the models property in v0.10.0
      const streamResult =
        await this.genAI.models.generateContentStream(requestConfig);

      // Iterate through the chunks and yield text
      // The v0.10.0 SDK returns an AsyncGenerator directly, not an object with a stream property
      for await (const chunk of streamResult) {
        // Extract text from the chunk if available - text is a getter, not a method
        const chunkText = chunk.text;
        if (chunkText) {
          yield chunkText;
        }
      }
    } catch (error) {
      logger.error("Error generating content stream:", error);
      throw new GeminiApiError(
        `Failed to generate content stream: ${(error as Error).message}`,
        error
      );
    }
  }

  public async generateContent(params: GenerateContentParams): Promise<string> {
    const {
      prompt,
      modelName,
      generationConfig,
      safetySettings,
      systemInstruction,
      cachedContentName,
      fileReferenceOrInlineData,
      inlineDataMimeType,
    } = params;

    const effectiveModelName = modelName ?? this.defaultModelName;
    if (!effectiveModelName) {
      throw new GeminiApiError(
        "Model name must be provided either as a parameter or via the GOOGLE_GEMINI_MODEL environment variable."
      );
    }
    logger.debug(`generateContent called with model: ${effectiveModelName}`);

    // Construct base content parts array
    const contentParts: Part[] = [];
    contentParts.push({ text: prompt });

    // Add file reference or inline data if provided
    if (fileReferenceOrInlineData) {
      if (typeof fileReferenceOrInlineData === "string" && inlineDataMimeType) {
        // Handle inline base64 data
        contentParts.push({
          inlineData: {
            data: fileReferenceOrInlineData,
            mimeType: inlineDataMimeType,
          },
        });
      } else if (
        typeof fileReferenceOrInlineData === "object" &&
        "name" in fileReferenceOrInlineData &&
        fileReferenceOrInlineData.uri
      ) {
        // Handle file reference
        contentParts.push({
          fileData: {
            fileUri: fileReferenceOrInlineData.uri,
            mimeType: fileReferenceOrInlineData.mimeType,
          },
        });
      } else {
        throw new GeminiApiError(
          "Invalid file reference or inline data provided"
        );
      }
    }

    // Process systemInstruction if it's a string
    let formattedSystemInstruction: Content | undefined;
    if (systemInstruction) {
      if (typeof systemInstruction === "string") {
        formattedSystemInstruction = {
          parts: [{ text: systemInstruction }],
        };
      } else {
        formattedSystemInstruction = systemInstruction;
      }
    }

    // Create the request configuration for v0.10.0
    const requestConfig: {
      model: string;
      contents: Content[];
      generationConfig?: GenerationConfig;
      safetySettings?: SafetySetting[];
      systemInstruction?: Content;
      cachedContent?: string;
    } = {
      model: effectiveModelName,
      contents: [{ role: "user", parts: contentParts }],
    };

    // Add optional parameters if provided
    if (generationConfig) {
      requestConfig.generationConfig = generationConfig;
    }
    if (safetySettings) {
      requestConfig.safetySettings = safetySettings;
    }
    if (formattedSystemInstruction) {
      requestConfig.systemInstruction = formattedSystemInstruction;
    }
    if (cachedContentName) {
      requestConfig.cachedContent = cachedContentName;
    }

    try {
      // Call generateContent directly on the models property in v0.10.0
      const result = await this.genAI.models.generateContent(requestConfig);

      // Handle potentially undefined text property
      if (!result.text) {
        throw new GeminiApiError("No text was generated in the response");
      }

      return result.text;
    } catch (error) {
      logger.error("Error generating content:", error);
      throw new GeminiApiError(
        `Failed to generate content: ${(error as Error).message}`,
        error
      );
    }
  }

  /**
   * Starts a new stateful chat session with the Gemini model.
   *
   * @param modelName The model to use for this chat session (or uses default model if not specified)
   * @param history Optional array of previous Content messages to initialize conversation history
   * @param generationConfig Optional configuration for text generation parameters
   * @param safetySettings Optional array of safety settings to control content filtering
   * @param tools Optional array of tools that can be used in the chat
   * @param systemInstruction Optional system instruction for the chat
   * @param cachedContentName Optional name of cached content to use
   * @returns A unique session ID to identify this chat session
   */
  public startChatSession(params: StartChatParams = {}): string {
    const {
      modelName,
      history,
      generationConfig,
      safetySettings,
      tools,
      systemInstruction,
      cachedContentName,
    } = params;

    const effectiveModelName = modelName ?? this.defaultModelName;
    if (!effectiveModelName) {
      throw new GeminiApiError(
        "Model name must be provided either as a parameter or via the GOOGLE_GEMINI_MODEL environment variable."
      );
    }

    // Process systemInstruction if it's a string
    let formattedSystemInstruction: Content | undefined;
    if (systemInstruction) {
      if (typeof systemInstruction === "string") {
        formattedSystemInstruction = {
          parts: [{ text: systemInstruction }],
        };
      } else {
        formattedSystemInstruction = systemInstruction;
      }
    }

    try {
      // Create the chat session using the models API
      logger.debug(`Creating chat session with model: ${effectiveModelName}`);

      // Create chat configuration for v0.10.0
      const chatConfig: {
        history?: Content[];
        generationConfig?: GenerationConfig;
        safetySettings?: SafetySetting[];
        tools?: Tool[];
        systemInstruction?: Content;
        cachedContent?: string;
      } = {};

      // Add optional parameters if provided
      if (history && Array.isArray(history)) {
        chatConfig.history = history;
      }
      if (generationConfig) {
        chatConfig.generationConfig = generationConfig;
      }
      if (safetySettings && Array.isArray(safetySettings)) {
        chatConfig.safetySettings = safetySettings;
      }
      if (tools && Array.isArray(tools)) {
        chatConfig.tools = tools;
      }
      if (formattedSystemInstruction) {
        chatConfig.systemInstruction = formattedSystemInstruction;
      }
      if (cachedContentName) {
        chatConfig.cachedContent = cachedContentName;
      }

      // Generate a unique session ID
      const sessionId = uuidv4();

      // Create a mock chat session for storing configuration
      // In v0.10.0, we don't have direct chat session objects,
      // but we'll store the configuration to use for future messages
      this.chatSessions.set(sessionId, {
        model: effectiveModelName,
        config: chatConfig,
        history: history || [],
      });

      logger.info(
        `Chat session created: ${sessionId} using model ${effectiveModelName}`
      );

      return sessionId;
    } catch (error) {
      logger.error("Error creating chat session:", error);
      throw new GeminiApiError(
        `Failed to create chat session: ${(error as Error).message}`,
        error
      );
    }
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
    const {
      sessionId,
      message,
      generationConfig,
      safetySettings,
      tools,
      toolConfig,
      cachedContentName,
    } = params;

    // Get the chat session
    const session = this.chatSessions.get(sessionId);
    if (!session) {
      throw new GeminiApiError(`Chat session not found: ${sessionId}`);
    }

    // Create user content from the message
    const userContent: Content = {
      role: "user",
      parts: [{ text: message }],
    };

    // Add the user message to the session history
    session.history.push(userContent);

    try {
      // Prepare the request configuration
      const requestConfig: {
        model: string;
        contents: Content[];
        generationConfig?: GenerationConfig;
        safetySettings?: SafetySetting[];
        tools?: Tool[];
        toolConfig?: ToolConfig;
        systemInstruction?: Content;
        cachedContent?: string;
      } = {
        model: session.model,
        contents: session.history,
      };

      // Add configuration from the original session configuration
      if (session.config.systemInstruction) {
        requestConfig.systemInstruction = session.config.systemInstruction;
      }

      // Override with any per-message configuration options
      if (generationConfig) {
        requestConfig.generationConfig = generationConfig;
      } else if (session.config.generationConfig) {
        requestConfig.generationConfig = session.config.generationConfig;
      }

      if (safetySettings) {
        requestConfig.safetySettings = safetySettings;
      } else if (session.config.safetySettings) {
        requestConfig.safetySettings = session.config.safetySettings;
      }

      if (tools) {
        requestConfig.tools = tools;
      } else if (session.config.tools) {
        requestConfig.tools = session.config.tools;
      }

      if (toolConfig) {
        requestConfig.toolConfig = toolConfig;
      }

      if (cachedContentName) {
        requestConfig.cachedContent = cachedContentName;
      } else if (session.config.cachedContent) {
        requestConfig.cachedContent = session.config.cachedContent;
      }

      logger.debug(
        `Sending message to session ${sessionId} using model ${session.model}`
      );

      // Call the generateContent API
      const response = await this.genAI.models.generateContent(requestConfig);

      // Process the response
      if (response.candidates && response.candidates.length > 0) {
        const assistantMessage = response.candidates[0].content;
        if (assistantMessage) {
          // Add the assistant response to the session history
          session.history.push(assistantMessage);
        }
      }

      return response;
    } catch (error) {
      logger.error(`Error sending message to session ${sessionId}:`, error);
      throw new GeminiApiError(
        `Failed to send message to session ${sessionId}: ${(error as Error).message}`,
        error
      );
    }
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
    const { sessionId, functionResponse, functionCall } = params;

    // Get the chat session
    const session = this.chatSessions.get(sessionId);
    if (!session) {
      throw new GeminiApiError(`Chat session not found: ${sessionId}`);
    }

    // Create function response message
    const responseContent: Content = {
      role: "function",
      parts: [
        {
          functionResponse: {
            name: functionCall?.name || "function",
            response: { content: functionResponse },
          },
        },
      ],
    };

    // Add the function response to the session history
    session.history.push(responseContent);

    try {
      // Prepare the request configuration
      const requestConfig: {
        model: string;
        contents: Content[];
        generationConfig?: GenerationConfig;
        safetySettings?: SafetySetting[];
        tools?: Tool[];
        toolConfig?: ToolConfig;
        systemInstruction?: Content;
        cachedContent?: string;
      } = {
        model: session.model,
        contents: session.history,
      };

      // Add configuration from the session
      if (session.config.systemInstruction) {
        requestConfig.systemInstruction = session.config.systemInstruction;
      }

      if (session.config.generationConfig) {
        requestConfig.generationConfig = session.config.generationConfig;
      }

      if (session.config.safetySettings) {
        requestConfig.safetySettings = session.config.safetySettings;
      }

      if (session.config.tools) {
        requestConfig.tools = session.config.tools;
      }

      if (session.config.cachedContent) {
        requestConfig.cachedContent = session.config.cachedContent;
      }

      logger.debug(
        `Sending function result to session ${sessionId} using model ${session.model}`
      );

      // Call the generateContent API directly
      const response = await this.genAI.models.generateContent(requestConfig);

      // Process the response
      if (response.candidates && response.candidates.length > 0) {
        const assistantMessage = response.candidates[0].content;
        if (assistantMessage) {
          // Add the assistant response to the session history
          session.history.push(assistantMessage);
        }
      }

      return response;
    } catch (error) {
      logger.error(
        `Error sending function result to session ${sessionId}:`,
        error
      );
      throw new GeminiApiError(
        `Failed to send function result to session ${sessionId}: ${(error as Error).message}`,
        error
      );
    }
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
    try {
      logger.debug(`Creating cache for model: ${modelName}`);

      // Process systemInstruction if it's a string
      let formattedSystemInstruction: Content | undefined;
      if (options?.systemInstruction) {
        if (typeof options.systemInstruction === "string") {
          formattedSystemInstruction = {
            parts: [{ text: options.systemInstruction }],
          };
        } else {
          formattedSystemInstruction = options.systemInstruction;
        }
      }

      // Create config object for the request
      const cacheConfig = {
        contents,
        displayName: options?.displayName,
        systemInstruction: formattedSystemInstruction,
        ttl: options?.ttl,
        tools: options?.tools,
        toolConfig: options?.toolConfig,
      };

      // Create the cache entry
      const cacheData = await this.genAI.caches.create({
        model: modelName,
        config: cacheConfig,
      });

      // Return the mapped metadata
      return this.mapSdkCacheToMetadata(cacheData);
    } catch (error: unknown) {
      logger.error(
        `Error creating cache: ${error instanceof Error ? error.message : String(error)}`,
        error
      );
      throw new GeminiApiError(
        `Failed to create cache: ${error instanceof Error ? error.message : String(error)}`,
        error
      );
    }
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
    try {
      logger.debug(
        `Listing caches with pageSize: ${pageSize}, pageToken: ${pageToken}`
      );

      // Prepare list parameters
      const listParams: Record<string, number | string> = {};

      if (pageSize !== undefined) {
        listParams.pageSize = pageSize;
      }

      if (pageToken) {
        listParams.pageToken = pageToken;
      }

      // Call the caches.list method
      const response = await this.genAI.caches.list(listParams);

      const caches: CachedContentMetadata[] = [];
      let nextPageToken: string | undefined;

      // Handle the response in a more generic way to accommodate different API versions
      if (response && typeof response === "object") {
        if ("caches" in response && Array.isArray(response.caches)) {
          // Standard response format - cast to our TypeScript interface for validation
          for (const cache of response.caches) {
            caches.push(this.mapSdkCacheToMetadata(cache));
          }
          // Use optional chaining to safely access nextPageToken
          nextPageToken = (
            response as {
              caches: Record<string, unknown>[];
              nextPageToken?: string;
            }
          ).nextPageToken;
        } else if ("page" in response && response.page) {
          // Pager-like object in v0.10.0
          const cacheList = Array.from(response.page);
          for (const cache of cacheList) {
            caches.push(this.mapSdkCacheToMetadata(cache));
          }

          // Check if there's a next page
          const hasNextPage =
            typeof response === "object" &&
            "hasNextPage" in response &&
            typeof response.hasNextPage === "function"
              ? response.hasNextPage()
              : false;

          if (hasNextPage) {
            nextPageToken = "next_page_available";
          }
        } else if (Array.isArray(response)) {
          // Direct array response
          for (const cache of response) {
            caches.push(this.mapSdkCacheToMetadata(cache));
          }
        }
      }

      return { caches, nextPageToken };
    } catch (error: unknown) {
      logger.error(
        `Error listing caches: ${error instanceof Error ? error.message : String(error)}`,
        error
      );
      throw new GeminiApiError(
        `Failed to list caches: ${error instanceof Error ? error.message : String(error)}`,
        error
      );
    }
  }

  /**
   * Gets a specific cached content entry's metadata from the Gemini API.
   *
   * @param cacheName The name of the cached content to retrieve (format: "cachedContents/{id}")
   * @returns Promise resolving to the cached content metadata
   */
  public async getCache(cacheName: string): Promise<CachedContentMetadata> {
    try {
      logger.debug(`Getting cache metadata for: ${cacheName}`);

      // Get the cache metadata
      const cacheData = await this.genAI.caches.get({ name: cacheName });

      return this.mapSdkCacheToMetadata(cacheData);
    } catch (error: unknown) {
      logger.error(
        `Error getting cache: ${error instanceof Error ? error.message : String(error)}`,
        error
      );
      throw new GeminiApiError(
        `Failed to get cache: ${error instanceof Error ? error.message : String(error)}`,
        error
      );
    }
  }

  /**
   * Updates a cached content entry in the Gemini API.
   *
   * @param cacheName The name of the cached content to update (format: "cachedContents/{id}")
   * @param updates The updates to apply to the cached content (ttl, displayName)
   * @returns Promise resolving to the updated cached content metadata
   */
  public async updateCache(
    cacheName: string,
    updates: { ttl?: string; displayName?: string }
  ): Promise<CachedContentMetadata> {
    try {
      logger.debug(`Updating cache: ${cacheName}`);

      // Update the cache
      const cacheData = await this.genAI.caches.update({
        name: cacheName,
        config: updates,
      });

      return this.mapSdkCacheToMetadata(cacheData);
    } catch (error: unknown) {
      logger.error(
        `Error updating cache: ${error instanceof Error ? error.message : String(error)}`,
        error
      );
      throw new GeminiApiError(
        `Failed to update cache: ${error instanceof Error ? error.message : String(error)}`,
        error
      );
    }
  }

  /**
   * Deletes a cached content entry from the Gemini API.
   *
   * @param cacheName The name of the cached content to delete (format: "cachedContents/{id}")
   * @returns Promise resolving to an object with success flag
   */
  public async deleteCache(cacheName: string): Promise<{ success: boolean }> {
    try {
      logger.debug(`Deleting cache: ${cacheName}`);

      // Delete the cache
      await this.genAI.caches.delete({ name: cacheName });

      return { success: true };
    } catch (error: unknown) {
      logger.error(
        `Error deleting cache: ${error instanceof Error ? error.message : String(error)}`,
        error
      );
      throw new GeminiApiError(
        `Failed to delete cache: ${error instanceof Error ? error.message : String(error)}`,
        error
      );
    }
  }

  /**
   * Helper method to map cached content response data to our CachedContentMetadata interface
   *
   * @param cacheData The cache data from the Gemini API
   * @returns The mapped CachedContentMetadata object
   */
  private mapSdkCacheToMetadata(
    cacheData: CachedContent
  ): CachedContentMetadata {
    if (!cacheData.name) {
      throw new Error("Invalid cache data received: missing required name");
    }

    // In SDK v0.10.0, the structure might be slightly different
    // Constructing CachedContentMetadata with fallback values where needed
    return {
      name: cacheData.name,
      displayName: cacheData.displayName || "",
      createTime: cacheData.createTime || new Date().toISOString(),
      updateTime: cacheData.updateTime || new Date().toISOString(),
      expirationTime: cacheData.expireTime,
      model: cacheData.model || "",
      state: "ACTIVE", // Default to ACTIVE since CachedContent does not have a status/state property
      usageMetadata: {
        totalTokenCount:
          typeof cacheData.usageMetadata?.totalTokenCount !== "undefined"
            ? cacheData.usageMetadata.totalTokenCount
            : 0,
      },
    };
  }
}
