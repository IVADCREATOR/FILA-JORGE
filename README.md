# sorasaki-db

Infraestrutura própria de banco de dados para o Sorasaki: API própria em
Node.js/TypeScript sobre SQLite (motor de armazenamento), desenhada para
permitir migração futura para PostgreSQL sem reescrever a aplicação.

## Status atual: MVP

Este é o primeiro passo do projeto (ver `docs/` para a arquitetura completa
planejada). O que já funciona:

- SQLite com WAL mode habilitado
- Sistema de migrations (arquivos `.sql` numerados em `/migrations`)
- Camada `DatabaseAdapter` (abstração para futura troca por Postgres)
- Repository + Service para uma tabela de teste (`test_items`)
- API Fastify com `GET /api/health`, `GET /api/test-items`, `POST /api/test-items`
- Validação de input com Zod (rejeita antes de qualquer SQL)
- Prepared statements em 100% das queries (nenhuma concatenação de string)
- Teste automatizado (Vitest) cobrindo o pipeline completo

O que **ainda não existe** (próximas etapas): autenticação, usuários, papéis/permissões,
backups automáticos, painel administrativo, e as demais tabelas do Sorasaki
(`profiles`, `orders`, `products` etc).

## Como rodar

```bash
npm install
cp .env.example .env
npm run migrate   # aplica migrations, cria data/sorasaki.db
npm run dev       # sobe a API em http://localhost:3000
```

## Como testar

```bash
npm test
```

## Testando os endpoints manualmente

```bash
curl http://localhost:3000/api/health

curl http://localhost:3000/api/test-items

curl -X POST http://localhost:3000/api/test-items \
  -H "Content-Type: application/json" \
  -d '{"name": "primeiro item"}'
```

## Arquitetura (resumo)

```
Rota (Fastify)
   ↓
Service (validação com Zod, regras de negócio)
   ↓
Repository (única camada que escreve SQL, sempre com prepared statements)
   ↓
DatabaseAdapter (interface)
   ↓
SQLite (implementação atual) | Postgres (implementação futura)
```

Nenhuma camada acima do Repository sabe que o banco é SQLite. Isso é o que
torna a troca futura para Postgres uma questão de implementar um novo adapter,
não de reescrever a aplicação.

## Próximos passos

1. Autenticação (Argon2id + sessões via cookie HttpOnly/Secure/SameSite)
2. Tabela `profiles` + papéis/permissões
3. Migração da primeira tabela real do Supabase (baixo risco: `site_notices`
   ou `feedback`)
4. Sistema de backup (VACUUM INTO → gzip → checksum → Google Drive)
