import { z } from "zod";
import type { TestItemsRepository } from "../repositories/testItems.repository.js";

export const createTestItemSchema = z.object({
  name: z.string().trim().min(1, "name não pode ser vazio").max(200, "name muito longo"),
});

export type CreateTestItemInput = z.infer<typeof createTestItemSchema>;

export function createTestItemsService(repo: TestItemsRepository) {
  return {
    list() {
      return repo.findAll();
    },

    create(input: unknown) {
      // Validação acontece aqui, antes de qualquer contato com o banco.
      // Se falhar, lança ZodError - a rota decide como transformar isso em resposta HTTP.
      const data = createTestItemSchema.parse(input);
      return repo.create(data.name);
    },
  };
}
