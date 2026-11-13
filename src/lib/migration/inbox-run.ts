import { config } from "@/lib/config";
import { readJson } from "@/lib/storage";
import { createRest, type RestOptions } from "@/lib/storage/rest-table";
import { planInboxMigration, type InboxPlan, type InboxSource } from "./inbox-plan";

export type InboxReport = { plan: InboxPlan };
export type InboxRunResult = {
  copied: { settings: number; conversations: number; messages: number; usage: number };
  missing: number;
  plan: InboxPlan;
};

export function createInboxMigration(options: RestOptions) {
  const rest = createRest(options);

  async function rows<T>(table: string, order: string): Promise<T[]> {
    return rest.fetchAll<T>(table, "", order);
  }

  async function readExisting() {
    const [clients, settings, conversations, messages, usage] = await Promise.all([
      rows<{ id: string }>("clients", "id"),
      rows<{ client_id: string }>("inbox_settings", "client_id"),
      rows<{ client_id: string; lead_id: string }>("conversations", "lead_id"),
      rows<{ id: string }>("inbox_messages", "id"),
      rows<{ client_id: string; day: string }>("ai_usage", "day"),
    ]);
    return {
      clientIds: new Set(clients.map((r) => r.id)),
      settingsClientIds: new Set(settings.map((r) => r.client_id)),
      conversationKeys: new Set(conversations.map((r) => `${r.client_id}|${r.lead_id}`)),
      messageIds: new Set(messages.map((r) => r.id)),
      usageKeys: new Set(usage.map((r) => `${r.client_id}|${r.day}`)),
    };
  }

  async function readSource(): Promise<InboxSource> {
    const data = await readJson<Partial<Record<keyof InboxSource, unknown>> | null>("inbox", null);
    return { settings: data?.settings ?? {}, conversations: data?.conversations ?? [], messages: data?.messages ?? [], aiUsage: data?.aiUsage ?? {} };
  }

  async function insert(table: string, list: unknown[]): Promise<void> {
    for (let i = 0; i < list.length; i += 500) {
      // ignore-duplicates: linha que já existe é pulada. Nunca sobrescreve nada.
      const response = await rest.call(table, "POST", "", list.slice(i, i + 500), "resolution=ignore-duplicates,return=minimal");
      if (!response.ok) rest.fail(response.status, "copiar", table);
    }
  }

  /** Só olha: mostra o que seria copiado. Não grava nada. */
  async function preview(): Promise<InboxReport> {
    const [source, existing] = await Promise.all([readSource(), readExisting()]);
    return { plan: planInboxMigration(source, existing) };
  }

  /** Copia o que falta e confere o resultado. Não altera nem apaga o lugar antigo. */
  async function run(): Promise<InboxRunResult> {
    const source = await readSource();
    const plan = planInboxMigration(source, await readExisting());

    await insert("inbox_settings", plan.settings);
    await insert("conversations", plan.conversations);
    await insert("inbox_messages", plan.messages);
    await insert("ai_usage", plan.usage);

    const after = await readExisting();
    const missing =
      plan.settings.filter((r) => !after.settingsClientIds.has(r.client_id)).length +
      plan.conversations.filter((r) => !after.conversationKeys.has(`${r.client_id}|${r.lead_id}`)).length +
      plan.messages.filter((r) => !after.messageIds.has(r.id)).length +
      plan.usage.filter((r) => !after.usageKeys.has(`${r.client_id}|${r.day}`)).length;
    return {
      copied: { settings: plan.settings.length, conversations: plan.conversations.length, messages: plan.messages.length, usage: plan.usage.length },
      missing,
      plan,
    };
  }

  return { preview, run };
}

export function getInboxMigration() {
  return createInboxMigration({ url: config.supabaseUrl, secretKey: config.supabaseSecretKey });
}
