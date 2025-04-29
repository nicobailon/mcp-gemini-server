import { GoogleGenAI } from "@google/genai";
import { GeminiApiError } from "../../utils/errors.js";
import { logger } from "../../utils/logger.js";
import { FileMetadata } from "../../types/index.js";
import { GeminiSecurityService } from "./GeminiSecurityService.js";
import { Content, GenerationConfig, SafetySetting, Part } from "./GeminiTypes.js";

// Request configuration type definition for reuse
interface RequestConfig {
  model: string;
  contents: Content[];
  generationConfig?: GenerationConfig;
  safetySettings?: SafetySetting[];
  systemInstruction?: Content;
  cachedContent?: string;
}

/**
 * Interface for the parameters of the generateContent method
 */
export interface GenerateContentParams {
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
 * Service for handling content generation related operations for the Gemini service.
 * Manages content generation in both streaming and non-streaming modes.
 */
export class GeminiContentService {
  private genAI: GoogleGenAI;
  private defaultModelName?: string;
  private securityService: GeminiSecurityService;

  /**
   * Creates a new instance of the GeminiContentService.
   * @param genAI The GoogleGenAI instance to use for API calls
   * @param defaultModelName Optional default model name to use if not specified in method calls
   * @param securityService Optional security service for file path validation (a new instance is created if not provided)
   */
  constructor(
    genAI: GoogleGenAI,
    defaultModelName?: string,
    securityService?: GeminiSecurityService
  ) {
    this.genAI = genAI;
    this.defaultModelName = defaultModelName;
    this.securityService = securityService || new GeminiSecurityService();
  }

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
    logger.debug(`generateContentStream called with prompt: ${params.prompt}`);
    
    try {
      // Create the request configuration using the helper method
      const requestConfig = this.createRequestConfig(params);
      
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

  /**
   * Creates the request configuration object for both content generation methods.
   * This helper method reduces code duplication between generateContent and generateContentStream.
   * 
   * @param params The content generation parameters
   * @returns A properly formatted request configuration object
   * @throws GeminiApiError if parameters are invalid or model name is missing
   */
  private createRequestConfig(params: GenerateContentParams): RequestConfig {
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
    logger.debug(`Creating request config for model: ${effectiveModelName}`);

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
    const requestConfig: RequestConfig = {
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

    return requestConfig;
  }

  /**
   * Generates content using the Gemini model.
   *
   * @param params An object containing all necessary parameters for content generation
   * @returns A promise resolving to the generated text content
   */
  public async generateContent(params: GenerateContentParams): Promise<string> {
    logger.debug(`generateContent called with prompt: ${params.prompt}`);
    
    try {
      // Create the request configuration using the helper method
      const requestConfig = this.createRequestConfig(params);
      
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
}
