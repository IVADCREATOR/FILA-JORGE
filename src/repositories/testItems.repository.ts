import type { DatabaseAdapter } from "../database/adapter.js";

export interface TestItem {
  id: number;
  name: string;
  created_at: string;
}

export function createTestItemsRepository(db: DatabaseAdapter) {
  return {
    findAll(): TestItem[] {
      return db.all<TestItem>("SELECT id, name, created_at FROM test_items ORDER BY id DESC");
    },

    findById(id: number): TestItem | undefined {
      return db.get<TestItem>("SELECT id, name, created_at FROM test_items WHERE id = ?", [id]);
    },

    create(name: string): TestItem {
      const result = db.run("INSERT INTO test_items (name) VALUES (?)", [name]);
      const id = Number(result.lastInsertRowid);
      const created = db.get<TestItem>("SELECT id, name, created_at FROM test_items WHERE id = ?", [id]);
      if (!created) throw new Error("Falha ao ler registro recém-criado");
      return created;
    },
  };
}

export type TestItemsRepository = ReturnType<typeof createTestItemsRepository>;
