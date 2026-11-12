import type { StageId } from "@/lib/leads/types";
import type { Campaign, CampaignMessage, Settings, Template } from "./types";

/** Linhas das tabelas de campanhas (colunas em snake_case). No sistema, userId guarda o id do CLIENTE. */

const iso = (value: string): string => new Date(value).toISOString();
const isoOrNull = (value: string | null): string | null => (value ? iso(value) : null);

export type SettingsRow = {
  client_id: string;
  daily_limit: number;
  window_start: number;
  window_end: number;
  weekdays_only: boolean;
  opt_out_footer: string;
};

export function settingsToRow(clientId: string, s: Settings): SettingsRow {
  return {
    client_id: clientId,
    daily_limit: s.dailyLimit,
    window_start: s.windowStart,
    window_end: s.windowEnd,
    weekdays_only: s.weekdaysOnly,
    opt_out_footer: s.optOutFooter,
  };
}

export function rowToSettings(row: SettingsRow): Settings {
  return {
    dailyLimit: row.daily_limit,
    windowStart: row.window_start,
    windowEnd: row.window_end,
    weekdaysOnly: row.weekdays_only,
    optOutFooter: row.opt_out_footer,
  };
}

export type TemplateRow = {
  id: string;
  client_id: string;
  name: string;
  body: string;
  meta_name: string | null;
  status: string;
  created_at: string;
};

export function templateToRow(t: Template): TemplateRow {
  return { id: t.id, client_id: t.userId, name: t.name, body: t.body, meta_name: t.metaName ?? null, status: t.status, created_at: t.createdAt };
}

export function rowToTemplate(row: TemplateRow): Template {
  return {
    id: row.id,
    userId: row.client_id,
    name: row.name,
    body: row.body,
    ...(row.meta_name ? { metaName: row.meta_name } : {}),
    status: row.status as Template["status"],
    createdAt: iso(row.created_at),
  };
}

export type CampaignRow = {
  id: string;
  client_id: string;
  name: string;
  template_id: string;
  template_name: string;
  body: string;
  stages: string[];
  tag: string;
  status: string;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
};

export function campaignToRow(c: Campaign): CampaignRow {
  return {
    id: c.id,
    client_id: c.userId,
    name: c.name,
    template_id: c.templateId,
    template_name: c.templateName,
    body: c.body,
    stages: c.stages,
    tag: c.tag,
    status: c.status,
    created_at: c.createdAt,
    started_at: c.startedAt,
    finished_at: c.finishedAt,
  };
}

export function rowToCampaign(row: CampaignRow): Campaign {
  return {
    id: row.id,
    userId: row.client_id,
    name: row.name,
    templateId: row.template_id,
    templateName: row.template_name,
    body: row.body,
    stages: (row.stages ?? []) as StageId[],
    tag: row.tag,
    status: row.status as Campaign["status"],
    createdAt: iso(row.created_at),
    startedAt: isoOrNull(row.started_at),
    finishedAt: isoOrNull(row.finished_at),
  };
}

export type MessageRow = {
  id: string;
  client_id: string;
  campaign_id: string;
  lead_id: string;
  lead_name: string;
  phone: string;
  text: string;
  status: string;
  reason: string;
  provider_id: string | null;
  queued_at: string;
  sent_at: string | null;
};

export function messageToRow(m: CampaignMessage): MessageRow {
  return {
    id: m.id,
    client_id: m.userId,
    campaign_id: m.campaignId,
    lead_id: m.leadId,
    lead_name: m.leadName,
    phone: m.phone,
    text: m.text,
    status: m.status,
    reason: m.reason,
    provider_id: m.providerId,
    queued_at: m.queuedAt,
    sent_at: m.sentAt,
  };
}

export function rowToMessage(row: MessageRow): CampaignMessage {
  return {
    id: row.id,
    userId: row.client_id,
    campaignId: row.campaign_id,
    leadId: row.lead_id,
    leadName: row.lead_name,
    phone: row.phone,
    text: row.text,
    status: row.status as CampaignMessage["status"],
    reason: row.reason,
    providerId: row.provider_id,
    queuedAt: iso(row.queued_at),
    sentAt: isoOrNull(row.sent_at),
  };
}
