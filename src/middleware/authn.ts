import type { FastifyRequest, FastifyReply } from "fastify";
import { createSqliteAdapter } from "../database/sqlite/adapter.js";
import { createProfilesRepository, type Role, type PublicProfile } from "../repositories/profiles.repository.js";
import { createSessionsRepository } from "../repositories/sessions.repository.js";
import { createAuthService } from "../services/auth.service.js";
import { SESSION_COOKIE_NAME } from "./cookieConfig.js";

declare module "fastify" {
  interface FastifyRequest {
    user?: PublicProfile;
  }
}

// Instância única do auth service para os middlewares.
// (mesmo padrão usado nas rotas: adapter -> repository -> service)
const db = createSqliteAdapter();
const profiles = createProfilesRepository(db);
const sessions = createSessionsRepository(db);
const authService = createAuthService(profiles, sessions);

/**
 * Popula request.user se houver um cookie de sessão válido.
 * NÃO bloqueia a request se não houver sessão - use requireAuth pra isso.
 * Útil para rotas que têm comportamento opcionalmente diferente se logado.
 */
export async function attachUser(request: FastifyRequest, _reply: FastifyReply) {
  const token = request.cookies?.[SESSION_COOKIE_NAME];
  if (!token) return;

  const profile = authService.validateSession(token);
  if (profile) request.user = profile;
}

/**
 * Bloqueia a request com 401 se não houver sessão válida.
 */
export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  await attachUser(request, reply);
  if (!request.user) {
    return reply.status(401).send({ error: "unauthorized", message: "Sessão inválida ou expirada" });
  }
}

/**
 * Bloqueia a request com 403 se o usuário autenticado não tiver um dos papéis permitidos.
 * Sempre usar DEPOIS de requireAuth no array de preHandlers.
 */
export function requireRole(...allowedRoles: Role[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user || !allowedRoles.includes(request.user.role)) {
      return reply.status(403).send({ error: "forbidden", message: "Permissão insuficiente" });
    }
  };
}
