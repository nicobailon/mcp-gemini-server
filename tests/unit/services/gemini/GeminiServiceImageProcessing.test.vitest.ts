import type { ImagePart } from "@google/genai";
import { GoogleGenAI } from "@google/genai";
import { ConfigurationManager } from "../../../../src/config/ConfigurationManager.js";
import { GeminiUrlContextService } from "../../../../src/services/gemini/GeminiUrlContextService.js";
import { GeminiService } from "../../../../src/services/GeminiService.js";
import "../../../../src/types/googleGenAI.js";
import { UrlSecurityService } from "../../../../src/utils/UrlSecurityService.js";

// Mock dependencies
vi.mock("../../../../src/config/ConfigurationManager.js");
vi.mock("../../../../src/utils/UrlSecurityService.js");
vi.mock("../../../../src/services/gemini/GeminiUrlContextService.js");
vi.mock("@google/genai");

// Mock ModelSelectionService
vi.mock("../../../../src/services/ModelSelectionService.js", () => ({
  ModelSelectionService: vi.fn(() => ({
    selectOptimalModel: vi.fn(() => Promise.resolve("gemini-2.0-flash-exp")),
  })),
}));

// Mock GitHubApiService
vi.mock("../../../../src/services/gemini/GitHubApiService.js", () => ({
  GitHubApiService: vi.fn(() => ({})),
}));

describe("GeminiService - Image Processing", () => {
  let geminiService: GeminiService;
  let mockConfig: ConfigurationManager;
  let mockUrlSecurityService: any;
  let mockUrlContextService: any;
  let mockGenerativeModel: any;
  let mockGenAI: any;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Setup mock configuration
    mockConfig = {
      getGoogleGeminiApiKey: vi.fn().mockReturnValue("test-api-key"),
      getGeminiTextModel: vi.fn().mockReturnValue("gemini-pro"),
      getAllowedUrls: vi.fn().mockReturnValue([]),
      getBlockedUrls: vi.fn().mockReturnValue([]),
      getGeminiServiceConfig: vi.fn().mockReturnValue({
        apiKey: "test-api-key",
        defaultModel: "gemini-pro",
        maxImageSizeMB: 20,
        supportedImageFormats: ["image/png", "image/jpeg", "image/webp"],
        modelConfiguration: {
          text: [],
          image: [],
          video: [],
          codeReview: [],
          complexReasoning: [],
          capabilities: {},
          routing: {
            preferCostEffective: true,
            preferSpeed: false,
            preferQuality: false,
          },
        },
      }),
      getModelConfiguration: vi.fn().mockReturnValue({
        text: [],
        image: [],
        video: [],
        codeReview: [],
        complexReasoning: [],
        capabilities: {},
        routing: {
          preferCostEffective: true,
          preferSpeed: false,
          preferQuality: false,
        },
      }),
      getGitHubApiToken: vi.fn().mockReturnValue("test-github-token"),
    } as any;

    // Make ConfigurationManager.getInstance() return our mock
    vi.mocked(ConfigurationManager).getInstance = vi
      .fn()
      .mockReturnValue(mockConfig);

    // Setup mock services
    mockUrlSecurityService = {
      validateUrl: vi.fn().mockResolvedValue(undefined),
    };

    mockUrlContextService = {
      fetchUrlContent: vi.fn(),
    };

    // Setup mock Generative AI
    mockGenerativeModel = {
      generateContent: vi.fn(),
    };

    mockGenAI = {
      getGenerativeModel: vi.fn().mockReturnValue(mockGenerativeModel),
    };

    // Mock the constructors
    vi.mocked(UrlSecurityService).mockImplementation(
      () => mockUrlSecurityService as any
    );
    vi.mocked(GeminiUrlContextService).mockImplementation(
      () => mockUrlContextService as any
    );
    vi.mocked(GoogleGenAI).mockImplementation(() => mockGenAI);

    // Create service instance
    geminiService = new GeminiService();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("processImageUrl", () => {
    it("should successfully process a valid PNG image URL", async () => {
      const testUrl = "https://example.com/image.png";
      const mockImageData = Buffer.from("fake-image-data");
      const expectedBase64 = mockImageData.toString("base64");

      mockUrlContextService.fetchUrlContent.mockResolvedValue({
        content: mockImageData,
        metadata: {
          contentType: "image/png",
        },
      });

      const result = await geminiService.processImageUrl(testUrl);

      expect(mockUrlSecurityService.validateUrl).toHaveBeenCalledWith(testUrl);
      expect(mockUrlContextService.fetchUrlContent).toHaveBeenCalledWith(
        testUrl,
        {
          maxContentLength: 20 * 1024 * 1024,
          convertToMarkdown: false,
          includeMetadata: true,
        }
      );

      expect(result).toEqual({
        inlineData: {
          data: expectedBase64,
          mimeType: "image/png",
        },
      } as ImagePart);
    });

    it("should successfully process a valid JPEG image URL", async () => {
      const testUrl = "https://example.com/photo.jpg";
      const mockImageData = Buffer.from("fake-jpeg-data");
      const expectedBase64 = mockImageData.toString("base64");

      mockUrlContextService.fetchUrlContent.mockResolvedValue({
        content: mockImageData,
        metadata: {
          contentType: "image/jpeg",
        },
      });

      const result = await geminiService.processImageUrl(testUrl);

      expect(result).toEqual({
        inlineData: {
          data: expectedBase64,
          mimeType: "image/jpeg",
        },
      } as ImagePart);
    });

    it("should successfully process a valid WEBP image URL", async () => {
      const testUrl = "https://example.com/modern.webp";
      const mockImageData = Buffer.from("fake-webp-data");
      const expectedBase64 = mockImageData.toString("base64");

      mockUrlContextService.fetchUrlContent.mockResolvedValue({
        content: mockImageData,
        metadata: {
          contentType: "image/webp",
        },
      });

      const result = await geminiService.processImageUrl(testUrl);

      expect(result).toEqual({
        inlineData: {
          data: expectedBase64,
          mimeType: "image/webp",
        },
      } as ImagePart);
    });

    it("should throw error when URL security validation fails", async () => {
      const testUrl = "https://malicious.com/image.png";
      const securityError = new Error("URL is blocked");

      mockUrlSecurityService.validateUrl.mockRejectedValue(securityError);

      await expect(geminiService.processImageUrl(testUrl)).rejects.toThrow(
        "URL is blocked"
      );
      expect(mockUrlContextService.fetchUrlContent).not.toHaveBeenCalled();
    });

    it("should throw error when content is not an image", async () => {
      const testUrl = "https://example.com/document.pdf";

      mockUrlContextService.fetchUrlContent.mockResolvedValue({
        content: Buffer.from("pdf-content"),
        metadata: {
          contentType: "application/pdf",
        },
      });

      await expect(geminiService.processImageUrl(testUrl)).rejects.toThrow(
        "URL does not point to an image. Content-Type: application/pdf"
      );
    });

    it("should throw error for unsupported image format", async () => {
      const testUrl = "https://example.com/image.bmp";

      mockUrlContextService.fetchUrlContent.mockResolvedValue({
        content: Buffer.from("bmp-content"),
        metadata: {
          contentType: "image/bmp",
        },
      });

      await expect(geminiService.processImageUrl(testUrl)).rejects.toThrow(
        "Unsupported image format: image/bmp. Supported formats: PNG, JPEG, WEBP"
      );
    });

    it("should throw error when content-type is missing", async () => {
      const testUrl = "https://example.com/mystery-file";

      mockUrlContextService.fetchUrlContent.mockResolvedValue({
        content: Buffer.from("mystery-content"),
        metadata: {
          contentType: undefined,
        },
      });

      await expect(geminiService.processImageUrl(testUrl)).rejects.toThrow(
        "URL does not point to an image. Content-Type: undefined"
      );
    });

    it("should respect the 20MB size limit in fetch options", async () => {
      const testUrl = "https://example.com/large-image.png";
      const mockImageData = Buffer.from("image-data");

      mockUrlContextService.fetchUrlContent.mockResolvedValue({
        content: mockImageData,
        metadata: {
          contentType: "image/png",
        },
      });

      await geminiService.processImageUrl(testUrl);

      expect(mockUrlContextService.fetchUrlContent).toHaveBeenCalledWith(
        testUrl,
        {
          maxContentLength: 20 * 1024 * 1024, // 20MB
          convertToMarkdown: false,
          includeMetadata: true,
        }
      );
    });

    it("should handle case-insensitive content-type matching", async () => {
      const testUrl = "https://example.com/image.jpg";
      const mockImageData = Buffer.from("jpeg-data");
      const expectedBase64 = mockImageData.toString("base64");

      mockUrlContextService.fetchUrlContent.mockResolvedValue({
        content: mockImageData,
        metadata: {
          contentType: "IMAGE/JPEG", // Uppercase
        },
      });

      const result = await geminiService.processImageUrl(testUrl);

      expect(result).toEqual({
        inlineData: {
          data: expectedBase64,
          mimeType: "IMAGE/JPEG",
        },
      } as ImagePart);
    });
  });

  describe("analyzeImageWithPrompt", () => {
    const mockImagePart: ImagePart = {
      inlineData: {
        data: "base64-image-data",
        mimeType: "image/png",
      },
    };

    it("should successfully analyze an image with a prompt", async () => {
      const prompt = "Describe this image";
      const expectedResponse = "This is a description of the image";

      mockGenerativeModel.generateContent.mockResolvedValue({
        response: {
          text: vi.fn().mockReturnValue(expectedResponse),
        },
      });

      const result = await geminiService.analyzeImageWithPrompt(
        mockImagePart,
        prompt
      );

      expect(mockGenAI.getGenerativeModel).toHaveBeenCalledWith({
        model: "gemini-2.0-flash-exp",
      });
      expect(mockGenerativeModel.generateContent).toHaveBeenCalledWith({
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }, mockImagePart],
          },
        ],
      });
      expect(result).toBe(expectedResponse);
    });

    it("should use custom model when specified", async () => {
      const prompt = "Analyze this image";
      const customModel = "gemini-pro-vision";
      const expectedResponse = "Analysis result";

      mockGenerativeModel.generateContent.mockResolvedValue({
        response: {
          text: vi.fn().mockReturnValue(expectedResponse),
        },
      });

      const result = await geminiService.analyzeImageWithPrompt(
        mockImagePart,
        prompt,
        customModel
      );

      expect(mockGenAI.getGenerativeModel).toHaveBeenCalledWith({
        model: customModel,
      });
      expect(result).toBe(expectedResponse);
    });

    it("should handle empty response text", async () => {
      const prompt = "What is in this image?";

      mockGenerativeModel.generateContent.mockResolvedValue({
        response: {
          text: vi.fn().mockReturnValue(""),
        },
      });

      const result = await geminiService.analyzeImageWithPrompt(
        mockImagePart,
        prompt
      );

      expect(result).toBe("");
    });

    it("should propagate errors from generateContent", async () => {
      const prompt = "Describe this image";
      const error = new Error("API rate limit exceeded");

      mockGenerativeModel.generateContent.mockRejectedValue(error);

      await expect(
        geminiService.analyzeImageWithPrompt(mockImagePart, prompt)
      ).rejects.toThrow("API rate limit exceeded");
    });

    it("should handle multiline prompts", async () => {
      const multilinePrompt = `Please analyze this image and provide:
1. A general description
2. Any text visible in the image
3. The dominant colors`;
      const expectedResponse = "Detailed analysis of the image...";

      mockGenerativeModel.generateContent.mockResolvedValue({
        response: {
          text: vi.fn().mockReturnValue(expectedResponse),
        },
      });

      const result = await geminiService.analyzeImageWithPrompt(
        mockImagePart,
        multilinePrompt
      );

      expect(mockGenerativeModel.generateContent).toHaveBeenCalledWith({
        contents: [
          {
            role: "user",
            parts: [{ text: multilinePrompt }, mockImagePart],
          },
        ],
      });
      expect(result).toBe(expectedResponse);
    });

    it("should handle different image mime types", async () => {
      const jpegImagePart: ImagePart = {
        inlineData: {
          data: "base64-jpeg-data",
          mimeType: "image/jpeg",
        },
      };
      const prompt = "What format is this image?";
      const expectedResponse = "This is a JPEG image";

      mockGenerativeModel.generateContent.mockResolvedValue({
        response: {
          text: vi.fn().mockReturnValue(expectedResponse),
        },
      });

      const result = await geminiService.analyzeImageWithPrompt(
        jpegImagePart,
        prompt
      );

      expect(mockGenerativeModel.generateContent).toHaveBeenCalledWith({
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }, jpegImagePart],
          },
        ],
      });
      expect(result).toBe(expectedResponse);
    });
  });
});
