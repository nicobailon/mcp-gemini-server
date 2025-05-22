import { z } from "zod";
import {
  ReviewFocusSchema,
  ReasoningEffortSchema,
} from "./geminiGitLocalDiffReviewParams.js";

// Zod schema for GitHub pull request review tool parameters
export const GeminiGitHubPRReviewParamsSchema = z.object({
  // Required parameters
  prUrl: z.string().url({ message: "Must be a valid GitHub pull request URL" }),

  // Optional parameters
  model: z.string().optional(),
  reasoningEffort: ReasoningEffortSchema.optional().default("medium"),
  reviewFocus: ReviewFocusSchema.optional().default("general"),
  // Deprecated: filesOnly parameter is no longer used by the service
  // Kept for backward compatibility in the API but has no effect
  filesOnly: z.boolean().optional().default(false),
  excludePatterns: z.array(z.string()).optional().default([]),
  customPrompt: z.string().optional(),
});

// TypeScript interface for GitHub pull request review tool parameters
export type GeminiGitHubPRReviewParams = z.infer<
  typeof GeminiGitHubPRReviewParamsSchema
>;
