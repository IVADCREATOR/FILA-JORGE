import type { FastifyInstance } from "fastify";
import { ZodError } from "zod";
import { createSqliteAdapter } from "../../../database/sqlite/adapter.js";
import { createTestItemsRepository } from "../../../repositories/testItems.repository.js";
import { createTestItemsService } from "../../../services/testItems.service.js";

/**
 * A rota é a camada mais "burra" do sistema: só traduz HTTP <-> service.
 * Nenhuma regra de negócio e nenhum SQL aqui.
 */
export async function testItemsRoutes(app: FastifyInstance) {
  const db = createSqliteAdapter();
  const repo = createTestItemsRepository(db);
  const service = createTestItemsService(repo);

  app.get("/test-items", async (_request, reply) => {
    const items = service.list();
    return reply.send({ data: items });
  });

  app.post("/test-items", async (request, reply) => {
    try {
      const created = service.create(request.body);
      return reply.status(201).send({ data: created });
    } catch (err) {
      if (err instanceof ZodError) {
        return reply.status(400).send({
          error: "validation_error",
          details: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        });
      }
      throw err;
    }
  });
}
