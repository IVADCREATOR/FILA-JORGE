/**
 * Rate limiter de login em memória. Suficiente para uma instância única.
 *
 * LIMITAÇÃO IMPORTANTE: se você rodar múltiplas instâncias do servidor
 * (ex: atrás de um load balancer), cada instância tem seu próprio contador,
 * então o limite efetivo multiplica pelo número de instâncias. Se isso vier
 * a ser um problema, mover para uma tabela no banco ou Redis resolve.
 */

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutos

interface AttemptRecord {
  count: number;
  firstAttemptAt: number;
}

const attempts = new Map<string, AttemptRecord>();

function keyFor(ip: string, email: string): string {
  return `${ip}:${email.toLowerCase()}`;
}

export function isLoginBlocked(ip: string, email: string): boolean {
  const record = attempts.get(keyFor(ip, email));
  if (!record) return false;

  const windowExpired = Date.now() - record.firstAttemptAt > WINDOW_MS;
  if (windowExpired) {
    attempts.delete(keyFor(ip, email));
    return false;
  }

  return record.count >= MAX_ATTEMPTS;
}

export function recordFailedLogin(ip: string, email: string): void {
  const key = keyFor(ip, email);
  const record = attempts.get(key);

  if (!record || Date.now() - record.firstAttemptAt > WINDOW_MS) {
    attempts.set(key, { count: 1, firstAttemptAt: Date.now() });
    return;
  }

  record.count += 1;
}

export function clearLoginAttempts(ip: string, email: string): void {
  attempts.delete(keyFor(ip, email));
}
