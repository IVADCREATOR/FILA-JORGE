import type { FastifyInstance } from "fastify";
import { ZodError } from "zod";
import { createSqliteAdapter } from "../../../database/sqlite/adapter.js";
import { createProfilesRepository } from "../../../repositories/profiles.repository.js";
import { createSessionsRepository } from "../../../repositories/sessions.repository.js";
import {
  createAuthService,
  InvalidCredentialsError,
  EmailAlreadyInUseError,
} from "../../../services/auth.service.js";
import { requireAuth, requireRole } from "../../../middleware/authn.js";
import { SESSION_COOKIE_NAME, sessionCookieOptions } from "../../../middleware/cookieConfig.js";
import { createRateLimiter } from "../../../middleware/rateLimit.js";

// Login: limite por IP+email (5 tentativas / 15min) - já existia antes da auditoria.
const loginLimiter = createRateLimiter({ maxAttempts: 5, windowMs: 15 * 60 * 1000 });

// Registro: NÃO existia limite nenhum antes da auditoria. Argon2id é
// deliberadamente caro de CPU (~o suficiente pra tornar brute force de
// senha inviável), o que significa que registro sem limite é uma
// superfície de negação de serviço: um atacante consegue gerar carga
// significativa de CPU só mandando POSTs com emails diferentes.
// Limite por IP (não por email, já que o atacante controla o email).
const registerLimiter = createRateLimiter({ maxAttempts: 10, windowMs: 60 * 60 * 1000 });

export async function authRoutes(app: FastifyInstance) {
  const db = createSqliteAdapter();
  const profiles = createProfilesRepository(db);
  const sessions = createSessionsRepository(db);
  const authService = createAuthService(profiles, sessions);

  app.post("/auth/register", async (request, reply) => {
    if (registerLimiter.isBlocked(request.ip)) {
      return reply.status(429).send({
        error: "too_many_attempts",
        message: "Muitos registros a partir deste IP. Tente novamente mais tarde.",
      });
    }

    try {
      const { profile, token } = await authService.register(request.body, {
        userAgent: request.headers["user-agent"],
        ipAddress: request.ip,
      });

      reply.setCookie(SESSION_COOKIE_NAME, token, sessionCookieOptions());
      return reply.status(201).send({ data: profile });
    } catch (err) {
      // Toda tentativa (mesmo com email duplicado) conta pro limite -
      // isso é intencional, é justamente o padrão de abuso que queremos limitar.
      registerLimiter.recordFailure(request.ip);

      if (err instanceof ZodError) {
        return reply.status(400).send({
          error: "validation_error",
          details: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        });
      }
      if (err instanceof EmailAlreadyInUseError) {
        return reply.status(409).send({ error: "email_in_use", message: err.message });
      }
      throw err;
    }
  });

  app.post("/auth/login", async (request, reply) => {
    const ip = request.ip;
    const emailForRateLimit =
      typeof (request.body as any)?.email === "string" ? (request.body as any).email : "unknown";
    const limiterKey = `${ip}:${emailForRateLimit.toLowerCase()}`;

    if (loginLimiter.isBlocked(limiterKey)) {
      return reply.status(429).send({
        error: "too_many_attempts",
        message: "Muitas tentativas de login. Tente novamente mais tarde.",
      });
    }

    try {
      const { profile, token } = await authService.login(request.body, {
        userAgent: request.headers["user-agent"],
        ipAddress: ip,
      });

      loginLimiter.clear(limiterKey);
      reply.setCookie(SESSION_COOKIE_NAME, token, sessionCookieOptions());
      return reply.send({ data: profile });
    } catch (err) {
      if (err instanceof ZodError) {
        return reply.status(400).send({
          error: "validation_error",
          details: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        });
      }
      if (err instanceof InvalidCredentialsError) {
        loginLimiter.recordFailure(limiterKey);
        return reply.status(401).send({ error: "invalid_credentials", message: err.message });
      }
      throw err;
    }
  });

  app.post("/auth/logout", { preHandler: requireAuth }, async (request, reply) => {
    const token = request.cookies?.[SESSION_COOKIE_NAME];
    if (token) authService.logout(token);

    reply.clearCookie(SESSION_COOKIE_NAME, { path: "/" });
    return reply.status(204).send();
  });

  app.get("/auth/me", { preHandler: requireAuth }, async (request, reply) => {
    return reply.send({ data: request.user });
  });

  // Sessões expiradas se acumulavam sem nenhuma forma de limpeza (a
  // função já existia no repository, mas nada a chamava). Mesmo padrão
  // manual usado em /memory/_purge-expired, até existir um cron de verdade.
  app.post(
    "/auth/_purge-expired-sessions",
    { preHandler: [requireAuth, requireRole("admin")] },
    async (_request, reply) => {
      const removed = sessions.deleteExpired();
      return reply.send({ data: { removed } });
    }
  );
}
