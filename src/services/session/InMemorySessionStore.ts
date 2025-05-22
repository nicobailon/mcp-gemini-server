import { SessionStore } from "./SessionStore.js";
import { SessionState } from "../SessionService.js";

/**
 * In-memory implementation of SessionStore.
 * This is the default implementation that stores sessions in a Map.
 */
export class InMemorySessionStore implements SessionStore {
  private sessions: Map<string, SessionState> = new Map();

  async initialize(): Promise<void> {
    // No initialization needed for in-memory store
  }

  async set(sessionId: string, session: SessionState): Promise<void> {
    this.sessions.set(sessionId, session);
  }

  async get(sessionId: string): Promise<SessionState | null> {
    return this.sessions.get(sessionId) || null;
  }

  async delete(sessionId: string): Promise<boolean> {
    return this.sessions.delete(sessionId);
  }

  async deleteExpired(now: number): Promise<number> {
    let deletedCount = 0;
    for (const [sessionId, session] of this.sessions.entries()) {
      if (now > session.expiresAt) {
        this.sessions.delete(sessionId);
        deletedCount++;
      }
    }
    return deletedCount;
  }

  async count(): Promise<number> {
    return this.sessions.size;
  }

  async close(): Promise<void> {
    // No cleanup needed for in-memory store
    this.sessions.clear();
  }
}
