import { mockLeadsRepository, type LeadsRepository } from "./mock-repository";

export type { ImportManyResult, LeadsRepository } from "./mock-repository";

/** Repositório de leads. Grava em arquivo local ou no Supabase, conforme DATA_BACKEND. */
export function getLeadsRepository(): LeadsRepository {
  // O mesmo repositório serve aos dois modos: quem decide onde gravar é DATA_BACKEND (veja lib/storage).
  return mockLeadsRepository;
}
