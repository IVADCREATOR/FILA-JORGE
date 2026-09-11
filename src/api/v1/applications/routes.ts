import type { FastifyInstance } from "fastify";
import { z, ZodError } from "zod";
import { createSqliteAdapter } from "../../../database/sqlite/adapter.js";
import { createApplicationsRepository } from "../../../repositories/applications.repository.js";
import { createApiKeysRepository } from "../../../repositories/apiKeys.repository.js";
import {
  createApplicationsService,
  SlugAlreadyInUseError,
  ApplicationNotFoundError,
} from "../../../services/applications.service.js";
import { requireAuth, requireRole } from "../../../middleware/authn.js";

function zodErrorResponse(err: ZodError) {
  return {
    error: "validation_error",
    details: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
  };
}

// CORREÇÃO (auditoria): antes, `Number(request.params.id)` não validava
// nada - um :id não numérico virava NaN, e NaN passado como parâmetro
// pro better-sqlite3 lança um TypeError não tratado (better-sqlite3 recusa
// bind de NaN/Infinity). Isso resultava num 500 com erro cru do driver.
// Agora qualquer :id/:keyId inválido retorna um 400 limpo, validado ANTES
// de chegar no banco.
const idParamSchema = z.object({ id: z.coerce.number().int().positive() });
const keyIdParamSchema = z.object({ keyId: z.coerce.number().int().positive() });

/**
 * Todas as rotas aqui são administrativas: só um profile com role "admin"
 * pode criar/gerenciar aplicações. Não existe (e não deve existir por
 * enquanto) um jeito de uma aplicação se auto-cadastrar.
 */
export async function applicationsRoutes(app: FastifyInstance) {
  const db = createSqliteAdapter();
  const applications = createApplicationsRepository(db);
  const apiKeys = createApiKeysRepository(db);
  const service = createApplicationsService(applications, apiKeys);

  const adminOnly = [requireAuth, requireRole("admin")];

  app.get("/applications", { preHandler: adminOnly }, async (_request, reply) => {
    return reply.send({ data: service.list() });
  });

  app.post("/applications", { preHandler: adminOnly }, async (request, reply) => {
    try {
      const { application, rawKey } = service.create(request.body);
      // rawKey só aparece nesta resposta, uma vez. Depois disso é irrecuperável.
      return reply.status(201).send({ data: { application, apiKey: rawKey } });
    } catch (err) {
      if (err instanceof ZodError) return reply.status(400).send(zodErrorResponse(err));
      if (err instanceof SlugAlreadyInUseError) {
        return reply.status(409).send({ error: "slug_in_use", message: err.message });
      }
      throw err;
    }
  });

  app.get("/applications/:id/keys", { preHandler: adminOnly }, async (request, reply) => {
    try {
      const { id } = idParamSchema.parse(request.params);
      return reply.send({ data: service.listKeys(id) });
    } catch (err) {
      if (err instanceof ZodError) return reply.status(400).send(zodErrorResponse(err));
      throw err;
    }
  });

  const issueKeySchema = z.object({ scopes: z.array(z.string()).default([]) });

  app.post("/applications/:id/keys", { preHandler: adminOnly }, async (request, reply) => {
    try {
      const { id } = idParamSchema.parse(request.params);
      const { scopes } = issueKeySchema.parse(request.body ?? {});
      const rawKey = service.issueKeyForExistingApplication(id, scopes);
      return reply.status(201).send({ data: { apiKey: rawKey } });
    } catch (err) {
      if (err instanceof ZodError) return reply.status(400).send(zodErrorResponse(err));
      if (err instanceof ApplicationNotFoundError) {
        return reply.status(404).send({ error: "not_found", message: err.message });
      }
      throw err;
    }
  });

  app.delete("/applications/keys/:keyId", { preHandler: adminOnly }, async (request, reply) => {
    try {
      const { keyId } = keyIdParamSchema.parse(request.params);
      service.revokeKey(keyId);
      return reply.status(204).send();
    } catch (err) {
      if (err instanceof ZodError) return reply.status(400).send(zodErrorResponse(err));
      throw err;
    }
  });
}
