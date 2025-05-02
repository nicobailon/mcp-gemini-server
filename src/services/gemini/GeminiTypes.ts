import type {
  GenerationConfig,
  SafetySetting,
  Content,
  Part,
  Tool,
  ToolConfig,
  FunctionCall,
} from "@google/genai";

// Import ThinkingConfig and ExtendedGenerationConfig from our types
import type {
  ThinkingConfig,
  ExtendedGenerationConfig,
} from "../../types/googleGenAITypes.js";

// Re-export types from Google GenAI SDK and our custom types
export type {
  GenerationConfig,
  SafetySetting,
  Content,
  Part,
  Tool,
  ToolConfig,
  FunctionCall,
  ThinkingConfig,
  ExtendedGenerationConfig,
};

// Type-safe resource IDs
export type FileId = `files/${string}`;
export type CacheId = `cachedContents/${string}`;

/**
 * Interface for image data input used across image-related operations
 */
export interface ImagePart {
  /** The type of image input (base64 or URL) */
  type: "base64" | "url";

  /** The image data - either a base64-encoded string or a valid URL */
  data: string;

  /** The MIME type of the image (must be one of: 'image/jpeg', 'image/png', 'image/webp') */
  mimeType: string;
}

// Export the ChatSession interface for use across services
export interface ChatSession {
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
