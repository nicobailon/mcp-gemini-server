# MCP Gemini Server

[Previous content remains unchanged until Features section...]

## Features

* **Core Generation:** Standard (`gemini_generateContent`) and streaming (`gemini_generateContentStream`) text generation.
* **Function Calling:** Enables Gemini models to request the execution of client-defined functions (`gemini_functionCall`).
* **Stateful Chat:** Manages conversational context across multiple turns (`gemini_startChat`, `gemini_sendMessage`, `gemini_sendFunctionResult`).
* **File Handling:** Upload, list, retrieve, and delete files using the Gemini API.
* **Caching:** Create, list, retrieve, update, and delete cached content to optimize prompts.
* **Image Generation:** Generate images from text prompts using Gemini 2.5 Flash (`gemini_generateImage`).
* **Object Detection:** Detect objects in images and return bounding box coordinates (`gemini_objectDetection`).
* **Visual Content Understanding:** Extract information from charts, diagrams, and other visual content (`gemini_contentUnderstanding`).
* **Audio Transcription:** Transcribe audio files with optional timestamps and multilingual support (`gemini_audioTranscription`).

[Previous content remains unchanged until Available Tools section...]

### Audio Transcription

* **`gemini_audioTranscription`**
  * *Description:* Transcribes audio files using Gemini 2.5 models. Supports both direct processing (<20MB) and File API processing (up to 2GB with Google AI Studio API key).
  * *Required Params:* `filePath` (string - **must be an absolute path** accessible by the server process)
  * *Optional Params:*
    * `modelName` (string - defaults to server's default model)
    * `includeTimestamps` (boolean - include timestamps for paragraphs/speaker changes)
    * `language` (string - BCP-47 code, e.g., 'en-US', 'fr-FR')
    * `prompt` (string - additional instructions for transcription)
    * `mimeType` (string - audio format, inferred from extension if not provided)
  * *Supported Audio Formats:* MP3, WAV, OGG, M4A, FLAC (audio/mpeg, audio/wav, audio/ogg, audio/mp4, audio/x-m4a, audio/flac, audio/x-flac)
  * *Notes:*
    * Files under 20MB are processed directly with inline base64 encoding
    * Files over 20MB require a Google AI Studio API key and use the File API
    * Files over 2GB are not supported

[Previous content remains unchanged until Usage Examples section where we add:]

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

[Previous content remains unchanged until Known Issues section where we add:]

* Audio transcription of files over 20MB requires a Google AI Studio API key for File API access
* Audio files must be accessible via absolute paths from the server's environment
* Timestamp accuracy may vary depending on the model and audio quality
* Some audio formats may require explicit MIME type specification if the extension-based inference fails

[Rest of file remains unchanged...]