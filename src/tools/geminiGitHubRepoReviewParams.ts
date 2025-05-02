import { z } from "zod";
import {
  ReviewFocusSchema,
  ReasoningEffortSchema,
} from "./geminiGitLocalDiffReviewParams.js";

// Zod schema for GitHub repository review tool parameters
export const GeminiGitHubRepoReviewParamsSchema = z.object({
  // Required parameters
  repoUrl: z.string().url({ message: "Must be a valid GitHub URL" }),

  // Optional parameters
  model: z.string().optional(),
  reasoningEffort: ReasoningEffortSchema.optional().default("medium"),
  reviewFocus: ReviewFocusSchema.optional().default("general"),
  branch: z.string().optional(),
  maxFiles: z.number().int().positive().optional().default(50),
  excludePatterns: z.array(z.string()).optional().default([]),
  prioritizeFiles: z.array(z.string()).optional(),
  customPrompt: z.string().optional(),
});

// TypeScript interface for GitHub repository review tool parameters
export type GeminiGitHubRepoReviewParams = z.infer<
  typeof GeminiGitHubRepoReviewParamsSchema
>;
