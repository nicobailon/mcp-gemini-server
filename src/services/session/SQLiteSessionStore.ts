import Database from "better-sqlite3";
import { SessionStore } from "./SessionStore.js";
import { SessionState } from "../SessionService.js";
import { logger } from "../../utils/logger.js";
import path from "path";
import { mkdir } from "fs/promises";

/**
 * SQLite implementation of SessionStore.
 * Stores sessions in a SQLite database for persistence.
 */
export class SQLiteSessionStore implements SessionStore {
  private db!: Database.Database;
  private readonly dbPath: string;
  private preparedStatements: {
    insert?: Database.Statement;
    get?: Database.Statement;
    delete?: Database.Statement;
    deleteExpired?: Database.Statement;
    count?: Database.Statement;
  } = {};

  constructor(dbPath?: string) {
    // Default to a data directory in the project root
    this.dbPath = dbPath || path.join(process.cwd(), "data", "sessions.db");
  }

  async initialize(): Promise<void> {
    try {
      // Ensure the directory exists
      const dir = path.dirname(this.dbPath);
      await mkdir(dir, { recursive: true });

      // Open the database
      this.db = new Database(this.dbPath);
      logger.info(`SQLite session store initialized at: ${this.dbPath}`);

      // Enable WAL mode for better concurrency and performance
      this.db.pragma("journal_mode = WAL");
      logger.debug("SQLite WAL mode enabled");

      // Create the sessions table if it doesn't exist
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS sessions (
          id TEXT PRIMARY KEY,
          created_at INTEGER NOT NULL,
          last_activity INTEGER NOT NULL,
          expires_at INTEGER NOT NULL,
          data TEXT NOT NULL
        );
        
        -- Index for efficient cleanup of expired sessions
        CREATE INDEX IF NOT EXISTS idx_sessions_expires_at 
        ON sessions(expires_at);
      `);

      // Prepare statements for better performance
      this.preparedStatements.insert = this.db.prepare(`
        INSERT OR REPLACE INTO sessions (id, created_at, last_activity, expires_at, data)
        VALUES (@id, @createdAt, @lastActivity, @expiresAt, @data)
      `);

      this.preparedStatements.get = this.db.prepare(`
        SELECT * FROM sessions WHERE id = ?
      `);

      this.preparedStatements.delete = this.db.prepare(`
        DELETE FROM sessions WHERE id = ?
      `);

      this.preparedStatements.deleteExpired = this.db.prepare(`
        DELETE FROM sessions WHERE expires_at < ?
      `);

      this.preparedStatements.count = this.db.prepare(`
        SELECT COUNT(*) as count FROM sessions
      `);

      // Clean up any expired sessions on startup
      const now = Date.now();
      const deleted = await this.deleteExpired(now);
      if (deleted > 0) {
        logger.info(`Cleaned up ${deleted} expired sessions on startup`);
      }
    } catch (error) {
      logger.error("Failed to initialize SQLite session store:", error);
      throw error;
    }
  }

  async set(sessionId: string, session: SessionState): Promise<void> {
    if (!this.preparedStatements.insert) {
      throw new Error("SQLite session store not initialized");
    }

    try {
      this.preparedStatements.insert.run({
        id: session.id,
        createdAt: session.createdAt,
        lastActivity: session.lastActivity,
        expiresAt: session.expiresAt,
        data: JSON.stringify(session.data),
      });
    } catch (error) {
      logger.error(`Failed to save session ${sessionId}:`, error);
      throw error;
    }
  }

  async get(sessionId: string): Promise<SessionState | null> {
    if (!this.preparedStatements.get) {
      throw new Error("SQLite session store not initialized");
    }

    try {
      const row = this.preparedStatements.get.get(sessionId) as
        | {
            id: string;
            created_at: number;
            last_activity: number;
            expires_at: number;
            data: string;
          }
        | undefined;

      if (!row) {
        return null;
      }

      return {
        id: row.id,
        createdAt: row.created_at,
        lastActivity: row.last_activity,
        expiresAt: row.expires_at,
        data: JSON.parse(row.data),
      };
    } catch (error) {
      logger.error(`Failed to get session ${sessionId}:`, error);
      throw error;
    }
  }

  async delete(sessionId: string): Promise<boolean> {
    if (!this.preparedStatements.delete) {
      throw new Error("SQLite session store not initialized");
    }

    try {
      const result = this.preparedStatements.delete.run(sessionId);
      return result.changes > 0;
    } catch (error) {
      logger.error(`Failed to delete session ${sessionId}:`, error);
      throw error;
    }
  }

  async deleteExpired(now: number): Promise<number> {
    if (!this.preparedStatements.deleteExpired) {
      throw new Error("SQLite session store not initialized");
    }

    try {
      const result = this.preparedStatements.deleteExpired.run(now);
      return result.changes;
    } catch (error) {
      logger.error("Failed to delete expired sessions:", error);
      throw error;
    }
  }

  async count(): Promise<number> {
    if (!this.preparedStatements.count) {
      throw new Error("SQLite session store not initialized");
    }

    try {
      const result = this.preparedStatements.count.get() as { count: number };
      return result.count;
    } catch (error) {
      logger.error("Failed to count sessions:", error);
      throw error;
    }
  }

  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      logger.info("SQLite session store closed");
    }
  }
}
