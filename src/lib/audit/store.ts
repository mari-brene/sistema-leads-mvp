import { randomUUID } from "node:crypto";
import { readJson, writeJson } from "@/lib/storage";
import { createRest, type RestOptions } from "@/lib/storage/rest-table";
import { addEntries, emptyAudit, MAX_ENTRIES, type AuditData, type AuditEntry, type AuditKind, type NewEntry } from "./logic";

export const RETENTION_DAYS = 90;

/** Onde a auditoria fica guardada: coleção/arquivo (padrão) ou tabelas próprias do Supabase. */
export interface AuditStore {
  add(entries: NewEntry[], at: Date, lastCronText: string): Promise<void>;
  /** Registros do cliente + registros do sistema todo, do mais novo para o mais antigo. */
  read(clientId: string): Promise<AuditData>;
}

const globalWithLock = globalThis as typeof globalThis & { __auditLock?: Promise<unknown> };

function withLock<T>(task: () => Promise<T>): Promise<T> {
  const previous = globalWithLock.__auditLock ?? Promise.resolve();
  const run = previous.then(task, task);
  globalWithLock.__auditLock = run.catch(() => undefined);
  return run;
}

async function loadAll(): Promise<AuditData> {
  const data = await readJson<Partial<AuditData> | null>("audit", null);
  return { entries: Array.isArray(data?.entries) ? (data?.entries as AuditEntry[]) : emptyAudit().entries, lastCron: data?.lastCron ?? null };
}

export function createCollectionStore(): AuditStore {
  return {
    add: (entries, at, lastCronText) =>
      withLock(async () => {
        const stamp = at.toISOString();
        const data = addEntries(await loadAll(), entries, stamp, () => randomUUID());
        await writeJson("audit", { ...data, lastCron: lastCronText ? { at: stamp, text: lastCronText.slice(0, 300) } : data.lastCron });
      }),

    async read(clientId) {
      const data = await loadAll();
      return { ...data, entries: data.entries.filter((entry) => entry.userId === null || entry.userId === clientId) };
    },
  };
}

type LogRow = { id: string; client_id: string | null; at: string; kind: string; text: string };
type StateRow = { id: string; at: string; text: string };

const STATE_ID = "cron";

export function createTableStore(options: RestOptions, newId: () => string = () => randomUUID()): AuditStore {
  const rest = createRest(options);

  async function newest(filter: string): Promise<LogRow[]> {
    const response = await rest.call("audit_log", "GET", `?${filter}&select=*&order=at.desc,id.desc&limit=${MAX_ENTRIES}`);
    if (!response.ok) rest.fail(response.status, "ler", "audit_log");
    const rows = (await response.json()) as LogRow[];
    if (!Array.isArray(rows)) rest.fail(500, "ler", "audit_log");
    return rows;
  }

  return {
    async add(entries, at, lastCronText) {
      const base = at.getTime();
      if (entries.length > 0) {
        const rows: LogRow[] = entries.map((entry, index) => ({
          id: newId(),
          client_id: entry.userId,
          at: new Date(base + index).toISOString(),
          kind: entry.kind,
          text: entry.text.slice(0, 300),
        }));
        const response = await rest.call("audit_log", "POST", "", rows, "return=minimal");
        if (!response.ok) rest.fail(response.status, "gravar", "audit_log");
      }

      if (lastCronText) {
        const state: StateRow = { id: STATE_ID, at: at.toISOString(), text: lastCronText.slice(0, 300) };
        const saved = await rest.call("audit_state", "POST", "?on_conflict=id", state, "resolution=merge-duplicates,return=minimal");
        if (!saved.ok) rest.fail(saved.status, "gravar", "audit_state");
      }

      const cutoff = new Date(base - RETENTION_DAYS * 86_400_000).toISOString();
      const purged = await rest.call("audit_log", "DELETE", `?at=lt.${encodeURIComponent(cutoff)}`, undefined, "return=minimal");
      if (!purged.ok) rest.fail(purged.status, "apagar", "audit_log");
    },

    async read(clientId) {
      const [system, own, stateResponse] = await Promise.all([
        newest("client_id=is.null"),
        newest(`client_id=eq.${encodeURIComponent(clientId)}`),
        rest.call("audit_state", "GET", `?id=eq.${STATE_ID}&select=*&limit=1`),
      ]);
      if (!stateResponse.ok) rest.fail(stateResponse.status, "ler", "audit_state");
      const states = (await stateResponse.json()) as StateRow[];

      const entries = [...system, ...own]
        .sort((a, b) => (a.at === b.at ? b.id.localeCompare(a.id) : b.at.localeCompare(a.at)))
        .slice(0, MAX_ENTRIES)
        .map((row): AuditEntry => ({ id: row.id, at: new Date(row.at).toISOString(), userId: row.client_id, kind: row.kind as AuditKind, text: row.text }));
      const state = states[0];
      return { entries, lastCron: state ? { at: new Date(state.at).toISOString(), text: state.text } : null };
    },
  };
}
