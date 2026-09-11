import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const tmpDbPath = path.join(os.tmpdir(), `sorasaki-memory-test-${Date.now()}.db`);
process.env.DATABASE_PATH = tmpDbPath;
process.env.NODE_ENV = "test";

let closeDb: () => void;
let service: import("../src/services/memory.service.js").MemoryService;
let repo: import("../src/repositories/memory.repository.js").MemoryRepository;
let appA: number;
let appB: number;

beforeAll(async () => {
  const connection = await import("../src/database/sqlite/connection.js");
  const migrate = await import("../src/database/sqlite/migrate.js");
  const adapter = await import("../src/database/sqlite/adapter.js");
  const memoryRepoModule = await import("../src/repositories/memory.repository.js");
  const memoryServiceModule = await import("../src/services/memory.service.js");
  const applicationsRepoModule = await import("../src/repositories/applications.repository.js");
  const apiKeysRepoModule = await import("../src/repositories/apiKeys.repository.js");
  const applicationsServiceModule = await import("../src/services/applications.service.js");

  closeDb = connection.closeDb;
  migrate.runMigrations();

  const db = adapter.createSqliteAdapter();
  repo = memoryRepoModule.createMemoryRepository(db);
  service = memoryServiceModule.createMemoryService(repo);

  // Duas aplicações reais, pra testar isolamento de verdade (não só um id inventado).
  const applicationsRepo = applicationsRepoModule.createApplicationsRepository(db);
  const apiKeys = apiKeysRepoModule.createApiKeysRepository(db);
  const applicationsService = applicationsServiceModule.createApplicationsService(applicationsRepo, apiKeys);

  appA = applicationsService.create({ name: "App A", scopes: ["memory:read", "memory:write"] }).application.id;
  appB = applicationsService.create({ name: "App B", scopes: ["memory:read", "memory:write"] }).application.id;
});

afterAll(() => {
  closeDb();
  fs.rmSync(tmpDbPath, { force: true });
  fs.rmSync(`${tmpDbPath}-wal`, { force: true });
  fs.rmSync(`${tmpDbPath}-shm`, { force: true });
});

describe("memory service: roundtrip e validação", () => {
  it("grava e lê um valor JSON arbitrário", () => {
    const written = service.set(appA, "prefs", "theme", { value: { color: "dark", size: 14 } });
    expect(written.value).toEqual({ color: "dark", size: 14 });

    const read = service.get(appA, "prefs", "theme");
    expect(read?.value).toEqual({ color: "dark", size: 14 });
  });

  it("upsert: escrever de novo na mesma chave atualiza em vez de duplicar", () => {
    service.set(appA, "prefs", "theme", { value: "light" });
    const entries = service.list(appA, "prefs");
    const themeEntries = entries.filter((e) => e.key === "theme");
    expect(themeEntries).toHaveLength(1);
    expect(themeEntries[0].value).toBe("light");
  });

  it("rejeita namespace/key com caracteres não permitidos", () => {
    expect(() => service.set(appA, "prefs/../etc", "theme", { value: "x" })).toThrow();
  });

  it("rejeita value maior que o limite", () => {
    const bigValue = "x".repeat(70 * 1024);
    expect(() => service.set(appA, "prefs", "big", { value: bigValue })).toThrow(/limite/);
  });
});

describe("memory service: isolamento entre aplicações", () => {
  it("duas aplicações podem usar o mesmo namespace/key sem colidir", () => {
    service.set(appA, "shared-ns", "same-key", { value: "valor da app A" });
    service.set(appB, "shared-ns", "same-key", { value: "valor da app B" });

    expect(service.get(appA, "shared-ns", "same-key")?.value).toBe("valor da app A");
    expect(service.get(appB, "shared-ns", "same-key")?.value).toBe("valor da app B");
  });

  it("app B não enxerga nada escrito só pela app A", () => {
    service.set(appA, "only-a", "secret", { value: "não deveria vazar" });
    expect(service.get(appB, "only-a", "secret")).toBeUndefined();
    expect(service.list(appB, "only-a")).toHaveLength(0);
  });

  it("userKey diferentes isolam dados dentro da mesma aplicação", () => {
    service.set(appA, "per-user", "note", { value: "nota do user 1", userKey: "user-1" });
    service.set(appA, "per-user", "note", { value: "nota do user 2", userKey: "user-2" });

    expect(service.get(appA, "per-user", "note", "user-1")?.value).toBe("nota do user 1");
    expect(service.get(appA, "per-user", "note", "user-2")?.value).toBe("nota do user 2");
  });
});

describe("memory service: expiração e limpeza", () => {
  it("uma entrada expirada não é retornada por get, list ou por outra aplicação", () => {
    // Grava direto pelo repository com expires_at no passado, simulando TTL vencido.
    repo.upsert({
      applicationId: appA,
      userKey: "",
      namespace: "temp",
      key: "expired-item",
      value: JSON.stringify("vai sumir"),
      metadata: null,
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    });

    expect(service.get(appA, "temp", "expired-item")).toBeUndefined();
    expect(service.list(appA, "temp")).toHaveLength(0);
  });

  it("purgeExpired remove entradas vencidas do banco", () => {
    repo.upsert({
      applicationId: appA,
      userKey: "",
      namespace: "temp",
      key: "to-purge",
      value: JSON.stringify("x"),
      metadata: null,
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    });

    const removed = service.purgeExpired();
    expect(removed).toBeGreaterThan(0);
  });
});

describe("memory service: delete", () => {
  it("remove uma entrada existente e retorna false para uma que não existe", () => {
    service.set(appA, "to-delete", "item", { value: "x" });
    expect(service.delete(appA, "to-delete", "item")).toBe(true);
    expect(service.get(appA, "to-delete", "item")).toBeUndefined();
    expect(service.delete(appA, "to-delete", "item")).toBe(false);
  });
});
