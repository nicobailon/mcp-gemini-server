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
import type { ThinkingConfig, ExtendedGenerationConfig } from "../../types/googleGenAITypes.js";

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
