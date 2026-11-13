import { readJson, writeJson } from "@/lib/storage";
import { createRest, type RestOptions } from "@/lib/storage/rest-table";
import type { TenancyData } from "./logic";
import type { Client, Membership } from "./types";

/**
 * Onde ficam os clientes e os vínculos (quem pertence a qual cliente, com qual papel).
 * Mesma ideia dos outros módulos: coleção/arquivo (padrão) ou tabelas próprias do Supabase.
 */
export interface TenancyStore {
  load(): Promise<TenancyData>;
  /** Grava só a diferença entre "antes" e "depois". Nunca apaga clientes. */
  save(before: TenancyData, after: TenancyData): Promise<void>;
}

export function createCollectionStore(): TenancyStore {
  return {
    async load() {
      const [clients, memberships] = await Promise.all([readJson<Client[]>("clients", []), readJson<Membership[]>("memberships", [])]);
      return { clients: Array.isArray(clients) ? clients : [], memberships: Array.isArray(memberships) ? memberships : [] };
    },
    async save(_before, after) {
      await Promise.all([writeJson("clients", after.clients), writeJson("memberships", after.memberships)]);
    },
  };
}

type ClientRow = { id: string; name: string; created_at: string };
type MembershipRow = { user_id: string; client_id: string; role: string };

const key = (m: { userId: string; clientId: string }) => `${m.userId}::${m.clientId}`;

export function createTableStore(options: RestOptions): TenancyStore {
  const rest = createRest(options);
  const q = (value: string) => encodeURIComponent(value);

  return {
    async load() {
      const [clients, memberships] = await Promise.all([
        rest.fetchAll<ClientRow>("clients", "", "id"),
        rest.fetchAll<MembershipRow>("memberships", "", "user_id"),
      ]);
      return {
        clients: clients.map((row) => ({ id: row.id, name: row.name, createdAt: new Date(row.created_at).toISOString() })),
        memberships: memberships.map((row) => ({ userId: row.user_id, clientId: row.client_id, role: row.role as Membership["role"] })),
      };
    },

    async save(before, after) {
      const knownClients = new Set(before.clients.map((c) => c.id));
      const newClients = after.clients.filter((c) => !knownClients.has(c.id));
      const renamed = after.clients.filter((c) => knownClients.has(c.id) && before.clients.find((b) => b.id === c.id)?.name !== c.name);

      // ignore-duplicates: se duas requisições criarem o mesmo cliente ao mesmo tempo, a segunda é ignorada.
      if (newClients.length > 0) {
        const response = await rest.call(
          "clients",
          "POST",
          "",
          newClients.map((c) => ({ id: c.id, name: c.name, created_at: c.createdAt })),
          "resolution=ignore-duplicates,return=minimal",
        );
        if (!response.ok) rest.fail(response.status, "gravar", "clients");
      }
      for (const client of renamed) {
        const response = await rest.call("clients", "PATCH", `?id=eq.${q(client.id)}`, { name: client.name }, "return=minimal");
        if (!response.ok) rest.fail(response.status, "gravar", "clients");
      }

      const beforeByKey = new Map(before.memberships.map((m) => [key(m), m]));
      const afterKeys = new Set(after.memberships.map(key));
      const created = after.memberships.filter((m) => !beforeByKey.has(key(m)));
      const changed = after.memberships.filter((m) => beforeByKey.has(key(m)) && beforeByKey.get(key(m))!.role !== m.role);
      const removed = before.memberships.filter((m) => !afterKeys.has(key(m)));

      if (created.length > 0) {
        const response = await rest.call(
          "memberships",
          "POST",
          "",
          created.map((m) => ({ user_id: m.userId, client_id: m.clientId, role: m.role })),
          "resolution=ignore-duplicates,return=minimal",
        );
        if (!response.ok) rest.fail(response.status, "gravar", "memberships");
      }
      for (const m of changed) {
        const response = await rest.call("memberships", "PATCH", `?user_id=eq.${q(m.userId)}&client_id=eq.${q(m.clientId)}`, { role: m.role }, "return=minimal");
        if (!response.ok) rest.fail(response.status, "gravar", "memberships");
      }
      for (const m of removed) {
        const response = await rest.call("memberships", "DELETE", `?user_id=eq.${q(m.userId)}&client_id=eq.${q(m.clientId)}`, undefined, "return=minimal");
        if (!response.ok) rest.fail(response.status, "apagar", "memberships");
      }
    },
  };
}
