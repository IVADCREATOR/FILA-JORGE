import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// DATABASE_PATH precisa estar definido ANTES de qualquer import que toque
// connection.ts, por isso os imports dos módulos do projeto são dinâmicos
// e feitos dentro de beforeAll.
const tmpDbPath = path.join(os.tmpdir(), `sorasaki-test-${Date.now()}.db`);
process.env.DATABASE_PATH = tmpDbPath;

let closeDb: () => void;
let runMigrations: () => void;
let createSqliteAdapter: () => any;
let createTestItemsRepository: (db: any) => any;
let createTestItemsService: (repo: any) => any;

beforeAll(async () => {
  const connection = await import("../src/database/sqlite/connection.js");
  const migrate = await import("../src/database/sqlite/migrate.js");
  const adapter = await import("../src/database/sqlite/adapter.js");
  const repository = await import("../src/repositories/testItems.repository.js");
  const service = await import("../src/services/testItems.service.js");

  closeDb = connection.closeDb;
  runMigrations = migrate.runMigrations;
  createSqliteAdapter = adapter.createSqliteAdapter;
  createTestItemsRepository = repository.createTestItemsRepository;
  createTestItemsService = service.createTestItemsService;

  runMigrations();
});

afterAll(() => {
  closeDb();
  fs.rmSync(tmpDbPath, { force: true });
  fs.rmSync(`${tmpDbPath}-wal`, { force: true });
  fs.rmSync(`${tmpDbPath}-shm`, { force: true });
});

describe("test_items: pipeline SQLite -> Repository -> Service", () => {
  it("cria um item e consegue listá-lo de volta", () => {
    const db = createSqliteAdapter();
    const repo = createTestItemsRepository(db);
    const service = createTestItemsService(repo);

    const created = service.create({ name: "Item de teste" });
    expect(created.id).toBeTypeOf("number");
    expect(created.name).toBe("Item de teste");

    const all = service.list();
    expect(all.some((item: any) => item.id === created.id)).toBe(true);
  });

  it("rejeita name vazio antes de chegar ao banco", () => {
    const db = createSqliteAdapter();
    const repo = createTestItemsRepository(db);
    const service = createTestItemsService(repo);

    expect(() => service.create({ name: "" })).toThrow();
  });

  it("rejeita input sem o campo name", () => {
    const db = createSqliteAdapter();
    const repo = createTestItemsRepository(db);
    const service = createTestItemsService(repo);

    expect(() => service.create({})).toThrow();
  });
});
