import Fastify from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import { config } from "./config/env.js";
import { runMigrations } from "./database/sqlite/migrate.js";
import { healthRoutes } from "./api/v1/health/routes.js";
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

  // CORREÇÃO DE SEGURANÇA (auditoria): sem isso, um erro inesperado
  // (ex: uma constraint do SQLite, um erro de I/O, um bind inválido)
  // caía no handler padrão do Fastify, que serializa err.message
  // diretamente na resposta - podendo vazar nomes de tabela/coluna,
  // caminhos de arquivo, ou detalhes internos do driver. Agora:
  // erros com statusCode < 500 (validação, etc) mantêm sua mensagem
  // original; qualquer coisa >= 500 (não tratada) vira uma mensagem
  // genérica pro client, com o erro real logado só no servidor.
  app.setErrorHandler((error, request, reply) => {
    const statusCode = typeof error.statusCode === "number" && error.statusCode < 500 ? error.statusCode : 500;

    if (statusCode >= 500) {
      request.log.error({ err: error }, "erro não tratado");
      return reply.status(500).send({
        error: "internal_error",
        message: "Erro interno do servidor.",
      });
    }

    return reply.status(statusCode).send({
      error: error.code ?? "bad_request",
      message: error.message,
    });
  });

  // CORREÇÃO DE SEGURANÇA (auditoria): nenhum security header era
  // enviado antes disso. São seguros de aplicar globalmente porque essa
  // API é 100% JSON (nunca serve HTML/JS), então CSP restritiva não
  // quebra nada legítimo.
  app.addHook("onSend", async (request, reply, payload) => {
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("X-Frame-Options", "DENY");
    reply.header("Referrer-Policy", "no-referrer");
    reply.header("Permissions-Policy", "geolocation=(), camera=(), microphone=()");
    reply.header("Content-Security-Policy", "default-src 'none'");
    if (config.isProduction) {
      reply.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    }
    return payload;
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
  await app.register(authRoutes, { prefix: "/api/v1" });
  await app.register(applicationsRoutes, { prefix: "/api/v1" });
  await app.register(memoryRoutes, { prefix: "/api/v1" });

  await app.listen({ port: config.server.port, host: "0.0.0.0" });
}

main().catch((err) => {
  console.error("Falha ao iniciar o servidor:", err);
  process.exit(1);
});
