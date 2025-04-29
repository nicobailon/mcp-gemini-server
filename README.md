# MCP Gemini Server

[![smithery badge](https://smithery.ai/badge/@bsmi021/mcp-gemini-server)](https://smithery.ai/server/@bsmi021/mcp-gemini-server)

## Overview

This project provides a dedicated MCP (Model Context Protocol) server that wraps the `@google/genai` SDK (v0.10.0). It exposes Google's Gemini model capabilities as standard MCP tools, allowing other LLMs (like Claude) or MCP-compatible systems to leverage Gemini's features as a backend workhorse.

This server aims to simplify integration with Gemini models by providing a consistent, tool-based interface managed via the MCP standard. It supports the latest Gemini models including `gemini-1.5-pro-latest`, `gemini-1.5-flash-latest`, and `gemini-2.5-pro` models.


## Features

* **Core Generation:** Standard (`gemini_generateContent`) and streaming (`gemini_generateContentStream`) text generation with support for system instructions and cached content.
* **Function Calling:** Enables Gemini models to request the execution of client-defined functions (`gemini_functionCall`).
* **Stateful Chat:** Manages conversational context across multiple turns (`gemini_startChat`, `gemini_sendMessage`, `gemini_sendFunctionResult`) with support for system instructions, tools, and cached content.
* **File Handling:** Upload, list, retrieve, and delete files using the Gemini API with enhanced path security.
* **Caching:** Create, list, retrieve, update, and delete cached content to optimize prompts with support for tools and tool configurations.
* **Image Generation:** Generate images from text prompts using Gemini 2.0 Flash Experimental (`gemini_generateImage`) with control over resolution, number of images, and negative prompts. Also supports Imagen 3 models for high-quality dedicated image generation. Note that Gemini 2.5 models (Flash and Pro) do not currently support image generation.
* **Object Detection:** Detect objects in images and return bounding box coordinates (`gemini_objectDetection`) with custom prompt additions and output format options.
* **Visual Content Understanding:** Extract information from charts, diagrams, and other visual content (`gemini_contentUnderstanding`) with structured output options.
* **Audio Transcription:** Transcribe audio files with optional timestamps and multilingual support (`gemini_audioTranscription`) for both small and large files.


## Prerequisites

* Node.js (v18 or later)
* An API Key from **Google AI Studio** (<https://aistudio.google.com/app/apikey>).
  * **Important:** The File Handling and Caching APIs are **only compatible with Google AI Studio API keys** and are **not supported** when using Vertex AI credentials. This server does not currently support Vertex AI authentication.

## Installation & Setup

### Installing via Smithery

To install Gemini Server for Claude Desktop automatically via [Smithery](https://smithery.ai/server/@bsmi021/mcp-gemini-server):

```bash
npx -y @smithery/cli install @bsmi021/mcp-gemini-server --client claude
```

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
            "GEMINI_SAFE_FILE_BASE_DIR": "/path/to/allowed/files" // Optional: Restrict file operations
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

## Available Tools

This server provides the following MCP tools. Parameter schemas are defined using Zod for validation and description.

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
    * `safetySettings` (array) - Controls content filtering by harm category
    * `systemInstruction` (string or object) - System instruction to guide model behavior
    * `cachedContentName` (string) - Identifier for cached content to use with this request
  * *Note:* Can handle both multimodal inputs and cached content for improved efficiency
* **`gemini_generateContentStream`**
  * *Description:* Generates text content via streaming. (Note: Current implementation uses a workaround and collects all chunks before returning the full text).
  * *Required Params:* `prompt` (string)
  * *Optional Params:* 
    * `modelName` (string) - Name of the model to use
    * `generationConfig` (object) - Controls generation parameters like temperature, topP, etc.
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
    * `safetySettings` (array) - Controls content filtering
    * `systemInstruction` (string or object) - System instruction to guide model behavior
    * `cachedContentName` (string) - Identifier for cached content to use with this session
* **`gemini_sendMessage`**
  * *Description:* Sends a message within an existing chat session.
  * *Required Params:* `sessionId` (string), `message` (string)
  * *Optional Params:* 
    * `generationConfig` (object) - Controls generation parameters
    * `safetySettings` (array) - Controls content filtering
    * `tools` (array) - Tool definitions including function declarations
    * `toolConfig` (object) - Configures tool behavior
    * `cachedContentName` (string) - Identifier for cached content to use with this message
* **`gemini_sendFunctionResult`**
  * *Description:* Sends the result of a function execution back to a chat session.
  * *Required Params:* `sessionId` (string), `functionResponse` (string) - The result of the function execution
  * *Optional Params:* `functionCall` (object) - Reference to the original function call

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
    * `modelName` (string - defaults to "gemini-2.0-flash-exp-image-generation" for Gemini models, or use "imagen-3.0-generate-002" for higher quality dedicated image generation)
    * `resolution` (string enum: "512x512", "1024x1024", "1536x1536")
    * `numberOfImages` (number - 1-4, default: 1)
    * `safetySettings` (array) - Controls content filtering for generated images
    * `negativePrompt` (string - features to avoid in the generated image)
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

**Example 7b: Generating a High-Quality Image with Imagen 3**

```xml
<use_mcp_tool>
  <server_name>gemini-server</server_name>
  <tool_name>gemini_generateImage</tool_name>
  <arguments>
    {
      "prompt": "A futuristic cityscape with flying cars and neon lights",
      "modelName": "imagen-3.0-generate-002",
      "resolution": "1024x1024",
      "numberOfImages": 4,
      "negativePrompt": "dystopian, ruins, dark, gloomy"
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

## Environment Variables

Required:
- `GOOGLE_GEMINI_API_KEY`: Your Google Gemini API key (required)

Optional:
- `GOOGLE_GEMINI_MODEL`: Default model to use (e.g., `gemini-1.5-pro-latest`, `gemini-1.5-flash-latest`)
- `GOOGLE_GEMINI_IMAGE_RESOLUTION`: Default image resolution (512x512, 1024x1024, or 1536x1536)
- `GOOGLE_GEMINI_MAX_IMAGE_SIZE_MB`: Maximum allowed image size in MB
- `GOOGLE_GEMINI_SUPPORTED_IMAGE_FORMATS`: JSON array of supported image formats (e.g., `["image/jpeg","image/png","image/webp"]`)
- `GEMINI_SAFE_FILE_BASE_DIR`: Restricts file operations to a specific directory for security (defaults to current working directory)

You can create a `.env` file in the root directory with these variables:

```env
GOOGLE_GEMINI_API_KEY=your_api_key_here
GOOGLE_GEMINI_MODEL=gemini-1.5-pro-latest
GOOGLE_GEMINI_IMAGE_RESOLUTION=1024x1024
GOOGLE_GEMINI_MAX_IMAGE_SIZE_MB=10
GOOGLE_GEMINI_SUPPORTED_IMAGE_FORMATS=["image/jpeg","image/png","image/webp"]
GEMINI_SAFE_FILE_BASE_DIR=/path/to/allowed/files
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
