// Using vitest globals - see vitest.config.ts globals: true
import { geminiAnalyzeImageUrlTool } from "../../../src/tools/geminiAnalyzeImageUrlTool.js";
import { GeminiService } from "../../../src/services/GeminiService.js";
import {
  GeminiContentFilterError,
  GeminiQuotaError,
  GeminiValidationError,
} from "../../../src/utils/geminiErrors.js";
import type { ImagePart } from "@google/genai";

describe("geminiAnalyzeImageUrlTool", () => {
  let mockGeminiService: Partial<GeminiService>;
  let mockProcessImageUrl: ReturnType<typeof vi.fn>;
  let mockAnalyzeImageWithPrompt: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockProcessImageUrl = vi.fn();
    mockAnalyzeImageWithPrompt = vi.fn();

    mockGeminiService = {
      processImageUrl: mockProcessImageUrl,
      analyzeImageWithPrompt: mockAnalyzeImageWithPrompt,
    };
  });

  describe("tool definition", () => {
    it("should have correct metadata", () => {
      expect(geminiAnalyzeImageUrlTool.name).toBe("analyzeImageUrl");
      expect(geminiAnalyzeImageUrlTool.description).toContain(
        "Analyze an image from a URL using Google's Gemini Vision API"
      );
      expect(geminiAnalyzeImageUrlTool.description).toContain(
        "PNG, JPEG, and WEBP"
      );
      expect(geminiAnalyzeImageUrlTool.description).toContain("20MB");
    });

    it("should have valid input schema", () => {
      const schema = geminiAnalyzeImageUrlTool.inputSchema;
      expect(schema).toBeDefined();

      // Test valid input
      const validInput = {
        imageUrl: "https://example.com/image.png",
        prompt: "Describe this image",
      };
      expect(() => schema.parse(validInput)).not.toThrow();

      // Test invalid inputs
      expect(() =>
        schema.parse({ imageUrl: "not-a-url", prompt: "test" })
      ).toThrow();
      expect(() =>
        schema.parse({ imageUrl: "https://example.com", prompt: "" })
      ).toThrow();
      expect(() => schema.parse({ imageUrl: "https://example.com" })).toThrow();
      expect(() => schema.parse({ prompt: "test" })).toThrow();
    });
  });

  describe("execute function", () => {
    it("should successfully analyze an image from URL", async () => {
      const mockImagePart: ImagePart = {
        inlineData: {
          data: "base64-image-data",
          mimeType: "image/png",
        },
      };
      const mockAnalysisResult = "This is a beautiful sunset over the ocean.";

      mockProcessImageUrl.mockResolvedValue(mockImagePart);
      mockAnalyzeImageWithPrompt.mockResolvedValue(mockAnalysisResult);

      const args = {
        imageUrl: "https://example.com/sunset.png",
        prompt: "Describe this image in detail",
      };

      const result = await geminiAnalyzeImageUrlTool.execute(
        args,
        mockGeminiService as GeminiService
      );

      expect(mockProcessImageUrl).toHaveBeenCalledWith(
        "https://example.com/sunset.png"
      );
      expect(mockAnalyzeImageWithPrompt).toHaveBeenCalledWith(
        mockImagePart,
        "Describe this image in detail"
      );
      expect(result).toBe(mockAnalysisResult);
    });

    it("should handle processImageUrl errors", async () => {
      const error = new Error("URL is blocked");
      mockProcessImageUrl.mockRejectedValue(error);

      const args = {
        imageUrl: "https://malicious.com/image.png",
        prompt: "Analyze this",
      };

      await expect(
        geminiAnalyzeImageUrlTool.execute(
          args,
          mockGeminiService as GeminiService
        )
      ).rejects.toThrow(GeminiContentFilterError);

      try {
        await geminiAnalyzeImageUrlTool.execute(
          args,
          mockGeminiService as GeminiService
        );
      } catch (err) {
        expect(err).toBeInstanceOf(GeminiContentFilterError);
        expect((err as GeminiContentFilterError).message).toContain(
          "Content filtered"
        );
      }
    });

    it("should handle analyzeImageWithPrompt errors", async () => {
      const mockImagePart: ImagePart = {
        inlineData: {
          data: "base64-image-data",
          mimeType: "image/png",
        },
      };

      mockProcessImageUrl.mockResolvedValue(mockImagePart);
      mockAnalyzeImageWithPrompt.mockRejectedValue(new Error("API rate limit"));

      const args = {
        imageUrl: "https://example.com/image.png",
        prompt: "Describe this",
      };

      await expect(
        geminiAnalyzeImageUrlTool.execute(
          args,
          mockGeminiService as GeminiService
        )
      ).rejects.toThrow(GeminiQuotaError);

      try {
        await geminiAnalyzeImageUrlTool.execute(
          args,
          mockGeminiService as GeminiService
        );
      } catch (err) {
        expect(err).toBeInstanceOf(GeminiQuotaError);
        expect((err as GeminiQuotaError).message).toContain(
          "API quota exceeded"
        );
      }
    });

    it("should handle invalid arguments", async () => {
      const invalidArgs = {
        imageUrl: "not-a-url",
        prompt: "test",
      };

      await expect(
        geminiAnalyzeImageUrlTool.execute(
          invalidArgs,
          mockGeminiService as GeminiService
        )
      ).rejects.toThrow(GeminiValidationError);

      try {
        await geminiAnalyzeImageUrlTool.execute(
          invalidArgs,
          mockGeminiService as GeminiService
        );
      } catch (err) {
        expect(err).toBeInstanceOf(GeminiValidationError);
        expect((err as GeminiValidationError).message).toContain(
          "Validation error"
        );
      }
    });

    it("should handle empty analysis results", async () => {
      const mockImagePart: ImagePart = {
        inlineData: {
          data: "base64-image-data",
          mimeType: "image/jpeg",
        },
      };

      mockProcessImageUrl.mockResolvedValue(mockImagePart);
      mockAnalyzeImageWithPrompt.mockResolvedValue("");

      const args = {
        imageUrl: "https://example.com/image.jpg",
        prompt: "What's in this image?",
      };

      const result = await geminiAnalyzeImageUrlTool.execute(
        args,
        mockGeminiService as GeminiService
      );

      expect(result).toBe("");
    });

    it("should work with different image formats", async () => {
      const testCases = [
        { mimeType: "image/png", url: "https://example.com/test.png" },
        { mimeType: "image/jpeg", url: "https://example.com/test.jpg" },
        { mimeType: "image/webp", url: "https://example.com/test.webp" },
      ];

      for (const testCase of testCases) {
        const mockImagePart: ImagePart = {
          inlineData: {
            data: `base64-${testCase.mimeType}-data`,
            mimeType: testCase.mimeType,
          },
        };

        mockProcessImageUrl.mockResolvedValue(mockImagePart);
        mockAnalyzeImageWithPrompt.mockResolvedValue(
          `Analysis of ${testCase.mimeType}`
        );

        const args = {
          imageUrl: testCase.url,
          prompt: "Analyze this image",
        };

        const result = await geminiAnalyzeImageUrlTool.execute(
          args,
          mockGeminiService as GeminiService
        );

        expect(result).toBe(`Analysis of ${testCase.mimeType}`);
        expect(mockProcessImageUrl).toHaveBeenCalledWith(testCase.url);
      }
    });

    it("should handle complex prompts", async () => {
      const mockImagePart: ImagePart = {
        inlineData: {
          data: "base64-image-data",
          mimeType: "image/png",
        },
      };
      const complexPrompt = `Please analyze this image and provide:
1. A detailed description
2. Any text visible in the image
3. The dominant colors
4. The mood or atmosphere conveyed`;

      mockProcessImageUrl.mockResolvedValue(mockImagePart);
      mockAnalyzeImageWithPrompt.mockResolvedValue(
        "Detailed analysis results..."
      );

      const args = {
        imageUrl: "https://example.com/complex.png",
        prompt: complexPrompt,
      };

      const result = await geminiAnalyzeImageUrlTool.execute(
        args,
        mockGeminiService as GeminiService
      );

      expect(mockAnalyzeImageWithPrompt).toHaveBeenCalledWith(
        mockImagePart,
        complexPrompt
      );
      expect(result).toBe("Detailed analysis results...");
    });
  });
});
