import type { FastifyInstance } from "fastify";
import { ZodError } from "zod";
import { createSqliteAdapter } from "../../database/sqlite/adapter.js";
import { createProfilesRepository } from "../../repositories/profiles.repository.js";
import { createSessionsRepository } from "../../repositories/sessions.repository.js";
import {
  createAuthService,
  InvalidCredentialsError,
  EmailAlreadyInUseError,
} from "../../services/auth.service.js";
import { requireAuth } from "../../middleware/authn.js";
import { SESSION_COOKIE_NAME, sessionCookieOptions } from "../../middleware/cookieConfig.js";
import { isLoginBlocked, recordFailedLogin, clearLoginAttempts } from "../../middleware/loginRateLimit.js";

export async function authRoutes(app: FastifyInstance) {
  const db = createSqliteAdapter();
  const profiles = createProfilesRepository(db);
  const sessions = createSessionsRepository(db);
  const authService = createAuthService(profiles, sessions);

  app.post("/auth/register", async (request, reply) => {
    try {
      const { profile, token } = await authService.register(request.body, {
        userAgent: request.headers["user-agent"],
        ipAddress: request.ip,
      });

      reply.setCookie(SESSION_COOKIE_NAME, token, sessionCookieOptions());
      return reply.status(201).send({ data: profile });
    } catch (err) {
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

    if (isLoginBlocked(ip, emailForRateLimit)) {
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

      clearLoginAttempts(ip, emailForRateLimit);
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
        recordFailedLogin(ip, emailForRateLimit);
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
}
