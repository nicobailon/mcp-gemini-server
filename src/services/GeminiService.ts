import { GoogleGenAI } from "@google/genai";
import type {
  GenerationConfig,
  SafetySetting,
  Content,
  Part,
  File as GenAIFile,
  Chat,
  GenerateContentResponse,
  FunctionCall,
  FunctionDeclaration,
  Tool,
  ToolConfig,
} from "@google/genai";
import { ConfigurationManager } from "../config/ConfigurationManager.js";
import { GeminiApiError } from "../utils/errors.js";
import { logger } from "../utils/logger.js";
import path from "path";
import fs from "fs/promises";
import { FileMetadata, CachedContentMetadata } from "../types/index.js";
import { v4 as uuidv4 } from "uuid";

/**
 * Service for interacting with the Google Gemini API.
 */
export class GeminiService {
  private genAI: GoogleGenAI;
  private defaultModelName?: string;
  private secureBasePath?: string;
  private chatSessions: Map<string, Chat> = new Map();

  constructor() {
    const configManager = ConfigurationManager.getInstance();
    const config = configManager.getGeminiServiceConfig();

    if (!config.apiKey) {
      throw new Error("Gemini API key is required");
    }

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

      // Prepare upload configuration
      const uploadConfig: {
        file: string;
        config?: {
          mimeType?: string;
          displayName?: string;
        };
      } = {
        file: validatedPath,
      };

      if (options) {
        uploadConfig.config = {};
        if (options.mimeType) {
          uploadConfig.config.mimeType = options.mimeType;
        }
        if (options.displayName) {
          uploadConfig.config.displayName = options.displayName;
        }
      }

      // Upload the file
      const fileData = await this.genAI.files.upload(uploadConfig);

      // Ensure required fields exist
      if (!fileData.name || !fileData.uri) {
        throw new GeminiApiError(
          "Invalid file data received: missing required name or uri"
        );
      }

      // Return the file metadata
      return {
        name: fileData.name,
        uri: fileData.uri,
        mimeType:
          fileData.mimeType || options?.mimeType || "application/octet-stream",
        displayName: fileData.displayName || options?.displayName,
        sizeBytes: fileData.sizeBytes || "0",
        createTime: fileData.createTime || new Date().toISOString(),
        updateTime: fileData.updateTime || new Date().toISOString(),
        sha256Hash: fileData.sha256Hash || "",
        state: fileData.state || "ACTIVE",
      };
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

      // Call the files.list method
      const pager = await this.genAI.files.list({
        config: {
          pageSize: pageSize,
          pageToken: pageToken,
        },
      });

      // Get the first page of results
      const page = pager.page;
      const files: FileMetadata[] = [];

      // Process each file in the page
      for (const file of page) {
        files.push(this.mapFileResponseToMetadata(file));
      }

      // Determine if there's another page of results
      const hasNextPage = pager.hasNextPage();

      // Return the files and the nextPageToken if available
      return {
        files,
        nextPageToken: hasNextPage ? "next_page_available" : undefined,
      };
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
    if (!fileData.name || !fileData.uri) {
      throw new Error(
        "Invalid file data received: missing required name or uri"
      );
    }

    return {
      name: fileData.name!,
      uri: fileData.uri!,
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

  public async generateContent(
    prompt: string,
    modelName?: string,
    generationConfig?: GenerationConfig,
    safetySettings?: SafetySetting[],
    systemInstruction?: Content,
    cachedContentName?: string,
    fileReferenceOrInlineData?: FileMetadata | string,
    inlineDataMimeType?: string
  ): Promise<string> {
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

    // Construct the config object
    const callConfig: Record<string, unknown> = {};
    if (generationConfig) {
      Object.assign(callConfig, { generationConfig });
    }
    if (safetySettings) {
      callConfig.safetySettings = safetySettings;
    }
    if (systemInstruction) {
      callConfig.systemInstruction = systemInstruction;
    }
    if (cachedContentName) {
      callConfig.cachedContent = cachedContentName;
    }

    // Create generate content parameters
    const params = {
      model: effectiveModelName,
      contents: [{ role: "user", parts: contentParts }],
      ...callConfig,
    };

    try {
      // Call generateContent with enhanced parameters
      const result = await this.genAI.models.generateContent(params);

      // In the new SDK, text is a property not a method
      if (result?.text) {
        return result.text;
      } else {
        // Fallback for unexpected structures
        logger.warn(
          "Unexpected result structure from generateContent:",
          result
        );
        return JSON.stringify(result);
      }
    } catch (error) {
      logger.error("Error generating content:", error);
      throw new GeminiApiError(
        `Failed to generate content: ${(error as Error).message}`,
        error
      );
    }
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
  public startChatSession(
    modelName?: string,
    history?: Content[],
    generationConfig?: GenerationConfig,
    safetySettings?: SafetySetting[],
    tools?: Tool[],
    systemInstruction?: Content,
    cachedContentName?: string
  ): string {
    const effectiveModelName = modelName ?? this.defaultModelName;
    if (!effectiveModelName) {
      throw new GeminiApiError(
        "Model name must be provided either as a parameter or via the GOOGLE_GEMINI_MODEL environment variable."
      );
    }

    // Prepare chat parameters
    const chatParams: {
      model: string;
      history?: Content[];
      generationConfig?: GenerationConfig;
      safetySettings?: SafetySetting[];
      tools?: Tool[];
      systemInstruction?: Content;
      cachedContent?: string;
    } = {
      model: effectiveModelName,
    };

    // Add optional parameters if provided
    if (history && Array.isArray(history)) {
      chatParams.history = history;
    }
    if (generationConfig) {
      chatParams.generationConfig = generationConfig;
    }
    if (safetySettings && Array.isArray(safetySettings)) {
      chatParams.safetySettings = safetySettings;
    }
    if (tools && Array.isArray(tools)) {
      chatParams.tools = tools;
    }
    if (systemInstruction) {
      chatParams.systemInstruction = systemInstruction;
    }
    if (cachedContentName) {
      chatParams.cachedContent = cachedContentName;
    }

    try {
      // Create the chat session
      logger.debug(`Creating chat session with model: ${effectiveModelName}`);
      const chat = this.genAI.models.startChat(chatParams);

      // Generate a unique session ID
      const sessionId = uuidv4();

      // Store the chat session
      this.chatSessions.set(sessionId, chat);
      logger.info(`Chat session created: ${sessionId} using model ${effectiveModelName}`);

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
   *
   * @param sessionId The ID of the chat session to send the message to
   * @param message The text message to send
   * @param generationConfig Optional configuration for text generation parameters
   * @param safetySettings Optional array of safety settings to control content filtering
   * @param tools Optional array of tools that can be used in this message
   * @param toolConfig Optional configuration for tool usage
   * @param cachedContentName Optional name of cached content to use
   * @returns The model's response
   * @throws GeminiApiError if the session doesn't exist or there's an API error
   */
  public async sendMessageToSession(
    sessionId: string,
    message: string,
    generationConfig?: GenerationConfig,
    safetySettings?: SafetySetting[],
    tools?: Tool[],
    toolConfig?: ToolConfig,
    cachedContentName?: string
  ): Promise<GenerateContentResponse> {
    const chatSession = this.chatSessions.get(sessionId);
    if (!chatSession) {
      logger.error(`Chat session not found: ${sessionId}`);
      throw new GeminiApiError(`Chat session not found: ${sessionId}`);
    }

    // Prepare message parameters
    const messageParams: {
      generationConfig?: GenerationConfig;
      safetySettings?: SafetySetting[];
      tools?: Tool[];
      toolConfig?: ToolConfig;
      cachedContent?: string;
    } = {};

    // Add optional parameters if provided
    if (generationConfig) {
      messageParams.generationConfig = generationConfig;
    }
    if (safetySettings && Array.isArray(safetySettings)) {
      messageParams.safetySettings = safetySettings;
    }
    if (tools && Array.isArray(tools)) {
      messageParams.tools = tools;
    }
    if (toolConfig) {
      messageParams.toolConfig = toolConfig;
    }
    if (cachedContentName) {
      messageParams.cachedContent = cachedContentName;
    }

    try {
      logger.debug(`Sending message to session ${sessionId}`);
      // Send the message to the chat session
      const response = await chatSession.sendMessage(
        message,
        Object.keys(messageParams).length > 0 ? messageParams : undefined
      );
      logger.debug(`Got response for session ${sessionId}`);
      return response;
    } catch (error) {
      logger.error(`Error sending message to session ${sessionId}:`, error);
      throw new GeminiApiError(
        `Failed to send message to chat session: ${(error as Error).message}`,
        error
      );
    }
  }

  /**
   * Sends a function result to an existing chat session.
   *
   * @param sessionId The ID of the chat session to send the function result to
   * @param functionResponse The function response to send
   * @param functionCall Optional function call object referencing the original function call
   * @returns The model's response
   * @throws GeminiApiError if the session doesn't exist or there's an API error
   */
  public async sendFunctionResultToSession(
    sessionId: string,
    functionResponse: string,
    functionCall?: FunctionCall
  ): Promise<GenerateContentResponse> {
    const chatSession = this.chatSessions.get(sessionId);
    if (!chatSession) {
      logger.error(`Chat session not found: ${sessionId}`);
      throw new GeminiApiError(`Chat session not found: ${sessionId}`);
    }

    try {
      logger.debug(`Sending function result to session ${sessionId}`);
      
      // Format the function response as content parts
      const responseParts: Part[] = [
        { 
          functionResponse: {
            name: functionCall?.name || "unnamed_function",
            response: { name: functionCall?.name || "unnamed_function", content: functionResponse }
          }
        }
      ];
      
      // Send the function result to the chat session
      const response = await chatSession.sendMessage({
        role: "function",
        parts: responseParts
      });
      
      logger.debug(`Got response for function result in session ${sessionId}`);
      return response;
    } catch (error) {
      logger.error(`Error sending function result to session ${sessionId}:`, error);
      throw new GeminiApiError(
        `Failed to send function result to chat session: ${(error as Error).message}`,
        error
      );
    }
  }

  /**
   * Creates a function call request to a Gemini model.
   *
   * @param prompt The text prompt to send to the model
   * @param functionDeclarations Array of function declarations that the model can call
   * @param modelName Optional model name to use (defaults to service default)
   * @param generationConfig Optional generation config parameters
   * @param safetySettings Optional safety settings
   * @param toolConfig Optional tool configuration parameters
   * @returns Object containing either the function call details or a text response
   */
  public async generateFunctionCallRequest(
    prompt: string,
    functionDeclarations: FunctionDeclaration[],
    modelName?: string,
    generationConfig?: GenerationConfig,
    safetySettings?: SafetySetting[],
    toolConfig?: ToolConfig
  ): Promise<{ functionCall?: FunctionCall; text?: string }> {
    const effectiveModelName = modelName ?? this.defaultModelName;
    if (!effectiveModelName) {
      throw new GeminiApiError(
        "Model name must be provided either as a parameter or via the GOOGLE_GEMINI_MODEL environment variable."
      );
    }

    logger.debug(`Generating function call with model: ${effectiveModelName}`);

    // Create tools configuration from function declarations
    const tools: Tool[] = [
      {
        functionDeclarations: functionDeclarations,
      },
    ];

    // Prepare request parameters
    const requestParams: {
      model: string;
      contents: Content[];
      tools: Tool[];
      generationConfig?: GenerationConfig;
      safetySettings?: SafetySetting[];
      toolConfig?: ToolConfig;
    } = {
      model: effectiveModelName,
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }],
        },
      ],
      tools: tools,
    };

    // Add optional parameters if provided
    if (generationConfig) {
      requestParams.generationConfig = generationConfig;
    }
    if (safetySettings && Array.isArray(safetySettings)) {
      requestParams.safetySettings = safetySettings;
    }
    if (toolConfig) {
      requestParams.toolConfig = toolConfig;
    }

    try {
      // Call the Gemini API
      const result = await this.genAI.models.generateContent(requestParams);
      
      // Process the response
      const functionCalls = result.candidates?.[0]?.content?.parts
        ?.map(part => part.functionCall)
        .filter(Boolean);
      
      // Check if we got a function call
      if (functionCalls && functionCalls.length > 0) {
        logger.debug(`Function call generated: ${functionCalls[0].name}`);
        return { functionCall: functionCalls[0] };
      } else {
        // Return text response if no function call
        const textParts = result.candidates?.[0]?.content?.parts
          ?.filter(part => typeof part.text === 'string')
          ?.map(part => part.text);
          
        const responseText = textParts?.join('') || '';
        logger.debug("Text response received instead of function call");
        return { text: responseText };
      }
    } catch (error) {
      logger.error("Error generating function call:", error);
      throw new GeminiApiError(
        `Failed to generate function call: ${(error as Error).message}`,
        error
      );
    }
  }

  /**
   * Generates content from the model in a streaming manner.
   * Returns an async generator that yields chunks of text as they arrive.
   *
   * @param prompt The text prompt to send to the model
   * @param modelName Optional model name to use (defaults to service default)
   * @param generationConfig Optional generation config parameters
   * @param safetySettings Optional safety settings
   * @param systemInstruction Optional system instruction
   * @param cachedContentName Optional name of cached content to use
   * @returns Async generator yielding chunks of generated text
   */
  public async *generateContentStream(
    prompt: string,
    modelName?: string,
    generationConfig?: GenerationConfig,
    safetySettings?: SafetySetting[],
    systemInstruction?: Content,
    cachedContentName?: string
  ): AsyncGenerator<string, void, unknown> {
    const effectiveModelName = modelName ?? this.defaultModelName;
    if (!effectiveModelName) {
      throw new GeminiApiError(
        "Model name must be provided either as a parameter or via the GOOGLE_GEMINI_MODEL environment variable."
      );
    }

    logger.debug(`Generating content stream with model: ${effectiveModelName}`);

    // Prepare request parameters
    const requestParams: {
      model: string;
      contents: Content[];
      generationConfig?: GenerationConfig;
      safetySettings?: SafetySetting[];
      systemInstruction?: Content;
      cachedContent?: string;
    } = {
      model: effectiveModelName,
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }],
        },
      ],
    };

    // Add optional parameters if provided
    if (generationConfig) {
      requestParams.generationConfig = generationConfig;
    }
    if (safetySettings && Array.isArray(safetySettings)) {
      requestParams.safetySettings = safetySettings;
    }
    if (systemInstruction) {
      requestParams.systemInstruction = systemInstruction;
    }
    if (cachedContentName) {
      requestParams.cachedContent = cachedContentName;
    }

    try {
      // Call the Gemini API streaming endpoint
      const response = await this.genAI.models.generateContentStream(requestParams);
      
      // Process the stream chunks
      for await (const chunk of response.stream) {
        // Only yield if there is text content
        if (chunk.text) {
          yield chunk.text;
        }
      }
      
      logger.debug("Content stream completed successfully");
    } catch (error) {
      logger.error("Error generating content stream:", error);
      throw new GeminiApiError(
        `Failed to generate content stream: ${(error as Error).message}`,
        error
      );
    }
  }

  /**
   * Creates a new cache entry with the Gemini API.
   *
   * @param contents Array of content messages to cache
   * @param model Model to use for the cache
   * @param options Optional configuration including displayName, systemInstruction, TTL, tools and toolConfig
   * @returns Metadata for the created cache entry
   */
  public async createCache(
    contents: Content[],
    model: string,
    options?: {
      displayName?: string;
      systemInstruction?: Content;
      ttl?: string;
      tools?: Tool[];
      toolConfig?: ToolConfig;
    }
  ): Promise<CachedContentMetadata> {
    logger.debug(`Creating cache with model: ${model}`);

    try {
      // Prepare cache parameters
      const cacheParams: {
        model: string;
        contents: Content[];
        displayName?: string;
        systemInstruction?: Content;
        ttl?: string;
        tools?: Tool[];
        toolConfig?: ToolConfig;
      } = {
        model: model,
        contents: contents,
      };

      // Add optional parameters if provided
      if (options) {
        if (options.displayName) {
          cacheParams.displayName = options.displayName;
        }
        if (options.systemInstruction) {
          cacheParams.systemInstruction = options.systemInstruction;
        }
        if (options.ttl) {
          cacheParams.ttl = options.ttl;
        }
        if (options.tools) {
          cacheParams.tools = options.tools;
        }
        if (options.toolConfig) {
          cacheParams.toolConfig = options.toolConfig;
        }
      }

      // Create the cache
      const cachedContent = await this.genAI.models.createCachedContent(cacheParams);
      
      if (!cachedContent || !cachedContent.name) {
        throw new Error("Invalid cache response: missing required name property");
      }
      
      // Map the response to our metadata type
      const metadata: CachedContentMetadata = {
        name: cachedContent.name,
        displayName: cachedContent.displayName || "",
        createTime: cachedContent.createTime || new Date().toISOString(),
        updateTime: cachedContent.updateTime || new Date().toISOString(),
        expirationTime: cachedContent.expirationTime,
        state: cachedContent.state || "ACTIVE",
      };
      
      logger.info(`Cache created successfully: ${metadata.name}`);
      return metadata;
    } catch (error) {
      logger.error("Error creating cache:", error);
      throw new GeminiApiError(
        `Failed to create cache: ${(error as Error).message}`,
        error
      );
    }
  }

  /**
   * Updates an existing cache entry.
   *
   * @param cacheName The name of the cache to update (format: "cachedContents/{cache_id}")
   * @param contents New content messages to update in the cache
   * @param options Optional configuration including displayName, systemInstruction, and TTL
   * @returns Updated metadata for the cache entry
   */
  public async updateCache(
    cacheName: string,
    contents: Content[],
    options?: {
      displayName?: string;
      systemInstruction?: Content;
      ttl?: string;
      tools?: Tool[];
      toolConfig?: ToolConfig;
    }
  ): Promise<CachedContentMetadata> {
    logger.debug(`Updating cache: ${cacheName}`);

    try {
      // Prepare update parameters
      const updateParams: {
        name: string;
        contents: Content[];
        displayName?: string;
        systemInstruction?: Content;
        ttl?: string;
        tools?: Tool[];
        toolConfig?: ToolConfig;
      } = {
        name: cacheName,
        contents: contents,
      };

      // Add optional parameters if provided
      if (options) {
        if (options.displayName) {
          updateParams.displayName = options.displayName;
        }
        if (options.systemInstruction) {
          updateParams.systemInstruction = options.systemInstruction;
        }
        if (options.ttl) {
          updateParams.ttl = options.ttl;
        }
        if (options.tools) {
          updateParams.tools = options.tools;
        }
        if (options.toolConfig) {
          updateParams.toolConfig = options.toolConfig;
        }
      }

      // Update the cache
      const updatedCache = await this.genAI.models.updateCachedContent(updateParams);
      
      if (!updatedCache || !updatedCache.name) {
        throw new Error("Invalid cache response: missing required name property");
      }
      
      // Map the response to our metadata type
      const metadata: CachedContentMetadata = {
        name: updatedCache.name,
        displayName: updatedCache.displayName || "",
        createTime: updatedCache.createTime || new Date().toISOString(),
        updateTime: updatedCache.updateTime || new Date().toISOString(),
        expirationTime: updatedCache.expirationTime,
        state: updatedCache.state || "ACTIVE",
      };
      
      logger.info(`Cache updated successfully: ${metadata.name}`);
      return metadata;
    } catch (error) {
      logger.error(`Error updating cache ${cacheName}:`, error);
      throw new GeminiApiError(
        `Failed to update cache: ${(error as Error).message}`,
        error
      );
    }
  }

  /**
   * Gets metadata for a specific cache entry.
   *
   * @param cacheName The name of the cache to retrieve (format: "cachedContents/{cache_id}")
   * @returns Metadata for the cache entry
   */
  public async getCache(cacheName: string): Promise<CachedContentMetadata> {
    logger.debug(`Getting cache metadata for: ${cacheName}`);

    try {
      // Get the cache metadata
      const cacheData = await this.genAI.models.getCachedContent({ name: cacheName });
      
      if (!cacheData || !cacheData.name) {
        throw new Error("Invalid cache response: missing required name property");
      }
      
      // Map the response to our metadata type
      const metadata: CachedContentMetadata = {
        name: cacheData.name,
        displayName: cacheData.displayName || "",
        createTime: cacheData.createTime || new Date().toISOString(),
        updateTime: cacheData.updateTime || new Date().toISOString(),
        expirationTime: cacheData.expirationTime,
        state: cacheData.state || "ACTIVE",
      };
      
      return metadata;
    } catch (error) {
      logger.error(`Error getting cache ${cacheName}:`, error);
      throw new GeminiApiError(
        `Failed to get cache: ${(error as Error).message}`,
        error
      );
    }
  }

  /**
   * Lists all cache entries.
   *
   * @param pageSize Optional maximum number of cache entries to return
   * @param pageToken Optional token for pagination
   * @returns Object with array of cache metadata and next page token if available
   */
  public async listCaches(
    pageSize?: number,
    pageToken?: string
  ): Promise<{ caches: CachedContentMetadata[]; nextPageToken?: string }> {
    logger.debug(
      `Listing caches with pageSize: ${pageSize}, pageToken: ${pageToken}`
    );

    try {
      // List caches with pagination
      const response = await this.genAI.models.listCachedContents({
        pageSize: pageSize,
        pageToken: pageToken,
      });
      
      // Process the response into our metadata format
      const caches: CachedContentMetadata[] = [];
      
      // Check if there are cached contents in the response
      if (response && response.cachedContents && Array.isArray(response.cachedContents)) {
        for (const cache of response.cachedContents) {
          if (cache && cache.name) {
            caches.push({
              name: cache.name,
              displayName: cache.displayName || "",
              createTime: cache.createTime || new Date().toISOString(),
              updateTime: cache.updateTime || new Date().toISOString(),
              expirationTime: cache.expirationTime,
              state: cache.state || "ACTIVE",
            });
          }
        }
      }
      
      return {
        caches,
        nextPageToken: response.nextPageToken,
      };
    } catch (error) {
      logger.error("Error listing caches:", error);
      throw new GeminiApiError(
        `Failed to list caches: ${(error as Error).message}`,
        error
      );
    }
  }

  /**
   * Deletes a specific cache entry.
   *
   * @param cacheName The name of the cache to delete (format: "cachedContents/{cache_id}")
   * @returns Object with success flag
   */
  public async deleteCache(cacheName: string): Promise<{ success: boolean }> {
    logger.debug(`Deleting cache: ${cacheName}`);

    try {
      // Delete the cache
      await this.genAI.models.deleteCachedContent({ name: cacheName });
      
      logger.info(`Cache deleted successfully: ${cacheName}`);
      return { success: true };
    } catch (error) {
      logger.error(`Error deleting cache ${cacheName}:`, error);
      throw new GeminiApiError(
        `Failed to delete cache: ${(error as Error).message}`,
        error
      );
    }
  }
}
