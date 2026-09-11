-- 004_memory.sql
-- Memory Service: armazenamento genérico de key/value associado a uma
-- application (e opcionalmente a um "user_key" definido por ela).
--
-- "user_key" é um identificador OPAÇO escolhido por quem chama a API -
-- não é uma foreign key para profiles. O Core não sabe nem precisa saber
-- o que esse valor significa; isso mantém o Memory Service desacoplado
-- das regras de negócio de qualquer aplicação específica (Sorasaki ou não).

CREATE TABLE application_memory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  user_key TEXT NOT NULL DEFAULT '', -- '' = memória em nível de aplicação, sem usuário específico
  namespace TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,      -- JSON serializado; schema livre para quem consome
  metadata TEXT,             -- JSON opcional
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT            -- NULL = nunca expira
);

-- Isolamento: cada (application, user_key, namespace, key) é único.
-- Uma aplicação nunca enxerga ou colide com a chave de outra.
CREATE UNIQUE INDEX idx_memory_unique ON application_memory(application_id, user_key, namespace, key);
CREATE INDEX idx_memory_lookup ON application_memory(application_id, namespace, user_key);
CREATE INDEX idx_memory_expires_at ON application_memory(expires_at);
