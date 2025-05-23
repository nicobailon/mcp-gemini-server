import { SessionState } from "../SessionService.js";

/**
 * Interface for session storage implementations.
 * This allows for different storage backends (in-memory, SQLite, Redis, etc.)
 */
export interface SessionStore {
  /**
   * Store a session
   * @param sessionId The session identifier
   * @param session The session state to store
   */
  set(sessionId: string, session: SessionState): Promise<void>;

  /**
   * Retrieve a session
   * @param sessionId The session identifier
   * @returns The session state or null if not found
   */
  get(sessionId: string): Promise<SessionState | null>;

  /**
   * Delete a session
   * @param sessionId The session identifier
   * @returns True if the session was deleted, false if it didn't exist
   */
  delete(sessionId: string): Promise<boolean>;

  /**
   * Delete all expired sessions
   * @param now Current timestamp in milliseconds
   * @returns Number of sessions deleted
   */
  deleteExpired(now: number): Promise<number>;

  /**
   * Get the count of active sessions
   * @returns Number of sessions in the store
   */
  count(): Promise<number>;

  /**
   * Initialize the store (create tables, connect, etc.)
   */
  initialize(): Promise<void>;

  /**
   * Close/cleanup the store
   */
  close(): Promise<void>;
}
