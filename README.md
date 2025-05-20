# MCP Gemini Server

## Overview

This project provides a dedicated MCP (Model Context Protocol) server that wraps the `@google/genai` SDK (v0.10.0). It exposes Google's Gemini model capabilities as standard MCP tools, allowing other LLMs (like Claude) or MCP-compatible systems to leverage Gemini's features as a backend workhorse.

This server aims to simplify integration with Gemini models by providing a consistent, tool-based interface managed via the MCP standard. It supports the latest Gemini models including `gemini-1.5-pro-latest`, `gemini-1.5-flash-latest`, and `gemini-2.5-pro` models.


## Features

* **Core Generation:** Standard (`gemini_generateContent`) and streaming (`gemini_generateContentStream`) text generation with support for system instructions and cached content.
* **Function Calling:** Enables Gemini models to request the execution of client-defined functions (`gemini_functionCall`).
* **Stateful Chat:** Manages conversational context across multiple turns (`gemini_startChat`, `gemini_sendMessage`, `gemini_sendFunctionResult`) with support for system instructions, tools, and cached content.
* **File Handling:** Upload, list, retrieve, and delete files using the Gemini API with enhanced path security.
* **Caching:** Create, list, retrieve, update, and delete cached content to optimize prompts with support for tools and tool configurations.
* **Image Generation:** Generate images from text prompts using Gemini 2.0 Flash Experimental (`gemini_generateImage`) with control over resolution, number of images, and negative prompts. Also supports the latest Imagen 3.1 model for high-quality dedicated image generation with advanced style controls. Note that Gemini 2.5 models (Flash and Pro) do not currently support image generation.
* **Object Detection:** Detect objects in images and return bounding box coordinates (`gemini_objectDetection`) with custom prompt additions and output format options.
* **Visual Content Understanding:** Extract information from charts, diagrams, and other visual content (`gemini_contentUnderstanding`) with structured output options.
* **Audio Transcription:** Transcribe audio files with optional timestamps and multilingual support (`gemini_audioTranscription`) for both small and large files.
* **MCP Client:** Connect to and interact with external MCP servers.
  * `mcpConnectToServer`: Establishes a connection to an external MCP server.
  * `mcpListServerTools`: Lists available tools on a connected MCP server.
  * `mcpCallServerTool`: Calls a function on a connected MCP server, with an option for file output.
  * `mcpDisconnectFromServer`: Disconnects from an external MCP server.
  * `writeToFile`: Writes content directly to files within allowed directories.


## Prerequisites

* Node.js (v18 or later)
* An API Key from **Google AI Studio** (<https://aistudio.google.com/app/apikey>).
  * **Important:** The File Handling and Caching APIs are **only compatible with Google AI Studio API keys** and are **not supported** when using Vertex AI credentials. This server does not currently support Vertex AI authentication.

## Installation & Setup

### Installing Manually

1. **Clone/Place Project:** Ensure the `mcp-gemini-server` project directory is accessible on your system.
2. **Install Dependencies:** Navigate to the project directory in your terminal and run:

    ```bash
    npm install
    ```

3. **Build Project:** Compile the TypeScript source code:

    ```bash
    npm run build
    ```

    This command uses the TypeScript compiler (`tsc`) and outputs the JavaScript files to the `./dist` directory (as specified by `outDir` in `tsconfig.json`). The main server entry point will be `dist/server.js`.
4. **Configure MCP Client:** Add the server configuration to your MCP client's settings file (e.g., `cline_mcp_settings.json` for Cline/VSCode, or `claude_desktop_config.json` for Claude Desktop App). Replace `/path/to/mcp-gemini-server` with the actual path on your system and `YOUR_API_KEY` with your Google AI Studio key.

    ```json
    {
      "mcpServers": {
        "gemini-server": { // Or your preferred name
          "command": "node",
          "args": ["/path/to/mcp-gemini-server/dist/server.js"], // Path to the compiled server entry point
          "env": {
            "GOOGLE_GEMINI_API_KEY": "YOUR_API_KEY",
            "GOOGLE_GEMINI_MODEL": "gemini-1.5-flash", // Optional: Set a default model
            "GEMINI_SAFE_FILE_BASE_DIR": "/path/to/allowed/files", // Optional: Restrict file operations
            "ALLOWED_OUTPUT_PATHS": "/path/to/output1,/path/to/output2" // Optional: Comma-separated list of allowed output directories for mcpCallServerTool and writeToFileTool
          },
          "disabled": false,
          "autoApprove": []
        }
        // ... other servers
      }
    }
    ```

5. **Restart MCP Client:** Restart your MCP client application (e.g., VS Code with Cline extension, Claude Desktop App) to load the new server configuration. The MCP client will manage starting and stopping the server process.

## Configuration

The server uses environment variables for configuration, passed via the `env` object in the MCP settings:

* `GOOGLE_GEMINI_API_KEY` (**Required**): Your API key obtained from Google AI Studio.
* `GOOGLE_GEMINI_MODEL` (*Optional*): Specifies a default Gemini model name (e.g., `gemini-1.5-flash`, `gemini-1.0-pro`). If set, tools that require a model name (like `gemini_generateContent`, `gemini_startChat`, etc.) will use this default when the `modelName` parameter is omitted in the tool call. This simplifies client calls when primarily using one model. If this environment variable is *not* set, the `modelName` parameter becomes required for those tools. See the [Google AI documentation](https://ai.google.dev/models/gemini) for available model names.
* `ALLOWED_OUTPUT_PATHS` (*Optional*): A comma-separated list of absolute paths to directories where the `mcpCallServerTool` (with `outputToFile` parameter) and `writeToFileTool` are allowed to write files. If not set, file output will be disabled for these tools. This is a security measure to prevent arbitrary file writes.

## Available Tools

This server provides the following MCP tools. Parameter schemas are defined using Zod for validation and description.

**Validation and Error Handling:** All parameters are validated using Zod schemas at both the MCP tool level and service layer, providing consistent validation, detailed error messages, and type safety. The server implements comprehensive error mapping to provide clear, actionable error messages.

**Retry Logic:** API requests automatically use exponential backoff retry for transient errors (network issues, rate limits, timeouts), improving reliability for unstable connections. The retry mechanism includes configurable parameters for maximum attempts, delay times, and jitter to prevent thundering herd effects.

**Note on Optional Parameters:** Many tools accept complex optional parameters (e.g., `generationConfig`, `safetySettings`, `toolConfig`, `history`, `functionDeclarations`, `contents`). These parameters are typically objects or arrays whose structure mirrors the types defined in the underlying `@google/genai` SDK (v0.10.0). For the exact structure and available fields within these complex parameters, please refer to:
    1. The corresponding `src/tools/*Params.ts` file in this project.
    2. The official [Google AI JS SDK Documentation](https://github.com/google/generative-ai-js).

### Core Generation

* **`gemini_generateContent`**
  * *Description:* Generates non-streaming text content from a prompt.
  * *Required Params:* `prompt` (string)
  * *Optional Params:* 
    * `modelName` (string) - Name of the model to use
    * `generationConfig` (object) - Controls generation parameters like temperature, topP, etc.
      * `thinkingConfig` (object) - Controls model reasoning process
        * `thinkingBudget` (number) - Maximum tokens for reasoning (0-24576)
        * `reasoningEffort` (string) - Simplified control: "none" (0 tokens), "low" (1K), "medium" (8K), "high" (24K)
    * `safetySettings` (array) - Controls content filtering by harm category
    * `systemInstruction` (string or object) - System instruction to guide model behavior
    * `cachedContentName` (string) - Identifier for cached content to use with this request
  * *Note:* Can handle both multimodal inputs and cached content for improved efficiency
  * *Thinking Budget:* Controls the token budget for model reasoning. Lower values provide faster responses, higher values improve complex reasoning.
* **`gemini_generateContentStream`**
  * *Description:* Generates text content via streaming. (Note: Current implementation uses a workaround and collects all chunks before returning the full text).
  * *Required Params:* `prompt` (string)
  * *Optional Params:* 
    * `modelName` (string) - Name of the model to use
    * `generationConfig` (object) - Controls generation parameters like temperature, topP, etc.
      * `thinkingConfig` (object) - Controls model reasoning process
        * `thinkingBudget` (number) - Maximum tokens for reasoning (0-24576)
        * `reasoningEffort` (string) - Simplified control: "none" (0 tokens), "low" (1K), "medium" (8K), "high" (24K)
    * `safetySettings` (array) - Controls content filtering by harm category
    * `systemInstruction` (string or object) - System instruction to guide model behavior
    * `cachedContentName` (string) - Identifier for cached content to use with this request

### Function Calling

* **`gemini_functionCall`**
  * *Description:* Sends a prompt and function declarations to the model, returning either a text response or a requested function call object (as a JSON string).
  * *Required Params:* `prompt` (string), `functionDeclarations` (array)
  * *Optional Params:* 
    * `modelName` (string) - Name of the model to use
    * `generationConfig` (object) - Controls generation parameters
    * `safetySettings` (array) - Controls content filtering
    * `toolConfig` (object) - Configures tool behavior like temperature and confidence thresholds

### Stateful Chat

* **`gemini_startChat`**
  * *Description:* Initiates a new stateful chat session and returns a unique `sessionId`.
  * *Optional Params:* 
    * `modelName` (string) - Name of the model to use
    * `history` (array) - Initial conversation history
    * `tools` (array) - Tool definitions including function declarations
    * `generationConfig` (object) - Controls generation parameters
      * `thinkingConfig` (object) - Controls model reasoning process
        * `thinkingBudget` (number) - Maximum tokens for reasoning (0-24576)
        * `reasoningEffort` (string) - Simplified control: "none" (0 tokens), "low" (1K), "medium" (8K), "high" (24K)
    * `safetySettings` (array) - Controls content filtering
    * `systemInstruction` (string or object) - System instruction to guide model behavior
    * `cachedContentName` (string) - Identifier for cached content to use with this session
* **`gemini_sendMessage`**
  * *Description:* Sends a message within an existing chat session.
  * *Required Params:* `sessionId` (string), `message` (string)
  * *Optional Params:* 
    * `generationConfig` (object) - Controls generation parameters
      * `thinkingConfig` (object) - Controls model reasoning process
        * `thinkingBudget` (number) - Maximum tokens for reasoning (0-24576)
        * `reasoningEffort` (string) - Simplified control: "none" (0 tokens), "low" (1K), "medium" (8K), "high" (24K)
    * `safetySettings` (array) - Controls content filtering
    * `tools` (array) - Tool definitions including function declarations
    * `toolConfig` (object) - Configures tool behavior
    * `cachedContentName` (string) - Identifier for cached content to use with this message
* **`gemini_sendFunctionResult`**
  * *Description:* Sends the result of a function execution back to a chat session.
  * *Required Params:* `sessionId` (string), `functionResponse` (string) - The result of the function execution
  * *Optional Params:* `functionCall` (object) - Reference to the original function call
* **`gemini_routeMessage`**
  * *Description:* Routes a message to the most appropriate model from a provided list based on message content. Returns both the model's response and which model was selected.
  * *Required Params:* 
    * `message` (string) - The text message to be routed to the most appropriate model
    * `models` (array) - Array of model names to consider for routing (e.g., ['gemini-1.5-flash', 'gemini-1.5-pro']). The first model in the list will be used for routing decisions.
  * *Optional Params:* 
    * `routingPrompt` (string) - Custom prompt to use for routing decisions. If not provided, a default routing prompt will be used.
    * `defaultModel` (string) - Model to fall back to if routing fails. If not provided and routing fails, an error will be thrown.
    * `generationConfig` (object) - Generation configuration settings to apply to the selected model's response.
      * `thinkingConfig` (object) - Controls model reasoning process
        * `thinkingBudget` (number) - Maximum tokens for reasoning (0-24576)
        * `reasoningEffort` (string) - Simplified control: "none" (0 tokens), "low" (1K), "medium" (8K), "high" (24K)
    * `safetySettings` (array) - Safety settings to apply to both routing and final response.
    * `systemInstruction` (string or object) - A system instruction to guide the model's behavior after routing.

### File Handling (Google AI Studio Key Required)

* **`gemini_uploadFile`**
  * *Description:* Uploads a file from a local path.
  * *Required Params:* `filePath` (string - **must be an absolute path**)
  * *Optional Params:* `displayName` (string), `mimeType` (string)
  * *Security Note:* File paths are strictly validated against the secure base directory specified in the `GEMINI_SAFE_FILE_BASE_DIR` environment variable. All file operations are restricted to this directory to prevent path traversal attacks. If this environment variable is not set, the current working directory is used as the default secure base path.
* **`gemini_listFiles`**
  * *Description:* Lists previously uploaded files.
  * *Required Params:* None
  * *Optional Params:* `pageSize` (number), `pageToken` (string - Note: `pageToken` may not be reliably returned currently).
* **`gemini_getFile`**
  * *Description:* Retrieves metadata for a specific uploaded file.
  * *Required Params:* `fileName` (string - e.g., `files/abc123xyz`)
* **`gemini_deleteFile`**
  * *Description:* Deletes an uploaded file.
  * *Required Params:* `fileName` (string - e.g., `files/abc123xyz`)

### Caching (Google AI Studio Key Required)

* **`gemini_createCache`**
  * *Description:* Creates cached content for compatible models (e.g., `gemini-1.5-flash`).
  * *Required Params:* `contents` (array), `model` (string)
  * *Optional Params:* 
    * `displayName` (string) - Human-readable name for the cached content
    * `systemInstruction` (string or object) - System instruction to apply to the cached content
    * `ttl` (string - e.g., '3600s') - Time-to-live for the cached content
    * `tools` (array) - Tool definitions for use with the cached content
    * `toolConfig` (object) - Configuration for the tools
* **`gemini_listCaches`**
  * *Description:* Lists existing cached content.
  * *Required Params:* None
  * *Optional Params:* `pageSize` (number), `pageToken` (string - Note: `pageToken` may not be reliably returned currently).
* **`gemini_getCache`**
  * *Description:* Retrieves metadata for specific cached content.
  * *Required Params:* `cacheName` (string - e.g., `cachedContents/abc123xyz`)
* **`gemini_updateCache`**
  * *Description:* Updates metadata and contents for cached content.
  * *Required Params:* `cacheName` (string), `contents` (array)
  * *Optional Params:* 
    * `displayName` (string) - Updated display name
    * `systemInstruction` (string or object) - Updated system instruction
    * `ttl` (string) - Updated time-to-live
    * `tools` (array) - Updated tool definitions
    * `toolConfig` (object) - Updated tool configuration
* **`gemini_deleteCache`**
  * *Description:* Deletes cached content.
  * *Required Params:* `cacheName` (string - e.g., `cachedContents/abc123xyz`)

### Image Generation

* **`gemini_generateImage`**
  * *Description:* Generates images from text prompts using available image generation models.
  * *Required Params:* `prompt` (string - descriptive text prompt for image generation)
  * *Optional Params:* 
    * `modelName` (string - defaults to "imagen-3.1-generate-003" for high-quality dedicated image generation or use "gemini-2.0-flash-exp-image-generation" for Gemini models)
    * `resolution` (string enum: "512x512", "1024x1024", "1536x1536")
    * `numberOfImages` (number - 1-8, default: 1)
    * `safetySettings` (array) - Controls content filtering for generated images
    * `negativePrompt` (string - features to avoid in the generated image)
    * `stylePreset` (string enum: "photographic", "digital-art", "cinematic", "anime", "3d-render", "oil-painting", "watercolor", "pixel-art", "sketch", "comic-book", "neon", "fantasy")
    * `seed` (number - integer value for reproducible generation)
    * `styleStrength` (number - strength of style preset, 0.0-1.0)
  * *Response:* Returns an array of base64-encoded images with metadata including dimensions and MIME type.
  * *Notes:* Image generation uses significant resources, especially at higher resolutions. Consider using smaller resolutions for faster responses and less resource usage.

### Object Detection

* **`gemini_objectDetection`**
  * *Description:* Detects objects in images and returns their positions with bounding box coordinates.
  * *Required Params:* `image` (object with `type` ["url" | "base64"], `data` [URL string or base64 data], and `mimeType`)
  * *Optional Params:* 
    * `modelName` (string - defaults to server's default model)
    * `promptAddition` (string - custom instructions for detection)
    * `outputFormat` (string enum: "json" | "text", default: "json")
    * `safetySettings` (array) - Controls content filtering
  * *Response:* JSON array of detected objects with labels, normalized bounding box coordinates (0-1000 scale), and confidence scores. When `outputFormat` is "text", returns natural language description.
  * *Notes:* This tool is optimized for common object detection in photographs, diagrams, and scenes.

### Visual Content Understanding

* **`gemini_contentUnderstanding`**
  * *Description:* Analyzes and extracts information from visual content like charts, diagrams, documents, and complex visuals.
  * *Required Params:* 
    * `image` (object with `type` ["url" | "base64"], `data` [URL string or base64 data], and `mimeType`)
    * `prompt` (string - instructions for analyzing the content)
  * *Optional Params:* 
    * `modelName` (string - defaults to server's default model)
    * `structuredOutput` (boolean - whether to return JSON structure)
    * `safetySettings` (array) - Controls content filtering
  * *Response:* When `structuredOutput` is true, returns JSON-structured data extracted from the visual content. Otherwise, returns natural language analysis.
  * *Notes:* Particularly effective for extracting data from charts, tables, diagrams, receipts, documents, and other structured visual information.

### Audio Transcription

* **`gemini_audioTranscription`**
  * *Description:* Transcribes audio files using Gemini models. Supports both direct processing (<20MB) and File API processing (larger files require Google AI Studio API key).
  * *Required Params:* `filePath` (string - **must be an absolute path** accessible by the server process)
  * *Optional Params:*
    * `modelName` (string - defaults to server's default model)
    * `includeTimestamps` (boolean - include timestamps for paragraphs/speaker changes)
    * `language` (string - BCP-47 code, e.g., 'en-US', 'fr-FR')
    * `prompt` (string - additional instructions for transcription)
    * `mimeType` (string - audio format, inferred from extension if not provided)
  * *Supported Audio Formats:* MP3, WAV, OGG, M4A, FLAC (audio/mpeg, audio/wav, audio/ogg, audio/mp4, audio/x-m4a, audio/flac, audio/x-flac)
  * *Security Note:* File paths are strictly validated against the secure base directory (`GEMINI_SAFE_FILE_BASE_DIR` environment variable). Operations are restricted to this directory to prevent path traversal attacks.
  * *Notes:*
    * Files under 20MB are processed directly with inline base64 encoding
    * Files over 20MB require a Google AI Studio API key and use the File API
    * The actual upper file size limit when using File API is determined by the Gemini API itself
    * Transcription quality may vary based on audio quality, background noise, and number of speakers

### MCP Client Tools

* **`mcpConnectToServer`**
  * *Description:* Establishes a connection to an external MCP server.
  * *Required Params:*
    * `serverId` (string): A unique identifier for this server connection.
    * `connectionType` (string enum: "sse" | "stdio"): The transport protocol to use.
    * `sseUrl` (string, optional if `connectionType` is "stdio"): The URL for SSE connection.
    * `stdioCommand` (string, optional if `connectionType` is "sse"): The command to run for stdio connection.
    * `stdioArgs` (array of strings, optional): Arguments for the stdio command.
    * `stdioEnv` (object, optional): Environment variables for the stdio command.
* **`mcpListServerTools`**
  * *Description:* Lists available tools on a connected MCP server.
  * *Required Params:*
    * `serverId` (string): The identifier of the connected server.
* **`mcpCallServerTool`**
  * *Description:* Calls a function on a connected MCP server.
  * *Required Params:*
    * `serverId` (string): The identifier of the connected server.
    * `toolName` (string): The name of the tool to call on the remote server.
    * `toolArgs` (object): The arguments to pass to the remote tool.
  * *Optional Params:*
    * `outputToFile` (string): If provided, the tool's output will be written to this file path. The path must be within one of the directories specified in the `ALLOWED_OUTPUT_PATHS` environment variable.
* **`mcpDisconnectFromServer`**
  * *Description:* Disconnects from an external MCP server.
  * *Required Params:*
    * `serverId` (string): The identifier of the server connection to terminate.
* **`writeToFile`**
  * *Description:* Writes content directly to a file.
  * *Required Params:*
    * `filePath` (string): The absolute path of the file to write to. Must be within one of the directories specified in the `ALLOWED_OUTPUT_PATHS` environment variable.
    * `content` (string): The content to write to the file.
  * *Optional Params:*
    * `overwrite` (boolean, default: false): If true, overwrite the file if it already exists. Otherwise, an error will be thrown if the file exists.

## Usage Examples

Here are examples of how an MCP client (like Claude) might call these tools using the `use_mcp_tool` format:


**Example 1: Simple Content Generation (Using Default Model)**

```xml
<use_mcp_tool>
  <server_name>gemini-server</server_name>
  <tool_name>gemini_generateContent</tool_name>
  <arguments>
    {
      "prompt": "Write a short poem about a rubber duck."
    }
  </arguments>
</use_mcp_tool>
```

**Example 2: Content Generation (Specifying Model & Config)**

```xml
<use_mcp_tool>
  <server_name>gemini-server</server_name>
  <tool_name>gemini_generateContent</tool_name>
  <arguments>
    {
      "modelName": "gemini-1.0-pro",
      "prompt": "Explain the concept of recursion in programming.",
      "generationConfig": {
        "temperature": 0.7,
        "maxOutputTokens": 500
      }
    }
  </arguments>
</use_mcp_tool>
```

**Example 2b: Content Generation with Thinking Budget Control**

```xml
<use_mcp_tool>
  <server_name>gemini-server</server_name>
  <tool_name>gemini_generateContent</tool_name>
  <arguments>
    {
      "modelName": "gemini-1.5-pro",
      "prompt": "Solve this complex math problem: Find all values of x where 2sin(x) = x^2-x+1 in the range [0, 2π].",
      "generationConfig": {
        "temperature": 0.2,
        "maxOutputTokens": 1000,
        "thinkingConfig": {
          "thinkingBudget": 8192
        }
      }
    }
  </arguments>
</use_mcp_tool>
```

**Example 2c: Content Generation with Simplified Reasoning Effort**

```xml
<use_mcp_tool>
  <server_name>gemini-server</server_name>
  <tool_name>gemini_generateContent</tool_name>
  <arguments>
    {
      "modelName": "gemini-1.5-pro",
      "prompt": "Solve this complex math problem: Find all values of x where 2sin(x) = x^2-x+1 in the range [0, 2π].",
      "generationConfig": {
        "temperature": 0.2,
        "maxOutputTokens": 1000,
        "thinkingConfig": {
          "reasoningEffort": "high"
        }
      }
    }
  </arguments>
</use_mcp_tool>
```

**Example 3: Starting and Continuing a Chat**

*Start Chat:*

```xml
<use_mcp_tool>
  <server_name>gemini-server</server_name>
  <tool_name>gemini_startChat</tool_name>
  <arguments>
    {}
  </arguments>
</use_mcp_tool>
```

*(Assume response contains `sessionId: "some-uuid-123"`)*

*Send Message:*

```xml
<use_mcp_tool>
  <server_name>gemini-server</server_name>
  <tool_name>gemini_sendMessage</tool_name>
  <arguments>
    {
      "sessionId": "some-uuid-123",
      "message": "Hello! Can you tell me about the Gemini API?"
    }
  </arguments>
</use_mcp_tool>
```

**Example 4: Content Generation with System Instructions (Simplified Format)**

```xml
<use_mcp_tool>
  <server_name>gemini-server</server_name>
  <tool_name>gemini_generateContent</tool_name>
  <arguments>
    {
      "modelName": "gemini-2.5-pro-exp",
      "prompt": "What should I do with my day off?",
      "systemInstruction": "You are a helpful assistant that provides friendly and detailed advice. You should focus on outdoor activities and wellness."
    }
  </arguments>
</use_mcp_tool>
```

**Example 5: Content Generation with System Instructions (Object Format)**

```xml
<use_mcp_tool>
  <server_name>gemini-server</server_name>
  <tool_name>gemini_generateContent</tool_name>
  <arguments>
    {
      "modelName": "gemini-1.5-pro-latest",
      "prompt": "What should I do with my day off?",
      "systemInstruction": {
        "parts": [
          {
            "text": "You are a helpful assistant that provides friendly and detailed advice. You should focus on outdoor activities and wellness."
          }
        ]
      }
    }
  </arguments>
</use_mcp_tool>
```

**Example 6: Using Cached Content with System Instruction**

```xml
<use_mcp_tool>
  <server_name>gemini-server</server_name>
  <tool_name>gemini_generateContent</tool_name>
  <arguments>
    {
      "modelName": "gemini-2.5-pro-exp",
      "prompt": "Explain how these concepts relate to my product?",
      "cachedContentName": "cachedContents/abc123xyz",
      "systemInstruction": "You are a product expert who explains technical concepts in simple terms."
    }
  </arguments>
</use_mcp_tool>
```

**Example 6: Uploading a File**

```xml
<use_mcp_tool>
  <server_name>gemini-server</server_name>
  <tool_name>gemini_uploadFile</tool_name>
  <arguments>
    {
      "filePath": "C:\\Users\\YourUser\\Documents\\my_document.txt", // IMPORTANT: Use absolute path with escaped backslashes if needed
      "displayName": "My Document"
    }
  </arguments>
</use_mcp_tool>
```


**Example 7: Generating an Image**

```xml
<use_mcp_tool>
  <server_name>gemini-server</server_name>
  <tool_name>gemini_generateImage</tool_name>
  <arguments>
    {
      "prompt": "A futuristic cityscape with flying cars and neon lights",
      "modelName": "gemini-2.0-flash-exp-image-generation",
      "resolution": "1024x1024",
      "numberOfImages": 1,
      "negativePrompt": "dystopian, ruins, dark, gloomy"
    }
  </arguments>
</use_mcp_tool>
```

**Example 7b: Generating a High-Quality Image with Imagen 3.1**

```xml
<use_mcp_tool>
  <server_name>gemini-server</server_name>
  <tool_name>gemini_generateImage</tool_name>
  <arguments>
    {
      "prompt": "A futuristic cityscape with flying cars and neon lights",
      "modelName": "imagen-3.1-generate-003",
      "resolution": "1024x1024",
      "numberOfImages": 4,
      "negativePrompt": "dystopian, ruins, dark, gloomy"
    }
  </arguments>
</use_mcp_tool>
```

**Example 7c: Using Advanced Style Options**

```xml
<use_mcp_tool>
  <server_name>gemini-server</server_name>
  <tool_name>gemini_generateImage</tool_name>
  <arguments>
    {
      "prompt": "A futuristic cityscape with flying cars and neon lights",
      "modelName": "imagen-3.1-generate-003",
      "resolution": "1024x1024",
      "numberOfImages": 2,
      "stylePreset": "anime",
      "styleStrength": 0.8,
      "seed": 12345
    }
  </arguments>
</use_mcp_tool>
```

**Example 8: Detecting Objects in an Image**

```xml
<use_mcp_tool>
  <server_name>gemini-server</server_name>
  <tool_name>gemini_objectDetection</tool_name>
  <arguments>
    {
      "image": {
        "type": "url",
        "data": "https://example.com/images/street_scene.jpg",
        "mimeType": "image/jpeg"
      },
      "outputFormat": "json",
      "promptAddition": "Focus on vehicles and pedestrians, ignore buildings"
    }
  </arguments>
</use_mcp_tool>
```

**Example 9: Understanding Chart Content**

```xml
<use_mcp_tool>
  <server_name>gemini-server</server_name>
  <tool_name>gemini_contentUnderstanding</tool_name>
  <arguments>
    {
      "image": {
        "type": "base64",
        "data": "data:image/png;base64,iVBORw0KGgoAA...", // Base64 encoded chart image
        "mimeType": "image/png"
      },
      "prompt": "Extract the data from this sales chart and identify the key trends",
      "structuredOutput": true
    }
  </arguments>
</use_mcp_tool>
```

**Example 10: Audio Transcription (Small File)**

```xml
<use_mcp_tool>
  <server_name>gemini-server</server_name>
  <tool_name>gemini_audioTranscription</tool_name>
  <arguments>
    {
      "filePath": "/absolute/path/to/recording.mp3",
      "includeTimestamps": true,
      "language": "en-US",
      "prompt": "Identify different speakers if possible"
    }
  </arguments>
</use_mcp_tool>
```

**Example 11: Audio Transcription (Large File with File API)**

```xml
<use_mcp_tool>
  <server_name>gemini-server</server_name>
  <tool_name>gemini_audioTranscription</tool_name>
  <arguments>
    {
      "filePath": "/absolute/path/to/long-recording.wav",
      "mimeType": "audio/wav",
      "includeTimestamps": true,
      "language": "fr-FR"
    }
  </arguments>
</use_mcp_tool>
```

**Example 12: Message Routing Between Models**

```xml
<use_mcp_tool>
  <server_name>gemini-server</server_name>
  <tool_name>gemini_routeMessage</tool_name>
  <arguments>
    {
      "message": "Can you create a detailed business plan for a sustainable fashion startup?",
      "models": ["gemini-1.5-pro", "gemini-1.5-flash", "gemini-2.5-pro"],
      "routingPrompt": "Analyze this message and determine which model would be best suited to handle it. Consider: gemini-1.5-flash for simpler tasks, gemini-1.5-pro for balanced capabilities, and gemini-2.5-pro for complex creative tasks.",
      "defaultModel": "gemini-1.5-pro",
      "generationConfig": {
        "temperature": 0.7,
        "maxOutputTokens": 1024
      }
    }
  </arguments>
</use_mcp_tool>
```

The response will be a JSON string containing both the text response and which model was chosen:

```json
{
  "text": "# Business Plan for Sustainable Fashion Startup\n\n## Executive Summary\n...",
  "chosenModel": "gemini-2.5-pro"
}
```

**Example 8: Connecting to an External MCP Server (SSE)**

```xml
<use_mcp_tool>
  <server_name>gemini-server</server_name>
  <tool_name>mcpConnectToServer</tool_name>
  <arguments>
    {
      "serverId": "my-external-server",
      "connectionType": "sse",
      "sseUrl": "http://localhost:8080/mcp"
    }
  </arguments>
</use_mcp_tool>
```

**Example 9: Calling a Tool on an External MCP Server and Writing Output to File**

```xml
<use_mcp_tool>
  <server_name>gemini-server</server_name>
  <tool_name>mcpCallServerTool</tool_name>
  <arguments>
    {
      "serverId": "my-external-server",
      "toolName": "remote_tool_name",
      "toolArgs": { "param1": "value1" },
      "outputToFile": "/path/to/allowed/output/result.json"
    }
  </arguments>
</use_mcp_tool>
```

**Example 10: Writing Content Directly to a File**

```xml
<use_mcp_tool>
  <server_name>gemini-server</server_name>
  <tool_name>writeToFile</tool_name>
  <arguments>
    {
      "filePath": "/path/to/allowed/output/my_notes.txt",
      "content": "This is some important content.",
      "overwrite": true
    }
  </arguments>
</use_mcp_tool>
```

## `mcp-gemini-server` and Gemini SDK's MCP Function Calling

The official Google Gemini API documentation includes examples (such as for [function calling with MCP structure](https://ai.google.dev/gemini-api/docs/function-calling?example=weather#model_context_protocol_mcp)) that demonstrate how you can use the client-side Gemini SDK (e.g., in Python or Node.js) to interact with the Gemini API. In such scenarios, particularly for function calling, the client SDK itself can be used to structure requests and handle responses in a manner that aligns with MCP principles.

The `mcp-gemini-server` project offers a complementary approach by providing a **fully implemented, standalone MCP server**. Instead of your client application directly using the Gemini SDK to format MCP-style messages for the Gemini API, your client application (which could be another LLM like Claude, a custom script, or any MCP-compatible system) would:

1.  Connect to an instance of this `mcp-gemini-server`.
2.  Call the pre-defined MCP tools exposed by this server, such as `gemini_functionCall`, `gemini_generateContent`, etc.

This `mcp-gemini-server` then internally handles all the necessary interactions with the Google Gemini API, including structuring the requests, managing API keys, and processing responses, abstracting these details away from your MCP client.

### Benefits of using `mcp-gemini-server`:

*   **Abstraction & Simplicity:** Client applications don't need to integrate the Gemini SDK directly or manage the specifics of its API for MCP-style interactions. They simply make standard MCP tool calls.
*   **Centralized Configuration:** API keys, default model choices, safety settings, and other configurations are managed centrally within the `mcp-gemini-server`.
*   **Rich Toolset:** Provides a broad set of pre-defined MCP tools for various Gemini features (text generation, chat, file handling, image generation, etc.), not just function calling.
*   **Interoperability:** Enables any MCP-compatible client to leverage Gemini's capabilities without needing native Gemini SDK support.

### When to Choose Which Approach:

*   **Direct SDK Usage (as in Google's MCP examples):**
    *   Suitable if you are building a client application (e.g., in Python or Node.js) and want fine-grained control over the Gemini API interaction directly within that client.
    *   Useful if you prefer to manage the Gemini SDK dependencies and logic within your client application and are primarily focused on function calling structured in an MCP-like way.
*   **Using `mcp-gemini-server`:**
    *   Ideal if you want to expose Gemini capabilities to an existing MCP-compatible ecosystem (e.g., another LLM, a workflow automation system).
    *   Beneficial if you want to rapidly prototype or deploy Gemini features as tools without extensive client-side SDK integration.
    *   Preferable if you need a wider range of Gemini features exposed as consistent MCP tools and want to centralize the Gemini API interaction point.

### A Note on This Server's Own MCP Client Tools:

The `mcp-gemini-server` also includes tools like `mcpConnectToServer`, `mcpListServerTools`, and `mcpCallServerTool`. These tools allow *this server* to act as an MCP *client* to *other external* MCP servers. This is a distinct capability from how an MCP client would connect *to* `mcp-gemini-server` to utilize Gemini features.

## Environment Variables

### Required:
- `GOOGLE_GEMINI_API_KEY`: Your Google Gemini API key (required)

### Optional - Gemini API Configuration:
- `GOOGLE_GEMINI_MODEL`: Default model to use (e.g., `gemini-1.5-pro-latest`, `gemini-1.5-flash-latest`)
- `GOOGLE_GEMINI_DEFAULT_THINKING_BUDGET`: Default thinking budget in tokens (0-24576) for controlling model reasoning
- `GOOGLE_GEMINI_IMAGE_RESOLUTION`: Default image resolution (512x512, 1024x1024, or 1536x1536)
- `GOOGLE_GEMINI_MAX_IMAGE_SIZE_MB`: Maximum allowed image size in MB
- `GOOGLE_GEMINI_SUPPORTED_IMAGE_FORMATS`: JSON array of supported image formats (e.g., `["image/jpeg","image/png","image/webp"]`)
- `GEMINI_SAFE_FILE_BASE_DIR`: Restricts file operations to a specific directory for security (defaults to current working directory)

### Optional - Server Configuration:
- `MCP_TRANSPORT_TYPE`: Transport to use for MCP server (options: `stdio`, `ws`; default: `stdio`)
- `MCP_WS_PORT`: Port for WebSocket transport when using `ws` transport type (default: `8080`)
- `ENABLE_HEALTH_CHECK`: Enable health check server (options: `true`, `false`; default: `true`)
- `HEALTH_CHECK_PORT`: Port for health check HTTP server (default: `3000`)

You can create a `.env` file in the root directory with these variables:

```env
# Required API Configuration
GOOGLE_GEMINI_API_KEY=your_api_key_here

# Optional API Configuration
GOOGLE_GEMINI_MODEL=gemini-1.5-pro-latest
GOOGLE_GEMINI_DEFAULT_THINKING_BUDGET=4096
GOOGLE_GEMINI_IMAGE_RESOLUTION=1024x1024
GOOGLE_GEMINI_MAX_IMAGE_SIZE_MB=10
GOOGLE_GEMINI_SUPPORTED_IMAGE_FORMATS=["image/jpeg","image/png","image/webp"]
GEMINI_SAFE_FILE_BASE_DIR=/path/to/allowed/files

# Server Configuration
MCP_TRANSPORT_TYPE=stdio
# MCP_WS_PORT=8080 # Uncomment when using WebSocket transport
ENABLE_HEALTH_CHECK=true
HEALTH_CHECK_PORT=3000
```

## Error Handling

The server provides enhanced error handling using the MCP standard `McpError` type when tool execution fails. This object contains:

* `code`: An `ErrorCode` enum value indicating the type of error:
  * `InvalidParams`: Parameter validation errors (wrong type, missing required field, etc.)
  * `InvalidRequest`: General request errors, including safety blocks and not found resources 
  * `PermissionDenied`: Authentication or authorization failures
  * `ResourceExhausted`: Rate limits, quotas, or resource capacity issues
  * `FailedPrecondition`: Operations that require conditions that aren't met
  * `InternalError`: Unexpected server or API errors
* `message`: A human-readable description of the error with specific details.
* `details`: (Optional) An object with more specific information from the Gemini SDK error.

### Implementation Details

The server uses a multi-layered approach to error handling:

1. **Validation Layer**: Zod schemas validate all parameters at both the tool level (MCP request) and service layer (before API calls).
2. **Error Classification**: A detailed error mapping system categorizes errors from the Google GenAI SDK into specific error types:
   * `GeminiValidationError`: Parameter validation failures 
   * `GeminiAuthError`: Authentication issues
   * `GeminiQuotaError`: Rate limiting and quota exhaustion
   * `GeminiContentFilterError`: Content safety filtering
   * `GeminiNetworkError`: Connection and timeout issues
   * `GeminiModelError`: Model-specific problems
3. **Retry Mechanism**: Automatic retry with exponential backoff for transient errors:
   * Network issues, timeouts, and rate limit errors are automatically retried
   * Configurable retry parameters (attempts, delay, backoff factor)
   * Jitter randomization to prevent synchronized retry attempts
   * Detailed logging of retry attempts for debugging

**Common Error Scenarios:**

* **Authentication Failures:** `PermissionDenied` - Invalid API key, expired credentials, or unauthorized access.
* **Parameter Validation:** `InvalidParams` - Missing required fields, wrong data types, invalid values.
* **Safety Blocks:** `InvalidRequest` - Content blocked by safety filters with details indicating `SAFETY` as the block reason.
* **File/Cache Not Found:** `InvalidRequest` - Resource not found, with details about the missing resource.
* **Rate Limits:** `ResourceExhausted` - API quota exceeded or rate limits hit, with details about limits.
* **File API Unavailable:** `FailedPrecondition` - When attempting File API operations without a valid Google AI Studio key.
* **Path Traversal Security:** `InvalidParams` - Attempts to access files outside the allowed directory with details about the security validation failure.
* **Image/Audio Processing Errors:** 
  * `InvalidParams` - For format issues, size limitations, or invalid inputs
  * `InternalError` - For processing failures during analysis
  * `ResourceExhausted` - For resource-intensive operations exceeding limits

The server includes additional context in error messages to help with troubleshooting, including session IDs for chat-related errors and specific validation details for parameter errors.

Check the `message` and `details` fields of the returned `McpError` for specific troubleshooting information.

## Development and Testing

This server includes a comprehensive test suite to ensure functionality and compatibility with the Gemini API. The tests are organized into unit tests (for individual components) and integration tests (for end-to-end functionality).

### Test Structure

- **Unit Tests**: Located in `tests/unit/` - Test individual components in isolation with mocked dependencies
- **Integration Tests**: Located in `tests/integration/` - Test end-to-end functionality with real server interaction
- **Test Utilities**: Located in `tests/utils/` - Helper functions and fixtures for testing

### Running Tests

```bash
# Install dependencies first
npm install

# Run all tests
npm run test

# Run only unit tests
npm run test:unit

# Run only integration tests
npm run test:integration

# Run a specific test file
node --test --loader ts-node/esm tests/path/to/test-file.test.ts
```

### Testing Approach

1. **Service Mocking**: The tests use a combination of direct method replacement and mock interfaces to simulate the Gemini API response. This is particularly important for the `@google/genai` SDK (v0.10.0) which has a complex object structure.

2. **Environmental Variables**: Tests automatically check for required environment variables and will skip tests that require API keys if they're not available. This allows core functionality to be tested without credentials.

3. **Test Server**: Integration tests use a test server fixture that creates an isolated HTTP server instance with the MCP handler configured for testing.

4. **RetryService**: The retry mechanism is extensively tested to ensure proper handling of transient errors with exponential backoff, jitter, and configurable retry parameters.

5. **Image Generation**: Tests specifically address the complex interactions with the Gemini API for image generation, supporting both Gemini models and the dedicated Imagen 3.1 model.

### Test Environment Setup

For running tests that require API access, create a `.env.test` file in the project root with the following variables:

```env
# Required for basic API tests
GOOGLE_GEMINI_API_KEY=your_api_key_here

# Required for router tests
GOOGLE_GEMINI_MODEL=gemini-1.5-flash-latest

# Required for file tests
GEMINI_SAFE_FILE_BASE_DIR=/path/to/allowed/files
```

The test suite will automatically detect available environment variables and skip tests that require missing configuration.

## Contributing

We welcome contributions to improve the MCP Gemini Server! This section provides guidelines for contributing to the project.

### Development Environment Setup

1. **Fork and Clone the Repository**
   ```bash
   git clone https://github.com/yourusername/mcp-gemini-server.git
   cd mcp-gemini-server
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Set Up Environment Variables**
   Create a `.env` file in the project root with the necessary variables as described in the Environment Variables section.

4. **Build and Run**
   ```bash
   npm run build
   npm run dev
   ```

### Development Process

1. **Create a Feature Branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make Your Changes**
   Implement your feature or fix, following the code style guidelines.

3. **Write Tests**
   Add tests for your changes to ensure functionality and prevent regressions.

4. **Run Tests and Linting**
   ```bash
   npm run test
   npm run lint
   npm run format
   ```

5. **Commit Your Changes**
   Use clear, descriptive commit messages that explain the purpose of your changes.

### Testing Guidelines

- Write unit tests for all new functionality
- Update existing tests when modifying functionality
- Ensure all tests pass before submitting a pull request
- Include both positive and negative test cases
- Mock external dependencies to ensure tests can run without external services

### Pull Request Process

1. **Update Documentation**
   Update the README.md and other documentation to reflect your changes.

2. **Submit a Pull Request**
   - Provide a clear description of the changes
   - Link to any related issues
   - Explain how to test the changes
   - Ensure all CI checks pass

3. **Code Review**
   - Address any feedback from reviewers
   - Make requested changes and update the PR

### Coding Standards

- Follow the existing code style (PascalCase for classes/interfaces/types, camelCase for functions/variables)
- Use strong typing with TypeScript interfaces
- Document public APIs with JSDoc comments
- Handle errors properly by extending base error classes
- Follow the service-based architecture with dependency injection
- Use Zod for schema validation
- Format code according to the project's ESLint and Prettier configuration

## Code Review Tools

The MCP Gemini Server provides powerful code review capabilities leveraging Gemini's models to analyze git diffs and GitHub repositories. These tools help identify potential issues, suggest improvements, and provide comprehensive feedback on code changes.

### Local Git Diff Review

Review local git changes directly from your command line:

```bash
# Using the included CLI script
./scripts/gemini-review.sh

# Options
./scripts/gemini-review.sh --focus=security --reasoning=high
```

The CLI script supports various options:
- `--focus=FOCUS`: Focus of the review (security, performance, architecture, bugs, general)
- `--model=MODEL`: Model to use (defaults to gemini-flash-2.0 for cost efficiency)
- `--reasoning=LEVEL`: Reasoning effort (none, low, medium, high)
- `--exclude=PATTERN`: Files to exclude using glob patterns

### GitHub Repository Review

Review GitHub repositories, branches, and pull requests using the following tools:

- **GitHub PR Review Tool**: Analyzes pull requests for issues and improvements
- **GitHub Repository Review Tool**: Analyzes entire repositories or branches

### Cost Optimization

By default, code review tools use the more cost-efficient `gemini-flash-2.0` model, which offers a good balance between cost and capability for most code review tasks. For particularly complex code bases or when higher reasoning depth is needed, you can specify more powerful models:

```bash
# Using a more powerful model for complex code
./scripts/gemini-review.sh --model=gemini-1.5-pro --reasoning=high
```

### Running Tests

Tests for the GitHub code review functionality can also use the cheaper model:

```bash
# Run tests with the default gemini-flash-2.0 model
npm run test:unit
```

## Server Features

### Health Check Endpoint

The server provides a built-in health check HTTP endpoint that can be used for monitoring and status checks. This is separate from the MCP server transport and runs as a lightweight HTTP server.

When enabled, you can access the health check at:
```
http://localhost:3000/health
```

The health check endpoint returns a JSON response with the following information:
```json
{
  "status": "running",
  "uptime": 1234,  // Seconds since the server started
  "transport": "StdioServerTransport",  // Current transport type
  "version": "0.1.0"  // Server version
}
```

You can check the health endpoint using curl:
```bash
curl http://localhost:3000/health
```

You can configure the health check using these environment variables:
- `ENABLE_HEALTH_CHECK`: Set to "false" to disable the health check server (default: "true")
- `HEALTH_CHECK_PORT`: Port number for the health check server (default: 3000)

### Graceful Shutdown

The server implements graceful shutdown handling for SIGTERM and SIGINT signals. When the server receives a shutdown signal:

1. It attempts to properly disconnect the MCP server transport
2. It closes the health check server if running
3. It logs the shutdown status
4. It exits with the appropriate exit code (0 for successful shutdown, 1 if errors occurred)

This ensures clean termination when the server is run in containerized environments or when stopped manually.

## Known Issues

* **Streaming Limitations:** `gemini_generateContentStream` uses a workaround, collecting all chunks before returning the full text. True streaming to the MCP client is not yet implemented due to current MCP SDK limitations.
* **Pagination Issues:** `gemini_listFiles` and `gemini_listCaches` may not reliably return `nextPageToken` due to limitations in iterating the SDK's Pager object. A workaround is implemented but has limited reliability.
* **Path Requirements:** All file operations require absolute paths when run from the server environment. Relative paths are not supported.
* **API Compatibility:** File Handling & Caching APIs are **not supported with Vertex AI credentials**, only Google AI Studio API keys.
* **Model Support:** This server is primarily tested and optimized for the latest Gemini 1.5 and 2.5 models. While other models should work, these models are the primary focus for testing and feature compatibility.
* **Resource Usage:** 
  * Image processing requires significant resource usage, especially for large resolution images. Consider using smaller resolutions (512x512) for faster responses.
  * Generating multiple images simultaneously increases resource usage proportionally.
  * Audio transcription of large files may take significant time and resources.
* **Content Handling:** 
  * Base64-encoded images are streamed in chunks to handle large file sizes efficiently.
  * Visual content understanding may perform differently across various types of visual content (charts vs. diagrams vs. documents).
  * Audio transcription accuracy depends on audio quality, number of speakers, and background noise.
