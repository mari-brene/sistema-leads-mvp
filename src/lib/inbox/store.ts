import { readJson, writeJson } from "@/lib/storage";
import { createRest, type RestOptions } from "@/lib/storage/rest-table";
import {
  conversationToRow,
  messageToRow,
  rowToConversation,
  rowToMessage,
  rowToSettings,
  settingsToRow,
  type AiUsageRow,
  type ConversationRow,
  type InboxMessageRow,
  type InboxSettingsRow,
} from "./table-mapping";
import type { Conversation, InboxMessage, InboxSettings } from "./types";

/**
 * Tudo da caixa de entrada de UM cliente. As regras do repositório alteram esta estrutura "no lugar";
 * o store grava depois só o que mudou. aiUsage: "clienteId|2026-10-21" → respostas da IA nesse dia.
 */
export type ClientInbox = {
  settings: InboxSettings | null;
  conversations: Conversation[];
  messages: InboxMessage[];
  aiUsage: Record<string, number>;
};

export interface InboxStore {
  withLock<T>(task: () => Promise<T>): Promise<T>;
  read(clientId: string): Promise<ClientInbox>;
  /** Lê os dados do cliente, deixa a função alterar, grava as mudanças. Uma gravação de cada vez. */
  edit<T>(clientId: string, change: (data: ClientInbox) => T): Promise<T>;
}

// ---------- Arquivo local / coleção app_data (como sempre foi) ----------

type FileData = {
  settings: Record<string, InboxSettings>;
  conversations: Conversation[];
  messages: InboxMessage[];
  aiUsage: Record<string, number>;
};

async function readAll(): Promise<FileData> {
  const data = (await readJson<Partial<FileData> | null>("inbox", null)) ?? {};
  return {
    settings: data.settings ?? {},
    conversations: Array.isArray(data.conversations) ? data.conversations : [],
    messages: Array.isArray(data.messages) ? data.messages : [],
    aiUsage: data.aiUsage ?? {},
  };
}

const globalWithLock = globalThis as typeof globalThis & { __inboxLock?: Promise<unknown> };

function withLock<T>(task: () => Promise<T>): Promise<T> {
  const previous = globalWithLock.__inboxLock ?? Promise.resolve();
  const run = previous.then(task, task);
  globalWithLock.__inboxLock = run.catch(() => undefined);
  return run;
}

const prefixOf = (clientId: string) => `${clientId}|`;

function view(data: FileData, clientId: string): ClientInbox {
  return {
    settings: data.settings[clientId] ?? null,
    conversations: data.conversations.filter((c) => c.userId === clientId),
    messages: data.messages.filter((m) => m.userId === clientId),
    aiUsage: Object.fromEntries(Object.entries(data.aiUsage).filter(([key]) => key.startsWith(prefixOf(clientId)))),
  };
}

export function createCollectionStore(): InboxStore {
  return {
    withLock,
    async read(clientId) {
      return view(await readAll(), clientId);
    },
    edit: (clientId, change) =>
      withLock(async () => {
        const data = await readAll();
        const mine = view(data, clientId);
        const result = change(mine);
        await writeJsonInbox({
          settings: mine.settings ? { ...data.settings, [clientId]: mine.settings } : data.settings,
          conversations: [...data.conversations.filter((c) => c.userId !== clientId), ...mine.conversations],
          messages: [...data.messages.filter((m) => m.userId !== clientId), ...mine.messages],
          aiUsage: {
            ...Object.fromEntries(Object.entries(data.aiUsage).filter(([key]) => !key.startsWith(prefixOf(clientId)))),
            ...mine.aiUsage,
          },
        });
        return result;
      }),
  };
}

const writeJsonInbox = (data: FileData) => writeJson("inbox", data);

// ---------- Tabelas próprias do Supabase (supabase/04-caixa-de-entrada.sql) ----------

export function createTableStore(options: RestOptions): InboxStore {
  const rest = createRest(options);
  const of = (clientId: string) => `client_id=eq.${encodeURIComponent(clientId)}`;

  async function load(clientId: string): Promise<ClientInbox> {
    const [settings, conversations, messages, usage] = await Promise.all([
      rest.fetchAll<InboxSettingsRow>("inbox_settings", of(clientId), "client_id"),
      rest.fetchAll<ConversationRow>("conversations", of(clientId), "lead_id"),
      rest.fetchAll<InboxMessageRow>("inbox_messages", of(clientId)),
      rest.fetchAll<AiUsageRow>("ai_usage", of(clientId), "day"),
    ]);
    return {
      settings: settings[0] ? rowToSettings(settings[0]) : null,
      conversations: conversations.map(rowToConversation),
      messages: messages.map(rowToMessage),
      aiUsage: Object.fromEntries(usage.map((row) => [`${clientId}|${row.day}`, row.count])),
    };
  }

  async function upsert(table: string, rows: unknown[], conflict: string): Promise<void> {
    if (rows.length === 0) return;
    const response = await rest.call(table, "POST", `?on_conflict=${conflict}`, rows, "resolution=merge-duplicates,return=minimal");
    if (!response.ok) rest.fail(response.status, "gravar", table);
  }

  async function save(clientId: string, before: ClientInbox, after: ClientInbox): Promise<void> {
    if (after.settings && JSON.stringify(before.settings) !== JSON.stringify(after.settings)) {
      await upsert("inbox_settings", [settingsToRow(clientId, after.settings)], "client_id");
    }
    await rest.syncRows("conversations", clientId, before.conversations, after.conversations, conversationToRow, "lead_id");
    await rest.syncRows("inbox_messages", clientId, before.messages, after.messages, messageToRow);
    const changedUsage = Object.entries(after.aiUsage)
      .filter(([key, count]) => before.aiUsage[key] !== count)
      .map(([key, count]) => {
        if (!key.startsWith(prefixOf(clientId))) throw new Error("Uso de IA de outro cliente: gravação bloqueada.");
        return { client_id: clientId, day: key.slice(prefixOf(clientId).length), count };
      });
    await upsert("ai_usage", changedUsage, "client_id,day");
  }

  return {
    withLock,
    read: load,
    edit: (clientId, change) =>
      withLock(async () => {
        const before = await load(clientId);
        const after = structuredClone(before);
        const result = change(after);
        await save(clientId, before, after);
        return result;
      }),
  };
}
