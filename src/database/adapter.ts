/**
 * Interface mínima que qualquer motor de banco precisa implementar.
 * Repositories dependem SOMENTE desta interface, nunca do driver concreto.
 *
 * Quando migrarmos para Postgres, criamos src/database/postgres/adapter.ts
 * implementando o mesmo contrato, e os repositories não mudam uma linha.
 */
export interface DatabaseAdapter {
  get<T = unknown>(sql: string, params?: unknown[]): T | undefined;
  all<T = unknown>(sql: string, params?: unknown[]): T[];
  run(sql: string, params?: unknown[]): { lastInsertRowid: number | bigint; changes: number };
  transaction<T>(fn: () => T): T;
}
