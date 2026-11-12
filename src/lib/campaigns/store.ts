import { readJson, writeJson } from "@/lib/storage";
import { createRest, type RestOptions } from "@/lib/storage/rest-table";
import {
  campaignToRow,
  messageToRow,
  rowToCampaign,
  rowToMessage,
  rowToSettings,
  rowToTemplate,
  settingsToRow,
  templateToRow,
  type CampaignRow,
  type MessageRow,
  type SettingsRow,
  type TemplateRow,
} from "./table-mapping";
import { DEFAULT_SETTINGS, type Campaign, type CampaignMessage, type Settings, type Slice, type Template } from "./types";

/**
 * Onde as campanhas ficam guardadas. O repositório só conhece esta interface:
 * a mesma regra de negócio roda sobre o arquivo/coleção (padrão) ou sobre as tabelas próprias do Supabase.
 * Toda leitura e gravação é de UM cliente por vez.
 */
export interface CampaignsStore {
  /** Executa uma tarefa de cada vez (evita duas gravações misturadas no mesmo servidor). */
  withLock<T>(task: () => Promise<T>): Promise<T>;
  load(clientId: string): Promise<Slice>;
  /** Grava só o que mudou entre "antes" e "depois". */
  save(clientId: string, before: Slice, after: Slice): Promise<void>;
  saveSettings(clientId: string, settings: Settings): Promise<void>;
  /** Clientes que têm alguma campanha em andamento (usado pelo agendador). */
  listActiveClientIds(): Promise<string[]>;
}

// ---------- Arquivo local / coleção app_data (como sempre foi) ----------

type FileData = {
  settings: Record<string, Settings>;
  templates: Template[];
  campaigns: Campaign[];
  messages: CampaignMessage[];
};

async function readAll(): Promise<FileData> {
  const data = (await readJson<Partial<FileData> | null>("campaigns", null)) ?? {};
  return {
    settings: data.settings ?? {},
    templates: data.templates ?? [],
    campaigns: data.campaigns ?? [],
    messages: data.messages ?? [],
  };
}

const globalWithLock = globalThis as typeof globalThis & { __campaignsLock?: Promise<unknown> };

function withLock<T>(task: () => Promise<T>): Promise<T> {
  const previous = globalWithLock.__campaignsLock ?? Promise.resolve();
  const run = previous.then(task, task);
  globalWithLock.__campaignsLock = run.catch(() => undefined);
  return run;
}

export function createCollectionStore(): CampaignsStore {
  return {
    withLock,

    async load(clientId) {
      const data = await readAll();
      return {
        settings: { ...DEFAULT_SETTINGS, ...(data.settings[clientId] ?? {}) },
        templates: data.templates.filter((item) => item.userId === clientId),
        campaigns: data.campaigns.filter((item) => item.userId === clientId),
        messages: data.messages.filter((item) => item.userId === clientId),
      };
    },

    async save(clientId, _before, after) {
      const data = await readAll();
      await writeJson("campaigns", {
        settings: { ...data.settings, [clientId]: after.settings },
        templates: [...data.templates.filter((item) => item.userId !== clientId), ...after.templates],
        campaigns: [...data.campaigns.filter((item) => item.userId !== clientId), ...after.campaigns],
        messages: [...data.messages.filter((item) => item.userId !== clientId), ...after.messages],
      });
    },

    async saveSettings(clientId, settings) {
      const data = await readAll();
      await writeJson("campaigns", { ...data, settings: { ...data.settings, [clientId]: settings } });
    },

    async listActiveClientIds() {
      const data = await readAll();
      return [...new Set(data.campaigns.filter((campaign) => campaign.status === "em_andamento").map((campaign) => campaign.userId))];
    },
  };
}

// ---------- Tabelas próprias do Supabase (supabase/03-campanhas.sql) ----------

export function createTableStore(options: RestOptions): CampaignsStore {
  const rest = createRest(options);
  const of = (clientId: string) => `client_id=eq.${encodeURIComponent(clientId)}`;

  async function loadSettings(clientId: string): Promise<Settings> {
    const rows = await rest.fetchAll<SettingsRow>("campaign_settings", of(clientId), "client_id");
    return rows[0] ? { ...DEFAULT_SETTINGS, ...rowToSettings(rows[0]) } : { ...DEFAULT_SETTINGS };
  }

  async function upsertSettings(clientId: string, settings: Settings): Promise<void> {
    const response = await rest.call(
      "campaign_settings",
      "POST",
      "?on_conflict=client_id",
      settingsToRow(clientId, settings),
      "resolution=merge-duplicates,return=minimal",
    );
    if (!response.ok) rest.fail(response.status, "gravar", "campaign_settings");
  }

  return {
    withLock,

    async load(clientId) {
      const [settings, templates, campaigns, messages] = await Promise.all([
        loadSettings(clientId),
        rest.fetchAll<TemplateRow>("message_templates", of(clientId)),
        rest.fetchAll<CampaignRow>("campaigns", of(clientId)),
        rest.fetchAll<MessageRow>("campaign_messages", of(clientId)),
      ]);
      return {
        settings,
        templates: templates.map(rowToTemplate),
        campaigns: campaigns.map(rowToCampaign),
        messages: messages.map(rowToMessage),
      };
    },

    async save(clientId, before, after) {
      if (JSON.stringify(before.settings) !== JSON.stringify(after.settings)) await upsertSettings(clientId, after.settings);
      await rest.syncRows("message_templates", clientId, before.templates, after.templates, templateToRow);
      // Campanhas antes das mensagens (a mensagem aponta para a campanha); apagar campanha leva as mensagens junto.
      await rest.syncRows("campaigns", clientId, before.campaigns, after.campaigns, campaignToRow);
      await rest.syncRows("campaign_messages", clientId, before.messages, after.messages, messageToRow);
    },

    saveSettings: upsertSettings,

    async listActiveClientIds() {
      const rows = await rest.fetchAll<CampaignRow>("campaigns", "status=eq.em_andamento", "id");
      return [...new Set(rows.map((row) => row.client_id))];
    },
  };
}
