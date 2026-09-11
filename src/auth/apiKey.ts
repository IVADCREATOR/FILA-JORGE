import crypto from "node:crypto";

const KEY_PREFIX = "sk"; // "secret key" - prefixo visível pro usuário reconhecer o formato

/**
 * Gera uma nova API key no formato sk_<64 hex chars>.
 * O valor retornado só existe em memória neste momento - depois de
 * hashear e salvar, é impossível recuperá-lo de novo. O chamador precisa
 * mostrar isso pro usuário UMA vez, na hora da criação.
 */
export function generateApiKey(): { raw: string; prefix: string } {
  const random = crypto.randomBytes(32).toString("hex");
  const raw = `${KEY_PREFIX}_${random}`;
  // prefixo exibível: primeiros 12 caracteres, suficiente pra reconhecer
  // a key numa lista sem expor nada sensível.
  const prefix = raw.slice(0, 12);
  return { raw, prefix };
}

export function hashApiKey(rawKey: string): string {
  return crypto.createHash("sha256").update(rawKey).digest("hex");
}
