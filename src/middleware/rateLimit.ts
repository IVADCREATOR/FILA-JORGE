/**
 * Rate limiter em memória, com janela deslizante simples por chave.
 * Reutilizável: cada rota que precisar de limite cria seu próprio limiter
 * com `createRateLimiter`, com seus próprios limites e sua própria chave.
 *
 * LIMITAÇÃO CONHECIDA: em memória, então serve bem UMA instância do
 * servidor. Com múltiplas instâncias atrás de um load balancer, o limite
 * efetivo multiplica pelo número de instâncias - se isso virar problema,
 * mover para uma tabela no banco ou Redis resolve.
 *
 * CORREÇÃO DE SEGURANÇA (auditoria): a versão anterior deste limiter
 * (loginRateLimit.ts) só apagava uma entrada do Map quando ALGUÉM
 * consultava exatamente aquela chave depois da janela expirar. Um
 * atacante variando o email a cada tentativa (ex: login ou registro com
 * emails aleatórios) fazia o Map crescer indefinidamente, sem nunca ser
 * limpo - um vetor de exaustão de memória. Agora existe uma varredura
 * periódica que remove entradas expiradas independentemente de consulta.
 */

interface AttemptRecord {
  count: number;
  firstAttemptAt: number;
}

export interface RateLimiter {
  isBlocked(key: string): boolean;
  recordFailure(key: string): void;
  clear(key: string): void;
}

const SWEEP_INTERVAL_MS = 5 * 60 * 1000; // varre entradas expiradas a cada 5 minutos

export function createRateLimiter(options: { maxAttempts: number; windowMs: number }): RateLimiter {
  const attempts = new Map<string, AttemptRecord>();

  function isExpired(record: AttemptRecord): boolean {
    return Date.now() - record.firstAttemptAt > options.windowMs;
  }

  // Varredura periódica: remove entradas expiradas mesmo que ninguém as
  // consulte de novo. unref() garante que isso não impede o processo de
  // encerrar (relevante em testes/scripts curtos).
  const sweepTimer = setInterval(() => {
    for (const [key, record] of attempts) {
      if (isExpired(record)) attempts.delete(key);
    }
  }, SWEEP_INTERVAL_MS);
  sweepTimer.unref?.();

  return {
    isBlocked(key: string): boolean {
      const record = attempts.get(key);
      if (!record) return false;

      if (isExpired(record)) {
        attempts.delete(key);
        return false;
      }

      return record.count >= options.maxAttempts;
    },

    recordFailure(key: string): void {
      const record = attempts.get(key);

      if (!record || isExpired(record)) {
        attempts.set(key, { count: 1, firstAttemptAt: Date.now() });
        return;
      }

      record.count += 1;
    },

    clear(key: string): void {
      attempts.delete(key);
    },
  };
}
