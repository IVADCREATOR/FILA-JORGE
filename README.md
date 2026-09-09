# sorasaki-db

Infraestrutura própria de banco de dados para o Sorasaki: API própria em
Node.js/TypeScript sobre SQLite (motor de armazenamento), desenhada para
permitir migração futura para PostgreSQL sem reescrever a aplicação.

## Status atual

O que já funciona:

- SQLite com WAL mode habilitado
- Sistema de migrations (arquivos `.sql` numerados em `/migrations`)
- Camada `DatabaseAdapter` (abstração para futura troca por Postgres)
- Repository + Service para uma tabela de teste (`test_items`)
- API Fastify com `GET /api/health`, `GET /api/test-items`, `POST /api/test-items`
- Validação de input com Zod (rejeita antes de qualquer SQL)
- Prepared statements em 100% das queries (nenhuma concatenação de string)
- **Autenticação completa**: `profiles` + `sessions`, senha com Argon2id,
  sessão via cookie HttpOnly/Secure(prod)/SameSite=Strict, token opaco
  (hash guardado no banco, nunca o token cru), rate limit de login (5
  tentativas / 15 min por IP+email), papéis (`user`/`moderator`/`admin`)
  com middleware `requireAuth`/`requireRole`
- Endpoints: `POST /api/auth/register`, `POST /api/auth/login`,
  `POST /api/auth/logout`, `GET /api/auth/me`
- Testes automatizados (Vitest) cobrindo os dois pipelines

O que **ainda não existe** (próximas etapas): backups automáticos, painel
administrativo, verificação de e-mail, recuperação de senha, e as demais
tabelas do Sorasaki (`orders`, `products`, `groups` etc).

### Sobre o rate limit de login

É em memória, então funciona bem com uma instância só do servidor. Se algum
dia isso rodar em múltiplas instâncias atrás de um load balancer, o limite
efetivo multiplica pelo número de instâncias — nesse ponto vale mover para
uma tabela no banco ou Redis. Deixei um comentário no código sobre isso.

### Sobre CSRF

Como a sessão usa `SameSite=Strict`, o navegador não envia o cookie em
requests cross-site, o que já cobre a maior parte do risco de CSRF para
esse formato de API. Quando o painel administrativo for construído (com
formulários), vale reavaliar se um token CSRF explícito é necessário.

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

# Auth: registro (salva o cookie de sessão em cookies.txt)
curl -c cookies.txt -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email": "voce@sorasaki.com", "password": "senha-forte-123"}'

# Reusa o cookie salvo pra acessar rota protegida
curl -b cookies.txt http://localhost:3000/api/auth/me

curl -b cookies.txt -X POST http://localhost:3000/api/auth/logout -i
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

1. Migração da primeira tabela real do Supabase (baixo risco: `site_notices`
   ou `feedback`)
2. Sistema de backup (VACUUM INTO → gzip → checksum → Google Drive)
3. Verificação de e-mail e recuperação de senha
4. Painel administrativo (visualizar tabelas, registros, logs, backups)
5. Rotação de secrets e auditoria (`admin_activity`)
