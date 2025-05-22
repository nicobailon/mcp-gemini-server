import { v4 as uuidv4 } from "uuid";
import { logger } from "../utils/logger.js";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { SessionStore } from "./session/SessionStore.js";
import { InMemorySessionStore } from "./session/InMemorySessionStore.js";
import { SQLiteSessionStore } from "./session/SQLiteSessionStore.js";

export interface SessionState<T = Record<string, unknown>> {
  id: string;
  createdAt: number;
  lastActivity: number;
  expiresAt: number;
  data: T; // Generic data for the session (e.g., chat history, tool state)
}

export class SessionService {
  private store: SessionStore;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private defaultTimeoutSeconds: number;
  private initialized: Promise<void>;

  constructor(
    defaultTimeoutSeconds: number = 3600,
    storeType?: "memory" | "sqlite",
    dbPath?: string
  ) {
    // Default 1 hour
    this.defaultTimeoutSeconds = defaultTimeoutSeconds;

    // Initialize the appropriate store based on configuration
    const effectiveStoreType =
      storeType || process.env.SESSION_STORE_TYPE || "memory";

    switch (effectiveStoreType) {
      case "sqlite":
        this.store = new SQLiteSessionStore(
          dbPath || process.env.SQLITE_DB_PATH
        );
        break;
      case "memory":
      default:
        this.store = new InMemorySessionStore();
        break;
    }

    // Initialize the store asynchronously
    this.initialized = this.initializeStore();
    this.initialized
      .then(() => {
        this.startCleanupInterval();
        logger.info(
          `SessionService initialized with ${effectiveStoreType} store and default timeout: ${defaultTimeoutSeconds}s`
        );
      })
      .catch((error) => {
        logger.error("Failed to initialize session store:", error);
        throw error;
      });
  }

  private async initializeStore(): Promise<void> {
    await this.store.initialize();
  }

  /**
   * Creates a new session.
   * @param initialData Initial data to store in the session.
   * @param timeoutSeconds Optional custom timeout for this session.
   * @returns The newly created session ID.
   */
  public async createSession<
    T extends Record<string, unknown> = Record<string, unknown>,
  >(initialData: T = {} as T, timeoutSeconds?: number): Promise<string> {
    // Ensure store is initialized
    await this.initialized;

    const sessionId = uuidv4();
    const now = Date.now();
    const effectiveTimeout = timeoutSeconds ?? this.defaultTimeoutSeconds;
    const expiresAt = now + effectiveTimeout * 1000;

    const newSession: SessionState<T> = {
      id: sessionId,
      createdAt: now,
      lastActivity: now,
      expiresAt: expiresAt,
      data: initialData,
    };

    await this.store.set(sessionId, newSession);
    logger.debug(
      `Session ${sessionId} created, expires in ${effectiveTimeout}s`
    );
    return sessionId;
  }

  /**
   * Retrieves a session and updates its last activity timestamp.
   * @param sessionId The ID of the session to retrieve.
   * @returns The session state.
   * @throws McpError if the session is not found or has expired.
   */
  public async getSession(sessionId: string): Promise<SessionState> {
    // Ensure store is initialized
    await this.initialized;

    const session = await this.store.get(sessionId);
    if (!session) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `Session not found: ${sessionId}`
      );
    }
    if (Date.now() > session.expiresAt) {
      await this.deleteSession(sessionId); // Clean up expired session
      throw new McpError(
        ErrorCode.InvalidRequest,
        `Session expired: ${sessionId}`
      );
    }

    // Update last activity and extend expiration
    session.lastActivity = Date.now();
    session.expiresAt =
      session.lastActivity + this.defaultTimeoutSeconds * 1000;
    await this.store.set(sessionId, session);
    logger.debug(`Session ${sessionId} accessed, expiration extended.`);
    return session;
  }

  /**
   * Updates existing session data.
   * @param sessionId The ID of the session to update.
   * @param partialData Partial data to merge into the session's data.
   * @throws McpError if the session is not found or has expired.
   */
  public async updateSession(
    sessionId: string,
    partialData: Partial<Record<string, unknown>>
  ): Promise<void> {
    const session = await this.getSession(sessionId); // This also updates lastActivity
    session.data = { ...session.data, ...partialData };
    await this.store.set(sessionId, session);
    logger.debug(`Session ${sessionId} updated.`);
  }

  /**
   * Deletes a session.
   * @param sessionId The ID of the session to delete.
   * @returns True if the session was deleted, false otherwise.
   */
  public async deleteSession(sessionId: string): Promise<boolean> {
    await this.initialized;
    const deleted = await this.store.delete(sessionId);
    if (deleted) {
      logger.debug(`Session ${sessionId} deleted.`);
    } else {
      logger.warn(`Attempted to delete non-existent session: ${sessionId}`);
    }
    return deleted;
  }

  /**
   * Starts the periodic cleanup of expired sessions.
   */
  private startCleanupInterval(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredSessions();
    }, 60 * 1000); // Check every minute
  }

  /**
   * Cleans up all expired sessions.
   */
  private async cleanupExpiredSessions(): Promise<void> {
    try {
      const now = Date.now();
      const cleanedCount = await this.store.deleteExpired(now);
      if (cleanedCount > 0) {
        logger.info(
          `SessionService cleaned up ${cleanedCount} expired sessions.`
        );
      }
    } catch (error) {
      logger.error("Error during session cleanup:", error);
    }
  }

  /**
   * Stops the periodic cleanup interval.
   */
  public stopCleanupInterval(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      logger.info("SessionService cleanup interval stopped.");
    }
  }

  /**
   * Returns the number of active sessions.
   */
  public async getActiveSessionCount(): Promise<number> {
    await this.initialized;
    return this.store.count();
  }

  /**
   * Closes the session service and cleans up resources.
   */
  public async close(): Promise<void> {
    this.stopCleanupInterval();
    await this.store.close();
    logger.info("SessionService closed");
  }
}
