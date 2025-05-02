import { describe, it } from "node:test";
import assert from "node:assert";
import {
  processTemplate,
  getReviewTemplate,
  getFocusInstructions,
} from "../../../../src/services/gemini/GeminiPromptTemplates.js";

describe("GeminiPromptTemplates", () => {
  describe("processTemplate()", () => {
    it("should replace placeholders with values", () => {
      const template = "Hello {{name}}, welcome to {{place}}!";
      const context = {
        name: "John",
        place: "Paris",
      };

      const result = processTemplate(template, context);
      assert.strictEqual(result, "Hello John, welcome to Paris!");
    });

    it("should handle missing placeholders", () => {
      const template = "Hello {{name}}, welcome to {{place}}!";
      const context = {
        name: "John",
      };

      const result = processTemplate(template, context);
      assert.strictEqual(result, "Hello John, welcome to !");
    });

    it("should handle undefined values", () => {
      const template = "Hello {{name}}, welcome to {{place}}!";
      const context = {
        name: "John",
        place: undefined,
      };

      const result = processTemplate(template, context);
      assert.strictEqual(result, "Hello John, welcome to !");
    });

    it("should handle non-string values", () => {
      const template = "The answer is {{answer}}.";
      const context = {
        answer: 42,
      };

      const result = processTemplate(template, context);
      assert.strictEqual(result, "The answer is 42.");
    });
  });

  describe("getReviewTemplate()", () => {
    it("should return different templates for different review focuses", () => {
      const securityTemplate = getReviewTemplate("security");
      const performanceTemplate = getReviewTemplate("performance");
      const architectureTemplate = getReviewTemplate("architecture");
      const bugsTemplate = getReviewTemplate("bugs");
      const generalTemplate = getReviewTemplate("general");

      // Verify all templates are strings and different from each other
      assert.strictEqual(typeof securityTemplate, "string");
      assert.strictEqual(typeof performanceTemplate, "string");
      assert.strictEqual(typeof architectureTemplate, "string");
      assert.strictEqual(typeof bugsTemplate, "string");
      assert.strictEqual(typeof generalTemplate, "string");

      assert.notStrictEqual(securityTemplate, performanceTemplate);
      assert.notStrictEqual(securityTemplate, architectureTemplate);
      assert.notStrictEqual(securityTemplate, bugsTemplate);
      assert.notStrictEqual(securityTemplate, generalTemplate);
      assert.notStrictEqual(performanceTemplate, architectureTemplate);
      assert.notStrictEqual(performanceTemplate, bugsTemplate);
      assert.notStrictEqual(performanceTemplate, generalTemplate);
      assert.notStrictEqual(architectureTemplate, bugsTemplate);
      assert.notStrictEqual(architectureTemplate, generalTemplate);
      assert.notStrictEqual(bugsTemplate, generalTemplate);
    });

    it("should return a template containing expected keywords for each focus", () => {
      // Security template should mention security concepts
      const securityTemplate = getReviewTemplate("security");
      assert.ok(securityTemplate.includes("security"));
      assert.ok(securityTemplate.includes("vulnerabilit"));

      // Performance template should mention performance concepts
      const performanceTemplate = getReviewTemplate("performance");
      assert.ok(performanceTemplate.includes("performance"));
      assert.ok(performanceTemplate.includes("optimiz"));

      // Architecture template should mention architecture concepts
      const architectureTemplate = getReviewTemplate("architecture");
      assert.ok(architectureTemplate.includes("architect"));
      assert.ok(architectureTemplate.includes("design"));

      // Bugs template should mention bug-related concepts
      const bugsTemplate = getReviewTemplate("bugs");
      assert.ok(bugsTemplate.includes("bug"));
      assert.ok(bugsTemplate.includes("error"));

      // General template should be comprehensive
      const generalTemplate = getReviewTemplate("general");
      assert.ok(generalTemplate.includes("comprehensive"));
    });
  });

  describe("getFocusInstructions()", () => {
    it("should return different instructions for different focuses", () => {
      const securityInstructions = getFocusInstructions("security");
      const performanceInstructions = getFocusInstructions("performance");
      const architectureInstructions = getFocusInstructions("architecture");
      const bugsInstructions = getFocusInstructions("bugs");
      const generalInstructions = getFocusInstructions("general");

      // Verify all instructions are strings and different from each other
      assert.strictEqual(typeof securityInstructions, "string");
      assert.strictEqual(typeof performanceInstructions, "string");
      assert.strictEqual(typeof architectureInstructions, "string");
      assert.strictEqual(typeof bugsInstructions, "string");
      assert.strictEqual(typeof generalInstructions, "string");

      assert.notStrictEqual(securityInstructions, performanceInstructions);
      assert.notStrictEqual(securityInstructions, architectureInstructions);
      assert.notStrictEqual(securityInstructions, bugsInstructions);
      assert.notStrictEqual(securityInstructions, generalInstructions);
      assert.notStrictEqual(performanceInstructions, architectureInstructions);
      assert.notStrictEqual(performanceInstructions, bugsInstructions);
      assert.notStrictEqual(performanceInstructions, generalInstructions);
      assert.notStrictEqual(architectureInstructions, bugsInstructions);
      assert.notStrictEqual(architectureInstructions, generalInstructions);
      assert.notStrictEqual(bugsInstructions, generalInstructions);
    });

    it("should include focus-specific keywords in each instruction", () => {
      // Security instructions should mention security concepts
      const securityInstructions = getFocusInstructions("security");
      assert.ok(securityInstructions.includes("security"));
      assert.ok(securityInstructions.includes("vulnerabilities"));

      // Performance instructions should mention performance concepts
      const performanceInstructions = getFocusInstructions("performance");
      assert.ok(performanceInstructions.includes("performance"));
      assert.ok(performanceInstructions.includes("algorithm"));

      // Architecture instructions should mention architecture concepts
      const architectureInstructions = getFocusInstructions("architecture");
      assert.ok(architectureInstructions.includes("architectural"));
      assert.ok(architectureInstructions.includes("design pattern"));

      // Bugs instructions should mention bug-related concepts
      const bugsInstructions = getFocusInstructions("bugs");
      assert.ok(bugsInstructions.includes("bugs"));
      assert.ok(bugsInstructions.includes("errors"));

      // General instructions should be comprehensive
      const generalInstructions = getFocusInstructions("general");
      assert.ok(generalInstructions.includes("comprehensive"));
    });
  });
});
