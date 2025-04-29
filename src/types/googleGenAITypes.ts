import {
  Content,
  Tool,
  ToolConfig,
  GenerationConfig,
  SafetySetting,
  GenerateContentResponse,
} from "@google/genai";

// Proper type for chat session and cached content parameters
interface ChatSessionParams {
  model: string;
  history?: Content[];
  generationConfig?: GenerationConfig;
  safetySettings?: SafetySetting[];
  tools?: Tool[];
  systemInstruction?: Content;
  cachedContent?: string;
}

interface CachedContentParams {
  model: string;
  contents: Content[];
  displayName?: string;
  systemInstruction?: Content;
  ttl?: string;
  tools?: Tool[];
  toolConfig?: ToolConfig;
}

interface CachedContentMetadata {
  name: string;
  displayName?: string;
  model?: string;
  createTime: string;
  updateTime: string;
  expirationTime?: string;
  state?: string;
  usageMetadata?: {
    totalTokenCount?: number;
  };
}

// Enums for response types
enum FinishReason {
  FINISH_REASON_UNSPECIFIED = "FINISH_REASON_UNSPECIFIED",
  STOP = "STOP",
  MAX_TOKENS = "MAX_TOKENS",
  SAFETY = "SAFETY",
  RECITATION = "RECITATION",
  OTHER = "OTHER",
}

enum BlockedReason {
  BLOCKED_REASON_UNSPECIFIED = "BLOCKED_REASON_UNSPECIFIED",
  SAFETY = "SAFETY",
  OTHER = "OTHER",
}

// FunctionCall interface
interface FunctionCall {
  name: string;
  args?: Record<string, unknown>;
}

// Response type interfaces
interface PromptFeedback {
  blockReason?: BlockedReason;
  safetyRatings?: Array<{
    category: string;
    probability: string;
    blocked: boolean;
  }>;
}

interface Candidate {
  content?: Content;
  finishReason?: FinishReason;
  safetyRatings?: Array<{
    category: string;
    probability: string;
    blocked: boolean;
  }>;
  index?: number;
}

// Augment the Models interface from @google/genai
declare module "@google/genai" {
  interface Models {
    startChat(params: ChatSessionParams): ChatSession;
    createCachedContent(
      params: CachedContentParams
    ): Promise<CachedContentMetadata>;
    updateCachedContent(
      params: { name: string } & Partial<CachedContentParams>
    ): Promise<CachedContentMetadata>;
    getCachedContent(params: { name: string }): Promise<CachedContentMetadata>;
    listCachedContents(params: {
      pageSize?: number;
      pageToken?: string;
    }): Promise<{
      cachedContents: CachedContentMetadata[];
      nextPageToken?: string;
    }>;
    deleteCachedContent(params: { name: string }): Promise<void>;
  }
}

// Re-export needed types for use in other files
export type {
  ChatSessionParams,
  CachedContentParams,
  CachedContentMetadata,
  GenerateContentResult,
  GenerateContentResponseChunk,
  PromptFeedback,
  Candidate,
  FunctionCall,
  ChatSession,
};
export { FinishReason, BlockedReason };

// Include the ChatSession type for completeness
interface ChatSession {
  sendMessage(
    params:
      | ({ message: string } & Record<string, unknown>)
      | { message: { functionResponse: { name: string; response: unknown } } }
  ): Promise<GenerateContentResponse>;
  getHistory(): Content[];
}

interface GenerateContentResult {
  text?: string;
  response: {
    text(): string;
    promptFeedback?: PromptFeedback;
    candidates?: Candidate[];
  };
}

interface GenerateContentResponseChunk {
  text?: string;
  candidates?: Candidate[];
}
