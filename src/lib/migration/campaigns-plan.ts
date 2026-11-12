import {
  campaignToRow,
  messageToRow,
  settingsToRow,
  templateToRow,
  type CampaignRow,
  type MessageRow,
  type SettingsRow,
  type TemplateRow,
} from "@/lib/campaigns/table-mapping";
import { DEFAULT_SETTINGS, type Campaign, type CampaignMessage, type Settings, type Template } from "@/lib/campaigns/types";

export type CampaignsSource = { settings: unknown; templates: unknown; campaigns: unknown; messages: unknown };

export type CampaignsExisting = {
  clientIds: Set<string>;
  settingsClientIds: Set<string>;
  templateIds: Set<string>;
  campaignIds: Set<string>;
  messageIds: Set<string>;
};

export type Counts = { source: number; alreadyCopied: number; toCopy: number; blocked: number; invalid: number };

export type CampaignsPlan = {
  settings: SettingsRow[];
  templates: TemplateRow[];
  campaigns: CampaignRow[];
  messages: MessageRow[];
  counts: { settings: Counts; templates: Counts; campaigns: Counts; messages: Counts };
};

const isText = (value: unknown): value is string => typeof value === "string" && value.length > 0;
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

function emptyCounts(source: number): Counts {
  return { source, alreadyCopied: 0, toCopy: 0, blocked: 0, invalid: 0 };
}

/**
 * Decide o que falta copiar das campanhas antigas (coleção "campaigns" do app_data) para as tabelas novas.
 * Não grava nada. O cliente dono precisa já existir na tabela "clients" (copie os leads antes).
 */
export function planCampaignsMigration(source: CampaignsSource, existing: CampaignsExisting): CampaignsPlan {
  const settingsMap = source.settings && typeof source.settings === "object" && !Array.isArray(source.settings) ? (source.settings as Record<string, Partial<Settings>>) : {};
  const settingsIds = Object.keys(settingsMap);
  const templatesIn = list(source.templates);
  const campaignsIn = list(source.campaigns);
  const messagesIn = list(source.messages);
  const counts = {
    settings: emptyCounts(settingsIds.length),
    templates: emptyCounts(templatesIn.length),
    campaigns: emptyCounts(campaignsIn.length),
    messages: emptyCounts(messagesIn.length),
  };

  const settings: SettingsRow[] = [];
  for (const clientId of settingsIds) {
    const value = settingsMap[clientId];
    if (!value || typeof value !== "object") counts.settings.invalid++;
    else if (existing.settingsClientIds.has(clientId)) counts.settings.alreadyCopied++;
    else if (!existing.clientIds.has(clientId)) counts.settings.blocked++;
    else settings.push(settingsToRow(clientId, { ...DEFAULT_SETTINGS, ...value }));
  }

  function pick<T extends { id: string; userId: string }, R>(
    items: unknown[],
    c: Counts,
    already: Set<string>,
    required: (keyof T)[],
    toRow: (item: T) => R,
    canonical: Set<string>,
    extraOk: (item: T) => boolean = () => true,
  ): R[] {
    const rows: R[] = [];
    for (const raw of items) {
      const item = raw as Partial<T> | null;
      if (!item || !isText(item.id) || !isText(item.userId) || required.some((key) => item[key] === undefined || item[key] === null) || canonical.has(item.id)) {
        c.invalid++;
        continue;
      }
      canonical.add(item.id);
      if (already.has(item.id)) c.alreadyCopied++;
      else if (!existing.clientIds.has(item.userId) || !extraOk(item as T)) c.blocked++;
      else rows.push(toRow(item as T));
    }
    c.toCopy = rows.length;
    return rows;
  }

  const templates = pick<Template, TemplateRow>(templatesIn, counts.templates, existing.templateIds, ["name", "body", "status", "createdAt"], templateToRow, new Set());
  const campaigns = pick<Campaign, CampaignRow>(
    campaignsIn,
    counts.campaigns,
    existing.campaignIds,
    ["name", "status", "createdAt", "stages"],
    campaignToRow,
    new Set(),
  );
  // Mensagem só entra se a campanha dela já está (ou vai estar) na tabela nova.
  const campaignOk = new Set([...existing.campaignIds, ...campaigns.map((row) => row.id)]);
  const messages = pick<CampaignMessage, MessageRow>(
    messagesIn,
    counts.messages,
    existing.messageIds,
    ["campaignId", "status", "queuedAt", "text"],
    messageToRow,
    new Set(),
    (message) => campaignOk.has(message.campaignId),
  );
  counts.settings.toCopy = settings.length;

  return { settings, templates, campaigns, messages, counts };
}
