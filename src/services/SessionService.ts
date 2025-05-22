import { v4 as uuidv4 } from "uuid";
import { logger } from "../utils/logger.js";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";

export interface SessionState<T = any> {
  id: string;
  createdAt: number;
  lastActivity: number;
  expiresAt: number;
  data: T; // Generic data for the session (e.g., chat history, tool state)
}

export class SessionService {
  private sessions: Map<string, SessionState> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;
  private defaultTimeoutSeconds: number;

  constructor(defaultTimeoutSeconds: number = 3600) {
    // Default 1 hour
    this.defaultTimeoutSeconds = defaultTimeoutSeconds;
    this.startCleanupInterval();
    logger.info(
      `SessionService initialized with default timeout: ${defaultTimeoutSeconds}s`
    );
  }

  /**
   * Creates a new session.
   * @param initialData Initial data to store in the session.
   * @param timeoutSeconds Optional custom timeout for this session.
   * @returns The newly created session ID.
   */
  public createSession(initialData: any = {}, timeoutSeconds?: number): string {
    const sessionId = uuidv4();
    const now = Date.now();
    const effectiveTimeout = timeoutSeconds ?? this.defaultTimeoutSeconds;
    const expiresAt = now + effectiveTimeout * 1000;

    const newSession: SessionState = {
      id: sessionId,
      createdAt: now,
      lastActivity: now,
      expiresAt: expiresAt,
      data: initialData,
    };

    this.sessions.set(sessionId, newSession);
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
  public getSession(sessionId: string): SessionState {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `Session not found: ${sessionId}`
      );
    }
    if (Date.now() > session.expiresAt) {
      this.deleteSession(sessionId); // Clean up expired session
      throw new McpError(
        ErrorCode.InvalidRequest,
        `Session expired: ${sessionId}`
      );
    }

    // Update last activity and extend expiration
    session.lastActivity = Date.now();
    session.expiresAt =
      session.lastActivity + this.defaultTimeoutSeconds * 1000;
    logger.debug(`Session ${sessionId} accessed, expiration extended.`);
    return session;
  }

  /**
   * Updates existing session data.
   * @param sessionId The ID of the session to update.
   * @param partialData Partial data to merge into the session's data.
   * @throws McpError if the session is not found or has expired.
   */
  public updateSession(sessionId: string, partialData: any): void {
    const session = this.getSession(sessionId); // This also updates lastActivity
    session.data = { ...session.data, ...partialData };
    logger.debug(`Session ${sessionId} updated.`);
  }

  /**
   * Deletes a session.
   * @param sessionId The ID of the session to delete.
   * @returns True if the session was deleted, false otherwise.
   */
  public deleteSession(sessionId: string): boolean {
    const deleted = this.sessions.delete(sessionId);
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
  private cleanupExpiredSessions(): void {
    const now = Date.now();
    let cleanedCount = 0;
    for (const [sessionId, session] of this.sessions.entries()) {
      if (now > session.expiresAt) {
        this.sessions.delete(sessionId);
        logger.info(`Cleaned up expired session: ${sessionId}`);
        cleanedCount++;
      }
    }
    if (cleanedCount > 0) {
      logger.info(
        `SessionService cleaned up ${cleanedCount} expired sessions.`
      );
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
  public getActiveSessionCount(): number {
    return this.sessions.size;
  }
}
