import type { DatabaseAdapter } from "../database/adapter.js";

export interface Session {
  id: number;
  token_hash: string;
  profile_id: number;
  user_agent: string | null;
  ip_address: string | null;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
}

export function createSessionsRepository(db: DatabaseAdapter) {
  return {
    create(params: {
      profileId: number;
      tokenHash: string;
      expiresAt: string;
      userAgent?: string;
      ipAddress?: string;
    }): void {
      db.run(
        `INSERT INTO sessions (profile_id, token_hash, expires_at, user_agent, ip_address)
         VALUES (?, ?, ?, ?, ?)`,
        [params.profileId, params.tokenHash, params.expiresAt, params.userAgent ?? null, params.ipAddress ?? null]
      );
    },

    findValidByTokenHash(tokenHash: string): Session | undefined {
      return db.get<Session>(
        `SELECT * FROM sessions
         WHERE token_hash = ?
           AND revoked_at IS NULL
           AND expires_at > datetime('now')`,
        [tokenHash]
      );
    },

    revokeByTokenHash(tokenHash: string): void {
      db.run(
        "UPDATE sessions SET revoked_at = datetime('now') WHERE token_hash = ? AND revoked_at IS NULL",
        [tokenHash]
      );
    },

    revokeAllForProfile(profileId: number): void {
      db.run(
        "UPDATE sessions SET revoked_at = datetime('now') WHERE profile_id = ? AND revoked_at IS NULL",
        [profileId]
      );
    },

    deleteExpired(): number {
      const result = db.run("DELETE FROM sessions WHERE expires_at <= datetime('now')");
      return result.changes;
    },
  };
}

export type SessionsRepository = ReturnType<typeof createSessionsRepository>;
