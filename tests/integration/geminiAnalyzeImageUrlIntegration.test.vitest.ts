/// <reference types="vitest/globals" />
// Using vitest globals - see vitest.config.ts globals: true
import { geminiAnalyzeImageUrlTool } from "../../src/tools/geminiAnalyzeImageUrlTool.js";
import { z } from "zod";

describe("Gemini Analyze Image URL - Integration Tests", () => {
  describe("Tool Definition Integration", () => {
    it("should have correct tool structure for MCP integration", () => {
      // Verify tool has all required properties
      expect(geminiAnalyzeImageUrlTool).toHaveProperty("name");
      expect(geminiAnalyzeImageUrlTool).toHaveProperty("description");
      expect(geminiAnalyzeImageUrlTool).toHaveProperty("inputSchema");
      expect(geminiAnalyzeImageUrlTool).toHaveProperty("execute");

      // Verify name follows convention
      expect(geminiAnalyzeImageUrlTool.name).toBe("analyzeImageUrl");

      // Verify description contains key information
      expect(geminiAnalyzeImageUrlTool.description).toContain(
        "Gemini Vision API"
      );
      expect(geminiAnalyzeImageUrlTool.description).toContain(
        "PNG, JPEG, and WEBP"
      );
      expect(geminiAnalyzeImageUrlTool.description).toContain("20MB");
    });

    it("should have valid Zod schema for parameters", () => {
      const schema = geminiAnalyzeImageUrlTool.inputSchema;

      // Verify it's a Zod schema
      expect(schema).toBeInstanceOf(z.ZodSchema);

      // Test valid input
      const validInput = {
        imageUrl: "https://example.com/image.png",
        prompt: "Describe this image",
      };

      const result = schema.safeParse(validInput);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.imageUrl).toBe(validInput.imageUrl);
        expect(result.data.prompt).toBe(validInput.prompt);
      }

      // Test invalid URL
      const invalidUrl = {
        imageUrl: "not-a-url",
        prompt: "Describe this",
      };
      expect(schema.safeParse(invalidUrl).success).toBe(false);

      // Test empty prompt
      const emptyPrompt = {
        imageUrl: "https://example.com/image.png",
        prompt: "",
      };
      expect(schema.safeParse(emptyPrompt).success).toBe(false);

      // Test missing fields
      expect(
        schema.safeParse({ imageUrl: "https://example.com/image.png" }).success
      ).toBe(false);
      expect(schema.safeParse({ prompt: "Describe" }).success).toBe(false);
      expect(schema.safeParse({}).success).toBe(false);
    });

    it("should have execute function with correct signature", () => {
      // Verify execute is a function
      expect(typeof geminiAnalyzeImageUrlTool.execute).toBe("function");

      // Verify it's an async function
      expect(geminiAnalyzeImageUrlTool.execute.constructor.name).toBe(
        "AsyncFunction"
      );

      // Verify function length (number of parameters)
      expect(geminiAnalyzeImageUrlTool.execute.length).toBe(2);
    });

    it("should validate URL formats correctly", () => {
      const schema = geminiAnalyzeImageUrlTool.inputSchema;

      // Valid URLs
      const validUrls = [
        "https://example.com/image.png",
        "https://cdn.example.com/photos/photo.jpg",
        "https://example.com/image.webp?query=param",
        "https://subdomain.example.co.uk/path/to/image.jpeg",
      ];

      for (const url of validUrls) {
        const result = schema.safeParse({ imageUrl: url, prompt: "test" });
        expect(result.success).toBe(true);
      }

      // Invalid URLs - These fail Zod's URL validation
      // Note: file:// and ftp:// URLs pass Zod validation but are blocked by UrlSecurityService
      const invalidUrls = [
        "not-a-url",
        "example.com/image.png", // Missing protocol
        "",
      ];

      for (const url of invalidUrls) {
        const result = schema.safeParse({ imageUrl: url, prompt: "test" });
        expect(result.success).toBe(false);
      }

      // URLs that pass schema validation but would be blocked by security
      const securityBlockedUrls = [
        "file:///local/image.png",
        "ftp://example.com/image.png",
        "javascript:alert('test')",
        "data:image/png;base64,iVBORw0KG",
      ];

      // These pass schema validation but security checks would block them
      for (const url of securityBlockedUrls) {
        const result = schema.safeParse({ imageUrl: url, prompt: "test" });
        expect(result.success).toBe(true); // Schema allows them
      }
    });

    it("should validate prompt requirements", () => {
      const schema = geminiAnalyzeImageUrlTool.inputSchema;

      // Valid prompts
      const validPrompts = [
        "Describe this image",
        "What objects are in this photo?",
        "Analyze the colors and composition",
        "Extract any text visible in the image",
        "A", // Single character should be valid
      ];

      for (const prompt of validPrompts) {
        const result = schema.safeParse({
          imageUrl: "https://example.com/image.png",
          prompt,
        });
        expect(result.success).toBe(true);
      }

      // Invalid prompts
      const invalidPrompts = [
        "", // Empty string
      ];

      for (const prompt of invalidPrompts) {
        const result = schema.safeParse({
          imageUrl: "https://example.com/image.png",
          prompt,
        });
        expect(result.success).toBe(false);
      }

      // Test that whitespace gets trimmed
      const whitespaceResult = schema.safeParse({
        imageUrl: "https://example.com/image.png",
        prompt: "   test   ",
      });
      expect(whitespaceResult.success).toBe(true);
      if (whitespaceResult.success) {
        expect(whitespaceResult.data.prompt).toBe("test");
      }
    });
  });

  describe("Error Message Integration", () => {
    it("should provide clear error messages for validation failures", () => {
      const schema = geminiAnalyzeImageUrlTool.inputSchema;

      // Test invalid URL error
      const urlResult = schema.safeParse({
        imageUrl: "not-a-url",
        prompt: "test",
      });
      expect(urlResult.success).toBe(false);
      if (!urlResult.success) {
        expect(urlResult.error.issues[0].message).toContain("url");
      }

      // Test empty prompt error
      const promptResult = schema.safeParse({
        imageUrl: "https://example.com/image.png",
        prompt: "",
      });
      expect(promptResult.success).toBe(false);
      if (!promptResult.success) {
        expect(promptResult.error.issues[0].message).toBeTruthy();
      }

      // Test missing field errors
      const missingResult = schema.safeParse({});
      expect(missingResult.success).toBe(false);
      if (!missingResult.success) {
        expect(missingResult.error.issues.length).toBeGreaterThan(0);
      }
    });
  });

  describe("Tool Metadata", () => {
    it("should provide helpful description for users", () => {
      const description = geminiAnalyzeImageUrlTool.description;

      // Check that description includes important information
      expect(description).toContain("image");
      expect(description).toContain("URL");
      expect(description).toContain("Gemini");
      expect(description.length).toBeGreaterThan(50); // Should be descriptive
      expect(description.length).toBeLessThan(200); // But not too long
    });

    it("should follow naming conventions", () => {
      const name = geminiAnalyzeImageUrlTool.name;

      // Should be camelCase
      expect(name).toMatch(/^[a-z][a-zA-Z0-9]*$/);

      // Should be descriptive
      expect(name).toContain("analyze");
      expect(name).toContain("Image");
      expect(name).toContain("Url");
    });
  });
});
