import { config } from "@/lib/config";
import { ensureDefaultClient, pickAccess, type Access } from "./logic";
import { createCollectionStore, createTableStore, type TenancyStore } from "./store";
import type { Scope } from "./types";

export type { Access } from "./logic";

export * from "./types";
export { canConfigure } from "./logic";

/**
 * Onde ficam clientes e vínculos: coleção/arquivo (padrão) ou, com DATA_BACKEND=supabase e TENANCY_STORE=table,
 * as tabelas próprias "clients" e "memberships" (necessárias para os leads, campanhas e conversas nas tabelas novas).
 */
export function getTenancyStore(): TenancyStore {
  if (config.dataBackend === "supabase" && config.tenancyStore === "table") {
    return createTableStore({ url: config.supabaseUrl, secretKey: config.supabaseSecretKey });
  }
  return createCollectionStore();
}

/**
 * Descobre (e cria, se for a primeira vez) o cliente ativo e o papel da pessoa, e a lista de clientes que ela pode acessar.
 * Se não for possível ler os vínculos, dá erro: nunca se assume que a pessoa é a primeira do sistema.
 */
export async function resolveAccess(
  userId: string,
  preferredClientId?: string,
  store: TenancyStore = getTenancyStore(),
): Promise<{ scope: Scope; accessible: Access[] }> {
  let data = await store.load();
  const ensured = ensureDefaultClient(data, userId, new Date());
  if (ensured.changed) {
    await store.save(data, ensured.data);
    data = ensured.data;
  }
  const access = pickAccess(data, userId, preferredClientId);
  if (!access) throw new Error("Não foi possível determinar o cliente desta conta.");
  return access;
}

export async function resolveScope(userId: string, preferredClientId?: string, store?: TenancyStore): Promise<Scope> {
  return (await resolveAccess(userId, preferredClientId, store)).scope;
}
