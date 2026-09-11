import type { FastifyInstance } from "fastify";
import { ZodError } from "zod";
import { createSqliteAdapter } from "../../../database/sqlite/adapter.js";
import { createMemoryRepository } from "../../../repositories/memory.repository.js";
import { createMemoryService, ValueTooLargeError } from "../../../services/memory.service.js";
import { requireApplication, requireScope } from "../../../middleware/authApp.js";
import { requireAuth, requireRole } from "../../../middleware/authn.js";

function zodErrorResponse(err: ZodError) {
  return {
    error: "validation_error",
    details: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
  };
}

export async function memoryRoutes(app: FastifyInstance) {
  const db = createSqliteAdapter();
  const repo = createMemoryRepository(db);
  const service = createMemoryService(repo);

  // Todas as rotas abaixo operam SEMPRE sobre request.application.info.id -
  // nunca sobre um application_id vindo do client. É isso que garante que
  // uma aplicação não consiga ler/escrever memory de outra.

  app.put(
    "/memory/:namespace/:key",
    { preHandler: [requireApplication, requireScope("memory:write")] },
    async (request, reply) => {
      try {
        const { namespace, key } = request.params as { namespace: string; key: string };
        const entry = service.set(request.application!.info.id, namespace, key, request.body);
        return reply.status(200).send({ data: entry });
      } catch (err) {
        if (err instanceof ZodError) return reply.status(400).send(zodErrorResponse(err));
        if (err instanceof ValueTooLargeError) return reply.status(413).send({ error: "value_too_large", message: err.message });
        throw err;
      }
    }
  );

  app.get(
    "/memory/:namespace/:key",
    { preHandler: [requireApplication, requireScope("memory:read")] },
    async (request, reply) => {
      try {
        const { namespace, key } = request.params as { namespace: string; key: string };
        const userKey = (request.query as { userKey?: string })?.userKey ?? "";
        const entry = service.get(request.application!.info.id, namespace, key, userKey);

        if (!entry) return reply.status(404).send({ error: "not_found" });
        return reply.send({ data: entry });
      } catch (err) {
        if (err instanceof ZodError) return reply.status(400).send(zodErrorResponse(err));
        throw err;
      }
    }
  );

  app.get(
    "/memory/:namespace",
    { preHandler: [requireApplication, requireScope("memory:read")] },
    async (request, reply) => {
      try {
        const { namespace } = request.params as { namespace: string };
        const userKey = (request.query as { userKey?: string })?.userKey ?? "";
        const entries = service.list(request.application!.info.id, namespace, userKey);
        return reply.send({ data: entries });
      } catch (err) {
        if (err instanceof ZodError) return reply.status(400).send(zodErrorResponse(err));
        throw err;
      }
    }
  );

  app.delete(
    "/memory/:namespace/:key",
    { preHandler: [requireApplication, requireScope("memory:write")] },
    async (request, reply) => {
      try {
        const { namespace, key } = request.params as { namespace: string; key: string };
        const userKey = (request.query as { userKey?: string })?.userKey ?? "";
        const deleted = service.delete(request.application!.info.id, namespace, key, userKey);

        if (!deleted) return reply.status(404).send({ error: "not_found" });
        return reply.status(204).send();
      } catch (err) {
        if (err instanceof ZodError) return reply.status(400).send(zodErrorResponse(err));
        throw err;
      }
    }
  );

  // Não existe scheduler/cron ainda (fica pra uma fase futura). Até lá,
  // isso é um gatilho manual pro admin liberar espaço de entradas expiradas.
  app.post(
    "/memory/_purge-expired",
    { preHandler: [requireAuth, requireRole("admin")] },
    async (_request, reply) => {
      const removed = service.purgeExpired();
      return reply.send({ data: { removed } });
    }
  );
}
