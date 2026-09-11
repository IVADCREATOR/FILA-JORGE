import type { DatabaseAdapter } from "../database/adapter.js";

export interface MemoryEntry {
  id: number;
  application_id: number;
  user_key: string;
  namespace: string;
  key: string;
  value: string; // JSON serializado
  metadata: string | null; // JSON serializado
  created_at: string;
  updated_at: string;
  expires_at: string | null;
}

/**
 * IMPORTANTE: toda query aqui recebe application_id como parâmetro
 * obrigatório e o usa no WHERE. Isso é o que garante isolamento entre
 * aplicações no nível de dados - não depende de nenhuma outra camada
 * lembrar de filtrar corretamente.
 */
export function createMemoryRepository(db: DatabaseAdapter) {
  function find(applicationId: number, userKey: string, namespace: string, key: string): MemoryEntry | undefined {
    return db.get<MemoryEntry>(
      `SELECT * FROM application_memory
       WHERE application_id = ? AND user_key = ? AND namespace = ? AND key = ?
         AND (expires_at IS NULL OR expires_at > datetime('now'))`,
      [applicationId, userKey, namespace, key]
    );
  }

  return {
    upsert(params: {
      applicationId: number;
      userKey: string;
      namespace: string;
      key: string;
      value: string;
      metadata: string | null;
      expiresAt: string | null;
    }): MemoryEntry {
      db.run(
        `INSERT INTO application_memory
           (application_id, user_key, namespace, key, value, metadata, expires_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT(application_id, user_key, namespace, key)
         DO UPDATE SET value = excluded.value,
                       metadata = excluded.metadata,
                       expires_at = excluded.expires_at,
                       updated_at = datetime('now')`,
        [params.applicationId, params.userKey, params.namespace, params.key, params.value, params.metadata, params.expiresAt]
      );

      const entry = find(params.applicationId, params.userKey, params.namespace, params.key);
      if (!entry) throw new Error("Falha ao ler entrada de memory recém-gravada");
      return entry;
    },

    find,

    list(applicationId: number, userKey: string, namespace: string): MemoryEntry[] {
      return db.all<MemoryEntry>(
        `SELECT * FROM application_memory
         WHERE application_id = ? AND user_key = ? AND namespace = ?
           AND (expires_at IS NULL OR expires_at > datetime('now'))
         ORDER BY key ASC`,
        [applicationId, userKey, namespace]
      );
    },

    delete(applicationId: number, userKey: string, namespace: string, key: string): number {
      const result = db.run(
        "DELETE FROM application_memory WHERE application_id = ? AND user_key = ? AND namespace = ? AND key = ?",
        [applicationId, userKey, namespace, key]
      );
      return result.changes;
    },

    deleteExpired(): number {
      const result = db.run("DELETE FROM application_memory WHERE expires_at IS NOT NULL AND expires_at <= datetime('now')");
      return result.changes;
    },
  };
}

export type MemoryRepository = ReturnType<typeof createMemoryRepository>;
