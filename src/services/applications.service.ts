import { z } from "zod";
import type { ApplicationsRepository, Application } from "../repositories/applications.repository.js";
import type { ApiKeysRepository } from "../repositories/apiKeys.repository.js";
import { generateApiKey, hashApiKey } from "../auth/apiKey.js";

export const createApplicationSchema = z.object({
  name: z.string().trim().min(1, "name obrigatório").max(120),
  scopes: z.array(z.string()).default([]),
});

export class SlugAlreadyInUseError extends Error {
  constructor(slug: string) {
    super(`Já existe uma aplicação com o slug "${slug}"`);
  }
}

export class ApplicationNotFoundError extends Error {
  constructor() {
    super("Aplicação não encontrada");
  }
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove acentos
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function createApplicationsService(applications: ApplicationsRepository, apiKeys: ApiKeysRepository) {
  // CORREÇÃO (auditoria): issueKey definida como função nomeada em vez de
  // método do objeto retornado. A versão anterior fazia `this.issueKey(...)`
  // dentro de `create()`, o que só funciona se o service for sempre chamado
  // como `service.create(...)` - se algum código no futuro desestruturar
  // (`const { create } = service`), `this` vira undefined e quebra em
  // runtime. Isso não é uma vulnerabilidade em si, mas é o tipo de bug
  // silencioso que só aparece em produção; corrigido por robustez.
  function issueKey(applicationId: number, scopes: string[] = []): string {
    const { raw, prefix } = generateApiKey();
    apiKeys.create({
      applicationId,
      keyHash: hashApiKey(raw),
      keyPrefix: prefix,
      scopes,
    });
    return raw;
  }

  return {
    /**
     * Cria uma aplicação e já gera sua primeira API key.
     * A key crua (rawKey) só é retornada aqui, nesta única chamada -
     * depois disso é irrecuperável (só o hash fica salvo).
     */
    create(input: unknown): { application: Application; rawKey: string } {
      const data = createApplicationSchema.parse(input);
      const slug = slugify(data.name);

      if (applications.findBySlug(slug)) throw new SlugAlreadyInUseError(slug);

      const application = applications.create(data.name, slug);
      const rawKey = issueKey(application.id, data.scopes);

      return { application, rawKey };
    },

    issueKey,

    /**
     * CORREÇÃO (auditoria): antes, emitir uma key para um application_id
     * inexistente causava um erro não tratado de FOREIGN KEY constraint
     * do SQLite (porque api_keys.application_id referencia applications).
     * Esse erro batia no handler padrão do Fastify e vazava a mensagem
     * crua do driver. Agora a existência é validada aqui, retornando um
     * erro de domínio limpo que a rota converte em 404.
     */
    issueKeyForExistingApplication(applicationId: number, scopes: string[] = []): string {
      const application = applications.findById(applicationId);
      if (!application) throw new ApplicationNotFoundError();
      return issueKey(applicationId, scopes);
    },

    revokeKey(keyId: number): void {
      apiKeys.revoke(keyId);
    },

    list(): Application[] {
      return applications.findAll();
    },

    listKeys(applicationId: number) {
      // Nunca retorna key_hash pro chamador - só metadados.
      return apiKeys.findByApplication(applicationId).map((k) => ({
        id: k.id,
        keyPrefix: k.key_prefix,
        scopes: JSON.parse(k.scopes) as string[],
        createdAt: k.created_at,
        lastUsedAt: k.last_used_at,
        revokedAt: k.revoked_at,
      }));
    },

    /**
     * Valida uma API key crua vinda do header Authorization e retorna
     * a aplicação + scopes associados, ou undefined se inválida/revogada/app desabilitada.
     */
    authenticateByKey(rawKey: string) {
      const keyHash = hashApiKey(rawKey);
      const keyRow = apiKeys.findValidByHash(keyHash);
      if (!keyRow) return undefined;

      const application = applications.findById(keyRow.application_id);
      if (!application || application.status !== "active") return undefined;

      apiKeys.touchLastUsed(keyRow.id);

      return {
        application,
        scopes: JSON.parse(keyRow.scopes) as string[],
      };
    },
  };
}

export type ApplicationsService = ReturnType<typeof createApplicationsService>;
