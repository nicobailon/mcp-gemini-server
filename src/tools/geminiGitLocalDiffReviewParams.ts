import { z } from "zod";

// Define a schema for the review focus parameter
export const ReviewFocusSchema = z.enum([
  "security",
  "performance",
  "architecture",
  "bugs",
  "general",
]);

// Define a schema for the reasoning effort parameter
export const ReasoningEffortSchema = z.enum(["none", "low", "medium", "high"]);

// Zod schema for git diff review tool parameters
export const GeminiGitLocalDiffReviewParamsSchema = z.object({
  // Required parameters
  diffContent: z.string().min(1, { message: "Diff content is required" }),

  // Optional parameters
  model: z.string().optional(),
  reasoningEffort: ReasoningEffortSchema.optional().default("medium"),
  reviewFocus: ReviewFocusSchema.optional().default("general"),
  repositoryContext: z.string().optional(),
  excludePatterns: z.array(z.string()).optional(),
  maxFilesToInclude: z.number().int().positive().optional(),
  prioritizeFiles: z.array(z.string()).optional(),
  customPrompt: z.string().optional(),
});

// TypeScript interface for git diff review tool parameters
export type GeminiGitLocalDiffReviewParams = z.infer<
  typeof GeminiGitLocalDiffReviewParamsSchema
>;
