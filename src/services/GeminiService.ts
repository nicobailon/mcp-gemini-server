// Existing code remains unchanged until the generateContent method...

public async generateContent(
  prompt: string,
  modelName?: string,
  generationConfig?: GenerationConfig,
  safetySettings?: SafetySetting[],
  systemInstruction?: Content,
  cachedContentName?: string,
  fileReferenceOrInlineData?: FileMetadata | string,
  inlineDataMimeType?: string
): Promise<string> {
  const effectiveModelName = modelName ?? this.defaultModelName;
  if (!effectiveModelName) {
    throw new GeminiApiError(
      "Model name must be provided either as a parameter or via the GOOGLE_GEMINI_MODEL environment variable."
    );
  }
  logger.debug(`generateContent called with model: ${effectiveModelName}`);

  try {
    // Construct base content parts array
    let contentParts: Part[] = [];
    contentParts.push({ text: prompt });

    // Add file reference or inline data if provided
    if (fileReferenceOrInlineData) {
      if (typeof fileReferenceOrInlineData === 'string' && inlineDataMimeType) {
        // Handle inline base64 data
        contentParts.push({
          inlineData: {
            data: fileReferenceOrInlineData,
            mimeType: inlineDataMimeType
          }
        });
      } else if (typeof fileReferenceOrInlineData === 'object' && 'name' in fileReferenceOrInlineData && fileReferenceOrInlineData.uri) {
        // Handle file reference
        contentParts.push({
          fileData: {
            fileUri: fileReferenceOrInlineData.uri,
            mimeType: fileReferenceOrInlineData.mimeType
          }
        });
      } else {
        throw new GeminiApiError("Invalid file reference or inline data provided");
      }
    }

    // Construct the config object
    const callConfig: GenerateContentConfig = {};
    if (generationConfig) {
      Object.assign(callConfig, generationConfig);
    }
    if (safetySettings) {
      callConfig.safetySettings = safetySettings;
    }
    if (systemInstruction) {
      callConfig.systemInstruction = systemInstruction;
    }
    if (cachedContentName) {
      callConfig.cachedContent = cachedContentName;
    }

    // Create generate content parameters
    const params: GenerateContentParameters = {
      model: effectiveModelName,
      contents: [{ role: "user", parts: contentParts }],
      config: Object.keys(callConfig).length > 0 ? callConfig : undefined,
    };

    // Call generateContent with enhanced parameters
    const result: GenerateContentResponse = await this.genAI.models.generateContent(params);

    // Rest of the response handling code remains unchanged...
  } catch (error: unknown) {
    // Error handling remains unchanged...
  }
}

// Rest of the file remains unchanged...