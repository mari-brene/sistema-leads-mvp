import {
  conversationToRow,
  messageToRow,
  settingsToRow,
  type AiUsageRow,
  type ConversationRow,
  type InboxMessageRow,
  type InboxSettingsRow,
} from "@/lib/inbox/table-mapping";
import { DEFAULT_INBOX_SETTINGS, type Conversation, type InboxMessage, type InboxSettings } from "@/lib/inbox/types";
import type { Counts } from "./campaigns-plan";

export type InboxSource = { settings: unknown; conversations: unknown; messages: unknown; aiUsage: unknown };

export type InboxExisting = {
  clientIds: Set<string>;
  settingsClientIds: Set<string>;
  /** "cliente|lead" */
  conversationKeys: Set<string>;
  messageIds: Set<string>;
  /** "cliente|dia" */
  usageKeys: Set<string>;
};

export type InboxPlan = {
  settings: InboxSettingsRow[];
  conversations: ConversationRow[];
  messages: InboxMessageRow[];
  usage: AiUsageRow[];
  counts: { settings: Counts; conversations: Counts; messages: Counts; usage: Counts };
};

const isText = (value: unknown): value is string => typeof value === "string" && value.length > 0;
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const empty = (source: number): Counts => ({ source, alreadyCopied: 0, toCopy: 0, blocked: 0, invalid: 0 });
const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);

/**
 * Decide o que falta copiar da caixa de entrada antiga (coleção "inbox" do app_data) para as tabelas novas.
 * Não grava nada. O cliente dono precisa já existir na tabela "clients".
 */
export function planInboxMigration(source: InboxSource, existing: InboxExisting): InboxPlan {
  const settingsMap = isObject(source.settings) ? (source.settings as Record<string, Partial<InboxSettings>>) : {};
  const usageMap = isObject(source.aiUsage) ? (source.aiUsage as Record<string, unknown>) : {};
  const conversationsIn = list(source.conversations);
  const messagesIn = list(source.messages);
  const counts = {
    settings: empty(Object.keys(settingsMap).length),
    conversations: empty(conversationsIn.length),
    messages: empty(messagesIn.length),
    usage: empty(Object.keys(usageMap).length),
  };

  const settings: InboxSettingsRow[] = [];
  for (const [clientId, value] of Object.entries(settingsMap)) {
    if (!isObject(value)) counts.settings.invalid++;
    else if (existing.settingsClientIds.has(clientId)) counts.settings.alreadyCopied++;
    else if (!existing.clientIds.has(clientId)) counts.settings.blocked++;
    else settings.push(settingsToRow(clientId, { ...DEFAULT_INBOX_SETTINGS, ...value }));
  }

  const conversations: ConversationRow[] = [];
  const seenConvos = new Set<string>();
  for (const raw of conversationsIn) {
    const c = raw as Partial<Conversation> | null;
    const ok = c && isText(c.userId) && isText(c.leadId) && isText(c.mode) && isText(c.createdAt) && isText(c.lastMessageAt);
    const key = ok ? `${c.userId}|${c.leadId}` : "";
    if (!ok || seenConvos.has(key)) {
      counts.conversations.invalid++;
      continue;
    }
    seenConvos.add(key);
    if (existing.conversationKeys.has(key)) counts.conversations.alreadyCopied++;
    else if (!existing.clientIds.has(c.userId as string)) counts.conversations.blocked++;
    else conversations.push(conversationToRow({ ...(c as Conversation), handoffReason: c.handoffReason ?? null, lastInboundAt: c.lastInboundAt ?? null, aiRepliesInRow: c.aiRepliesInRow ?? 0, needsHuman: !!c.needsHuman, lastPreview: c.lastPreview ?? "" }));
  }

  const messages: InboxMessageRow[] = [];
  const seenIds = new Set<string>();
  const seenExternal = new Set<string>();
  for (const raw of messagesIn) {
    const m = raw as Partial<InboxMessage> | null;
    const ok = m && isText(m.id) && isText(m.userId) && isText(m.leadId) && isText(m.direction) && isText(m.author) && isText(m.at) && typeof m.text === "string";
    if (!ok || seenIds.has(m.id as string)) {
      counts.messages.invalid++;
      continue;
    }
    // O banco não aceita o mesmo externalId duas vezes no mesmo cliente: a repetida é pulada (já era ignorada pela caixa de entrada).
    const externalKey = m.externalId ? `${m.userId}|${m.externalId}` : "";
    if (externalKey && seenExternal.has(externalKey)) {
      counts.messages.invalid++;
      continue;
    }
    seenIds.add(m.id as string);
    if (externalKey) seenExternal.add(externalKey);
    if (existing.messageIds.has(m.id as string)) counts.messages.alreadyCopied++;
    else if (!existing.clientIds.has(m.userId as string)) counts.messages.blocked++;
    else messages.push(messageToRow(m as InboxMessage));
  }

  const usage: AiUsageRow[] = [];
  for (const [key, count] of Object.entries(usageMap)) {
    const at = key.lastIndexOf("|");
    if (at <= 0 || typeof count !== "number" || !Number.isFinite(count)) {
      counts.usage.invalid++;
      continue;
    }
    const clientId = key.slice(0, at);
    if (existing.usageKeys.has(key)) counts.usage.alreadyCopied++;
    else if (!existing.clientIds.has(clientId)) counts.usage.blocked++;
    else usage.push({ client_id: clientId, day: key.slice(at + 1), count });
  }

  counts.settings.toCopy = settings.length;
  counts.conversations.toCopy = conversations.length;
  counts.messages.toCopy = messages.length;
  counts.usage.toCopy = usage.length;
  return { settings, conversations, messages, usage, counts };
}
