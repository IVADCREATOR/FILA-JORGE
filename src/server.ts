import Fastify from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import { config } from "./config/env.js";
import { runMigrations } from "./database/sqlite/migrate.js";
import { healthRoutes } from "./api/v1/health/routes.js";
import { testItemsRoutes } from "./api/v1/test-items/routes.js";
import { authRoutes } from "./api/v1/auth/routes.js";
import { applicationsRoutes } from "./api/v1/applications/routes.js";
import { memoryRoutes } from "./api/v1/memory/routes.js";

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

  // CORS: só libera origens explicitamente confiáveis (CORS_TRUSTED_ORIGINS no .env).
  // Sem isso configurado, só requests same-origin funcionam - o que é o
  // comportamento seguro por padrão quando ainda não existe frontend externo.
  await app.register(cors, {
    origin(origin, callback) {
      // origin undefined = request same-origin ou ferramenta tipo curl/Postman: permite.
      if (!origin || config.cors.trustedOrigins.includes(origin)) {
        return callback(null, true);
      }
      callback(new Error(`Origem não autorizada: ${origin}`), false);
    },
    credentials: true, // necessário pro cookie de sessão funcionar em requests cross-site autorizadas
  });

  await app.register(healthRoutes, { prefix: "/api/v1" });
  await app.register(testItemsRoutes, { prefix: "/api/v1" });
  await app.register(authRoutes, { prefix: "/api/v1" });
  await app.register(applicationsRoutes, { prefix: "/api/v1" });
  await app.register(memoryRoutes, { prefix: "/api/v1" });

  await app.listen({ port: config.server.port, host: "0.0.0.0" });
}

main().catch((err) => {
  console.error("Falha ao iniciar o servidor:", err);
  process.exit(1);
});
