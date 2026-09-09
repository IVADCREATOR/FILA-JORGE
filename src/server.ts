import Fastify from "fastify";
import { runMigrations } from "./database/sqlite/migrate.js";
import { healthRoutes } from "./api/health/routes.js";
import { testItemsRoutes } from "./api/test-items/routes.js";

async function main() {
  // Migrations rodam ANTES do server aceitar tráfego.
  // Se uma migration falhar, o processo não sobe - melhor falhar rápido
  // do que aceitar requests contra um schema inconsistente.
  runMigrations();

  const app = Fastify({
    logger: true,
  });

  await app.register(healthRoutes, { prefix: "/api" });
  await app.register(testItemsRoutes, { prefix: "/api" });

  const port = Number(process.env.PORT ?? 3000);

  await app.listen({ port, host: "0.0.0.0" });
}

main().catch((err) => {
  console.error("Falha ao iniciar o servidor:", err);
  process.exit(1);
});
