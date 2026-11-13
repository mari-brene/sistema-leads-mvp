import type { Conversation, InboxMessage, InboxSettings } from "./types";

/** Linhas das tabelas da caixa de entrada. No sistema, userId guarda o id do CLIENTE. */

const iso = (value: string): string => new Date(value).toISOString();
const isoOrNull = (value: string | null): string | null => (value ? iso(value) : null);

export type InboxSettingsRow = { client_id: string; ai_enabled: boolean; business_name: string; knowledge: string };

export const settingsToRow = (clientId: string, s: InboxSettings): InboxSettingsRow => ({
  client_id: clientId,
  ai_enabled: s.aiEnabled,
  business_name: s.businessName,
  knowledge: s.knowledge,
});

export const rowToSettings = (row: InboxSettingsRow): InboxSettings => ({
  aiEnabled: row.ai_enabled,
  businessName: row.business_name,
  knowledge: row.knowledge,
});

export type ConversationRow = {
  client_id: string;
  lead_id: string;
  mode: string;
  needs_human: boolean;
  handoff_reason: string | null;
  ai_replies_in_row: number;
  last_inbound_at: string | null;
  last_message_at: string;
  last_preview: string;
  created_at: string;
};

export const conversationToRow = (c: Conversation): ConversationRow => ({
  client_id: c.userId,
  lead_id: c.leadId,
  mode: c.mode,
  needs_human: c.needsHuman,
  handoff_reason: c.handoffReason,
  ai_replies_in_row: c.aiRepliesInRow,
  last_inbound_at: c.lastInboundAt,
  last_message_at: c.lastMessageAt,
  last_preview: c.lastPreview,
  created_at: c.createdAt,
});

export const rowToConversation = (row: ConversationRow): Conversation => ({
  userId: row.client_id,
  leadId: row.lead_id,
  mode: row.mode as Conversation["mode"],
  needsHuman: row.needs_human,
  handoffReason: row.handoff_reason,
  aiRepliesInRow: row.ai_replies_in_row,
  lastInboundAt: isoOrNull(row.last_inbound_at),
  lastMessageAt: iso(row.last_message_at),
  lastPreview: row.last_preview,
  createdAt: iso(row.created_at),
});

export type InboxMessageRow = {
  id: string;
  client_id: string;
  lead_id: string;
  direction: string;
  author: string;
  text: string;
  at: string;
  external_id: string | null;
  status: string | null;
  error: string | null;
};

export const messageToRow = (m: InboxMessage): InboxMessageRow => ({
  id: m.id,
  client_id: m.userId,
  lead_id: m.leadId,
  direction: m.direction,
  author: m.author,
  text: m.text,
  at: m.at,
  external_id: m.externalId ?? null,
  status: m.status ?? null,
  error: m.error ?? null,
});

export const rowToMessage = (row: InboxMessageRow): InboxMessage => ({
  id: row.id,
  userId: row.client_id,
  leadId: row.lead_id,
  direction: row.direction as InboxMessage["direction"],
  author: row.author as InboxMessage["author"],
  text: row.text,
  at: iso(row.at),
  ...(row.external_id ? { externalId: row.external_id } : {}),
  ...(row.status ? { status: row.status as "enviada" | "falhou" } : {}),
  ...(row.error ? { error: row.error } : {}),
});

export type AiUsageRow = { client_id: string; day: string; count: number };
