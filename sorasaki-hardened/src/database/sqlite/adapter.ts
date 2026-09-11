import { getDb } from "./connection.js";
import type { DatabaseAdapter } from "../adapter.js";

/**
 * Implementação SQLite da interface DatabaseAdapter.
 * Todas as queries daqui usam prepared statements (.prepare()),
 * nunca concatenação de string com input do usuário.
 */
export function createSqliteAdapter(): DatabaseAdapter {
  const db = getDb();

  return {
    get<T>(sql: string, params: unknown[] = []): T | undefined {
      return db.prepare(sql).get(...params) as T | undefined;
    },
    all<T>(sql: string, params: unknown[] = []): T[] {
      return db.prepare(sql).all(...params) as T[];
    },
    run(sql: string, params: unknown[] = []) {
      const info = db.prepare(sql).run(...params);
      return { lastInsertRowid: info.lastInsertRowid, changes: info.changes };
    },
    transaction<T>(fn: () => T): T {
      return db.transaction(fn)();
    },
  };
}
