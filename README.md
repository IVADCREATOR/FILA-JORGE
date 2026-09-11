# Sorasaki Core

Infraestrutura privada própria: API central para autenticação, banco de
dados, aplicações e (progressivamente) storage e memória, usada pelo
Sorasaki e por futuros projetos. SQLite é o motor de armazenamento atual,
acessado sempre através de uma camada de API própria — nunca diretamente
pelo frontend.

Hoje é **privado**: só existem duas formas de identidade — profiles
(humanos, admin) e applications (máquinas, ex: o backend do Sorasaki) — e
nenhuma delas pode se auto-cadastrar publicamente. A arquitetura já separa
o que é genérico (Core) do que é específico de um produto (ex: grupos,
pedidos do Sorasaki, que **não vivem neste repositório**), justamente para
permitir abrir isso a mais aplicações ou até ao público no futuro sem
reescrever a base.

## Arquitetura

```
Aplicações (Sorasaki, futuros projetos)
            ↓ HTTPS
      Sorasaki Core API (/api/v1)
   ┌────────┼─────────┐
 Auth   Applications  (Memory/Storage — Fase 2)
   └────────┼─────────┘
        Services
            ↓
       Repositories
            ↓
      DatabaseAdapter
            ↓
          SQLite  →  (PostgreSQL, futuramente)
```

Duas identidades independentes, dois middlewares diferentes:

- **`request.user`** — humano, autenticado via cookie de sessão
  (`requireAuth`, `requireRole`). Usado por rotas administrativas.
- **`request.application`** — máquina, autenticada via API key no header
  `Authorization: Bearer sk_...` (`requireApplication`, `requireScope`).
  Usado por rotas de dados que outros serviços vão consumir (memory,
  storage, futuramente).

Nenhuma camada acima do Repository sabe que o banco é SQLite — trocar por
Postgres no futuro é reimplementar `DatabaseAdapter`, não reescrever a
aplicação.

## Estrutura de pastas

```
src/
├── config/          # env validado com Zod - única fonte de configuração
├── auth/            # primitivas: hash de senha, tokens de sessão, API keys
├── database/
│   ├── adapter.ts        # interface DatabaseAdapter
│   └── sqlite/            # implementação atual
├── repositories/     # única camada que escreve SQL (prepared statements)
├── services/         # regras de negócio + validação (Zod)
├── middleware/         # authn (user), authApp (application), rate limit, cookie config
├── api/v1/             # rotas HTTP, uma pasta por recurso
│   ├── health/
│   ├── auth/
│   ├── applications/    # admin-only: criar app, gerenciar keys
│   └── test-items/      # andaime de exemplo do MVP inicial (ver nota abaixo)
migrations/           # arquivos .sql numerados
scripts/              # CLIs de bootstrap (create-admin, create-application)
tests/
```

> **Nota sobre `test-items`**: era a tabela de exemplo do MVP inicial pra
> validar o pipeline SQLite → API. Não faz parte do domínio do Core.
> Deixei como está por enquanto — recomendo removê-la numa limpeza futura,
> mas não decidi isso por você.

## Banco de dados

- SQLite com **WAL mode** (leituras não bloqueiam escritas concorrentes)
- Toda query usa prepared statements — nenhuma concatenação de string
- Transações explícitas via `db.transaction()` para operações multi-tabela
- Migrations numeradas em `/migrations`, aplicadas automaticamente no boot

Tabelas atuais: `profiles`, `sessions` (auth de humanos) e `applications`,
`api_keys` (auth de máquinas).

## Autenticação

**Humanos** (`profiles`): Argon2id para senha, sessão via token opaco
(só o hash SHA-256 fica no banco), cookie `HttpOnly` + `Secure` (produção)
+ `SameSite=Strict`, TTL configurável, rate limit de login (5 tentativas /
15 min por IP+email), papéis `user`/`moderator`/`admin`.

**Aplicações** (`applications` + `api_keys`): API key no formato
`sk_<64 hex>`, só o hash fica salvo (mesmo padrão de sessão), scopes como
array de strings (ex: `["memory:read","memory:write"]`), revogação
imediata, `last_used_at` atualizado a cada uso.

**Criação de admin e de aplicações não é exposta via API pública.**
São feitas por scripts rodados localmente por quem tem acesso ao servidor:

```bash
npm run create-admin -- "voce@sorasaki.com" "senha-forte-123"
npm run create-application -- "Sorasaki Web" memory:read memory:write
```

O segundo comando imprime a API key crua **uma única vez** — depois disso
é irrecuperável (só existe o hash no banco). Guarde-a num secrets manager
ou `.env` do consumidor, nunca no código.

Depois de ter um admin, `POST/GET /api/v1/applications` (protegidas por
`requireAuth + requireRole('admin')`) permitem gerenciar aplicações e
keys sem precisar de acesso ao servidor.

## API

Tudo sob `/api/v1`:

| Rota | Auth | Descrição |
|---|---|---|
| `GET /api/v1/health` | nenhuma | health check |
| `POST /api/v1/auth/register` | — | cria profile (sempre role `user`) |
| `POST /api/v1/auth/login` | — | cria sessão |
| `POST /api/v1/auth/logout` | cookie | revoga sessão |
| `GET /api/v1/auth/me` | cookie | perfil autenticado |
| `GET /api/v1/applications` | cookie (admin) | lista aplicações |
| `POST /api/v1/applications` | cookie (admin) | cria aplicação + 1ª key |
| `GET /api/v1/applications/:id/keys` | cookie (admin) | lista keys (sem hash) |
| `POST /api/v1/applications/:id/keys` | cookie (admin) | emite nova key |
| `DELETE /api/v1/applications/keys/:keyId` | cookie (admin) | revoga key |
| `PUT /api/v1/memory/:namespace/:key` | API key (`memory:write`) | cria/atualiza uma entrada |
| `GET /api/v1/memory/:namespace/:key` | API key (`memory:read`) | lê uma entrada |
| `GET /api/v1/memory/:namespace` | API key (`memory:read`) | lista entradas do namespace |
| `DELETE /api/v1/memory/:namespace/:key` | API key (`memory:write`) | remove uma entrada |
| `POST /api/v1/memory/_purge-expired` | cookie (admin) | remove entradas expiradas (gatilho manual, sem cron ainda) |
| `GET/POST /api/v1/test-items` | — | andaime de exemplo |

## Variáveis de ambiente

Ver `.env.example`. Validadas por `src/config/env.ts` no boot — o processo
não sobe se faltar algo obrigatório ou algo estiver no formato errado.

Destaque: `CORS_TRUSTED_ORIGINS` — lista separada por vírgula de origens
liberadas para requests cross-site (necessário quando um painel admin ou
outro frontend rodar em domínio/subdomínio diferente da API). Vazio por
padrão: só same-origin funciona.

## Rodando localmente

```bash
npm install
cp .env.example .env
npm run migrate
npm run create-admin -- "voce@sorasaki.com" "senha-forte-123"
npm run dev
```

```bash
npm test
```

## Produção / domínio próprio

O server já roda com `trustProxy: true` (necessário atrás de qualquer
proxy/load balancer para `request.ip` e HTTPS funcionarem corretamente) e
CORS configurável por env. Antes de colocar atrás de um domínio real:

- Definir `NODE_ENV=production` (ativa `Secure` no cookie de sessão)
- Preencher `CORS_TRUSTED_ORIGINS` com os domínios reais dos consumidores
- Terminar TLS na frente (reverse proxy/load balancer) — o processo Node
  em si não faz HTTPS
- Garantir que `data/` (arquivo `.db`) e `backups/` nunca fiquem em pasta
  servida publicamente pelo proxy

## Conectando o Sorasaki

O backend do Sorasaki (não o navegador do usuário final) passa a autenticar
como **aplicação**: guarda a API key gerada por `create-application` como
secret de ambiente e envia `Authorization: Bearer sk_...` nas chamadas ao
Core. Usuários finais do Sorasaki continuam sendo um conceito do próprio
Sorasaki por enquanto — isso só muda quando/se decidirmos que o Core
também gerencia usuários finais de aplicações terceiras (fica pra uma fase
futura, listada abaixo).

## Segurança — o que já está coberto

- Senha: Argon2id, nunca texto puro
- SQL: 100% prepared statements
- Sessão e API key: só hash no banco, nunca o valor cru
- CSRF: mitigado por `SameSite=Strict` no cookie (reavaliar se o futuro
  painel admin usar formulários cross-site)
- CORS: allowlist explícita via env, não `*`
- Autorização: sempre validada no backend (`requireAuth`/`requireRole`
  para humanos, `requireApplication`/`requireScope` para aplicações) —
  nunca confiada só ao frontend
- Isolamento entre aplicações: cada API key pertence a uma única
  `application`, `authenticateByKey` recusa aplicação `disabled`
- Rate limit de tentativas de login (brute force)
- Erros de validação (Zod) nunca vazam stack trace, só path + mensagem

## Memory Service

Armazenamento genérico de key/value, isolado por aplicação (e opcionalmente
por um `userKey` que a própria aplicação define — o Core não sabe nem
precisa saber o que esse identificador significa).

- Toda query já filtra por `application_id` na camada de repository — uma
  aplicação nunca consegue ler ou escrever memória de outra, mesmo que
  tente adivinhar namespace/key
- `namespace` e `key`: até 100 caracteres, charset restrito (`a-zA-Z0-9_:-`)
- `value`: qualquer JSON serializável, limite de 64KB por entrada
- `ttlSeconds` opcional — expira sozinho (mas ainda não existe um cron que
  limpe proativamente; até lá, `POST /memory/_purge-expired` é manual)
- Exemplo de uso pelo backend do Sorasaki:

```bash
curl -X PUT https://core.sorasaki.com/api/v1/memory/prefs/theme \
  -H "Authorization: Bearer sk_..." \
  -H "Content-Type: application/json" \
  -d '{"value": {"color": "dark"}, "userKey": "user-123", "ttlSeconds": 2592000}'
```

## O que ainda não existe (próximas fases)

**Fase 3 — Storage**: interface `StorageAdapter` com implementação local
primeiro; S3/R2/Google Drive como implementações futuras da mesma
interface, nunca acopladas ao resto da aplicação.

**Fase 4 — Backups**: `VACUUM INTO` → gzip → checksum → upload para o
Storage da Fase 3, com retenção e restauração validada (nunca sobrescreve
direto).

**Fase 5 — Observabilidade e auditoria**: tabela `admin_activity` para
ações administrativas, logs estruturados, webhooks, e um cron real pra
`purgeExpired()` do Memory Service (hoje é só o gatilho manual acima).

**Fase 6 — Multi-tenant / SaaS** (só se decidido abrir ao público):
Organizations, Plans, Usage, Quotas, Billing. Puramente arquitetural por
enquanto — nenhum código disso existe ainda, de propósito.

Verificação de e-mail e recuperação de senha para `profiles` também ainda
não existem.
