import type { FastifyRequest, FastifyReply } from "fastify";
import { createSqliteAdapter } from "../database/sqlite/adapter.js";
import { createApplicationsRepository, type Application } from "../repositories/applications.repository.js";
import { createApiKeysRepository } from "../repositories/apiKeys.repository.js";
import { createApplicationsService } from "../services/applications.service.js";

declare module "fastify" {
  interface FastifyRequest {
    application?: { info: Application; scopes: string[] };
  }
}

const db = createSqliteAdapter();
const applications = createApplicationsRepository(db);
const apiKeys = createApiKeysRepository(db);
const applicationsService = createApplicationsService(applications, apiKeys);

function extractBearerToken(header: string | undefined): string | undefined {
  if (!header?.startsWith("Bearer ")) return undefined;
  return header.slice("Bearer ".length).trim();
}

/**
 * Autentica a request via header "Authorization: Bearer <api_key>".
 * Isso é a identidade de MÁQUINA (aplicação), separada de request.user
 * (identidade de HUMANO, via cookie). Uma request pode ter as duas, uma,
 * ou nenhuma, dependendo da rota.
 */
export async function requireApplication(request: FastifyRequest, reply: FastifyReply) {
  const rawKey = extractBearerToken(request.headers.authorization);

  if (!rawKey) {
    return reply.status(401).send({ error: "unauthorized", message: "API key ausente" });
  }

  const result = applicationsService.authenticateByKey(rawKey);
  if (!result) {
    return reply.status(401).send({ error: "unauthorized", message: "API key inválida, revogada ou aplicação desabilitada" });
  }

  request.application = { info: result.application, scopes: result.scopes };
}

/**
 * Bloqueia com 403 se a aplicação autenticada não tiver o scope necessário.
 * Sempre usar DEPOIS de requireApplication no array de preHandlers.
 */
export function requireScope(...requiredScopes: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const scopes = request.application?.scopes ?? [];
    const hasAll = requiredScopes.every((scope) => scopes.includes(scope));

    if (!hasAll) {
      return reply.status(403).send({
        error: "forbidden",
        message: `Scope insuficiente. Necessário: ${requiredScopes.join(", ")}`,
      });
    }
  };
}
