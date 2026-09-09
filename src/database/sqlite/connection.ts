import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

/**
 * Ponto único de acesso ao driver better-sqlite3.
 * Nenhum outro arquivo do projeto deve importar "better-sqlite3" diretamente:
 * tudo passa por aqui, para que trocar o motor de banco (ex: Postgres no futuro)
 * signifique reimplementar só este arquivo e a interface DatabaseAdapter.
 */

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;

  const dbPath = process.env.DATABASE_PATH ?? "./data/sorasaki.db";
  const dir = path.dirname(dbPath);
  fs.mkdirSync(dir, { recursive: true });

  db = new Database(dbPath);

  // WAL: leituras não bloqueiam escritas concorrentes.
  // Sem isso, qualquer escrita trava todas as leituras até terminar.
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");

  return db;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
