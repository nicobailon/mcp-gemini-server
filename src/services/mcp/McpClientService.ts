import { logger } from "../../utils/index.js";
import { spawn, ChildProcess } from "child_process";
import EventSource from "eventsource";
// Define custom types for EventSource events since the eventsource package
// doesn't export its own types
interface ESMessageEvent {
  data: string;
  type: string;
  lastEventId: string;
  origin: string;
}

interface ESErrorEvent {
  type: string;
  message?: string;
  error?: Error;
}

// Add appropriate error handler typings
type ESErrorHandler = (event: ESErrorEvent) => void;
type ESMessageHandler = (event: ESMessageEvent) => void;
import { v4 as uuidv4 } from "uuid";
import fetch from "node-fetch";

export interface McpRequest {
  id: string;
  method: "listTools" | "callTool";
  params?: Record<string, unknown>;
}

export interface McpResponse {
  id: string;
  result?: unknown;
  error?: {
    code?: number;
    message: string;
    data?: unknown;
  };
}

export interface ToolDefinition {
  name: string;
  description: string;
  parametersSchema: Record<string, unknown>; // JSON Schema object
}

/**
 * Service for connecting to external Model Context Protocol (MCP) servers.
 * Provides methods to establish different types of connections (SSE, stdio).
 */
export class McpClientService {
  // Maps to store active connections
  private activeSseConnections: Map<
    string,
    { eventSource: EventSource; baseUrl: string }
  >;
  private activeStdioConnections: Map<string, ChildProcess>;
  private pendingStdioRequests: Map<
    string, // connectionId
    Map<
      string,
      { resolve: (value: any) => void; reject: (reason?: any) => void }
    > // requestId -> handlers
  > = new Map();

  constructor() {
    this.activeSseConnections = new Map();
    this.activeStdioConnections = new Map();
    logger.info("McpClientService initialized.");
  }

  /**
   * Establishes an SSE connection to the specified MCP server.
   * @param url - The URL of the MCP server to connect to.
   * @param messageHandler - Optional callback for handling received messages.
   * @returns A promise that resolves to a connection ID when the connection is established.
   */
  public connectSse(
    url: string,
    messageHandler?: (data: unknown) => void
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      logger.info(`Connecting to MCP server via SSE: ${url}`);

      try {
        // Create a unique ID for this connection
        const connectionId = uuidv4();

        // Create EventSource for SSE connection
        const eventSource = new EventSource(url);

        // Set up event handlers
        eventSource.onopen = () => {
          logger.info(`SSE connection established to ${url}`);
          this.activeSseConnections.set(connectionId, {
            eventSource,
            baseUrl: url,
          });
          resolve(connectionId);
        };

        eventSource.onmessage = ((event: ESMessageEvent) => {
          logger.debug(`SSE message received from ${url}:`, event.data);
          if (messageHandler) {
            try {
              const parsedData = JSON.parse(event.data);
              messageHandler(parsedData);
            } catch (error) {
              logger.error(`Error parsing SSE message:`, error);
              messageHandler(event.data);
            }
          }
        }) as ESMessageHandler;

        eventSource.onerror = ((error: ESErrorEvent) => {
          logger.error(`SSE connection error for ${url}:`, error.message || 'Unknown error');
          if (!this.activeSseConnections.has(connectionId)) {
            // If we haven't resolved yet, this is a connection failure
            reject(new Error(`Failed to establish SSE connection to ${url}: ${error.message || 'Unknown error'}`));
          } else if (eventSource.readyState === EventSource.CLOSED) {
            // Connection was established but is now closed
            logger.info(`SSE connection ${connectionId} closed due to error.`);
            this.activeSseConnections.delete(connectionId);
          }
        }) as ESErrorHandler;
      } catch (error) {
        logger.error(`Error creating SSE connection to ${url}:`, error);
        reject(error);
      }
    });
  }

  /**
   * Closes an SSE connection.
   * @param connectionId - The ID of the connection to close.
   * @returns True if the connection was closed, false if it wasn't found.
   */
  public closeSseConnection(connectionId: string): boolean {
    const connection = this.activeSseConnections.get(connectionId);
    if (connection) {
      connection.eventSource.close();
      this.activeSseConnections.delete(connectionId);
      logger.info(`SSE connection ${connectionId} closed.`);
      return true;
    }
    logger.warn(
      `Attempted to close non-existent SSE connection: ${connectionId}`
    );
    return false;
  }

  /**
   * Establishes a stdio connection using the specified command.
   * @param command - The command to execute for stdio connection.
   * @param args - Arguments to pass to the command.
   * @param messageHandler - Optional callback for handling stdout data.
   * @returns A promise that resolves to a connection ID when the process is spawned.
   */
  public connectStdio(
    command: string,
    args: string[] = [],
    messageHandler?: (data: unknown) => void
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      logger.info(
        `Connecting to MCP server via stdio using command: ${command} ${args.join(" ")}`
      );

      try {
        // Create a unique ID for this connection
        const connectionId = uuidv4();

        // Spawn the child process
        const childProcess = spawn(command, args, {
          stdio: ["pipe", "pipe", "pipe"],
        });

        // Store the connection
        this.activeStdioConnections.set(connectionId, childProcess);

        // Buffer to accumulate data chunks
        let buffer = "";

        // Set up event handlers
        childProcess.stdout.on("data", (data) => {
          // Append the new data to our buffer
          buffer += data.toString();
          logger.debug(
            `Stdio stdout from ${command} (raw chunk):`,
            data.toString()
          );

          // Process complete lines in the buffer
          let newlineIndex;
          while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
            // Extract the line (excluding the newline)
            const line = buffer.substring(0, newlineIndex);
            // Remove the processed line from the buffer (including the newline)
            buffer = buffer.substring(newlineIndex + 1);

            // Skip empty lines
            if (!line.trim()) continue;

            try {
              // Try to parse the line as JSON
              const parsedData = JSON.parse(line);
              logger.debug(`Parsed JSON message:`, parsedData);

              // Check if this is a response to a pending request
              if (parsedData.id) {
                // Search for the request in all connection maps
                let foundRequest = false;
                for (const [
                  connId,
                  requestsMap,
                ] of this.pendingStdioRequests.entries()) {
                  if (requestsMap.has(parsedData.id)) {
                    const { resolve, reject } = requestsMap.get(parsedData.id)!;
                    requestsMap.delete(parsedData.id);

                    // If this was the last pending request, clean up the connection map
                    if (requestsMap.size === 0) {
                      this.pendingStdioRequests.delete(connId);
                    }

                    foundRequest = true;

                    if (parsedData.error) {
                      reject(
                        parsedData.error || new Error("Tool execution error")
                      );
                    } else {
                      resolve(parsedData.result);
                    }

                    break;
                  }
                }

                // Only log if we didn't find the request
                if (!foundRequest && messageHandler) {
                  logger.debug(
                    `Received message with ID ${parsedData.id} but no matching pending request found`
                  );
                  messageHandler(parsedData);
                }
              } else if (messageHandler) {
                // If not a response to a pending request, pass to the message handler
                messageHandler(parsedData);
              }
            } catch (error) {
              logger.warn(`Error parsing JSON from stdio:`, error);
              // If not valid JSON and we have a message handler, pass the raw line
              if (messageHandler) {
                messageHandler(line);
              }
            }
          }
        });

        childProcess.stderr.on("data", (data) => {
          logger.warn(`Stdio stderr from ${command}:`, data.toString());
        });

        childProcess.on("error", (error) => {
          logger.error(`Stdio error for ${command}:`, error);
          if (this.activeStdioConnections.has(connectionId)) {
            this.activeStdioConnections.delete(connectionId);

            // Reject all pending requests for this connection
            if (this.pendingStdioRequests.has(connectionId)) {
              const pendingRequests =
                this.pendingStdioRequests.get(connectionId)!;
              for (const [
                requestId,
                { reject: rejectRequest },
              ] of pendingRequests.entries()) {
                logger.warn(
                  `Rejecting pending request ${requestId} due to connection error`
                );
                rejectRequest(
                  new Error(
                    `Connection error occurred before response: ${error.message}`
                  )
                );
              }
              this.pendingStdioRequests.delete(connectionId);
            }
          }
          reject(error);
        });

        childProcess.on("close", (code, signal) => {
          logger.info(
            `Stdio process ${command} closed with code ${code} and signal ${signal}`
          );
          if (this.activeStdioConnections.has(connectionId)) {
            this.activeStdioConnections.delete(connectionId);

            // Reject all pending requests for this connection
            if (this.pendingStdioRequests.has(connectionId)) {
              const pendingRequests =
                this.pendingStdioRequests.get(connectionId)!;
              for (const [
                requestId,
                { reject: rejectRequest },
              ] of pendingRequests.entries()) {
                logger.warn(
                  `Rejecting pending request ${requestId} due to connection closure`
                );
                rejectRequest(
                  new Error(
                    `Connection closed before response (code: ${code}, signal: ${signal})`
                  )
                );
              }
              this.pendingStdioRequests.delete(connectionId);
            }
          }
        });

        logger.info(`Stdio connection established for ${command}`);
        resolve(connectionId);
      } catch (error) {
        logger.error(`Error creating stdio connection for ${command}:`, error);
        reject(error);
      }
    });
  }

  /**
   * Sends data to a stdio connection.
   * @param connectionId - The ID of the connection to send data to.
   * @param data - The data to send.
   * @returns True if the data was sent, false if the connection wasn't found.
   */
  public sendToStdio(connectionId: string, data: string | object): boolean {
    const connection = this.activeStdioConnections.get(connectionId);
    if (connection) {
      const dataStr = typeof data === "string" ? data : JSON.stringify(data);
      if (connection.stdin) {
        connection.stdin.write(dataStr + "\n");
      } else {
        logger.error(`Stdio connection ${connectionId} has no stdin`);
        return false;
      }
      logger.debug(`Sent data to stdio connection ${connectionId}`);
      return true;
    }
    logger.warn(
      `Attempted to send data to non-existent stdio connection: ${connectionId}`
    );
    return false;
  }

  /**
   * Closes a stdio connection.
   * @param connectionId - The ID of the connection to close.
   * @param signal - Optional signal to send to the process. Default is 'SIGTERM'.
   * @returns True if the connection was closed, false if it wasn't found.
   */
  public closeStdioConnection(
    connectionId: string,
    signal: NodeJS.Signals = "SIGTERM"
  ): boolean {
    const connection = this.activeStdioConnections.get(connectionId);
    if (connection) {
      connection.kill(signal);
      this.activeStdioConnections.delete(connectionId);
      logger.info(
        `Stdio connection ${connectionId} closed with signal ${signal}.`
      );
      return true;
    }
    logger.warn(
      `Attempted to close non-existent stdio connection: ${connectionId}`
    );
    return false;
  }

  /**
   * Gets all active SSE connection IDs.
   * @returns Array of active SSE connection IDs.
   */
  public getActiveSseConnectionIds(): string[] {
    return Array.from(this.activeSseConnections.keys());
  }

  /**
   * Gets all active stdio connection IDs.
   * @returns Array of active stdio connection IDs.
   */
  public getActiveStdioConnectionIds(): string[] {
    return Array.from(this.activeStdioConnections.keys());
  }

  /**
   * Lists all available tools from an MCP server.
   * @param connectionId - The ID of the connection to query.
   * @returns A promise that resolves to an array of tool definitions.
   */
  public async listTools(connectionId: string): Promise<ToolDefinition[]> {
    logger.info(`Listing tools for connection ${connectionId}`);

    // Check if this is an SSE connection
    if (this.activeSseConnections.has(connectionId)) {
      const connection = this.activeSseConnections.get(connectionId)!;
      const requestId = uuidv4();
      const request: McpRequest = { id: requestId, method: "listTools" };

      try {
        // Create URL for the MCP request
        const mcpRequestUrl = new URL(connection.baseUrl);

        // Make the request
        const response = await fetch(mcpRequestUrl.toString(), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(request),
        });

        if (!response.ok) {
          throw new Error(
            `HTTP error from MCP server: ${response.status} ${response.statusText}`
          );
        }

        const mcpResponse: McpResponse = await response.json();

        if (mcpResponse.error) {
          throw new Error(`MCP error: ${JSON.stringify(mcpResponse.error)}`);
        }

        return mcpResponse.result as ToolDefinition[];
      } catch (error) {
        logger.error(
          `Error listing tools for SSE connection ${connectionId}:`,
          error
        );
        throw error;
      }
    }

    // Check if this is a stdio connection
    else if (this.activeStdioConnections.has(connectionId)) {
      const requestId = uuidv4();
      const request: McpRequest = { id: requestId, method: "listTools" };

      return new Promise<ToolDefinition[]>((resolve, reject) => {
        // Initialize the map for this connection if it doesn't exist
        if (!this.pendingStdioRequests.has(connectionId)) {
          this.pendingStdioRequests.set(connectionId, new Map());
        }

        // Store the promise resolution functions
        this.pendingStdioRequests
          .get(connectionId)!
          .set(requestId, { resolve, reject });

        // Send the request
        const sent = this.sendToStdio(connectionId, request);

        if (!sent) {
          // Clean up the pending request if sending fails
          this.pendingStdioRequests.get(connectionId)!.delete(requestId);

          // If this was the last pending request, clean up the connection map
          if (this.pendingStdioRequests.get(connectionId)!.size === 0) {
            this.pendingStdioRequests.delete(connectionId);
          }

          reject(
            new Error(
              `Failed to send request to stdio connection ${connectionId}`
            )
          );
        }
      });
    }

    // Neither SSE nor stdio connection found
    else {
      throw new Error(`No connection found with ID ${connectionId}`);
    }
  }

  /**
   * Calls a tool on an MCP server.
   * @param connectionId - The ID of the connection to use.
   * @param toolName - The name of the tool to call.
   * @param toolParameters - The parameters to pass to the tool.
   * @returns A promise that resolves to the tool's result.
   */
  public async callTool(
    connectionId: string,
    toolName: string,
    toolParameters: Record<string, unknown>
  ): Promise<unknown> {
    logger.info(`Calling tool ${toolName} on connection ${connectionId}`);

    // Check if this is an SSE connection
    if (this.activeSseConnections.has(connectionId)) {
      const connection = this.activeSseConnections.get(connectionId)!;
      const requestId = uuidv4();
      const request: McpRequest = {
        id: requestId,
        method: "callTool",
        params: { toolName, arguments: toolParameters },
      };

      try {
        // Create URL for the MCP request
        const mcpRequestUrl = new URL(connection.baseUrl);

        // Make the request
        const response = await fetch(mcpRequestUrl.toString(), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(request),
        });

        if (!response.ok) {
          throw new Error(
            `HTTP error from MCP server: ${response.status} ${response.statusText}`
          );
        }

        const mcpResponse: McpResponse = await response.json();

        if (mcpResponse.error) {
          throw new Error(`MCP error: ${JSON.stringify(mcpResponse.error)}`);
        }

        return mcpResponse.result;
      } catch (error) {
        logger.error(
          `Error calling tool ${toolName} on SSE connection ${connectionId}:`,
          error
        );
        throw error;
      }
    }

    // Check if this is a stdio connection
    else if (this.activeStdioConnections.has(connectionId)) {
      const requestId = uuidv4();
      const request: McpRequest = {
        id: requestId,
        method: "callTool",
        params: { toolName, arguments: toolParameters },
      };

      return new Promise((resolve, reject) => {
        // Initialize the map for this connection if it doesn't exist
        if (!this.pendingStdioRequests.has(connectionId)) {
          this.pendingStdioRequests.set(connectionId, new Map());
        }

        // Store the promise resolution functions
        this.pendingStdioRequests
          .get(connectionId)!
          .set(requestId, { resolve, reject });

        // Send the request
        const sent = this.sendToStdio(connectionId, request);

        if (!sent) {
          // Clean up the pending request if sending fails
          this.pendingStdioRequests.get(connectionId)!.delete(requestId);

          // If this was the last pending request, clean up the connection map
          if (this.pendingStdioRequests.get(connectionId)!.size === 0) {
            this.pendingStdioRequests.delete(connectionId);
          }

          reject(
            new Error(
              `Failed to send request to stdio connection ${connectionId}`
            )
          );
        }
      });
    }

    // Neither SSE nor stdio connection found
    else {
      throw new Error(`No connection found with ID ${connectionId}`);
    }
  }

  /**
   * Closes all active connections.
   */
  public closeAllConnections(): void {
    // Close all SSE connections
    for (const connectionId of this.activeSseConnections.keys()) {
      this.closeSseConnection(connectionId);
    }

    // Close all stdio connections
    for (const connectionId of this.activeStdioConnections.keys()) {
      this.closeStdioConnection(connectionId);
    }

    logger.info("All MCP connections closed.");
  }
}
