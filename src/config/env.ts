import { z } from "zod";

/**
 * Fonte única de configuração. Nenhum outro arquivo do projeto deve ler
 * process.env diretamente - tudo passa por aqui, validado.
 *
 * Isso resolve dois problemas: (1) falha rápido no boot se faltar algo
 * essencial, em vez de quebrar silenciosamente em produção; (2) evita que
 * o mesmo env var seja lido com defaults diferentes em arquivos diferentes.
 */

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),

  DATABASE_PATH: z.string().default("./data/sorasaki.db"),

  SESSION_COOKIE_NAME: z.string().default("sorasaki_session"),
  SESSION_TTL_HOURS: z.coerce.number().int().positive().default(720),

  // Lista separada por vírgula de origens confiáveis para CORS.
  // Vazio = nenhuma origem cross-site liberada (só same-origin funciona).
  CORS_TRUSTED_ORIGINS: z
    .string()
    .default("")
    .transform((value) =>
      value
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean)
    ),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Configuração de ambiente inválida:");
  console.error(parsed.error.format());
  process.exit(1);
}

const env = parsed.data;

export const config = {
  isProduction: env.NODE_ENV === "production",
  isTest: env.NODE_ENV === "test",
  nodeEnv: env.NODE_ENV,

  server: {
    port: env.PORT,
  },

  database: {
    path: env.DATABASE_PATH,
  },

  session: {
    cookieName: env.SESSION_COOKIE_NAME,
    ttlHours: env.SESSION_TTL_HOURS,
  },

  cors: {
    trustedOrigins: env.CORS_TRUSTED_ORIGINS,
  },
};
