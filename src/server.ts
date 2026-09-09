import Fastify from "fastify";
import cookie from "@fastify/cookie";
import { runMigrations } from "./database/sqlite/migrate.js";
import { healthRoutes } from "./api/health/routes.js";
import { testItemsRoutes } from "./api/test-items/routes.js";
import { authRoutes } from "./api/auth/routes.js";

async function main() {
  // Migrations rodam ANTES do server aceitar tráfego.
  // Se uma migration falhar, o processo não sobe - melhor falhar rápido
  // do que aceitar requests contra um schema inconsistente.
  runMigrations();

  const app = Fastify({
    logger: true,
    trustProxy: true, // necessário pra request.ip refletir o IP real atrás de proxy/load balancer
  });

  await app.register(cookie);

  await app.register(healthRoutes, { prefix: "/api" });
  await app.register(testItemsRoutes, { prefix: "/api" });
  await app.register(authRoutes, { prefix: "/api" });

  const port = Number(process.env.PORT ?? 3000);

  await app.listen({ port, host: "0.0.0.0" });
}

main().catch((err) => {
  console.error("Falha ao iniciar o servidor:", err);
  process.exit(1);
});
