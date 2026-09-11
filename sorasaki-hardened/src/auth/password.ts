import argon2 from "argon2";

/**
 * Argon2id: recomendado pela OWASP para hashing de senha (resiste bem
 * tanto a ataques de GPU quanto a ataques de custo de memória).
 * Parâmetros abaixo são um ponto de partida razoável para um servidor pequeno;
 * ajuste memoryCost pra cima se o hardware permitir.
 */
const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19456, // ~19 MB
  timeCost: 2,
  parallelism: 1,
};

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    // Hash malformado ou incompatível: trata como senha errada, não como erro 500.
    return false;
  }
}
