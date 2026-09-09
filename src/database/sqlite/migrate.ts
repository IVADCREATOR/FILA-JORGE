import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getDb } from "./connection.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, "../../../migrations");

/**
 * Aplica migrations pendentes em ordem alfabética/numérica.
 * A tabela _migrations é criada pela própria primeira migration (001_init.sql),
 * então na primeira execução ela roda "às cegas" e depois se auto-registra.
 */
export function runMigrations(): void {
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const alreadyApplied = new Set(
    db.prepare("SELECT filename FROM _migrations").all().map((row: any) => row.filename)
  );

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    if (alreadyApplied.has(file)) continue;

    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf-8");

    const applyMigration = db.transaction(() => {
      db.exec(sql);
      db.prepare("INSERT INTO _migrations (filename) VALUES (?)").run(file);
    });

    applyMigration();
    console.log(`[migrate] aplicada: ${file}`);
  }
}

// Permite rodar `npm run migrate` isoladamente
if (import.meta.url === `file://${process.argv[1]}`) {
  runMigrations();
  console.log("[migrate] concluído.");
}
