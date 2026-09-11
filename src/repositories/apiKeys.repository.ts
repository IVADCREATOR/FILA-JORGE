import type { DatabaseAdapter } from "../database/adapter.js";

export interface ApiKeyRow {
  id: number;
  application_id: number;
  key_prefix: string;
  key_hash: string;
  scopes: string; // JSON serializado
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

export function createApiKeysRepository(db: DatabaseAdapter) {
  return {
    create(params: { applicationId: number; keyHash: string; keyPrefix: string; scopes: string[] }): void {
      db.run(
        "INSERT INTO api_keys (application_id, key_hash, key_prefix, scopes) VALUES (?, ?, ?, ?)",
        [params.applicationId, params.keyHash, params.keyPrefix, JSON.stringify(params.scopes)]
      );
    },

    findValidByHash(keyHash: string): ApiKeyRow | undefined {
      return db.get<ApiKeyRow>(
        "SELECT * FROM api_keys WHERE key_hash = ? AND revoked_at IS NULL",
        [keyHash]
      );
    },

    findByApplication(applicationId: number): ApiKeyRow[] {
      return db.all<ApiKeyRow>(
        "SELECT * FROM api_keys WHERE application_id = ? ORDER BY id DESC",
        [applicationId]
      );
    },

    touchLastUsed(id: number): void {
      db.run("UPDATE api_keys SET last_used_at = datetime('now') WHERE id = ?", [id]);
    },

    revoke(id: number): void {
      db.run("UPDATE api_keys SET revoked_at = datetime('now') WHERE id = ? AND revoked_at IS NULL", [id]);
    },
  };
}

export type ApiKeysRepository = ReturnType<typeof createApiKeysRepository>;
