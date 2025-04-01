import { z } from 'zod';
// Re-use schemas defined in geminiGenerateContentParams.ts for consistency
import {
    generationConfigSchema,
    safetySettingSchema
} from './geminiGenerateContentParams.js';

// Tool Name
export const GEMINI_FUNCTION_CALL_TOOL_NAME = "gemini_functionCall";

// Tool Description
export const GEMINI_FUNCTION_CALL_TOOL_DESCRIPTION = `
Generates content using a specified Google Gemini model, enabling the model to request execution of predefined functions.
This tool accepts function declarations and returns either the standard text response OR the details of a function call requested by the model.
NOTE: This tool only returns the *request* for a function call; it does not execute the function itself.
`;

// Define basic parameter types allowed within function declarations
const functionParameterTypeSchema = z.enum([
    "OBJECT", "STRING", "NUMBER", "BOOLEAN", "ARRAY", "INTEGER" // Based on SDK's Type enum (approximated)
]).describe("The data type of the function parameter.");

// Define the base schema for a function parameter BEFORE the recursive part
const baseFunctionParameterSchema = z.object({
    type: functionParameterTypeSchema,
    description: z.string().optional().describe("Description of the parameter's purpose."),
    // Enum values if type is STRING with restricted values
    enum: z.array(z.string()).optional().describe("Allowed string values for an ENUM-like parameter.")
});

// Define the recursive schema using z.lazy and extending the base
type FunctionParameterSchemaType = z.infer<typeof baseFunctionParameterSchema> & {
    properties?: { [key: string]: FunctionParameterSchemaType };
    required?: string[];
    items?: FunctionParameterSchemaType;
};

const functionParameterSchema: z.ZodType<FunctionParameterSchemaType> = baseFunctionParameterSchema.extend({
    properties: z.lazy(() => z.record(functionParameterSchema).optional()),
    required: z.lazy(() => z.array(z.string()).optional().describe("List of required property names for OBJECT types.")),
    items: z.lazy(() => functionParameterSchema.optional().describe("Defines the schema for items if the parameter type is ARRAY."))
}).describe("Schema defining a single parameter for a function declaration, potentially recursive.");

// Define the properties schema using the final recursive parameter schema
const functionParameterPropertiesSchema = z.record(functionParameterSchema)
    .describe("Defines nested properties if the parameter type is OBJECT.");


// Zod Schema for a single Function Declaration (mirroring SDK structure)
export const functionDeclarationSchema = z.object({
    name: z.string().min(1).describe("The name of the function to be called. Must match the name the model is expected to use."),
    description: z.string().min(1).describe("A description of what the function does. Used by the model to decide when to call it."),
    parameters: z.object({
        type: z.literal("OBJECT").describe("The top-level parameters structure must be an OBJECT."),
        properties: functionParameterPropertiesSchema.describe("Defines the parameters the function accepts."),
        required: z.array(z.string()).optional().describe("List of required parameter names at the top level.")
    }).describe("Schema defining the parameters the function accepts. Must be of type OBJECT.")
}).describe("Declaration of a single function that the Gemini model can request to call.");

// Zod Schema for Tool Configuration (mirroring SDK ToolConfig)
// Using string literals for FunctionCallingConfigMode as enums are discouraged
const functionCallingConfigModeSchema = z.enum([
    "AUTO", "ANY", "NONE"
]).describe("Controls the function calling mode. AUTO (default): Model decides. ANY: Forces a function call. NONE: Disables function calling.");

const functionCallingConfigSchema = z.object({
    mode: functionCallingConfigModeSchema.optional().describe("The function calling mode."),
    allowedFunctionNames: z.array(z.string()).optional().describe("Optional list of function names allowed to be called. If specified, the model will only call functions from this list.")
}).optional().describe("Configuration specific to function calling.");

const toolConfigSchema = z.object({
    functionCallingConfig: functionCallingConfigSchema
}).optional().describe("Optional configuration for tools, specifically function calling.");


// Zod Schema for the main Tool Parameters
export const GEMINI_FUNCTION_CALL_PARAMS = {
    modelName: z.string().min(1).optional() // Make optional
        .describe("Optional. The name of the Gemini model to use (e.g., 'gemini-1.5-flash'). If omitted, the server's default model (from GOOGLE_GEMINI_MODEL env var) will be used."),
    prompt: z.string().min(1)
        .describe("Required. The text prompt to send to the Gemini model."),
    functionDeclarations: z.array(functionDeclarationSchema).min(1)
        .describe("Required. An array of function declarations (schemas) that the model can choose to call based on the prompt."),
    generationConfig: generationConfigSchema, // Re-using schema
    safetySettings: z.array(safetySettingSchema).optional(), // Re-using schema
    toolConfig: toolConfigSchema // Add toolConfig for function calling mode etc.
};

// Optional: Define a Zod schema for the entire input object if needed later
// export const geminiFunctionCallInputSchema = z.object(GEMINI_FUNCTION_CALL_PARAMS);
