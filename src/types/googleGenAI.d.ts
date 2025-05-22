// Type augmentation for @google/genai package
import type {
  GenerationConfig,
  SafetySetting,
  Content,
  Part,
  Tool,
  ToolConfig,
  HarmCategory,
  HarmBlockThreshold,
} from "@google/genai";

// Add additional types from our codebase
import type { ExtendedGenerationConfig } from "./googleGenAITypes.js";

declare module "@google/genai" {
  // Define Models interface
  export interface Models {
    getGenerativeModel(params: {
      model: string;
      generationConfig?: GenerationConfig;
      safetySettings?: SafetySetting[];
    }): GenerativeModel;
  }

  // Extend GoogleGenAI class with missing methods
  export interface GoogleGenAI {
    /**
     * Returns a generative model instance with the specified configuration
     *
     * @param options Model configuration options
     * @returns A generative model instance
     */
    getGenerativeModel(options: {
      model: string;
      generationConfig?: GenerationConfig | ExtendedGenerationConfig;
      safetySettings?: SafetySetting[];
    }): GenerativeModel;

    /**
     * Returns models available through the API
     */
    readonly models: Models;
  }

  // Image generation related types
  export interface ImagePart extends Part {
    inlineData: {
      data: string;
      mimeType: string;
    };
  }

  export interface FileMetadata {
    name: string;
    sizeBytes: number;
    createTime: string;
    updateTime: string;
    contentType: string;
    state: string;
    displayName?: string;
  }

  // Safety setting types
  export enum HarmCategory {
    HARM_CATEGORY_HARASSMENT = "HARM_CATEGORY_HARASSMENT",
    HARM_CATEGORY_HATE_SPEECH = "HARM_CATEGORY_HATE_SPEECH",
    HARM_CATEGORY_SEXUALLY_EXPLICIT = "HARM_CATEGORY_SEXUALLY_EXPLICIT",
    HARM_CATEGORY_DANGEROUS_CONTENT = "HARM_CATEGORY_DANGEROUS_CONTENT",
  }

  export enum HarmBlockThreshold {
    BLOCK_NONE = "BLOCK_NONE",
    BLOCK_LOW_AND_ABOVE = "BLOCK_LOW_AND_ABOVE",
    BLOCK_MEDIUM_AND_ABOVE = "BLOCK_MEDIUM_AND_ABOVE",
    BLOCK_HIGH_AND_ABOVE = "BLOCK_HIGH_AND_ABOVE",
  }

  export interface SafetySetting {
    category: HarmCategory;
    threshold: HarmBlockThreshold;
  }

  // Define the GenerativeModel interface
  export interface GenerativeModel {
    /**
     * Generates content based on provided prompt
     *
     * @param options Content generation options
     * @returns Promise with generated content response
     */
    generateContent(options: {
      contents: Content[];
      generationConfig?: GenerationConfig | ExtendedGenerationConfig;
      safetySettings?: SafetySetting[];
      tools?: Tool[];
      toolConfig?: ToolConfig;
    }): Promise<{
      response: {
        text(): string;
        candidates?: Array<{ content?: { parts?: Part[] } }>;
      };
    }>;

    /**
     * Generates content as a stream based on provided prompt
     *
     * @param options Content generation options
     * @returns Promise with stream of content responses
     */
    generateContentStream(options: {
      contents: Content[];
      generationConfig?: GenerationConfig | ExtendedGenerationConfig;
      safetySettings?: SafetySetting[];
      tools?: Tool[];
      toolConfig?: ToolConfig;
    }): Promise<{
      stream: AsyncGenerator<{
        text(): string;
        candidates?: Array<{ content?: { parts?: Part[] } }>;
      }>;
    }>;

    /**
     * Creates a chat session with the model
     */
    startChat(options?: {
      history?: Content[];
      generationConfig?: GenerationConfig | ExtendedGenerationConfig;
      safetySettings?: SafetySetting[];
      tools?: Tool[];
      systemInstruction?: Content;
      cachedContent?: string;
      thinkingConfig?: { reasoningEffort?: string; thinkingBudget?: number };
    }): ChatSession;

    /**
     * Generates images based on a text prompt
     */
    generateImages(params: {
      prompt: string;
      safetySettings?: SafetySetting[];
      [key: string]: unknown;
    }): Promise<{
      images?: Array<{ data?: string; mimeType?: string }>;
      promptSafetyMetadata?: {
        blocked?: boolean;
        safetyRatings?: Array<{ category: string; probability: string }>;
      };
    }>;
  }

  // Define ChatSession interface
  export interface ChatSession {
    sendMessage(text: string): Promise<{ response: { text(): string } }>;
    sendMessageStream(
      text: string
    ): Promise<{ stream: AsyncGenerator<{ text(): string }> }>;
    getHistory(): Content[];
  }
}
