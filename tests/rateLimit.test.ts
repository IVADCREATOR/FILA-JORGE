import { describe, it, expect } from "vitest";
import { createRateLimiter } from "../src/middleware/rateLimit.js";

describe("rateLimit: createRateLimiter", () => {
  it("não bloqueia antes de atingir o máximo de tentativas", () => {
    const limiter = createRateLimiter({ maxAttempts: 3, windowMs: 60_000 });

    expect(limiter.isBlocked("k")).toBe(false);
    limiter.recordFailure("k");
    limiter.recordFailure("k");
    expect(limiter.isBlocked("k")).toBe(false); // 2 falhas, limite é 3
  });

  it("bloqueia ao atingir o máximo de tentativas", () => {
    const limiter = createRateLimiter({ maxAttempts: 3, windowMs: 60_000 });

    limiter.recordFailure("k");
    limiter.recordFailure("k");
    limiter.recordFailure("k");
    expect(limiter.isBlocked("k")).toBe(true);
  });

  it("chaves diferentes têm contadores independentes", () => {
    const limiter = createRateLimiter({ maxAttempts: 1, windowMs: 60_000 });

    limiter.recordFailure("a");
    expect(limiter.isBlocked("a")).toBe(true);
    expect(limiter.isBlocked("b")).toBe(false);
  });

  it("clear() remove o bloqueio imediatamente", () => {
    const limiter = createRateLimiter({ maxAttempts: 1, windowMs: 60_000 });

    limiter.recordFailure("k");
    expect(limiter.isBlocked("k")).toBe(true);

    limiter.clear("k");
    expect(limiter.isBlocked("k")).toBe(false);
  });

  it("janela expirada reseta o contador (testado com windowMs negativo, simulando expiração imediata)", () => {
    // windowMs muito pequeno/negativo faz qualquer registro já nascer "expirado",
    // simulando de forma determinística a passagem do tempo sem usar sleep real.
    const limiter = createRateLimiter({ maxAttempts: 1, windowMs: -1 });

    limiter.recordFailure("k");
    expect(limiter.isBlocked("k")).toBe(false);
  });
});
