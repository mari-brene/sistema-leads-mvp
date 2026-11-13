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
  entries: AuditEntry[];
  lastCron: { at: string; text: string } | null;
};

export const MAX_ENTRIES = 300;

export type NewEntry = { userId: string | null; kind: AuditKind; text: string };

export function addEntries(data: AuditData, entries: NewEntry[], at: string, newId: () => string): AuditData {
  const added: AuditEntry[] = entries.map((entry) => ({ id: newId(), at, userId: entry.userId, kind: entry.kind, text: entry.text.slice(0, 300) }));
  return { ...data, entries: [...added.reverse(), ...data.entries].slice(0, MAX_ENTRIES) };
}

export function emptyAudit(): AuditData {
  return { entries: [], lastCron: null };
}
