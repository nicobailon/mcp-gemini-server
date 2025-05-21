/**
 * Tool Schemas Index
 *
 * This barrel file exports all standardized schema definitions
 * for tools, providing a central access point.
 */

// Base schema pattern
export * from "./BaseToolSchema.js";

// Common shared schema definitions
export * from "./CommonSchemas.js";

// Tool-specific schemas
export * from "./ToolSchemas.js";

// Re-export example tool params with namespace to avoid duplicate export conflicts
import * as ExampleToolParamsModule from "./exampleToolParams.js";
export { ExampleToolParamsModule };

// Re-export other schemas with namespacing to avoid export conflicts
import * as GeminiGenerateContentParamsModule from "./geminiGenerateContentParams.js";
export { GeminiGenerateContentParamsModule };

import * as WriteToFileParamsModule from "./writeToFileParams.js";
export { WriteToFileParamsModule };

// Add exports for other tool parameter schemas as they are added
// export * from "./yourNewToolParams.js";
