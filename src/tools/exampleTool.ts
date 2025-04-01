import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod"; // Import Zod for potential validation
import { TOOL_NAME, TOOL_DESCRIPTION, TOOL_PARAMS } from "./exampleToolParams.js";
import { ExampleService } from "../services/index.js";
import { ExampleServiceConfig, ExampleServiceData } from "../types/index.js";
import { ValidationError } from "../utils/errors.js";
import { logger } from "../utils/index.js";

// Define the type for the arguments object based on TOOL_PARAMS
type ExampleToolArgs = {
    name: string;
    language?: 'en' | 'es' | 'fr';
};

/**
 * Registers the exampleTool with the MCP server.
 * @param server - The McpServer instance.
 * @param config - Optional configuration specifically for the ExampleService used by this tool.
 */
export const exampleTool = (server: McpServer, config?: Partial<ExampleServiceConfig>): void => {
    // Instantiate the service this tool depends on
    // Pass the specific config slice if provided
    const serviceInstance = new ExampleService(config);

    // Define the async function that handles the tool execution
    const processExampleRequest = async (args: ExampleToolArgs) => {
        logger.debug(`Received request with args: ${JSON.stringify(args)}`);
        try {
            // 1. Input Validation (Optional, Zod schema from params can handle basic types)
            // You might add more complex cross-field validation here if needed.
            // Example: Ensure language is handled correctly, defaulting if necessary
            const language = args.language && ['en', 'es', 'fr'].includes(args.language) ? args.language : 'en';
            logger.debug(`Using language: ${language}`); // Example of using validated/processed args

            // 2. Prepare input for the service
            // The tool acts as an adapter between MCP args and service input DTO
            const serviceInput: Partial<ExampleServiceData> = {
                name: args.name,
                // Pass other relevant data if the service needs it
            };

            // 3. Call the underlying service
            const result = await serviceInstance.processExample(serviceInput);

            // 4. Format the successful output for MCP
            // Ensure the output is stringified JSON as expected by text content type
            return {
                content: [{
                    type: "text" as const, // Use "text" type
                    text: JSON.stringify(result, null, 2) // Pretty-print JSON response
                }]
            };

        } catch (error) {
            logger.error(`Error processing request: ${error}`);

            // 5. Map service errors to McpError
            if (error instanceof ValidationError) {
                // Map validation errors from the service to InvalidParams
                throw new McpError(
                    ErrorCode.InvalidParams,
                    `Validation failed: ${error.details}`, // Pass details if available
                );
            }
            if (error instanceof McpError) {
                throw error; // Re-throw if it's already an McpError
            }

            // Catch-all for unexpected errors from the service or this handler
            throw new McpError(
                ErrorCode.InternalError,
                error instanceof Error ? error.message : "An unexpected error occurred in the tool."
            );
        }
    };

    // Register the tool with the server
    server.tool(
        TOOL_NAME,
        TOOL_DESCRIPTION,
        TOOL_PARAMS, // Pass the Zod schema object
        processExampleRequest // Pass the async handler function
    );

    logger.info(`Tool registered: ${TOOL_NAME}`);
};
