import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const tmpDbPath = path.join(os.tmpdir(), `sorasaki-auth-test-${Date.now()}.db`);
process.env.DATABASE_PATH = tmpDbPath;
process.env.NODE_ENV = "test";

let closeDb: () => void;
let authService: import("../src/services/auth.service.js").AuthService;

beforeAll(async () => {
  const connection = await import("../src/database/sqlite/connection.js");
  const migrate = await import("../src/database/sqlite/migrate.js");
  const adapter = await import("../src/database/sqlite/adapter.js");
  const profilesRepo = await import("../src/repositories/profiles.repository.js");
  const sessionsRepo = await import("../src/repositories/sessions.repository.js");
  const authServiceModule = await import("../src/services/auth.service.js");

  closeDb = connection.closeDb;
  migrate.runMigrations();

  const db = adapter.createSqliteAdapter();
  const profiles = profilesRepo.createProfilesRepository(db);
  const sessions = sessionsRepo.createSessionsRepository(db);
  authService = authServiceModule.createAuthService(profiles, sessions);
});

afterAll(() => {
  closeDb();
  fs.rmSync(tmpDbPath, { force: true });
  fs.rmSync(`${tmpDbPath}-wal`, { force: true });
  fs.rmSync(`${tmpDbPath}-shm`, { force: true });
});

describe("auth: register, login, logout", () => {
  it("registra um novo usuário e retorna um token de sessão", async () => {
    const { profile, token } = await authService.register(
      { email: "teste@sorasaki.com", password: "senha-forte-123" },
      {}
    );

    expect(profile.email).toBe("teste@sorasaki.com");
    expect(profile.role).toBe("user");
    expect(token).toHaveLength(64); // 32 bytes em hex
  });

  it("rejeita registro com email duplicado", async () => {
    await expect(
      authService.register({ email: "teste@sorasaki.com", password: "outra-senha-123" }, {})
    ).rejects.toThrow("já está em uso");
  });

  it("rejeita registro com senha curta", async () => {
    await expect(
      authService.register({ email: "curta@sorasaki.com", password: "123" }, {})
    ).rejects.toThrow();
  });

  it("faz login com credenciais corretas", async () => {
    const { profile, token } = await authService.login(
      { email: "teste@sorasaki.com", password: "senha-forte-123" },
      {}
    );

    expect(profile.email).toBe("teste@sorasaki.com");
    expect(token).toHaveLength(64);
  });

  it("rejeita login com senha errada", async () => {
    await expect(
      authService.login({ email: "teste@sorasaki.com", password: "senha-errada" }, {})
    ).rejects.toThrow("incorretos");
  });

  it("rejeita login com email inexistente com a MESMA mensagem de senha errada", async () => {
    // Importante: não dar dica de que o email não existe (evita enumeração de contas).
    await expect(
      authService.login({ email: "nao-existe@sorasaki.com", password: "qualquer" }, {})
    ).rejects.toThrow("incorretos");
  });

  it("valida uma sessão ativa e invalida após logout", async () => {
    const { token } = await authService.login(
      { email: "teste@sorasaki.com", password: "senha-forte-123" },
      {}
    );

    const validated = authService.validateSession(token);
    expect(validated?.email).toBe("teste@sorasaki.com");

    authService.logout(token);

    const afterLogout = authService.validateSession(token);
    expect(afterLogout).toBeUndefined();
  });
});
