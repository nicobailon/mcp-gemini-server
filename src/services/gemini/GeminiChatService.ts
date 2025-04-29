import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { v4 as uuidv4 } from "uuid";
import { GeminiApiError } from "../../utils/errors.js";
import { logger } from "../../utils/logger.js";
import {
  Content,
  GenerationConfig,
  SafetySetting,
  Tool,
  ToolConfig,
  FunctionCall,
  ChatSession,
} from "./GeminiTypes.js";

/**
 * Interface for the parameters of the startChatSession method
 */
export interface StartChatParams {
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
export interface SendMessageParams {
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
export interface SendFunctionResultParams {
  sessionId: string;
  functionResponse: string;
  functionCall?: FunctionCall;
}

/**
 * Service for handling chat session related operations for the Gemini service.
 * Manages chat sessions, sending messages, and handling function responses.
 */
export class GeminiChatService {
  private genAI: GoogleGenAI;
  private defaultModelName?: string;
  private chatSessions: Map<string, ChatSession> = new Map();

  /**
   * Creates a new instance of the GeminiChatService.
   * @param genAI The GoogleGenAI instance to use for API calls
   * @param defaultModelName Optional default model name to use if not specified in method calls
   */
  constructor(genAI: GoogleGenAI, defaultModelName?: string) {
    this.genAI = genAI;
    this.defaultModelName = defaultModelName;
  }

  /**
   * Starts a new stateful chat session with the Gemini model.
   *
   * @param params Parameters for starting a chat session
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
}
