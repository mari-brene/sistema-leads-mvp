import { config } from "@/lib/config";
import type { Lead } from "@/lib/leads/types";
import { readJson } from "@/lib/storage";
import { keyHeaders, type FetchLike } from "@/lib/storage/supabase-store";
import type { Client, Membership } from "@/lib/tenancy/types";
import { membershipKey, planMigration, verifyCopy, type Existing, type Plan } from "./plan";

type Options = { url: string; secretKey: string; fetch?: FetchLike };

const PAGE = 1000;
const CHUNK = 500;

export type MigrationReport = {
  plan: Plan;
  tableLeads: number;
};

export function createMigration(options: Options) {
  const doFetch: FetchLike = options.fetch ?? ((url, init) => fetch(url, init) as unknown as ReturnType<FetchLike>);

  async function rest(method: string, table: string, query: string, body?: unknown, prefer?: string) {
    if (!options.url || !options.secretKey) throw new Error("Faltam SUPABASE_URL e SUPABASE_SECRET_KEY.");
    try {
      return await doFetch(`${options.url}/rest/v1/${table}${query}`, {
        method,
        headers: { ...keyHeaders(options.secretKey), "Content-Type": "application/json", ...(prefer ? { Prefer: prefer } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(20_000),
      });
    } catch {
      throw new Error("Não foi possível falar com o Supabase (rede ou tempo esgotado).");
    }
  }

  async function selectAll<T>(table: string, columns: string): Promise<T[]> {
    const out: T[] = [];
    for (let offset = 0; ; offset += PAGE) {
      const response = await rest("GET", table, `?select=${columns}&order=${columns.split(",")[0]}.asc&limit=${PAGE}&offset=${offset}`);
      if (!response.ok) throw new Error(`O Supabase respondeu com erro ${response.status} ao ler "${table}". A tabela foi criada (Parte C2a)?`);
      const page = (await response.json()) as T[];
      out.push(...page);
      if (page.length < PAGE) return out;
    }
  }

  async function readExisting(): Promise<{ existing: Existing; tableLeadIds: Set<string> }> {
    const [leads, clients, memberships] = await Promise.all([
      selectAll<{ id: string }>("leads", "id"),
      selectAll<{ id: string }>("clients", "id"),
      selectAll<{ user_id: string; client_id: string }>("memberships", "user_id,client_id"),
    ]);
    const tableLeadIds = new Set(leads.map((l) => l.id));
    return {
      tableLeadIds,
      existing: {
        leadIds: tableLeadIds,
        clientIds: new Set(clients.map((c) => c.id)),
        membershipKeys: new Set(memberships.map((m) => membershipKey(m.user_id, m.client_id))),
      },
    };
  }

  async function readSource() {
    const [leads, clients, memberships] = await Promise.all([
      readJson<unknown>("leads", []),
      readJson<Client[]>("clients", []),
      readJson<Membership[]>("memberships", []),
    ]);
    return { leads, clients: Array.isArray(clients) ? clients : [], memberships: Array.isArray(memberships) ? memberships : [] };
  }

  /** Só olha: mostra o que seria copiado. Não grava nada. */
  async function preview(): Promise<MigrationReport> {
    const [source, { existing }] = await Promise.all([readSource(), readExisting()]);
    return { plan: planMigration(source, existing), tableLeads: existing.leadIds.size };
  }

  async function insert(table: string, rows: unknown[]): Promise<void> {
    for (let i = 0; i < rows.length; i += CHUNK) {
      // ignore-duplicates: se a linha já existir, é pulada. Nunca sobrescreve nada.
      const response = await rest("POST", table, "", rows.slice(i, i + CHUNK), "resolution=ignore-duplicates,return=minimal");
      if (!response.ok) throw new Error(`O Supabase respondeu com erro ${response.status} ao copiar para "${table}".`);
    }
  }

  /** Copia o que falta (clientes, vínculos e leads) e confere o resultado. Não altera nem apaga a coleção antiga. */
  async function run(): Promise<{ copied: { clients: number; memberships: number; leads: number }; missing: number; plan: Plan }> {
    const source = await readSource();
    const { existing } = await readExisting();
    const plan = planMigration(source, existing);

    await insert("clients", plan.clients);
    await insert("memberships", plan.memberships);
    await insert("leads", plan.leads);

    const after = await readExisting();
    const sourceIds = (Array.isArray(source.leads) ? (source.leads as Partial<Lead>[]) : [])
      .map((l) => l?.id)
      .filter((id): id is string => typeof id === "string");
    const { missing } = verifyCopy(sourceIds, after.tableLeadIds);
    return { copied: { clients: plan.clients.length, memberships: plan.memberships.length, leads: plan.leads.length }, missing, plan };
  }

  return { preview, run };
}

export function getMigration() {
  return createMigration({ url: config.supabaseUrl, secretKey: config.supabaseSecretKey });
}
