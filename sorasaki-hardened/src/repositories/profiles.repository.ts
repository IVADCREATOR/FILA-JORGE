import type { DatabaseAdapter } from "../database/adapter.js";

export type Role = "user" | "moderator" | "admin";

export interface Profile {
  id: number;
  email: string;
  password_hash: string;
  role: Role;
  email_verified_at: string | null;
  created_at: string;
  updated_at: string;
}

export type PublicProfile = Omit<Profile, "password_hash">;

function toPublic(profile: Profile): PublicProfile {
  const { password_hash, ...rest } = profile;
  return rest;
}

export function createProfilesRepository(db: DatabaseAdapter) {
  return {
    findByEmail(email: string): Profile | undefined {
      return db.get<Profile>("SELECT * FROM profiles WHERE email = ?", [email]);
    },

    findById(id: number): Profile | undefined {
      return db.get<Profile>("SELECT * FROM profiles WHERE id = ?", [id]);
    },

    create(email: string, passwordHash: string, role: Role = "user"): PublicProfile {
      const result = db.run(
        "INSERT INTO profiles (email, password_hash, role) VALUES (?, ?, ?)",
        [email, passwordHash, role]
      );
      const id = Number(result.lastInsertRowid);
      const created = db.get<Profile>("SELECT * FROM profiles WHERE id = ?", [id]);
      if (!created) throw new Error("Falha ao ler profile recém-criado");
      return toPublic(created);
    },

    toPublic,
  };
}

export type ProfilesRepository = ReturnType<typeof createProfilesRepository>;
