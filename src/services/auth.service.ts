import { z } from "zod";
import type { ProfilesRepository } from "../repositories/profiles.repository.js";
import type { SessionsRepository } from "../repositories/sessions.repository.js";
import { hashPassword, verifyPassword } from "../auth/password.js";
import { generateSessionToken, hashSessionToken } from "../auth/session.js";
import { SESSION_TTL_HOURS } from "../middleware/cookieConfig.js";

export const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email("email inválido"),
  password: z.string().min(8, "senha precisa ter pelo menos 8 caracteres").max(200),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("email inválido"),
  password: z.string().min(1, "senha obrigatória"),
});

export class InvalidCredentialsError extends Error {
  constructor() {
    super("Email ou senha incorretos");
  }
}

export class EmailAlreadyInUseError extends Error {
  constructor() {
    super("Este email já está em uso");
  }
}

export function createAuthService(profiles: ProfilesRepository, sessions: SessionsRepository) {
  return {
    async register(input: unknown, context: { userAgent?: string; ipAddress?: string }) {
      const data = registerSchema.parse(input);

      const existing = profiles.findByEmail(data.email);
      if (existing) throw new EmailAlreadyInUseError();

      const passwordHash = await hashPassword(data.password);
      const profile = profiles.create(data.email, passwordHash, "user");

      const token = await createSessionForProfile(sessions, profile.id, context);
      return { profile, token };
    },

    async login(input: unknown, context: { userAgent?: string; ipAddress?: string }) {
      const data = loginSchema.parse(input);

      const profile = profiles.findByEmail(data.email);
      if (!profile) {
        // Mesma mensagem de erro para "email não existe" e "senha errada":
        // não dar dica pra quem está tentando enumerar emails válidos.
        throw new InvalidCredentialsError();
      }

      const valid = await verifyPassword(profile.password_hash, data.password);
      if (!valid) throw new InvalidCredentialsError();

      const token = await createSessionForProfile(sessions, profile.id, context);
      return { profile: profiles.toPublic(profile), token };
    },

    logout(rawToken: string): void {
      const tokenHash = hashSessionToken(rawToken);
      sessions.revokeByTokenHash(tokenHash);
    },

    /**
     * Valida um token de sessão vindo do cookie e retorna o profile associado.
     * Retorna undefined se o token for inválido, expirado ou revogado.
     */
    validateSession(rawToken: string) {
      const tokenHash = hashSessionToken(rawToken);
      const session = sessions.findValidByTokenHash(tokenHash);
      if (!session) return undefined;

      const profile = profiles.findById(session.profile_id);
      if (!profile) return undefined;

      return profiles.toPublic(profile);
    },
  };
}

async function createSessionForProfile(
  sessions: SessionsRepository,
  profileId: number,
  context: { userAgent?: string; ipAddress?: string }
) {
  const token = generateSessionToken();
  const tokenHash = hashSessionToken(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_HOURS * 60 * 60 * 1000).toISOString();

  sessions.create({
    profileId,
    tokenHash,
    expiresAt,
    userAgent: context.userAgent,
    ipAddress: context.ipAddress,
  });

  return token;
}

export type AuthService = ReturnType<typeof createAuthService>;
