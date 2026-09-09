import crypto from "node:crypto";

/**
 * O token "cru" é o que vai no cookie do navegador.
 * O que fica salvo no banco é o hash SHA-256 dele.
 * Assim, um dump do banco não dá a um atacante sessões prontas para usar.
 */
export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function hashSessionToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}
