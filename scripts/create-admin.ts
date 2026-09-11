import { createSqliteAdapter } from "../src/database/sqlite/adapter.js";
import { runMigrations } from "../src/database/sqlite/migrate.js";
import { createProfilesRepository } from "../src/repositories/profiles.repository.js";
import { hashPassword } from "../src/auth/password.js";

/**
 * Cria (ou promove) um profile admin. Rodar localmente:
 *
 *   npx tsx scripts/create-admin.ts seu@email.com "senha-forte-aqui"
 *
 * Deliberadamente NÃO existe um endpoint HTTP equivalente - criar admin
 * só deve ser possível por quem tem acesso ao servidor/banco diretamente.
 */
async function main() {
  const [email, password] = process.argv.slice(2);

  if (!email || !password) {
    console.error('Uso: npx tsx scripts/create-admin.ts "email@exemplo.com" "senha"');
    process.exit(1);
  }

  if (password.length < 8) {
    console.error("A senha precisa ter pelo menos 8 caracteres.");
    process.exit(1);
  }

  runMigrations();

  const db = createSqliteAdapter();
  const profiles = createProfilesRepository(db);

  const existing = profiles.findByEmail(email);
  if (existing) {
    console.error(`Já existe um profile com o email ${email} (role atual: ${existing.role}).`);
    console.error("Este script não sobrescreve profiles existentes por segurança.");
    process.exit(1);
  }

  const passwordHash = await hashPassword(password);
  const admin = profiles.create(email, passwordHash, "admin");

  console.log(`Admin criado: ${admin.email} (id ${admin.id}, role ${admin.role})`);
}

main().catch((err) => {
  console.error("Falha ao criar admin:", err);
  process.exit(1);
});
