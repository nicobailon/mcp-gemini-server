// --- Merged and Corrected Imports ---
import {
  GoogleGenAI,
  GenerationConfig,
  SafetySetting,
  GenerateContentResponse,
  Part,
  FunctionDeclaration,
  ToolConfig,
  FunctionCall,
  Tool,
  FinishReason,
  BlockedReason,
  Chat,
  Content,
  FunctionResponse,
  // File API related types from main entry
  File as GenAIFile,
  // UploadFileParameters, // Not directly exported, use inline object
  ListFilesParameters,
  GetFileParameters,
  DeleteFileParameters,
  // FileMetadata as GenAIFileMetadataParams, // Not exported directly
  ListFilesConfig,
  // --- Caching API Imports ---
  CachedContent, // SDK's type for cache object
  CreateCachedContentParameters,
  ListCachedContentsParameters,
  GetCachedContentParameters,
  UpdateCachedContentParameters,
  DeleteCachedContentParameters,
  ListCachedContentsConfig, // Config for list
  CreateCachedContentConfig, // Config for create
  UpdateCachedContentConfig, // Config for update
  // DeleteCachedContentResponse, // Delete returns void or empty object
  Pager, // Pager is used for listCaches too
  // New import for content generation parameters
  GenerateContentParameters,
  GenerateContentConfig,
  // Image generation types
  GenerateImagesParameters,
  GenerateImagesConfig,
  GenerateImagesResponse,
  Image as GenAIImage,
} from "@google/genai";
import { v4 as uuidv4 } from "uuid";
import {
  GeminiServiceConfig,
  FunctionResponseInput,
  FileMetadata,
  CachedContentMetadata,
  ImageGenerationResult,
} from "../types/index.js";
import { logger } from "../utils/index.js";
import { GeminiApiError } from "../utils/errors.js";

/**
 * Service class for interacting with the Google Gemini API using the @google/genai SDK.
 */
export class GeminiService {
  // Store the config directly, which might have an optional defaultModel
  private readonly config: GeminiServiceConfig;
  private readonly genAI: GoogleGenAI;
  private chatSessions: Map<string, Chat> = new Map();
  private readonly defaultModelName?: string; // Store the default model name

  /**
   * Initializes the GeminiService.
   * @param config - Configuration containing the API key.
   */
  constructor(config: GeminiServiceConfig) {
    // Ensure API key is provided
    if (!config.apiKey || config.apiKey.trim() === "") {
      const errorMsg = "Gemini API key is missing in configuration.";
      logger.error(errorMsg);
      throw new Error(errorMsg);
    }
    // Store the provided config, including the potentially undefined defaultModel
    this.config = { ...config };
    this.defaultModelName = config.defaultModel; // Store default model from config
    logger.info("Initializing GoogleGenAI SDK...");
    this.genAI = new GoogleGenAI({ apiKey: this.config.apiKey });
    logger.info(
      `GoogleGenAI SDK initialized. Default model: ${this.defaultModelName ?? "Not Set"}`
    );
  }

  /**
   * Generates non-streaming content based on a prompt.
   * @param prompt - The input prompt string.
   * @param modelName - The name of the Gemini model to use.
   * @param generationConfig - Optional generation configuration.
   * @param safetySettings - Optional safety settings.
   * @param systemInstruction - Optional system instruction.
   * @param cachedContentName - Optional cached content name.
   */
  public async generateContent(
    prompt: string,
    modelName?: string,
    generationConfig?: GenerationConfig,
    safetySettings?: SafetySetting[],
    systemInstruction?: Content,
    cachedContentName?: string
  ): Promise<string> {
    const effectiveModelName = modelName ?? this.defaultModelName;
    if (!effectiveModelName) {
      throw new GeminiApiError(
        "Model name must be provided either as a parameter or via the GOOGLE_GEMINI_MODEL environment variable."
      );
    }
    logger.debug(`generateContent called with model: ${effectiveModelName}`);

    try {
      // Construct the config object for the SDK call using GenerateContentConfig
      const callConfig: GenerateContentConfig = {};

      if (generationConfig) {
        // Copy generationConfig properties into callConfig
        for (const [key, value] of Object.entries(generationConfig)) {
          (callConfig as any)[key] = value;
        }
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

      // Create the generate content parameters using the SDK's interfaces
      const params: GenerateContentParameters = {
        model: effectiveModelName,
        contents: [{ role: "user", parts: [{ text: prompt }] }], // Updated to match latest SDK format
        config: Object.keys(callConfig).length > 0 ? callConfig : undefined,
      };

      // Call models.generateContent with the structured parameters
      const result: GenerateContentResponse =
        await this.genAI.models.generateContent(params);

      // --- Response Handling ---
      // Use the SDK's helper method first if available
      if (result.text !== undefined) {
        logger.debug(
          `Gemini response received successfully for model ${effectiveModelName} using result.text.`
        );
        return result.text;
      }

      // Otherwise fall back to manual extraction
      // Check if candidates array exists and has content
      if (!result.candidates || result.candidates.length === 0) {
        // Check promptFeedback for safety blocks (might be present even without candidates)
        if (result.promptFeedback?.blockReason === BlockedReason.SAFETY) {
          logger.warn(
            `Gemini prompt blocked due to SAFETY for model ${effectiveModelName}. Throwing error.`
          );
          throw new GeminiApiError("Prompt blocked due to safety settings.", {
            blockReason: result.promptFeedback.blockReason,
            safetyRatings: result.promptFeedback.safetyRatings,
          });
        }
        // If no candidates and no safety block, assume MAX_TOKENS or other non-error stop without output
        logger.warn(
          `Gemini response for model ${effectiveModelName} has no candidates. Assuming MAX_TOKENS or similar stop. Returning empty string.`
        );
        return "";
      }

      const firstCandidate = result.candidates[0];

      // 1. Check for SAFETY finish reason on the candidate
      if (firstCandidate?.finishReason === FinishReason.SAFETY) {
        logger.warn(
          `Gemini response stopped due to SAFETY for model ${effectiveModelName}. Throwing error.`
        );
        throw new GeminiApiError(
          "Content generation stopped due to safety settings.",
          {
            finishReason: firstCandidate.finishReason,
            safetyRatings: firstCandidate.safetyRatings,
          }
        );
      }

      // 2. Try to extract text
      const firstPart = firstCandidate?.content?.parts?.[0];
      let text: string | undefined = undefined;
      if (
        firstPart &&
        "text" in firstPart &&
        typeof firstPart.text === "string"
      ) {
        text = firstPart.text;
      }

      // 3. Check if text was found OR if finish reason is acceptable (STOP/MAX_TOKENS)
      if (text !== undefined) {
        logger.debug(
          `Gemini response received successfully for model ${effectiveModelName}.`
        );
        return text; // Return text (could be empty string)
      } else if (
        firstCandidate?.finishReason === FinishReason.MAX_TOKENS ||
        firstCandidate?.finishReason === FinishReason.STOP
      ) {
        logger.warn(
          `Gemini response stopped due to ${firstCandidate.finishReason} for model ${effectiveModelName} and contained no text part. Returning empty string.`
        );
        return ""; // Return empty string if stopped normally or by token limit without text
      } else {
        // If no text AND finish reason is not acceptable or missing
        logger.warn(
          `Gemini response for model ${effectiveModelName} did not contain text and had unexpected finishReason: ${firstCandidate?.finishReason}`
        );
        console.error(
          "Actual response structure (no text, unexpected finish):",
          JSON.stringify(result, null, 2)
        );
        throw new Error(
          "No valid text content found in Gemini response structure."
        );
      }
    } catch (error: unknown) {
      // Handle specific error thrown above for SAFETY finish reason
      if (
        error instanceof GeminiApiError &&
        error.message.includes("safety settings")
      ) {
        throw error; // Re-throw the specific error
      }
      // Handle other errors
      logger.error(
        `Gemini SDK error in generateContent for model ${effectiveModelName}:`,
        error
      );
      const errorMessage =
        error instanceof Error ? error.message : "Unknown SDK error";
      throw new GeminiApiError(errorMessage, error);
    }
  }

  /**
   * Generates streaming content based on a prompt.
   * @param prompt - The input prompt string.
   * @param modelName - The name of the Gemini model to use.
   * @param generationConfig - Optional generation configuration.
   * @param safetySettings - Optional safety settings.
   * @param systemInstruction - Optional system instruction.
   * @param cachedContentName - Optional cached content name.
   */
  public async *generateContentStream(
    prompt: string,
    modelName?: string,
    generationConfig?: GenerationConfig,
    safetySettings?: SafetySetting[],
    systemInstruction?: Content,
    cachedContentName?: string
  ): AsyncGenerator<string, void, undefined> {
    const effectiveModelName = modelName ?? this.defaultModelName;
    if (!effectiveModelName) {
      throw new GeminiApiError(
        "Model name must be provided either as a parameter or via the GOOGLE_GEMINI_MODEL environment variable."
      );
    }
    logger.debug(
      `generateContentStream called with model: ${effectiveModelName}`
    );

    try {
      // Construct the config object for the SDK call using GenerateContentConfig
      const callConfig: GenerateContentConfig = {};

      if (generationConfig) {
        // Copy generationConfig properties into callConfig
        for (const [key, value] of Object.entries(generationConfig)) {
          (callConfig as any)[key] = value;
        }
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

      // Create the generate content parameters using the SDK's interfaces
      const params: GenerateContentParameters = {
        model: effectiveModelName,
        contents: [{ role: "user", parts: [{ text: prompt }] }], // Updated to match latest SDK format
        config: Object.keys(callConfig).length > 0 ? callConfig : undefined,
      };

      // Call the SDK's streaming method - AWAIT it to get the generator
      const streamGenerator =
        await this.genAI.models.generateContentStream(params);

      // Iterate directly over the generator
      for await (const chunk of streamGenerator) {
        // Check promptFeedback for safety blocks (might appear in first chunk)
        if (chunk.promptFeedback?.blockReason === BlockedReason.SAFETY) {
          logger.warn(
            `Gemini prompt blocked due to SAFETY for model ${effectiveModelName} during stream. Throwing error.`
          );
          throw new GeminiApiError("Prompt blocked due to safety settings.", {
            blockReason: chunk.promptFeedback.blockReason,
            safetyRatings: chunk.promptFeedback.safetyRatings,
          });
        }

        // Use the helper property if available in newer SDK versions
        if (chunk.text !== undefined) {
          yield chunk.text;
          continue;
        }

        // Access text via candidates structure on each chunk (which is a GenerateContentResponse)
        const firstCandidate = chunk?.candidates?.[0];
        // Check finish reason on the chunk's candidate
        if (firstCandidate?.finishReason === FinishReason.SAFETY) {
          logger.warn(
            `Gemini stream stopped due to SAFETY for model ${effectiveModelName}.`
          );
          throw new GeminiApiError(
            "Content generation stopped during stream due to safety settings.",
            {
              finishReason: firstCandidate.finishReason,
              safetyRatings: firstCandidate.safetyRatings,
            }
          );
        }

        const firstPart = firstCandidate?.content?.parts?.[0];
        if (
          firstPart &&
          "text" in firstPart &&
          typeof firstPart.text === "string"
        ) {
          const textChunk = firstPart.text;
          // Yield all text parts, even if empty during streaming
          yield textChunk;
        } else {
          // Log if a chunk doesn't have the expected text structure, but continue streaming
          // unless it's the end due to other reasons.
          if (
            firstCandidate?.finishReason &&
            firstCandidate.finishReason !== FinishReason.STOP &&
            firstCandidate.finishReason !== FinishReason.MAX_TOKENS
          ) {
            logger.warn(
              `Stream chunk for model ${effectiveModelName} did not contain expected text structure. FinishReason: ${firstCandidate.finishReason}`
            );
            console.error(
              "Actual chunk structure:",
              JSON.stringify(chunk, null, 2)
            );
          }
        }
      }
      logger.debug(`Stream finished for model ${effectiveModelName}.`);
    } catch (error: unknown) {
      // Handle specific error thrown above for SAFETY finish reason
      if (
        error instanceof GeminiApiError &&
        error.message.includes("safety settings")
      ) {
        throw error; // Re-throw the specific error
      }
      logger.error(
        `Gemini SDK error in generateContentStream for model ${effectiveModelName}:`,
        error
      );
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Unknown SDK error during stream";
      // Throw the specific custom error
      throw new GeminiApiError(`Stream Error: ${errorMessage}`, error);
    }
  }

  /**
   * Generates content with function calling enabled and returns the function call request or text.
   * @param modelName - The name of the Gemini model to use.
   * @param prompt - The input prompt string.
   * @param functionDeclarations - Declarations of functions the model can call.
   * @param generationConfig - Optional generation configuration.
   * @param safetySettings - Optional safety settings.
   * @param toolConfig - Optional tool configuration (e.g., function calling mode).
   * @returns An object containing either { functionCall: {...} } or { text: "..." }
   */
  public async generateFunctionCallRequest(
    prompt: string,
    functionDeclarations: FunctionDeclaration[],
    modelName?: string, // Already marked optional, ensure signature matches usage
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
    logger.debug(
      `generateFunctionCallRequest called with model: ${effectiveModelName}`
    );

    try {
      // Construct the tools array for the SDK
      const tools: Tool[] = [{ functionDeclarations }];

      // Construct the config object for the SDK call
      const callConfig: any = {}; // Use 'any' or let TS infer
      if (generationConfig) {
        Object.assign(callConfig, generationConfig);
      }
      if (safetySettings) {
        callConfig.safetySettings = safetySettings;
      }
      if (toolConfig) {
        callConfig.toolConfig = toolConfig;
      }
      // Always pass tools for function calling
      callConfig.tools = tools;

      // Call generateContent, passing ALL optional configs within the 'config' object
      const result: GenerateContentResponse =
        await this.genAI.models.generateContent({
          model: effectiveModelName, // Use the determined model name
          contents: [{ role: "user", parts: [{ text: prompt }] }], // Updated to match latest SDK format
          ...(Object.keys(callConfig).length > 0 && { config: callConfig }),
        });

      // Check promptFeedback for safety blocks first
      if (result.promptFeedback?.blockReason === BlockedReason.SAFETY) {
        logger.warn(
          `Gemini prompt blocked due to SAFETY for model ${effectiveModelName} (function call mode). Throwing error.`
        );
        throw new GeminiApiError("Prompt blocked due to safety settings.", {
          blockReason: result.promptFeedback.blockReason,
          safetyRatings: result.promptFeedback.safetyRatings,
        });
      }

      // Check response for function calls first using the candidates structure
      const firstCandidate = result?.candidates?.[0];
      let requestedFunctionCall: FunctionCall | undefined = undefined;
      let responseText: string | undefined = undefined;

      // Check finish reason first on the candidate
      if (firstCandidate?.finishReason === FinishReason.SAFETY) {
        logger.warn(
          `Gemini function call request stopped due to SAFETY for model ${effectiveModelName}. Throwing error.`
        );
        throw new GeminiApiError(
          "Content generation stopped due to safety settings.",
          {
            finishReason: firstCandidate.finishReason,
            safetyRatings: firstCandidate.safetyRatings,
          }
        );
      }

      // Iterate through parts to find function calls or text
      if (firstCandidate?.content?.parts) {
        for (const part of firstCandidate.content.parts) {
          if ("functionCall" in part && part.functionCall) {
            requestedFunctionCall = part.functionCall;
            logger.debug(
              `Function call requested by model ${effectiveModelName}: ${requestedFunctionCall.name}`
            ); // Use effectiveModelName in log
            break;
          } else if (
            "text" in part &&
            typeof part.text === "string" &&
            !responseText
          ) {
            responseText = part.text;
          }
        }
      }

      // Return based on what was found
      if (requestedFunctionCall) {
        return { functionCall: requestedFunctionCall };
      } else if (responseText !== undefined) {
        // Check if text was found, even if empty
        logger.debug(
          `Text response received from function call request for model ${effectiveModelName}.`
        );
        return { text: responseText }; // Return text, potentially empty
      }
      // If neither function call nor text found, check finish reason again
      else if (
        firstCandidate?.finishReason === FinishReason.MAX_TOKENS ||
        firstCandidate?.finishReason === FinishReason.STOP
      ) {
        logger.warn(
          `Gemini response stopped due to ${firstCandidate.finishReason} for model ${effectiveModelName} (function call mode). Returning empty response.`
        );
        return {}; // Return empty object indicating neither text nor function call due to limit
      }

      // If still nothing found and reason isn't acceptable
      logger.warn(
        `Gemini response for model ${effectiveModelName} (function call mode) contained neither function call nor text. FinishReason: ${firstCandidate?.finishReason}`
      );
      console.error(
        "Actual response structure:",
        JSON.stringify(result, null, 2)
      );
      throw new Error(
        "No function call or text content found in Gemini response."
      );
    } catch (error: unknown) {
      // Handle specific error thrown above for SAFETY finish reason
      if (
        error instanceof GeminiApiError &&
        error.message.includes("safety settings")
      ) {
        throw error; // Re-throw the specific error
      }
      logger.error(
        `Gemini SDK error in generateFunctionCallRequest for model ${effectiveModelName}:`,
        error
      );
      const errorMessage =
        error instanceof Error ? error.message : "Unknown SDK error";
      // Throw the specific custom error
      throw new GeminiApiError(errorMessage, error);
    }
  }

  // --- New Chat Session Methods ---

  /**
   * Starts a new chat session and returns its unique ID.
   * @param modelName - The name of the Gemini model to use.
   * @param history - Optional initial conversation history.
   * @param generationConfig - Optional session-wide generation configuration.
   * @param safetySettings - Optional session-wide safety settings.
   * @param tools - Optional tools for function calling.
   * @param systemInstruction - Optional system instruction.
   * @param cachedContentName - Optional cached content name.
   * @returns The unique session ID.
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
    logger.debug(`Starting new chat session with model: ${effectiveModelName}`);
    try {
      // Construct the config object for createChat with GenerateContentConfig
      const createChatConfig: GenerateContentConfig = {};

      if (generationConfig) {
        // Copy generationConfig properties into createChatConfig
        for (const [key, value] of Object.entries(generationConfig)) {
          (createChatConfig as any)[key] = value;
        }
      }

      if (safetySettings) {
        createChatConfig.safetySettings = safetySettings;
      }

      if (tools) {
        createChatConfig.tools = tools;
      }

      if (systemInstruction) {
        createChatConfig.systemInstruction = systemInstruction;
      }

      if (cachedContentName) {
        createChatConfig.cachedContent = cachedContentName;
      }

      // Use typed CreateChatParameters
      const params = {
        model: effectiveModelName,
        history,
        config:
          Object.keys(createChatConfig).length > 0
            ? createChatConfig
            : undefined,
      };

      const chatSession = this.genAI.chats.create(params);
      const sessionId = uuidv4();
      this.chatSessions.set(sessionId, chatSession);
      logger.info(
        `Started chat session ${sessionId} with model ${effectiveModelName}`
      );
      return sessionId;
    } catch (error: unknown) {
      logger.error(
        `Error starting chat session with model ${effectiveModelName}:`,
        error
      );
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Unknown SDK error starting chat";
      throw new GeminiApiError(errorMessage, error);
    }
  }

  /**
   * Retrieves an active chat session by its ID.
   * @param sessionId - The unique ID of the session.
   * @returns The Chat instance.
   * @throws GeminiApiError if the session ID is not found.
   */
  private getChatSession(sessionId: string): Chat {
    // Use correct Chat type
    const session = this.chatSessions.get(sessionId);
    if (!session) {
      logger.warn(`Chat session not found: ${sessionId}`);
      throw new GeminiApiError(
        `Chat session with ID ${sessionId} not found or has expired.`,
        { sessionId }
      );
    }
    return session;
  }

  /**
   * Sends a message to an existing chat session.
   * @param sessionId - The ID of the chat session.
   * @param message - The message content (currently string only).
   * @param generationConfig - Optional per-request generation config.
   * @param safetySettings - Optional per-request safety settings.
   * @param tools - Optional per-request tools definition.
   * @param toolConfig - Optional per-request tool configuration.
   * @param cachedContentName - Optional cached content name.
   * @returns The model's response.
   */
  public async sendMessageToSession(
    sessionId: string,
    message: string, // TODO: Support PartListUnion later
    generationConfig?: GenerationConfig,
    safetySettings?: SafetySetting[],
    tools?: Tool[],
    toolConfig?: ToolConfig,
    cachedContentName?: string
  ): Promise<GenerateContentResponse> {
    logger.debug(`Sending message to session: ${sessionId}`);
    const chatSession = this.getChatSession(sessionId); // Throws if not found

    try {
      // Construct the config object for the SDK call using GenerateContentConfig
      const callConfig: GenerateContentConfig = {};

      if (generationConfig) {
        // Copy generationConfig properties into callConfig
        for (const [key, value] of Object.entries(generationConfig)) {
          (callConfig as any)[key] = value;
        }
      }

      if (safetySettings) {
        callConfig.safetySettings = safetySettings;
      }

      if (tools) {
        callConfig.tools = tools;
      }

      if (toolConfig) {
        callConfig.toolConfig = toolConfig;
      }

      if (cachedContentName) {
        callConfig.cachedContent = cachedContentName;
      }

      // Construct SendMessageParameters object with properly typed config
      const sendMessageParams = {
        message: [{ text: message }], // Update to pass a content part array
        config: Object.keys(callConfig).length > 0 ? callConfig : undefined,
      };

      // Call sendMessage on the specific session instance with a structured params object
      const result = await chatSession.sendMessage(sendMessageParams);

      // Note: The ChatSession object might update its internal history state.
      // We don't need to explicitly save it back to the map unless the SDK requires it
      // (which it typically doesn't for simple in-memory sessions).

      logger.debug(`Received response for session: ${sessionId}`);
      return result;
    } catch (error: unknown) {
      logger.error(`Error sending message to session ${sessionId}:`, error);
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Unknown SDK error sending message";
      throw new GeminiApiError(errorMessage, error); // Wrap SDK errors
    }
  }

  /**
   * Sends function execution results back to an existing chat session.
   * @param sessionId - The ID of the chat session.
   * @param functionResponses - An array of function results from the client.
   * @param generationConfig - Optional per-request generation config.
   * @param safetySettings - Optional per-request safety settings.
   * @returns The model's subsequent response.
   */
  public async sendFunctionResultToSession(
    sessionId: string,
    functionResponses: FunctionResponseInput[], // Use the input type defined in params
    generationConfig?: GenerationConfig,
    safetySettings?: SafetySetting[]
  ): Promise<GenerateContentResponse> {
    logger.debug(`Sending function results to session: ${sessionId}`);
    const chatSession = this.getChatSession(sessionId); // Throws if not found

    try {
      // Format the input results into the SDK's Part structure
      // The SDK expects an array of Part objects for sendMessage
      const functionResponseParts: Part[] = functionResponses.map((fr) => ({
        // Construct the FunctionResponse object as expected by the SDK Part type
        functionResponse: {
          name: fr.name,
          response: fr.response, // Pass the raw response object
        } as FunctionResponse, // Cast to SDK type for clarity
      }));

      // Construct the config object for the SDK call
      const callConfig: any = {};
      if (generationConfig) {
        Object.assign(callConfig, generationConfig);
      }
      if (safetySettings) {
        callConfig.safetySettings = safetySettings;
      }

      // Construct SendMessageParameters object with parts and config
      const sendMessageParams: any = {
        // Use 'any' or define SendMessageParameters type
        message: functionResponseParts, // Pass the array of parts
      };
      if (Object.keys(callConfig).length > 0) {
        sendMessageParams.config = callConfig;
      }

      // Call sendMessage with the single params object
      const result = await chatSession.sendMessage(sendMessageParams);

      logger.debug(
        `Received response after sending function results for session: ${sessionId}`
      );
      return result;
    } catch (error: unknown) {
      logger.error(
        `Error sending function results to session ${sessionId}:`,
        error
      );
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Unknown SDK error sending function results";
      throw new GeminiApiError(errorMessage, error); // Wrap SDK errors
    }
  }

  // TODO: Add method for cleaning up old/inactive sessions from the map if needed

  // --- File Handling Methods ---

  /**
   * Uploads a file to the Gemini API.
   * NOTE: This API is not supported on Vertex AI.
   * @param filePath - Path to the local file to upload.
   * @param fileMetadata - Optional metadata like displayName, mimeType.
   * @returns The metadata of the uploaded file.
   */
  public async uploadFile(
    filePath: string,
    // Use inline type for optional metadata matching SDK structure
    fileMetadataParams?: { displayName?: string; mimeType?: string }
  ): Promise<FileMetadata> {
    logger.debug(`uploadFile called for path: ${filePath}`);
    // TODO: Add check for Vertex AI if a reliable method is found on genAI instance

    try {
      // Define params inline based on expected structure for files.upload
      const uploadParams: {
        file: string;
        fileMetadata?: { displayName?: string; mimeType?: string };
      } = {
        file: filePath,
        ...(fileMetadataParams && { fileMetadata: fileMetadataParams }), // Pass the inline typed object
      };

      // upload returns Promise<GenAIFile> directly
      const sdkFile: GenAIFile = await this.genAI.files.upload(uploadParams);

      // No intermediate response object, sdkFile is the result
      if (!sdkFile) {
        throw new Error("SDK upload operation did not return file metadata.");
      }
      logger.info(`File uploaded successfully: ${sdkFile.name}`);
      return this.mapSdkFileToMetadata(sdkFile);
    } catch (error: unknown) {
      logger.error(
        `Gemini SDK error in uploadFile for path ${filePath}:`,
        error
      );
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Unknown SDK error uploading file";
      throw new GeminiApiError(errorMessage, error);
    }
  }

  /**
   * Lists files uploaded to the Gemini API.
   * NOTE: This API is not supported on Vertex AI.
   * @param pageSize - Maximum number of files per page.
   * @param pageToken - Token for the next page.
   * @returns An object containing the list of file metadata and the next page token.
   */
  public async listFiles(
    pageSize?: number,
    pageToken?: string
  ): Promise<{ files: FileMetadata[]; nextPageToken?: string }> {
    logger.debug(
      `listFiles called with pageSize: ${pageSize}, pageToken: ${pageToken}`
    );
    // TODO: Add check for Vertex AI if a reliable method is found on genAI instance

    try {
      // Use ListFilesParameters type, passing pageSize/pageToken inside config
      const listConfig: ListFilesConfig = {}; // Use the imported type
      if (pageSize !== undefined) listConfig.pageSize = pageSize;
      if (pageToken !== undefined) listConfig.pageToken = pageToken;
      const listParams: ListFilesParameters = {};
      if (Object.keys(listConfig).length > 0) {
        listParams.config = listConfig;
      }

      const pager: Pager<GenAIFile> = await this.genAI.files.list(listParams);

      // Workaround for latest SDK: Get first page using for await loop
      const files: GenAIFile[] = [];
      for await (const file of pager) {
        files.push(file);
        // Break after first batch, assuming SDK respects pageSize
        if (pageSize && files.length >= pageSize) break;
      }
      // Still use any to access nextPageToken as it might not be exposed in type
      const nextPageToken = (pager as any).nextPageToken;

      const filesMetadata = files.map(this.mapSdkFileToMetadata);
      logger.info(
        `Listed ${filesMetadata.length} files. NextPageToken: ${nextPageToken || "None"}`
      );
      return { files: filesMetadata, nextPageToken };
    } catch (error: unknown) {
      logger.error(`Gemini SDK error in listFiles:`, error);
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Unknown SDK error listing files";
      throw new GeminiApiError(errorMessage, error);
    }
  }

  /**
   * Gets metadata for a specific file from the Gemini API.
   * NOTE: This API is not supported on Vertex AI.
   * @param fileName - The unique name of the file (e.g., "files/abc123xyz").
   * @returns The metadata of the requested file.
   */
  public async getFile(fileName: string): Promise<FileMetadata> {
    logger.debug(`getFile called for name: ${fileName}`);
    // TODO: Add check for Vertex AI if a reliable method is found on genAI instance
    if (!fileName || !fileName.startsWith("files/")) {
      throw new GeminiApiError(
        'Invalid file name format. Must start with "files/".',
        { fileName }
      );
    }

    try {
      // Use GetFileParameters type
      const getParams: GetFileParameters = { name: fileName };
      const sdkFile: GenAIFile = await this.genAI.files.get(getParams); // Returns GenAIFile directly
      logger.info(`Retrieved file metadata for: ${sdkFile.name}`);
      return this.mapSdkFileToMetadata(sdkFile);
    } catch (error: unknown) {
      logger.error(`Gemini SDK error in getFile for name ${fileName}:`, error);
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Unknown SDK error getting file";
      // Check for specific "not found" errors if possible, otherwise wrap generically
      throw new GeminiApiError(errorMessage, error);
    }
  }

  /**
   * Deletes a specific file from the Gemini API.
   * NOTE: This API is not supported on Vertex AI.
   * @param fileName - The unique name of the file to delete (e.g., "files/abc123xyz").
   * @returns A success confirmation object.
   */
  public async deleteFile(fileName: string): Promise<{ success: boolean }> {
    logger.debug(`deleteFile called for name: ${fileName}`);
    // TODO: Add check for Vertex AI if a reliable method is found on genAI instance
    if (!fileName || !fileName.startsWith("files/")) {
      throw new GeminiApiError(
        'Invalid file name format. Must start with "files/".',
        { fileName }
      );
    }

    try {
      // Use DeleteFileParameters type
      const deleteParams: DeleteFileParameters = { name: fileName };
      await this.genAI.files.delete(deleteParams); // Returns void or empty object
      logger.info(`Successfully deleted file: ${fileName}`);
      return { success: true }; // Assume success if no error thrown
    } catch (error: unknown) {
      logger.error(
        `Gemini SDK error in deleteFile for name ${fileName}:`,
        error
      );
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Unknown SDK error deleting file";
      // Check for specific "not found" errors if possible, otherwise wrap generically
      throw new GeminiApiError(errorMessage, error);
    }
  }

  /**
   * Helper method to map the SDK's File object to our FileMetadata interface.
   * Handles potential differences in structure or naming and missing required fields.
   */
  private mapSdkFileToMetadata(sdkFile: GenAIFile): FileMetadata {
    // Validate required fields from SDK object
    if (!sdkFile.name)
      throw new GeminiApiError("SDK File object missing required field: name", {
        sdkFile,
      });
    if (!sdkFile.mimeType)
      throw new GeminiApiError(
        "SDK File object missing required field: mimeType",
        { sdkFile }
      );
    if (sdkFile.sizeBytes === undefined || sdkFile.sizeBytes === null)
      throw new GeminiApiError(
        "SDK File object missing required field: sizeBytes",
        { sdkFile }
      );
    if (!sdkFile.createTime)
      throw new GeminiApiError(
        "SDK File object missing required field: createTime",
        { sdkFile }
      );
    if (!sdkFile.updateTime)
      throw new GeminiApiError(
        "SDK File object missing required field: updateTime",
        { sdkFile }
      );
    if (!sdkFile.sha256Hash)
      throw new GeminiApiError(
        "SDK File object missing required field: sha256Hash",
        { sdkFile }
      );
    if (!sdkFile.uri)
      throw new GeminiApiError("SDK File object missing required field: uri", {
        sdkFile,
      });
    if (!sdkFile.state)
      throw new GeminiApiError(
        "SDK File object missing required field: state",
        { sdkFile }
      );

    // Helper to safely convert Date or string to ISO string
    const formatTime = (
      time: string | Date | undefined
    ): string | undefined => {
      if (!time) return undefined;
      // Check if it's a Date object before calling toISOString
      if (time instanceof Date) {
        return time.toISOString();
      }
      // Otherwise, assume it's already a string
      return String(time);
    };

    // Perform mapping
    const metadata: FileMetadata = {
      name: sdkFile.name,
      displayName: sdkFile.displayName,
      mimeType: sdkFile.mimeType,
      sizeBytes: String(sdkFile.sizeBytes), // Ensure string
      createTime: formatTime(sdkFile.createTime)!, // Use helper, assert non-null based on check above
      updateTime: formatTime(sdkFile.updateTime)!, // Use helper, assert non-null based on check above
      expirationTime: formatTime(sdkFile.expirationTime), // Optional
      sha256Hash: sdkFile.sha256Hash,
      uri: sdkFile.uri,
      state: sdkFile.state as FileMetadata["state"],
    };
    return metadata;
  }

  // --- Caching Methods ---

  /**
   * Creates cached content for a compatible model.
   * @param modelName - The model name (e.g., 'gemini-1.5-flash').
   * @param contents - The content to cache.
   * @param options - Optional parameters like displayName, ttl, systemInstruction, tools, toolConfig.
   * @returns Metadata of the created cache.
   */
  public async createCache(
    contents: Content[],
    modelName?: string,
    options?: {
      displayName?: string;
      systemInstruction?: Content;
      ttl?: string;
      tools?: Tool[];
      toolConfig?: ToolConfig;
    }
  ): Promise<CachedContentMetadata> {
    const effectiveModelName = modelName ?? this.defaultModelName;
    if (!effectiveModelName) {
      throw new GeminiApiError(
        "Model name must be provided either as a parameter or via the GOOGLE_GEMINI_MODEL environment variable."
      );
    }
    logger.debug(`createCache called for model: ${effectiveModelName}`);
    // TODO: Add explicit model compatibility check here? Or rely on SDK error.
    try {
      const createConfig: CreateCachedContentConfig = {
        contents: contents, // Pass contents inside config
        ...(options?.displayName && { displayName: options.displayName }),
        ...(options?.ttl && { ttl: options.ttl }),
        ...(options?.systemInstruction && {
          systemInstruction: options.systemInstruction,
        }),
        ...(options?.tools && { tools: options.tools }),
        ...(options?.toolConfig && { toolConfig: options.toolConfig }),
      };
      const createParams: CreateCachedContentParameters = {
        model: effectiveModelName, // Use the determined model name
        config: createConfig,
      };

      const sdkCache: CachedContent =
        await this.genAI.caches.create(createParams);

      if (!sdkCache) {
        throw new Error(
          "SDK create cache operation did not return cache metadata."
        );
      }
      logger.info(`Cache created successfully: ${sdkCache.name}`);
      return this.mapSdkCacheToMetadata(sdkCache);
    } catch (error: unknown) {
      logger.error(
        `Gemini SDK error in createCache for model ${effectiveModelName}:`,
        error
      );
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Unknown SDK error creating cache";
      throw new GeminiApiError(errorMessage, error);
    }
  }

  /**
   * Lists cached content.
   * @param pageSize - Maximum number of caches per page.
   * @param pageToken - Token for the next page.
   * @returns An object containing the list of cache metadata and the next page token.
   */
  public async listCaches(
    pageSize?: number,
    pageToken?: string
  ): Promise<{ caches: CachedContentMetadata[]; nextPageToken?: string }> {
    logger.debug(
      `listCaches called with pageSize: ${pageSize}, pageToken: ${pageToken}`
    );
    try {
      const listConfig: ListCachedContentsConfig = {};
      if (pageSize !== undefined) listConfig.pageSize = pageSize;
      if (pageToken !== undefined) listConfig.pageToken = pageToken;
      const listParams: ListCachedContentsParameters = {};
      if (Object.keys(listConfig).length > 0) {
        listParams.config = listConfig;
      }

      // list returns a Pager<CachedContent>
      const pager: Pager<CachedContent> =
        await this.genAI.caches.list(listParams);

      // Workaround for latest SDK: Get first page using for await loop
      const caches: CachedContent[] = [];
      for await (const cache of pager) {
        caches.push(cache);
        // Break after first batch, assuming SDK respects pageSize
        if (pageSize && caches.length >= pageSize) break;
      }
      // Still use any to access nextPageToken as it might not be exposed in type
      const nextPageToken = (pager as any).nextPageToken;

      const cachesMetadata = caches.map(this.mapSdkCacheToMetadata);
      logger.info(
        `Listed ${cachesMetadata.length} caches. NextPageToken: ${nextPageToken || "None"}`
      );
      return { caches: cachesMetadata, nextPageToken };
    } catch (error: unknown) {
      logger.error(`Gemini SDK error in listCaches:`, error);
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Unknown SDK error listing caches";
      throw new GeminiApiError(errorMessage, error);
    }
  }

  /**
   * Gets metadata for a specific cache.
   * @param cacheName - The unique name of the cache (e.g., "cachedContents/abc123xyz").
   * @returns The metadata of the requested cache.
   */
  public async getCache(cacheName: string): Promise<CachedContentMetadata> {
    logger.debug(`getCache called for name: ${cacheName}`);
    if (!cacheName || !cacheName.startsWith("cachedContents/")) {
      throw new GeminiApiError(
        'Invalid cache name format. Must start with "cachedContents/".',
        { cacheName }
      );
    }
    try {
      const getParams: GetCachedContentParameters = { name: cacheName };
      const sdkCache: CachedContent = await this.genAI.caches.get(getParams);
      logger.info(`Retrieved cache metadata for: ${sdkCache.name}`);
      return this.mapSdkCacheToMetadata(sdkCache);
    } catch (error: unknown) {
      logger.error(
        `Gemini SDK error in getCache for name ${cacheName}:`,
        error
      );
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Unknown SDK error getting cache";
      throw new GeminiApiError(errorMessage, error);
    }
  }

  /**
   * Updates metadata (TTL, displayName) for a specific cache.
   * @param cacheName - The unique name of the cache.
   * @param updates - Object containing optional `ttl` and/or `displayName`.
   * @returns The updated metadata of the cache.
   */
  public async updateCache(
    cacheName: string,
    updates: { ttl?: string; displayName?: string }
  ): Promise<CachedContentMetadata> {
    logger.debug(`updateCache called for name: ${cacheName}`);
    if (!cacheName || !cacheName.startsWith("cachedContents/")) {
      throw new GeminiApiError(
        'Invalid cache name format. Must start with "cachedContents/".',
        { cacheName }
      );
    }
    try {
      const updateConfig: UpdateCachedContentConfig = { ...updates }; // Pass updates in config
      const updateParams: UpdateCachedContentParameters = {
        name: cacheName,
        config: updateConfig,
      };
      const sdkCache: CachedContent =
        await this.genAI.caches.update(updateParams);
      logger.info(`Updated cache metadata for: ${sdkCache.name}`);
      return this.mapSdkCacheToMetadata(sdkCache);
    } catch (error: unknown) {
      logger.error(
        `Gemini SDK error in updateCache for name ${cacheName}:`,
        error
      );
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Unknown SDK error updating cache";
      throw new GeminiApiError(errorMessage, error);
    }
  }

  /**
   * Deletes a specific cache.
   * @param cacheName - The unique name of the cache to delete.
   * @returns A success confirmation object.
   */
  public async deleteCache(cacheName: string): Promise<{ success: boolean }> {
    logger.debug(`deleteCache called for name: ${cacheName}`);
    if (!cacheName || !cacheName.startsWith("cachedContents/")) {
      throw new GeminiApiError(
        'Invalid cache name format. Must start with "cachedContents/".',
        { cacheName }
      );
    }
    try {
      const deleteParams: DeleteCachedContentParameters = { name: cacheName };
      await this.genAI.caches.delete(deleteParams); // Returns void or empty object
      logger.info(`Successfully deleted cache: ${cacheName}`);
      return { success: true };
    } catch (error: unknown) {
      logger.error(
        `Gemini SDK error in deleteCache for name ${cacheName}:`,
        error
      );
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Unknown SDK error deleting cache";
      throw new GeminiApiError(errorMessage, error);
    }
  }

  /**
   * Helper method to map the SDK's CachedContent object to our CachedContentMetadata interface.
   */
  private mapSdkCacheToMetadata(
    sdkCache: CachedContent
  ): CachedContentMetadata {
    // Validate required fields
    if (!sdkCache.name)
      throw new GeminiApiError(
        "SDK CachedContent object missing required field: name",
        { sdkCache }
      );
    if (!sdkCache.model)
      throw new GeminiApiError(
        "SDK CachedContent object missing required field: model",
        { sdkCache }
      );
    if (!sdkCache.createTime)
      throw new GeminiApiError(
        "SDK CachedContent object missing required field: createTime",
        { sdkCache }
      );
    if (!sdkCache.updateTime)
      throw new GeminiApiError(
        "SDK CachedContent object missing required field: updateTime",
        { sdkCache }
      );
    // sizeBytes might be missing in some SDK versions or states, handle optionality
    // if (sdkCache.sizeBytes === undefined || sdkCache.sizeBytes === null) throw new GeminiApiError('SDK CachedContent object missing required field: sizeBytes', { sdkCache });

    // Helper to safely convert Date or string to ISO string
    const formatTime = (
      time: string | Date | undefined
    ): string | undefined => {
      if (!time) return undefined;
      return typeof time === "string" ? time : time.toISOString();
    };

    const metadata: CachedContentMetadata = {
      name: sdkCache.name,
      displayName: sdkCache.displayName,
      model: sdkCache.model,
      createTime: formatTime(sdkCache.createTime)!,
      updateTime: formatTime(sdkCache.updateTime)!,
      expireTime: formatTime(sdkCache.expireTime),
      // sizeBytes removed as it doesn't exist on SDK type
      usageMetadata: sdkCache.usageMetadata
        ? {
            // Map usageMetadata if present
            totalTokenCount: sdkCache.usageMetadata.totalTokenCount,
            // map other usage fields if they exist
          }
        : undefined,
    };
    return metadata;
  }

  /**
   * Generates images based on a text prompt using Gemini models.
   * @param prompt - The text prompt describing the desired image.
   * @param modelName - Optional. The name of the Gemini model to use (e.g., 'gemini-2.5-flash').
   * @param resolution - Optional. The desired resolution (default: '1024x1024').
   * @param numberOfImages - Optional. Number of images to generate (1-4, default: 1).
   * @param safetySettings - Optional. Safety settings to apply.
   * @param negativePrompt - Optional. Text description of features to avoid.
   * @returns Generated images with metadata.
   */
  /**
   * Detects objects in an image and returns their locations and descriptions.
   * @param imagePart - The image to analyze as a Part object (contains both data and mimeType).
   * @param promptAddition - Optional additional text to customize detection behavior.
   * @param modelName - Optional. The name of the Gemini model to use.
   * @param safetySettings - Optional safety settings to apply.
   * @returns Object detection results with normalized bounding box coordinates.
   */
  public async detectObjects(
    imagePart: Part,
    promptAddition?: string,
    modelName?: string,
    safetySettings?: SafetySetting[]
  ): Promise<ObjectDetectionResult> {
    const effectiveModelName = modelName ?? this.defaultModelName;
    if (!effectiveModelName) {
      throw new GeminiApiError(
        "Model name must be provided either as a parameter or via the GOOGLE_GEMINI_MODEL environment variable."
      );
    }
    logger.debug(`detectObjects called with model: ${effectiveModelName}`);

    try {
      // Validate image part has required fields
      if (!imagePart || !("inlineData" in imagePart) || !imagePart.inlineData) {
        throw new GeminiApiError("Invalid image part: missing inlineData", { imagePart });
      }

      // Construct the base prompt for bounding box detection
      let prompt = "Detect all objects in this image. For each object detected, return:";
      prompt += "\n1. A descriptive label";
      prompt += "\n2. Bounding box coordinates [ymin, xmin, ymax, xmax] normalized to 0-1000 scale";
      prompt += "\n3. A confidence score between 0 and 1 if applicable";
      prompt += "\nFormat the response as a valid JSON array of objects.";

      // Add any custom prompt additions
      if (promptAddition) {
        prompt += `\nAdditional instructions: ${promptAddition}`;
      }

      // Construct the config object
      const callConfig: GenerateContentConfig = {};
      if (safetySettings) {
        callConfig.safetySettings = safetySettings;
      }

      // Create the generate content parameters
      const params: GenerateContentParameters = {
        model: effectiveModelName,
        contents: [{ 
          role: "user", 
          parts: [
            { text: prompt },
            imagePart
          ]
        }],
        config: Object.keys(callConfig).length > 0 ? callConfig : undefined,
      };

      // Call the model
      const result: GenerateContentResponse = await this.genAI.models.generateContent(params);

      // Check for safety blocks
      if (result.promptFeedback?.blockReason === BlockedReason.SAFETY) {
        logger.warn(
          `Object detection blocked due to SAFETY for model ${effectiveModelName}. Throwing error.`
        );
        throw new GeminiApiError("Object detection blocked due to safety settings.", {
          blockReason: result.promptFeedback.blockReason,
          safetyRatings: result.promptFeedback.safetyRatings,
        });
      }

      // Get the response text
      let responseText: string | undefined;
      if (result.text !== undefined) {
        responseText = result.text;
      } else {
        const firstCandidate = result.candidates?.[0];
        if (firstCandidate?.finishReason === FinishReason.SAFETY) {
          throw new GeminiApiError(
            "Object detection stopped due to safety settings.",
            {
              finishReason: firstCandidate.finishReason,
              safetyRatings: firstCandidate.safetyRatings,
            }
          );
        }
        const firstPart = firstCandidate?.content?.parts?.[0];
        if (firstPart && "text" in firstPart && typeof firstPart.text === "string") {
          responseText = firstPart.text;
        }
      }

      if (!responseText) {
        logger.warn(
          `No text response received for object detection with model ${effectiveModelName}.`
        );
        return {
          objects: [],
          promptSafetyMetadata: {
            blocked: true,
            reasons: ["No response generated"],
          }
        };
      }

      // Try to parse the JSON response
      try {
        const detectedObjects = JSON.parse(responseText);
        if (!Array.isArray(detectedObjects)) {
          throw new Error("Response is not an array");
        }

        // Process and validate each object
        const objects = detectedObjects.map((obj: any) => {
          // Basic validation of required fields
          if (!obj.label || !Array.isArray(obj.boundingBox) || obj.boundingBox.length !== 4) {
            throw new Error(`Invalid object format: ${JSON.stringify(obj)}`);
          }

          // Normalize and validate coordinates
          const [yMin, xMin, yMax, xMax] = obj.boundingBox.map((coord: number) => {
            if (typeof coord !== "number" || coord < 0 || coord > 1000) {
              throw new Error(`Invalid coordinate value: ${coord}`);
            }
            return coord;
          });

          return {
            label: String(obj.label),
            boundingBox: { yMin, xMin, yMax, xMax },
            ...(obj.confidence !== undefined && {
              confidence: Number(obj.confidence)
            })
          };
        });

        return {
          objects,
          promptSafetyMetadata: result.promptFeedback ? {
            blocked: false,
            reasons: result.promptFeedback.safetyRatings?.map(r => r.category)
          } : undefined
        };
      } catch (parseError) {
        logger.error(
          `Failed to parse object detection response as JSON for model ${effectiveModelName}:`,
          parseError
        );
        // Return the raw text for potential debugging or alternate parsing
        return {
          objects: [],
          rawText: responseText,
          promptSafetyMetadata: {
            blocked: true,
            reasons: [`Failed to parse response: ${parseError.message}`]
          }
        };
      }
    } catch (error: unknown) {
      // Handle specific error thrown above for SAFETY issues
      if (
        error instanceof GeminiApiError &&
        error.message.includes("safety settings")
      ) {
        throw error; // Re-throw the specific error
      }
      // Handle other errors
      logger.error(
        `Gemini SDK error in detectObjects for model ${effectiveModelName}:`,
        error
      );
      const errorMessage =
        error instanceof Error ? error.message : "Unknown SDK error";
      throw new GeminiApiError(errorMessage, error);
    }
  }

  public async detectObjects(
    imagePart: Part,
    promptAddition?: string,
    modelName?: string,
    safetySettings?: SafetySetting[]
  ): Promise<ObjectDetectionResult> {
    const effectiveModelName = modelName ?? this.defaultModelName;
    if (!effectiveModelName) {
      throw new GeminiApiError(
        "Model name must be provided either as a parameter or via the GOOGLE_GEMINI_MODEL environment variable."
      );
    }
    logger.debug(`detectObjects called with model: ${effectiveModelName}`);

    try {
      // Validate image part has required fields
      if (!imagePart || !("inlineData" in imagePart) || !imagePart.inlineData) {
        throw new GeminiApiError("Invalid image part: missing inlineData", { imagePart });
      }

      // ... rest of method implementation ...
    } catch (error: unknown) {
      // ... error handling ...
    }
  }

  /**
   * Analyzes visual content like charts and diagrams to extract information.
   * @param imagePart - The image to analyze as a Part object (contains both data and mimeType).
   * @param prompt - Instructions for analyzing the image (e.g., "Extract metrics from this chart").
   * @param structuredOutput - Whether to return structured JSON data (defaults to false).
   * @param modelName - Optional. The name of the Gemini model to use.
   * @param safetySettings - Optional safety settings to apply.
   * @returns Analysis results with extracted information.
   */
  public async analyzeContent(
    imagePart: Part,
    prompt: string,
    structuredOutput: boolean = false,
    modelName?: string,
    safetySettings?: SafetySetting[]
  ): Promise<ContentUnderstandingResult> {
    const effectiveModelName = modelName ?? this.defaultModelName;
    if (!effectiveModelName) {
      throw new GeminiApiError(
        "Model name must be provided either as a parameter or via the GOOGLE_GEMINI_MODEL environment variable."
      );
    }
    logger.debug(`analyzeContent called with model: ${effectiveModelName}`);

    try {
      // Validate image part has required fields
      if (!imagePart || !("inlineData" in imagePart) || !imagePart.inlineData) {
        throw new GeminiApiError("Invalid image part: missing inlineData", { imagePart });
      }

      // Modify prompt if structured output is requested
      let effectivePrompt = prompt;
      if (structuredOutput) {
        effectivePrompt += "\nFormat your response as a valid JSON object with appropriate fields for the extracted information.";
      }

      // Construct the config object
      const callConfig: GenerateContentConfig = {};
      if (safetySettings) {
        callConfig.safetySettings = safetySettings;
      }

      // Create the generate content parameters
      const params: GenerateContentParameters = {
        model: effectiveModelName,
        contents: [{ 
          role: "user", 
          parts: [
            { text: effectivePrompt },
            imagePart
          ]
        }],
        config: Object.keys(callConfig).length > 0 ? callConfig : undefined,
      };

      // Call the model
      const result: GenerateContentResponse = await this.genAI.models.generateContent(params);

      // Check for safety blocks
      if (result.promptFeedback?.blockReason === BlockedReason.SAFETY) {
        logger.warn(
          `Content analysis blocked due to SAFETY for model ${effectiveModelName}. Throwing error.`
        );
        throw new GeminiApiError("Content analysis blocked due to safety settings.", {
          blockReason: result.promptFeedback.blockReason,
          safetyRatings: result.promptFeedback.safetyRatings,
        });
      }

      // Get the response text
      let responseText: string | undefined;
      if (result.text !== undefined) {
        responseText = result.text;
      } else {
        const firstCandidate = result.candidates?.[0];
        if (firstCandidate?.finishReason === FinishReason.SAFETY) {
          throw new GeminiApiError(
            "Content analysis stopped due to safety settings.",
            {
              finishReason: firstCandidate.finishReason,
              safetyRatings: firstCandidate.safetyRatings,
            }
          );
        }
        const firstPart = firstCandidate?.content?.parts?.[0];
        if (firstPart && "text" in firstPart && typeof firstPart.text === "string") {
          responseText = firstPart.text;
        }
      }

      if (!responseText) {
        logger.warn(
          `No text response received for content analysis with model ${effectiveModelName}.`
        );
        return {
          analysis: {},
          promptSafetyMetadata: {
            blocked: true,
            reasons: ["No response generated"],
          }
        };
      }

      // Try to parse JSON if structured output was requested
      if (structuredOutput) {
        try {
          const jsonData = JSON.parse(responseText);
          return {
            analysis: {
              data: jsonData,
            },
            promptSafetyMetadata: result.promptFeedback ? {
              blocked: false,
              reasons: result.promptFeedback.safetyRatings?.map(r => r.category)
            } : undefined
          };
        } catch (parseError) {
          logger.error(
            `Failed to parse content analysis response as JSON for model ${effectiveModelName}:`,
            parseError
          );
          // Fall back to returning raw text
          return {
            analysis: {
              text: responseText
            },
            rawText: responseText,
            promptSafetyMetadata: {
              blocked: false,
              reasons: [`Failed to parse JSON: ${parseError.message}`]
            }
          };
        }
      }

      // Return natural language analysis
      return {
        analysis: {
          text: responseText
        },
        promptSafetyMetadata: result.promptFeedback ? {
          blocked: false,
          reasons: result.promptFeedback.safetyRatings?.map(r => r.category)
        } : undefined
      };

    } catch (error: unknown) {
      // Handle specific error thrown above for SAFETY issues
      if (
        error instanceof GeminiApiError &&
        error.message.includes("safety settings")
      ) {
        throw error; // Re-throw the specific error
      }
      // Handle other errors
      logger.error(
        `Gemini SDK error in analyzeContent for model ${effectiveModelName}:`,
        error
      );
      const errorMessage =
        error instanceof Error ? error.message : "Unknown SDK error";
      throw new GeminiApiError(errorMessage, error);
    }
  }

  public async generateImage(
    prompt: string,
    modelName?: string,
    resolution?: string, // '512x512' | '1024x1024' | '1536x1536'
    numberOfImages?: number,
    safetySettings?: SafetySetting[],
    negativePrompt?: string
  ): Promise<ImageGenerationResult> {
    const effectiveModelName = modelName ?? this.defaultModelName;
    if (!effectiveModelName) {
      throw new GeminiApiError(
        "Model name must be provided either as a parameter or via the GOOGLE_GEMINI_MODEL environment variable."
      );
    }
    logger.debug(`generateImage called with model: ${effectiveModelName}`);

    try {
      // Construct the config object for the SDK call
      const config: GenerateImagesConfig = {
        resolution,
        numberOfImages: numberOfImages !== undefined ? numberOfImages : 1,
        safetySettings,
        negativePrompt,
      };

      // Create the generate images parameters
      const params: GenerateImagesParameters = {
        model: effectiveModelName,
        prompt,
        config: Object.keys(config).length > 0 ? config : undefined,
      };

      // Call models.generateImages with the parameters
      const result: GenerateImagesResponse = await this.genAI.models.generateImages(params);

      // Check for safety blocks
      if (result.promptFeedback?.blockReason === BlockedReason.SAFETY) {
        logger.warn(
          `Image generation blocked due to SAFETY for model ${effectiveModelName}. Throwing error.`
        );
        throw new GeminiApiError("Image generation blocked due to safety settings.", {
          blockReason: result.promptFeedback.blockReason,
          safetyRatings: result.promptFeedback.safetyRatings,
        });
      }

      // Extract and convert images
      if (!result.generatedImages?.length) {
        logger.warn(
          `No images generated for model ${effectiveModelName}. Check if the model supports image generation.`
        );
        return {
          images: [],
          promptSafetyMetadata: result.promptFeedback
            ? {
                blocked: true,
                reasons: [
                  result.promptFeedback.blockReason ??
                    "Unknown (no images generated)",
                ],
              }
            : undefined,
        };
      }

      // Convert GenAIImage objects to our format
      const images = result.generatedImages.map((genImg) => {
        // Validate required fields
        if (!genImg.image?.data) {
          throw new GeminiApiError(
            "Generated image missing required data field",
            { genImg }
          );
        }
        if (!genImg.image?.mimeType) {
          throw new GeminiApiError(
            "Generated image missing required mimeType field",
            { genImg }
          );
        }

        // Get dimensions from resolution
        let width = 1024, height = 1024; // Default if not specified
        if (resolution) {
          const [w, h] = resolution.split("x").map(Number);
          if (w && h) {
            width = w;
            height = h;
          }
        }

        return {
          base64Data: genImg.image.data,
          mimeType: genImg.image.mimeType,
          width,
          height,
        };
      });

      // Return successfully generated images with any safety metadata
      return {
        images,
        promptSafetyMetadata: result.promptFeedback
          ? {
              blocked: false, // Not blocked since we got images
              reasons: result.promptFeedback.safetyRatings?.map(
                (r) => r.category
              ),
            }
          : undefined,
      };
    } catch (error: unknown) {
      // Handle specific error thrown above for SAFETY finish reason
      if (
        error instanceof GeminiApiError &&
        error.message.includes("safety settings")
      ) {
        throw error; // Re-throw the specific error
      }
      // Handle other errors
      logger.error(
        `Gemini SDK error in generateImage for model ${effectiveModelName}:`,
        error
      );
      const errorMessage =
        error instanceof Error ? error.message : "Unknown SDK error";
      throw new GeminiApiError(errorMessage, error);
    }
  }
}
