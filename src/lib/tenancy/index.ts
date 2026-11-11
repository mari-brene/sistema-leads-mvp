import { readJson, writeJson } from "@/lib/storage";
import { ensureDefaultClient, pickScope, type TenancyData } from "./logic";
import type { Client, Membership, Scope } from "./types";

export * from "./types";
export { canConfigure } from "./logic";

const EMPTY: TenancyData = { clients: [], memberships: [] };

async function load(): Promise<TenancyData> {
  const [clients, memberships] = await Promise.all([
    readJson<Client[]>("clients", []),
    readJson<Membership[]>("memberships", []),
  ]);
  return { clients, memberships };
}

/** Descobre (e cria, se for a primeira vez) o cliente e o papel da pessoa. */
export async function resolveScope(userId: string, preferredClientId?: string): Promise<Scope> {
  let data = await load().catch(() => EMPTY);
  const ensured = ensureDefaultClient(data, userId, new Date());
  if (ensured.changed) {
    data = ensured.data;
    await Promise.all([writeJson("clients", data.clients), writeJson("memberships", data.memberships)]);
  }
  const scope = pickScope(userId, data.memberships, preferredClientId);
  if (!scope) throw new Error("Não foi possível determinar o cliente desta conta.");
  return scope;
}
