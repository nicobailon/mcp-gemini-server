import { describe, it, beforeEach, afterEach, mock, expect } from "node:test";
import * as sinon from "sinon";
import { GeminiService } from "../../../../src/services/GeminiService.js";
import { GeminiApiError } from "../../../../src/utils/errors.js";
import { ImageGenerationResult } from "../../../../src/types/index.js";

describe("GeminiService - Image Generation", () => {
  // Create stubs for the GoogleGenAI SDK
  const mockGenerateImages = sinon.stub();
  const mockGetGenerativeModel = sinon.stub();
  
  // Mock response data
  const mockImageResponse = {
    images: [
      {
        data: "mockBase64Data",
        mimeType: "image/png"
      }
    ],
    promptSafetyMetadata: {
      blocked: false
    }
  };
  
  beforeEach(() => {
    // Reset the stubs before each test
    mockGenerateImages.reset();
    mockGetGenerativeModel.reset();
    
    // Configure the mock behavior
    mockGenerateImages.resolves(mockImageResponse);
    mockGetGenerativeModel.returns({
      generateImages: mockGenerateImages
    });
    
    // Override the GeminiService's genAI property with our mock
    // @ts-ignore - We're intentionally overriding private property for testing
    GeminiService.prototype["genAI"] = {
      models: {
        getGenerativeModel: mockGetGenerativeModel
      }
    };
  });
  
  afterEach(() => {
    // Clean up any remaining stubs
    sinon.restore();
  });
  
  it("should generate an image with default parameters", async () => {
    // Arrange
    const service = new GeminiService();
    const prompt = "A serene mountain landscape at sunset";
    
    // Act
    const result = await service.generateImage(prompt);
    
    // Assert
    expect(mockGetGenerativeModel.calledOnce).toBeTruthy();
    expect(mockGetGenerativeModel.firstCall.args[0]).toEqual({
      model: "imagen-3.0-generate-002"
    });
    
    expect(mockGenerateImages.calledOnce).toBeTruthy();
    expect(mockGenerateImages.firstCall.args[0]).toEqual({
      prompt,
      resolution: "1024x1024",
      numberOfImages: 1
    });
    
    // Verify the result structure
    expect(result).toHaveProperty("images");
    expect(result.images.length).toBe(1);
    expect(result.images[0]).toHaveProperty("base64Data", "mockBase64Data");
    expect(result.images[0]).toHaveProperty("mimeType", "image/png");
    expect(result.images[0]).toHaveProperty("width", 1024);
    expect(result.images[0]).toHaveProperty("height", 1024);
  });
  
  it("should generate an image with custom parameters", async () => {
    // Arrange
    const service = new GeminiService();
    const prompt = "A futuristic cityscape";
    const modelName = "gemini-2.0-flash-exp";
    const resolution = "512x512";
    const numberOfImages = 2;
    const safetySettings = [{ category: "HARM_CATEGORY_SEXUAL", threshold: "BLOCK_MEDIUM_AND_ABOVE" }];
    const negativePrompt = "cars, traffic";
    
    // Act
    const result = await service.generateImage(
      prompt,
      modelName,
      resolution,
      numberOfImages,
      safetySettings as any,
      negativePrompt
    );
    
    // Assert
    expect(mockGetGenerativeModel.calledOnce).toBeTruthy();
    expect(mockGetGenerativeModel.firstCall.args[0]).toEqual({
      model: "gemini-2.0-flash-exp"
    });
    
    expect(mockGenerateImages.calledOnce).toBeTruthy();
    expect(mockGenerateImages.firstCall.args[0]).toEqual({
      prompt,
      resolution: "512x512",
      numberOfImages: 2,
      negativePrompt,
      safetySettings
    });
    
    // Verify width and height from the specified resolution
    expect(result.images[0]).toHaveProperty("width", 512);
    expect(result.images[0]).toHaveProperty("height", 512);
  });
  
  it("should handle errors from the API", async () => {
    // Arrange
    const service = new GeminiService();
    const prompt = "A black hole eating a planet";
    const errorMessage = "API rate limit exceeded";
    
    // Configure mock to throw an error
    mockGenerateImages.rejects(new Error(errorMessage));
    
    // Act & Assert
    await expect(async () => {
      await service.generateImage(prompt);
    }).rejects.toThrow(GeminiApiError);
  });
  
  it("should throw an error when no images are generated", async () => {
    // Arrange
    const service = new GeminiService();
    const prompt = "Empty result test";
    
    // Configure mock to return empty images array
    mockGenerateImages.resolves({ images: [] });
    
    // Act & Assert
    await expect(async () => {
      await service.generateImage(prompt);
    }).rejects.toThrow("No images were generated");
  });
  
  it("should limit numberOfImages to maximum of 4", async () => {
    // Arrange
    const service = new GeminiService();
    const prompt = "Test max images";
    
    // Act
    await service.generateImage(prompt, undefined, undefined, 10);
    
    // Assert
    expect(mockGenerateImages.firstCall.args[0].numberOfImages).toBe(4);
  });
});