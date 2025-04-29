import { GoogleGenAI, CachedContent } from "@google/genai";
import { 
  GeminiApiError, 
  GeminiResourceNotFoundError, 
  GeminiInvalidParameterError 
} from "../../utils/errors.js";
import { logger } from "../../utils/logger.js";
import { CachedContentMetadata } from "../../types/index.js";
import { Content, Tool, ToolConfig, CacheId } from "./GeminiTypes.js";

/**
 * Service for handling cache-related operations for the Gemini service.
 * Manages creation, listing, retrieval, and manipulation of cached content.
 */
export class GeminiCacheService {
  private genAI: GoogleGenAI;

  /**
   * Creates a new instance of the GeminiCacheService.
   * @param genAI The GoogleGenAI instance to use for API calls
   */
  constructor(genAI: GoogleGenAI) {
    this.genAI = genAI;
  }

  /**
   * Creates a cached content entry in the Gemini API.
   *
   * @param modelName The model to use for this cached content
   * @param contents The conversation contents to cache
   * @param options Additional options for the cache (displayName, systemInstruction, ttl, tools, toolConfig)
   * @returns Promise resolving to the cached content metadata
   */
  public async createCache(
    modelName: string,
    contents: Content[],
    options?: {
      displayName?: string;
      systemInstruction?: Content | string;
      ttl?: string;
      tools?: Tool[];
      toolConfig?: ToolConfig;
    }
  ): Promise<CachedContentMetadata> {
    try {
      logger.debug(`Creating cache for model: ${modelName}`);

      // Process systemInstruction if it's a string
      let formattedSystemInstruction: Content | undefined;
      if (options?.systemInstruction) {
        if (typeof options.systemInstruction === "string") {
          formattedSystemInstruction = {
            parts: [{ text: options.systemInstruction }],
          };
        } else {
          formattedSystemInstruction = options.systemInstruction;
        }
      }

      // Create config object for the request
      const cacheConfig = {
        contents,
        displayName: options?.displayName,
        systemInstruction: formattedSystemInstruction,
        ttl: options?.ttl,
        tools: options?.tools,
        toolConfig: options?.toolConfig,
      };

      // Create the cache entry
      const cacheData = await this.genAI.caches.create({
        model: modelName,
        config: cacheConfig,
      });

      // Return the mapped metadata
      return this.mapSdkCacheToMetadata(cacheData);
    } catch (error: unknown) {
      logger.error(
        `Error creating cache: ${error instanceof Error ? error.message : String(error)}`,
        error
      );
      throw new GeminiApiError(
        `Failed to create cache: ${error instanceof Error ? error.message : String(error)}`,
        error
      );
    }
  }

  /**
   * Lists cached content entries in the Gemini API.
   *
   * @param pageSize Optional maximum number of entries to return
   * @param pageToken Optional token for pagination
   * @returns Promise resolving to an object with caches array and optional nextPageToken
   */
  public async listCaches(
    pageSize?: number,
    pageToken?: string
  ): Promise<{ caches: CachedContentMetadata[]; nextPageToken?: string }> {
    try {
      logger.debug(
        `Listing caches with pageSize: ${pageSize}, pageToken: ${pageToken}`
      );

      // Prepare list parameters
      const listParams: Record<string, number | string> = {};

      if (pageSize !== undefined) {
        listParams.pageSize = pageSize;
      }

      if (pageToken) {
        listParams.pageToken = pageToken;
      }

      // Call the caches.list method
      const response = await this.genAI.caches.list(listParams);

      const caches: CachedContentMetadata[] = [];
      let nextPageToken: string | undefined;

      // Handle the response in a more generic way to accommodate different API versions
      if (response && typeof response === "object") {
        if ("caches" in response && Array.isArray(response.caches)) {
          // Standard response format - cast to our TypeScript interface for validation
          for (const cache of response.caches) {
            caches.push(this.mapSdkCacheToMetadata(cache));
          }
          // Use optional chaining to safely access nextPageToken
          nextPageToken = (
            response as {
              caches: Record<string, unknown>[];
              nextPageToken?: string;
            }
          ).nextPageToken;
        } else if ("page" in response && response.page) {
          // Pager-like object in v0.10.0
          const cacheList = Array.from(response.page);
          for (const cache of cacheList) {
            caches.push(this.mapSdkCacheToMetadata(cache));
          }

          // Check if there's a next page
          const hasNextPage =
            typeof response === "object" &&
            "hasNextPage" in response &&
            typeof response.hasNextPage === "function"
              ? response.hasNextPage()
              : false;

          if (hasNextPage) {
            nextPageToken = "next_page_available";
          }
        } else if (Array.isArray(response)) {
          // Direct array response
          for (const cache of response) {
            caches.push(this.mapSdkCacheToMetadata(cache));
          }
        }
      }

      return { caches, nextPageToken };
    } catch (error: unknown) {
      logger.error(
        `Error listing caches: ${error instanceof Error ? error.message : String(error)}`,
        error
      );
      throw new GeminiApiError(
        `Failed to list caches: ${error instanceof Error ? error.message : String(error)}`,
        error
      );
    }
  }

  /**
   * Gets a specific cached content entry's metadata from the Gemini API.
   *
   * @param cacheId The ID of the cached content to retrieve (format: "cachedContents/{id}")
   * @returns Promise resolving to the cached content metadata
   */
  public async getCache(cacheId: CacheId): Promise<CachedContentMetadata> {
    try {
      logger.debug(`Getting cache metadata for: ${cacheId}`);

      // Validate the cacheId format
      if (!cacheId.startsWith("cachedContents/")) {
        throw new GeminiInvalidParameterError(
          `Cache ID must be in the format "cachedContents/{id}", received: ${cacheId}`
        );
      }

      // Get the cache metadata
      const cacheData = await this.genAI.caches.get({ name: cacheId });

      return this.mapSdkCacheToMetadata(cacheData);
    } catch (error: unknown) {
      // Check for specific error patterns in the error message
      if (error instanceof Error) {
        if (error.message.includes("not found") || error.message.includes("404")) {
          throw new GeminiResourceNotFoundError("Cache", cacheId, error);
        }
      }
      
      logger.error(
        `Error getting cache: ${error instanceof Error ? error.message : String(error)}`,
        error
      );
      throw new GeminiApiError(
        `Failed to get cache: ${error instanceof Error ? error.message : String(error)}`,
        error
      );
    }
  }

  /**
   * Updates a cached content entry in the Gemini API.
   *
   * @param cacheId The ID of the cached content to update (format: "cachedContents/{id}")
   * @param updates The updates to apply to the cached content (ttl, displayName)
   * @returns Promise resolving to the updated cached content metadata
   */
  public async updateCache(
    cacheId: CacheId,
    updates: { ttl?: string; displayName?: string }
  ): Promise<CachedContentMetadata> {
    try {
      logger.debug(`Updating cache: ${cacheId}`);

      // Validate the cacheId format
      if (!cacheId.startsWith("cachedContents/")) {
        throw new GeminiInvalidParameterError(
          `Cache ID must be in the format "cachedContents/{id}", received: ${cacheId}`
        );
      }

      // Update the cache
      const cacheData = await this.genAI.caches.update({
        name: cacheId,
        config: updates,
      });

      return this.mapSdkCacheToMetadata(cacheData);
    } catch (error: unknown) {
      // Check for specific error patterns in the error message
      if (error instanceof Error) {
        if (error.message.includes("not found") || error.message.includes("404")) {
          throw new GeminiResourceNotFoundError("Cache", cacheId, error);
        }
      }
      
      logger.error(
        `Error updating cache: ${error instanceof Error ? error.message : String(error)}`,
        error
      );
      throw new GeminiApiError(
        `Failed to update cache: ${error instanceof Error ? error.message : String(error)}`,
        error
      );
    }
  }

  /**
   * Deletes a cached content entry from the Gemini API.
   *
   * @param cacheId The ID of the cached content to delete (format: "cachedContents/{id}")
   * @returns Promise resolving to an object with success flag
   */
  public async deleteCache(cacheId: CacheId): Promise<{ success: boolean }> {
    try {
      logger.debug(`Deleting cache: ${cacheId}`);

      // Validate the cacheId format
      if (!cacheId.startsWith("cachedContents/")) {
        throw new GeminiInvalidParameterError(
          `Cache ID must be in the format "cachedContents/{id}", received: ${cacheId}`
        );
      }

      // Delete the cache
      await this.genAI.caches.delete({ name: cacheId });

      return { success: true };
    } catch (error: unknown) {
      // Check for specific error patterns in the error message
      if (error instanceof Error) {
        if (error.message.includes("not found") || error.message.includes("404")) {
          throw new GeminiResourceNotFoundError("Cache", cacheId, error);
        }
      }
      
      logger.error(
        `Error deleting cache: ${error instanceof Error ? error.message : String(error)}`,
        error
      );
      throw new GeminiApiError(
        `Failed to delete cache: ${error instanceof Error ? error.message : String(error)}`,
        error
      );
    }
  }

  /**
   * Helper method to map cached content response data to our CachedContentMetadata interface
   *
   * @param cacheData The cache data from the Gemini API
   * @returns The mapped CachedContentMetadata object
   */
  private mapSdkCacheToMetadata(
    cacheData: CachedContent
  ): CachedContentMetadata {
    if (!cacheData.name) {
      throw new Error("Invalid cache data received: missing required name");
    }

    // In SDK v0.10.0, the structure might be slightly different
    // Constructing CachedContentMetadata with fallback values where needed
    return {
      name: cacheData.name,
      displayName: cacheData.displayName || "",
      createTime: cacheData.createTime || new Date().toISOString(),
      updateTime: cacheData.updateTime || new Date().toISOString(),
      expirationTime: cacheData.expireTime,
      model: cacheData.model || "",
      state: "ACTIVE", // Default to ACTIVE since CachedContent does not have a status/state property
      usageMetadata: {
        totalTokenCount:
          typeof cacheData.usageMetadata?.totalTokenCount !== "undefined"
            ? cacheData.usageMetadata.totalTokenCount
            : 0,
      },
    };
  }
}
