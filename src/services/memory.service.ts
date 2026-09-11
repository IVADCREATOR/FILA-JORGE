import { z } from "zod";
import type { MemoryRepository } from "../repositories/memory.repository.js";

// namespace e key: charset restrito, evita ambiguidade e injeção de path em rotas futuras.
const identifierSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[a-zA-Z0-9_:-]+$/, "use apenas letras, números, '_', '-' ou ':'");

const MAX_VALUE_BYTES = 64 * 1024; // 64KB por entrada - suficiente pra preferências/contexto, não pra blobs

export const setMemorySchema = z.object({
  value: z.unknown().refine((v) => v !== undefined, "value é obrigatório"),
  metadata: z.record(z.unknown()).optional(),
  userKey: z.string().max(200).default(""),
  ttlSeconds: z.number().int().positive().optional(),
});

export class ValueTooLargeError extends Error {
  constructor() {
    super(`value excede o limite de ${MAX_VALUE_BYTES} bytes`);
  }
}

function toPublicEntry(entry: {
  namespace: string;
  key: string;
  value: string;
  metadata: string | null;
  created_at: string;
  updated_at: string;
  expires_at: string | null;
}) {
  return {
    namespace: entry.namespace,
    key: entry.key,
    value: JSON.parse(entry.value),
    metadata: entry.metadata ? JSON.parse(entry.metadata) : null,
    createdAt: entry.created_at,
    updatedAt: entry.updated_at,
    expiresAt: entry.expires_at,
  };
}

export function createMemoryService(repo: MemoryRepository) {
  return {
    set(applicationId: number, namespace: unknown, key: unknown, input: unknown) {
      const ns = identifierSchema.parse(namespace);
      const k = identifierSchema.parse(key);
      const data = setMemorySchema.parse(input);

      const serializedValue = JSON.stringify(data.value);
      if (Buffer.byteLength(serializedValue, "utf8") > MAX_VALUE_BYTES) {
        throw new ValueTooLargeError();
      }

      const expiresAt = data.ttlSeconds
        ? new Date(Date.now() + data.ttlSeconds * 1000).toISOString()
        : null;

      const entry = repo.upsert({
        applicationId,
        userKey: data.userKey,
        namespace: ns,
        key: k,
        value: serializedValue,
        metadata: data.metadata ? JSON.stringify(data.metadata) : null,
        expiresAt,
      });

      return toPublicEntry(entry);
    },

    get(applicationId: number, namespace: unknown, key: unknown, userKey = "") {
      const ns = identifierSchema.parse(namespace);
      const k = identifierSchema.parse(key);

      const entry = repo.find(applicationId, userKey, ns, k);
      return entry ? toPublicEntry(entry) : undefined;
    },

    list(applicationId: number, namespace: unknown, userKey = "") {
      const ns = identifierSchema.parse(namespace);
      return repo.list(applicationId, userKey, ns).map(toPublicEntry);
    },

    delete(applicationId: number, namespace: unknown, key: unknown, userKey = ""): boolean {
      const ns = identifierSchema.parse(namespace);
      const k = identifierSchema.parse(key);
      return repo.delete(applicationId, userKey, ns, k) > 0;
    },

    purgeExpired(): number {
      return repo.deleteExpired();
    },
  };
}

export type MemoryService = ReturnType<typeof createMemoryService>;
