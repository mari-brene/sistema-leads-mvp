import { randomUUID } from "node:crypto";
import { readJson, writeJson } from "@/lib/storage";

/**
 * Auditoria: registro simples do que o agendador fez e dos erros.
 * Só guarda CONTAGENS e avisos. Nunca nomes, telefones, mensagens ou chaves.
 */

export type AuditKind = "agendador" | "erro" | "whatsapp";

export type AuditEntry = {
  id: string;
  at: string;
  /** null = evento do sistema todo. */
  userId: string | null;
  kind: AuditKind;
  text: string;
};

export type AuditData = {
  /** Mais novos primeiro. */
  entries: AuditEntry[];
  /** Última vez que o agendador chamou o sistema (mesmo que não tenha enviado nada). */
  lastCron: { at: string; text: string } | null;
};

export const MAX_ENTRIES = 300;

export type NewEntry = { userId: string | null; kind: AuditKind; text: string };

/** Função pura: acrescenta registros no começo e mantém só os mais recentes. */
export function addEntries(data: AuditData, entries: NewEntry[], at: string, newId: () => string): AuditData {
  const added: AuditEntry[] = entries.map((entry) => ({ id: newId(), at, userId: entry.userId, kind: entry.kind, text: entry.text.slice(0, 300) }));
  return { ...data, entries: [...added.reverse(), ...data.entries].slice(0, MAX_ENTRIES) };
}

export function emptyAudit(): AuditData {
  return { entries: [], lastCron: null };
}

const globalWithLock = globalThis as typeof globalThis & { __auditLock?: Promise<unknown> };

function withLock<T>(task: () => Promise<T>): Promise<T> {
  const previous = globalWithLock.__auditLock ?? Promise.resolve();
  const run = previous.then(task, task);
  globalWithLock.__auditLock = run.catch(() => undefined);
  return run;
}

async function load(): Promise<AuditData> {
  const data = await readJson<Partial<AuditData> | null>("audit", null);
  return { entries: Array.isArray(data?.entries) ? (data?.entries as AuditEntry[]) : [], lastCron: data?.lastCron ?? null };
}

/** Quem recebe os registros do agendador (os testes usam um falso). */
export interface AuditSink {
  log(entries: NewEntry[], lastCronText: string): Promise<void>;
}

export function createAuditSink(now: () => Date = () => new Date()): AuditSink {
  return {
    log: (entries, lastCronText) =>
      withLock(async () => {
        const at = now().toISOString();
        const data = addEntries(await load(), entries, at, () => randomUUID());
        await writeJson("audit", { ...data, lastCron: { at, text: lastCronText.slice(0, 300) } });
      }),
  };
}

/** O que a tela de Auditoria mostra: registros desta pessoa e do sistema. */
export async function readAudit(userId: string): Promise<AuditData> {
  const data = await load();
  return { ...data, entries: data.entries.filter((entry) => entry.userId === null || entry.userId === userId) };
}
