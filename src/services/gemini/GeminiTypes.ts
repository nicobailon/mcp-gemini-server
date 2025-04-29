import type {
  GenerationConfig,
  SafetySetting,
  Content,
  Part,
  Tool,
  ToolConfig,
  FunctionCall,
} from "@google/genai";

// Re-export types from Google GenAI SDK that we use
export type {
  GenerationConfig,
  SafetySetting,
  Content,
  Part,
  Tool,
  ToolConfig,
  FunctionCall,
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
