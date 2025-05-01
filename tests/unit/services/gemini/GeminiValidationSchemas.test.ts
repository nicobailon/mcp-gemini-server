import { describe, it } from "node:test";
import assert from "node:assert";
import { ZodError } from "zod";
import {
  validateImageGenerationParams,
  validateGenerateContentParams,
  validateRouteMessageParams,
  ImageGenerationParamsSchema,
  GenerateContentParamsSchema,
  RouteMessageParamsSchema,
  ThinkingConfigSchema,
  GenerationConfigSchema
} from "../../../../src/services/gemini/GeminiValidationSchemas.js";

describe("GeminiValidationSchemas", () => {
  describe("Image Generation Validation", () => {
    it("should validate valid image generation parameters", () => {
      const validParams = {
        prompt: "A beautiful sunset over the ocean",
        modelName: "imagen-3.1-generate-003",
        resolution: "1024x1024",
        numberOfImages: 2,
        safetySettings: [
          {
            category: "HARM_CATEGORY_HARASSMENT",
            threshold: "BLOCK_MEDIUM_AND_ABOVE"
          }
        ],
        negativePrompt: "clouds, rain",
        stylePreset: "photographic",
        seed: 12345,
        styleStrength: 0.75
      };
      
      // Should not throw
      const result = ImageGenerationParamsSchema.parse(validParams);
      assert.strictEqual(result.prompt, validParams.prompt);
      assert.strictEqual(result.modelName, validParams.modelName);
      assert.strictEqual(result.resolution, validParams.resolution);
    });
    
    it("should validate using the validateImageGenerationParams helper", () => {
      const result = validateImageGenerationParams(
        "A beautiful sunset",
        "imagen-3.1-generate-003",
        "1024x1024",
        2
      );
      
      assert.strictEqual(result.prompt, "A beautiful sunset");
      assert.strictEqual(result.modelName, "imagen-3.1-generate-003");
      assert.strictEqual(result.resolution, "1024x1024");
      assert.strictEqual(result.numberOfImages, 2);
    });
    
    it("should throw on invalid prompt", () => {
      assert.throws(
        () => ImageGenerationParamsSchema.parse({ prompt: "" }),
        (err: unknown) => {
          assert(err instanceof ZodError);
          const zodError = err as ZodError;
          assert.strictEqual(zodError.errors[0].path[0], "prompt");
          return true;
        }
      );
    });
    
    it("should throw on invalid resolution", () => {
      assert.throws(
        () => ImageGenerationParamsSchema.parse({ 
          prompt: "valid prompt",
          resolution: "invalid-resolution" 
        }),
        (err: unknown) => {
          assert(err instanceof ZodError);
          const zodError = err as ZodError;
          assert.strictEqual(zodError.errors[0].path[0], "resolution");
          return true;
        }
      );
    });
    
    it("should throw on invalid numberOfImages", () => {
      assert.throws(
        () => ImageGenerationParamsSchema.parse({ 
          prompt: "valid prompt",
          numberOfImages: 20 // Max is 8
        }),
        (err: unknown) => {
          assert(err instanceof ZodError);
          const zodError = err as ZodError;
          assert.strictEqual(zodError.errors[0].path[0], "numberOfImages");
          return true;
        }
      );
    });
    
    it("should throw on invalid styleStrength", () => {
      assert.throws(
        () => ImageGenerationParamsSchema.parse({ 
          prompt: "valid prompt",
          styleStrength: 2.5 // Max is 1.0
        }),
        (err: unknown) => {
          assert(err instanceof ZodError);
          const zodError = err as ZodError;
          assert.strictEqual(zodError.errors[0].path[0], "styleStrength");
          return true;
        }
      );
    });
  });
  
  describe("Thinking Budget Validation", () => {
    it("should validate valid thinking budget", () => {
      const validThinkingConfig = {
        thinkingBudget: 5000
      };
      
      // Should not throw
      const result = ThinkingConfigSchema.parse(validThinkingConfig);
      assert.strictEqual(result.thinkingBudget, 5000);
    });
    
    it("should validate empty thinking budget object", () => {
      const emptyThinkingConfig = {};
      
      // Should not throw
      const result = ThinkingConfigSchema.parse(emptyThinkingConfig);
      assert.strictEqual(result.thinkingBudget, undefined);
    });
    
    it("should validate valid reasoningEffort values", () => {
      const validValues = ["none", "low", "medium", "high"];
      
      for (const value of validValues) {
        // Should not throw
        const result = ThinkingConfigSchema.parse({ reasoningEffort: value });
        assert.strictEqual(result.reasoningEffort, value);
      }
    });
    
    it("should throw on invalid reasoningEffort values", () => {
      assert.throws(
        () => ThinkingConfigSchema.parse({ reasoningEffort: "invalid" }),
        (err: unknown) => {
          assert(err instanceof ZodError);
          const zodError = err as ZodError;
          assert.strictEqual(zodError.errors[0].path[0], "reasoningEffort");
          return true;
        }
      );
    });
    
    it("should validate both thinkingBudget and reasoningEffort in same object", () => {
      const config = {
        thinkingBudget: 5000,
        reasoningEffort: "medium"
      };
      
      // Should not throw
      const result = ThinkingConfigSchema.parse(config);
      assert.strictEqual(result.thinkingBudget, 5000);
      assert.strictEqual(result.reasoningEffort, "medium");
    });
    
    it("should validate thinking budget at boundaries", () => {
      // Min value (0)
      assert.doesNotThrow(() => 
        ThinkingConfigSchema.parse({ thinkingBudget: 0 })
      );
      
      // Max value (24576)
      assert.doesNotThrow(() => 
        ThinkingConfigSchema.parse({ thinkingBudget: 24576 })
      );
    });
    
    it("should throw on invalid thinking budget values", () => {
      // Below min value
      assert.throws(
        () => ThinkingConfigSchema.parse({ thinkingBudget: -1 }),
        (err: unknown) => {
          assert(err instanceof ZodError);
          const zodError = err as ZodError;
          assert.strictEqual(zodError.errors[0].path[0], "thinkingBudget");
          return true;
        }
      );
      
      // Above max value
      assert.throws(
        () => ThinkingConfigSchema.parse({ thinkingBudget: 30000 }),
        (err: unknown) => {
          assert(err instanceof ZodError);
          const zodError = err as ZodError;
          assert.strictEqual(zodError.errors[0].path[0], "thinkingBudget");
          return true;
        }
      );
      
      // Non-integer value
      assert.throws(
        () => ThinkingConfigSchema.parse({ thinkingBudget: 100.5 }),
        (err: unknown) => {
          assert(err instanceof ZodError);
          const zodError = err as ZodError;
          assert.strictEqual(zodError.errors[0].path[0], "thinkingBudget");
          return true;
        }
      );
    });
    
    it("should validate thinking config within generation config", () => {
      const validGenerationConfig = {
        temperature: 0.7,
        thinkingConfig: {
          thinkingBudget: 5000
        }
      };
      
      // Should not throw
      const result = GenerationConfigSchema.parse(validGenerationConfig);
      assert.strictEqual(result.temperature, 0.7);
      assert.strictEqual(result.thinkingConfig?.thinkingBudget, 5000);
    });
    
    it("should validate reasoningEffort within generation config", () => {
      const validGenerationConfig = {
        temperature: 0.7,
        thinkingConfig: {
          reasoningEffort: "high"
        }
      };
      
      // Should not throw
      const result = GenerationConfigSchema.parse(validGenerationConfig);
      assert.strictEqual(result.temperature, 0.7);
      assert.strictEqual(result.thinkingConfig?.reasoningEffort, "high");
    });
    
    it("should throw on invalid thinking budget in generation config", () => {
      assert.throws(
        () => GenerationConfigSchema.parse({
          temperature: 0.7,
          thinkingConfig: {
            thinkingBudget: 30000 // Above max
          }
        }),
        (err: unknown) => {
          assert(err instanceof ZodError);
          const zodError = err as ZodError;
          assert.strictEqual(zodError.errors[0].path[0], "thinkingConfig");
          assert.strictEqual(zodError.errors[0].path[1], "thinkingBudget");
          return true;
        }
      );
    });
  });

  describe("Content Generation Validation", () => {
    it("should validate valid content generation parameters", () => {
      const validParams = {
        prompt: "Tell me about AI",
        modelName: "gemini-1.5-flash",
        generationConfig: {
          temperature: 0.7,
          topP: 0.9,
          maxOutputTokens: 1000,
          thinkingConfig: {
            thinkingBudget: 4096
          }
        },
        safetySettings: [
          {
            category: "HARM_CATEGORY_HARASSMENT",
            threshold: "BLOCK_MEDIUM_AND_ABOVE"
          }
        ],
        systemInstruction: "You are a helpful assistant",
      };
      
      // Should not throw
      const result = GenerateContentParamsSchema.parse(validParams);
      assert.strictEqual(result.prompt, validParams.prompt);
      assert.strictEqual(result.modelName, validParams.modelName);
      assert.deepStrictEqual(result.generationConfig, validParams.generationConfig);
    });
    
    it("should validate using the validateGenerateContentParams helper", () => {
      const result = validateGenerateContentParams({
        prompt: "Tell me about AI",
        modelName: "gemini-1.5-flash"
      });
      
      assert.strictEqual(result.prompt, "Tell me about AI");
      assert.strictEqual(result.modelName, "gemini-1.5-flash");
    });
    
    it("should throw on invalid prompt", () => {
      assert.throws(
        () => GenerateContentParamsSchema.parse({ prompt: "" }),
        (err: unknown) => {
          assert(err instanceof ZodError);
          const zodError = err as ZodError;
          assert.strictEqual(zodError.errors[0].path[0], "prompt");
          return true;
        }
      );
    });
    
    it("should throw on invalid temperature", () => {
      assert.throws(
        () => GenerateContentParamsSchema.parse({ 
          prompt: "valid prompt",
          generationConfig: {
            temperature: 2.5 // Max is 1.0
          }
        }),
        (err: unknown) => {
          assert(err instanceof ZodError);
          const zodError = err as ZodError;
          assert.strictEqual(zodError.errors[0].path[0], "generationConfig");
          assert.strictEqual(zodError.errors[0].path[1], "temperature");
          return true;
        }
      );
    });
    
    it("should accept string or ContentSchema for systemInstruction", () => {
      // String form
      assert.doesNotThrow(() => 
        GenerateContentParamsSchema.parse({
          prompt: "valid prompt",
          systemInstruction: "You are a helpful assistant"
        })
      );
      
      // Object form
      assert.doesNotThrow(() => 
        GenerateContentParamsSchema.parse({
          prompt: "valid prompt",
          systemInstruction: {
            role: "system",
            parts: [{ text: "You are a helpful assistant" }]
          }
        })
      );
    });
  });
  
  describe("Router Validation", () => {
    it("should validate valid router parameters", () => {
      const validParams = {
        message: "What is the capital of France?",
        models: ["gemini-1.5-pro", "gemini-1.5-flash"],
        routingPrompt: "Choose the best model for this question",
        defaultModel: "gemini-1.5-pro",
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 1000
        },
        safetySettings: [
          {
            category: "HARM_CATEGORY_HARASSMENT",
            threshold: "BLOCK_MEDIUM_AND_ABOVE"
          }
        ],
        systemInstruction: "You are a helpful assistant"
      };
      
      // Should not throw
      const result = RouteMessageParamsSchema.parse(validParams);
      assert.strictEqual(result.message, validParams.message);
      assert.deepStrictEqual(result.models, validParams.models);
      assert.strictEqual(result.routingPrompt, validParams.routingPrompt);
    });
    
    it("should validate using the validateRouteMessageParams helper", () => {
      const result = validateRouteMessageParams({
        message: "What is the capital of France?",
        models: ["gemini-1.5-pro", "gemini-1.5-flash"]
      });
      
      assert.strictEqual(result.message, "What is the capital of France?");
      assert.deepStrictEqual(result.models, ["gemini-1.5-pro", "gemini-1.5-flash"]);
    });
    
    it("should throw on empty message", () => {
      assert.throws(
        () => RouteMessageParamsSchema.parse({ 
          message: "",
          models: ["gemini-1.5-pro"] 
        }),
        (err: unknown) => {
          assert(err instanceof ZodError);
          const zodError = err as ZodError;
          assert.strictEqual(zodError.errors[0].path[0], "message");
          return true;
        }
      );
    });
    
    it("should throw on empty models array", () => {
      assert.throws(
        () => RouteMessageParamsSchema.parse({ 
          message: "valid message",
          models: [] 
        }),
        (err: unknown) => {
          assert(err instanceof ZodError);
          const zodError = err as ZodError;
          assert.strictEqual(zodError.errors[0].path[0], "models");
          return true;
        }
      );
    });
    
    it("should throw on missing required fields", () => {
      assert.throws(
        () => RouteMessageParamsSchema.parse({
          // Missing required message field
          models: ["gemini-1.5-pro"]
        }),
        (err: unknown) => {
          assert(err instanceof ZodError);
          const zodError = err as ZodError;
          assert.strictEqual(zodError.errors[0].path[0], "message");
          return true;
        }
      );
      
      assert.throws(
        () => RouteMessageParamsSchema.parse({
          message: "valid message"
          // Missing required models field
        }),
        (err: unknown) => {
          assert(err instanceof ZodError);
          const zodError = err as ZodError;
          assert.strictEqual(zodError.errors[0].path[0], "models");
          return true;
        }
      );
    });
    
    it("should validate optional fields when provided", () => {
      // Testing with just the required fields
      assert.doesNotThrow(() => 
        RouteMessageParamsSchema.parse({
          message: "valid message",
          models: ["gemini-1.5-pro"]
        })
      );
      
      // Testing with optional fields
      assert.doesNotThrow(() => 
        RouteMessageParamsSchema.parse({
          message: "valid message",
          models: ["gemini-1.5-pro"],
          routingPrompt: "custom prompt",
          defaultModel: "gemini-1.5-flash"
        })
      );
      
      // Testing with invalid optional field
      assert.throws(
        () => RouteMessageParamsSchema.parse({ 
          message: "valid message",
          models: ["gemini-1.5-pro"],
          defaultModel: "" // Empty string
        }),
        (err: unknown) => {
          assert(err instanceof ZodError);
          const zodError = err as ZodError;
          assert.strictEqual(zodError.errors[0].path[0], "defaultModel");
          return true;
        }
      );
    });
    
    it("should accept string or ContentSchema for systemInstruction", () => {
      // String form
      assert.doesNotThrow(() => 
        RouteMessageParamsSchema.parse({
          message: "valid message",
          models: ["gemini-1.5-pro"],
          systemInstruction: "You are a helpful assistant"
        })
      );
      
      // Object form
      assert.doesNotThrow(() => 
        RouteMessageParamsSchema.parse({
          message: "valid message",
          models: ["gemini-1.5-pro"],
          systemInstruction: {
            parts: [{ text: "You are a helpful assistant" }]
          }
        })
      );
    });
  });
});