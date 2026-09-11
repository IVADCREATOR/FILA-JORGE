import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const tmpDbPath = path.join(os.tmpdir(), `sorasaki-apps-test-${Date.now()}.db`);
process.env.DATABASE_PATH = tmpDbPath;
process.env.NODE_ENV = "test";

let closeDb: () => void;
let service: import("../src/services/applications.service.js").ApplicationsService;
let applicationsRepo: import("../src/repositories/applications.repository.js").ApplicationsRepository;

beforeAll(async () => {
  const connection = await import("../src/database/sqlite/connection.js");
  const migrate = await import("../src/database/sqlite/migrate.js");
  const adapter = await import("../src/database/sqlite/adapter.js");
  const applicationsRepoModule = await import("../src/repositories/applications.repository.js");
  const apiKeysRepoModule = await import("../src/repositories/apiKeys.repository.js");
  const serviceModule = await import("../src/services/applications.service.js");

  closeDb = connection.closeDb;
  migrate.runMigrations();

  const db = adapter.createSqliteAdapter();
  applicationsRepo = applicationsRepoModule.createApplicationsRepository(db);
  const apiKeys = apiKeysRepoModule.createApiKeysRepository(db);
  service = serviceModule.createApplicationsService(applicationsRepo, apiKeys);
});

afterAll(() => {
  closeDb();
  fs.rmSync(tmpDbPath, { force: true });
  fs.rmSync(`${tmpDbPath}-wal`, { force: true });
  fs.rmSync(`${tmpDbPath}-shm`, { force: true });
});

describe("applications: criação, API keys e isolamento", () => {
  it("cria uma aplicação com slug derivado do nome e retorna a key crua uma vez", () => {
    const { application, rawKey } = service.create({ name: "Sorasaki Web", scopes: ["memory:read"] });

    expect(application.slug).toBe("sorasaki-web");
    expect(application.status).toBe("active");
    expect(rawKey).toMatch(/^sk_[a-f0-9]{64}$/);
  });

  it("rejeita criar duas aplicações que gerem o mesmo slug", () => {
    expect(() => service.create({ name: "Sorasaki Web", scopes: [] })).toThrow(/slug/);
  });

  it("autentica com a key correta e retorna os scopes associados", () => {
    const { application, rawKey } = service.create({ name: "Future App", scopes: ["memory:read", "memory:write"] });

    const result = service.authenticateByKey(rawKey);
    expect(result?.application.id).toBe(application.id);
    expect(result?.scopes).toEqual(["memory:read", "memory:write"]);
  });

  it("rejeita uma key inexistente", () => {
    const result = service.authenticateByKey("sk_" + "0".repeat(64));
    expect(result).toBeUndefined();
  });

  it("rejeita uma key revogada", () => {
    const { application, rawKey } = service.create({ name: "Revoke Test App", scopes: [] });
    const [key] = service.listKeys(application.id);

    service.revokeKey(key.id);

    expect(service.authenticateByKey(rawKey)).toBeUndefined();
  });

  it("rejeita uma key válida de aplicação desabilitada (isolamento entre aplicações)", () => {
    const { application, rawKey } = service.create({ name: "Disabled App", scopes: ["memory:read"] });
    applicationsRepo.setStatus(application.id, "disabled");

    expect(service.authenticateByKey(rawKey)).toBeUndefined();
  });

  it("nunca expõe key_hash ao listar keys", () => {
    const { application } = service.create({ name: "List Keys App", scopes: ["memory:read"] });
    const keys = service.listKeys(application.id);

    expect(keys[0]).not.toHaveProperty("keyHash");
    expect(keys[0]).not.toHaveProperty("key_hash");
    expect(keys[0]).toHaveProperty("keyPrefix");
  });
});
