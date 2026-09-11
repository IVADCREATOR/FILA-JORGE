-- 003_applications.sql
-- Identidade de "aplicação" (máquina), separada de "profile" (humano).
-- Uma application representa um consumidor da API (ex: backend do Sorasaki).
-- Autentica via API key, não via cookie de sessão.

CREATE TABLE applications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE api_keys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  -- key_prefix: primeiros caracteres da key, guardados em texto puro só pra
  -- exibir "sk_live_a1b2...” numa UI/log sem nunca expor a key inteira.
  key_prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  -- scopes como JSON array de strings, ex: ["memory:read","memory:write"].
  -- Fica simples assim enquanto o número de scopes for pequeno; se crescer
  -- muito, migra pra uma tabela própria application_scopes sem quebrar a API.
  scopes TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_used_at TEXT,
  revoked_at TEXT
);

CREATE INDEX idx_api_keys_application_id ON api_keys(application_id);
CREATE INDEX idx_api_keys_key_hash ON api_keys(key_hash);
