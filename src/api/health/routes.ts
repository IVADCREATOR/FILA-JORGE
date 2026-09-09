import type { FastifyInstance } from "fastify";
import { getDb } from "../../database/sqlite/connection.js";

export async function healthRoutes(app: FastifyInstance) {
  app.get("/health", async () => {
    const db = getDb();
    // Query trivial pra confirmar que o banco responde de verdade,
    // não só que o processo está de pé.
    db.prepare("SELECT 1").get();

    return {
      status: "ok",
      timestamp: new Date().toISOString(),
    };
  });
}
