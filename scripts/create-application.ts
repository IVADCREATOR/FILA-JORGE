import { createSqliteAdapter } from "../src/database/sqlite/adapter.js";
import { runMigrations } from "../src/database/sqlite/migrate.js";
import { createApplicationsRepository } from "../src/repositories/applications.repository.js";
import { createApiKeysRepository } from "../src/repositories/apiKeys.repository.js";
import { createApplicationsService } from "../src/services/applications.service.js";

/**
 * Cria uma application e imprime a API key crua UMA vez.
 *
 *   npx tsx scripts/create-application.ts "Sorasaki Web" memory:read memory:write
 *
 * Os argumentos depois do nome são os scopes iniciais da key.
 * Isso existe como alternativa à rota HTTP /api/v1/applications para o
 * bootstrap inicial (quando ainda não existe nenhum admin logado).
 */
async function main() {
  const [name, ...scopes] = process.argv.slice(2);

  if (!name) {
    console.error('Uso: npx tsx scripts/create-application.ts "Nome da App" [scope1] [scope2] ...');
    process.exit(1);
  }

  runMigrations();

  const db = createSqliteAdapter();
  const applications = createApplicationsRepository(db);
  const apiKeys = createApiKeysRepository(db);
  const service = createApplicationsService(applications, apiKeys);

  const { application, rawKey } = service.create({ name, scopes });

  console.log(`Aplicação criada: ${application.name} (slug: ${application.slug}, id: ${application.id})`);
  console.log("");
  console.log("API key (copie agora - não será mostrada de novo):");
  console.log(rawKey);
}

main().catch((err) => {
  console.error("Falha ao criar aplicação:", err);
  process.exit(1);
});
