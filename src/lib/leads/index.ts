import { config } from "@/lib/config";
import { mockLeadsRepository, type LeadsRepository } from "./mock-repository";
import { createTableLeadsRepository } from "./table-repository";

export type { ImportManyResult, LeadsRepository } from "./mock-repository";

/**
 * Repositório de leads.
 * Padrão: grava na coleção "leads" (arquivo local ou tabela app_data), conforme DATA_BACKEND.
 * Com DATA_BACKEND=supabase e LEADS_STORE=table: grava na tabela própria "leads", uma linha por lead.
 */
export function getLeadsRepository(): LeadsRepository {
  if (config.dataBackend === "supabase" && config.leadsStore === "table") {
    return createTableLeadsRepository({ url: config.supabaseUrl, secretKey: config.supabaseSecretKey });
  }
  return mockLeadsRepository;
}

/**
 * O mesmo repositório de leads, mas que decide a cada chamada onde gravar (arquivo, coleção ou tabela).
 * Campanhas e caixa de entrada usam este, para sempre falarem com o mesmo lugar que as telas.
 */
export const currentLeadsRepository: LeadsRepository = new Proxy({} as LeadsRepository, {
  get(_target, method: string) {
    return (...args: unknown[]) => (getLeadsRepository() as unknown as Record<string, (...a: unknown[]) => unknown>)[method](...args);
  },
});
