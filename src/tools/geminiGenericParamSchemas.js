import { z } from 'zod';

// --- Function Calling Schema Definitions ---

export const functionParameterTypeSchema = z.enum([
    "OBJECT", "STRING", "NUMBER", "BOOLEAN", "ARRAY", "INTEGER"
]).describe("The data type of the function parameter.");

const baseFunctionParameterSchema = z.object({
    type: functionParameterTypeSchema,
    description: z.string().optional().describe("Description of the parameter's purpose."),
    enum: z.array(z.string()).optional().describe("Allowed string values for an ENUM-like parameter.")
});

// Handle recursive type
const functionParameterSchemaRef = baseFunctionParameterSchema.extend({
    properties: z.lazy(() => z.record(z.any()).optional()),
    required: z.array(z.string()).optional().describe("List of required property names for OBJECT types."),
    items: z.lazy(() => z.any().optional().describe("Defines the schema for items if the parameter type is ARRAY."))
});

// Actual schema with proper typing
export const functionParameterSchema = functionParameterSchemaRef.describe(
    "Schema defining a single parameter for a function declaration, potentially recursive."
);

export const functionParameterPropertiesSchema = z.record(functionParameterSchema)
    .describe("Defines nested properties if the parameter type is OBJECT.");

export const functionDeclarationSchema = z.object({
    name: z.string().min(1).describe("The name of the function to be called."),
    description: z.string().min(1).describe("A description of what the function does."),
    parameters: z.object({
        type: z.literal("OBJECT").describe("The top-level parameters structure must be an OBJECT."),
        properties: functionParameterPropertiesSchema.describe("Defines the parameters the function accepts."),
        required: z.array(z.string()).optional().describe("List of required parameter names at the top level.")
    }).describe("Schema defining the parameters the function accepts.")
}).describe("Declaration of a single function that the Gemini model can request to call.");

// Schema for the 'tools' array expected by the SDK
export const ToolSchema = z.object({
    functionDeclarations: z.array(functionDeclarationSchema).optional().describe("List of function declarations for this tool.")
    // Add other tool types like Retrieval, GoogleSearchRetrieval if needed
}).describe("Represents a tool definition containing function declarations.");

// Schema for tool configuration
export const toolConfigSchema = z.object({
    functionCallingConfig: z.object({
        mode: z.enum(["AUTO", "ANY", "NONE"]).optional().describe("The function calling mode."),
        allowedFunctionNames: z.array(z.string()).optional().describe("Optional list of function names allowed.")
    }).optional()
}).describe("Configuration for how tools should be used.");
