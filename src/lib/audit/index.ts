import { config } from "@/lib/config";
import { createCollectionStore, createTableStore, type AuditStore } from "./store";
import type { AuditData, NewEntry } from "./logic";

export { addEntries, emptyAudit, MAX_ENTRIES } from "./logic";
export type { AuditData, AuditEntry, AuditKind, NewEntry } from "./logic";

export interface AuditSink {
  log(entries: NewEntry[], lastCronText: string): Promise<void>;
}

const collectionStore = createCollectionStore();
let tableStore: AuditStore | null = null;

/** Coleção/arquivo (padrão) ou, com DATA_BACKEND=supabase e AUDIT_STORE=table, tabelas próprias. Escolhido a cada chamada. */
export function currentAuditStore(): AuditStore {
  if (config.dataBackend === "supabase" && config.auditStore === "table") {
    tableStore ??= createTableStore({ url: config.supabaseUrl, secretKey: config.supabaseSecretKey });
    return tableStore;
  }
  return collectionStore;
}

export function createAuditSink(now: () => Date = () => new Date(), store?: AuditStore): AuditSink {
  return { log: (entries, lastCronText) => (store ?? currentAuditStore()).add(entries, now(), lastCronText) };
}

export function readAudit(clientId: string, store?: AuditStore): Promise<AuditData> {
  return (store ?? currentAuditStore()).read(clientId);
}
