import type { DatabaseAdapter } from "../database/adapter.js";

export type ApplicationStatus = "active" | "disabled";

export interface Application {
  id: number;
  name: string;
  slug: string;
  status: ApplicationStatus;
  created_at: string;
  updated_at: string;
}

export function createApplicationsRepository(db: DatabaseAdapter) {
  return {
    findById(id: number): Application | undefined {
      return db.get<Application>("SELECT * FROM applications WHERE id = ?", [id]);
    },

    findBySlug(slug: string): Application | undefined {
      return db.get<Application>("SELECT * FROM applications WHERE slug = ?", [slug]);
    },

    findAll(): Application[] {
      return db.all<Application>("SELECT * FROM applications ORDER BY id DESC");
    },

    create(name: string, slug: string): Application {
      const result = db.run("INSERT INTO applications (name, slug) VALUES (?, ?)", [name, slug]);
      const id = Number(result.lastInsertRowid);
      const created = db.get<Application>("SELECT * FROM applications WHERE id = ?", [id]);
      if (!created) throw new Error("Falha ao ler application recém-criada");
      return created;
    },

    setStatus(id: number, status: ApplicationStatus): void {
      db.run("UPDATE applications SET status = ?, updated_at = datetime('now') WHERE id = ?", [status, id]);
    },
  };
}

export type ApplicationsRepository = ReturnType<typeof createApplicationsRepository>;
