import type { Ctx } from "@/lib/leads/logic";
import { isStageId, type Lead, type StageId } from "@/lib/leads/types";
import { CAMPAIGN_STAGES, selectAudience } from "./audience";
import { renderTemplate, validateFooter, validateTemplate, withFooter } from "./templates";
import { checkWindow, localTime } from "./time";
import {
  BATCH_SIZE,
  MAX_AUDIENCE,
  MAX_DAILY_LIMIT,
  MAX_NAME,
  type Campaign,
  type CampaignMessage,
  type MessageCounts,
  type Settings,
  type Slice,
  type Template,
} from "./types";

/**
 * Regras das campanhas, como funções "puras": recebem os dados de UMA pessoa e devolvem os dados novos.
 * Nada aqui grava arquivo nem envia mensagem.
 */

export type Res<T extends object = object> = ({ ok: true; slice: Slice } & T) | { ok: false; error: string };

// ---------- Configurações ----------

export type SettingsInput = {
  dailyLimit: unknown;
  windowStart: unknown;
  windowEnd: unknown;
  weekdaysOnly: unknown;
  optOutFooter: unknown;
};

export function validateSettings(input: SettingsInput): { ok: true; value: Settings } | { ok: false; error: string } {
  const dailyLimit = Number(input.dailyLimit);
  if (!Number.isInteger(dailyLimit) || dailyLimit < 1 || dailyLimit > MAX_DAILY_LIMIT) {
    return { ok: false, error: `O limite diário deve ser um número inteiro de 1 a ${MAX_DAILY_LIMIT}.` };
  }
  const windowStart = Number(input.windowStart);
  const windowEnd = Number(input.windowEnd);
  if (!Number.isInteger(windowStart) || windowStart < 0 || windowStart > 23) {
    return { ok: false, error: "A hora inicial deve estar entre 0 e 23." };
  }
  if (!Number.isInteger(windowEnd) || windowEnd < 1 || windowEnd > 24) {
    return { ok: false, error: "A hora final deve estar entre 1 e 24." };
  }
  if (windowEnd <= windowStart) return { ok: false, error: "A hora final precisa ser depois da hora inicial." };

  const footer = typeof input.optOutFooter === "string" ? input.optOutFooter.trim() : "";
  const footerError = validateFooter(footer);
  if (footerError) return { ok: false, error: footerError };

  return {
    ok: true,
    value: { dailyLimit, windowStart, windowEnd, weekdaysOnly: Boolean(input.weekdaysOnly), optOutFooter: footer },
  };
}

// ---------- Modelos ----------

export function addTemplate(slice: Slice, userId: string, input: { name: string; body: string }, ctx: Ctx): Res<{ template: Template }> {
  const error = validateTemplate(input.name, input.body);
  if (error) return { ok: false, error };

  const name = input.name.trim();
  if (slice.templates.some((item) => item.name.toLowerCase() === name.toLowerCase())) {
    return { ok: false, error: "Já existe um modelo com este nome. Escolha outro." };
  }

  const template: Template = {
    id: ctx.newId(),
    userId,
    name,
    body: input.body.trim(),
    status: "pendente",
    createdAt: ctx.now,
  };
  return { ok: true, slice: { ...slice, templates: [...slice.templates, template] }, template };
}

/** SIMULAÇÃO: marca como aprovado. Na fase do WhatsApp real, quem aprova é a Meta. */
export function approveTemplate(slice: Slice, id: string): Res {
  const current = slice.templates.find((item) => item.id === id);
  if (!current) return { ok: false, error: "Modelo não encontrado." };
  const templates = slice.templates.map((item) => (item.id === id ? { ...item, status: "aprovado" as const } : item));
  return { ok: true, slice: { ...slice, templates } };
}

export function removeTemplate(slice: Slice, id: string): Res {
  if (!slice.templates.some((item) => item.id === id)) return { ok: false, error: "Modelo não encontrado." };
  return { ok: true, slice: { ...slice, templates: slice.templates.filter((item) => item.id !== id) } };
}

// ---------- Criar campanha ----------

export type CampaignInput = { name: string; templateId: string; stages: unknown; tag: string };

export function createCampaign(
  slice: Slice,
  leads: Lead[],
  userId: string,
  input: CampaignInput,
  ctx: Ctx,
): Res<{ campaign: Campaign }> {
  const name = input.name.trim();
  if (!name) return { ok: false, error: "Dê um nome à campanha, por exemplo: Oferta de outubro." };
  if (name.length > MAX_NAME) return { ok: false, error: `O nome pode ter no máximo ${MAX_NAME} caracteres.` };

  const template = slice.templates.find((item) => item.id === input.templateId);
  if (!template) return { ok: false, error: "Escolha um modelo de mensagem." };
  if (template.status !== "aprovado") {
    return { ok: false, error: "Este modelo ainda não foi aprovado. Só modelos aprovados podem ser enviados." };
  }

  const stages = Array.isArray(input.stages)
    ? (input.stages.filter((stage): stage is StageId => isStageId(stage) && CAMPAIGN_STAGES.includes(stage)))
    : [];
  const uniqueStages = [...new Set(stages)];
  if (uniqueStages.length === 0) {
    return { ok: false, error: "Escolha pelo menos uma etapa do Kanban para receber a campanha." };
  }

  const tag = input.tag.trim().slice(0, 30);
  const audience = selectAudience(leads, uniqueStages, tag);
  if (audience.eligible.length === 0) {
    return {
      ok: false,
      error:
        "Nenhum contato pode receber esta campanha. Só recebem quem está nas etapas escolhidas, " +
        "tem telefone e tem autorização (opt-in) registrada.",
    };
  }
  if (audience.eligible.length > MAX_AUDIENCE) {
    return {
      ok: false,
      error: `Este público tem ${audience.eligible.length} contatos e o limite é ${MAX_AUDIENCE} por campanha. Use uma tag para dividir em partes.`,
    };
  }

  const campaign: Campaign = {
    id: ctx.newId(),
    userId,
    name,
    templateId: template.id,
    templateName: template.name,
    body: template.body,
    stages: uniqueStages,
    tag,
    status: "rascunho",
    createdAt: ctx.now,
    startedAt: null,
    finishedAt: null,
  };

  const messages: CampaignMessage[] = audience.eligible.map((lead) => ({
    id: ctx.newId(),
    userId,
    campaignId: campaign.id,
    leadId: lead.id,
    leadName: lead.name,
    phone: lead.phone as string,
    text: withFooter(renderTemplate(template.body, lead), slice.settings.optOutFooter),
    status: "na_fila" as const,
    reason: "",
    providerId: null,
    queuedAt: ctx.now,
    sentAt: null,
  }));

  return {
    ok: true,
    slice: { ...slice, campaigns: [...slice.campaigns, campaign], messages: [...slice.messages, ...messages] },
    campaign,
  };
}

// ---------- Estados da campanha ----------

function setCampaign(slice: Slice, id: string, change: (campaign: Campaign) => Campaign): Slice {
  return { ...slice, campaigns: slice.campaigns.map((item) => (item.id === id ? change(item) : item)) };
}

export type CampaignAction = "start" | "pause" | "cancel";

export function changeCampaign(slice: Slice, id: string, action: CampaignAction, ctx: Ctx): Res {
  const campaign = slice.campaigns.find((item) => item.id === id);
  if (!campaign) return { ok: false, error: "Campanha não encontrada." };

  if (action === "start") {
    if (campaign.status !== "rascunho" && campaign.status !== "pausada") {
      return { ok: false, error: "Só dá para iniciar uma campanha em rascunho ou pausada." };
    }
    return {
      ok: true,
      slice: setCampaign(slice, id, (item) => ({ ...item, status: "em_andamento", startedAt: item.startedAt ?? ctx.now })),
    };
  }

  if (action === "pause") {
    if (campaign.status !== "em_andamento") return { ok: false, error: "Só dá para pausar uma campanha em andamento." };
    return { ok: true, slice: setCampaign(slice, id, (item) => ({ ...item, status: "pausada" })) };
  }

  if (campaign.status === "concluida" || campaign.status === "cancelada") {
    return { ok: false, error: "Esta campanha já terminou." };
  }
  const messages = slice.messages.map((message) =>
    message.campaignId === id && message.status === "na_fila"
      ? { ...message, status: "pulada" as const, reason: "Campanha cancelada." }
      : message,
  );
  return {
    ok: true,
    slice: setCampaign({ ...slice, messages }, id, (item) => ({ ...item, status: "cancelada", finishedAt: ctx.now })),
  };
}

/** Só rascunhos podem ser excluídos: o que já foi enviado fica guardado como registro. */
export function removeCampaign(slice: Slice, id: string): Res {
  const campaign = slice.campaigns.find((item) => item.id === id);
  if (!campaign) return { ok: false, error: "Campanha não encontrada." };
  if (campaign.status !== "rascunho") {
    return { ok: false, error: "Só campanhas em rascunho podem ser excluídas. As outras ficam como registro." };
  }
  return {
    ok: true,
    slice: {
      ...slice,
      campaigns: slice.campaigns.filter((item) => item.id !== id),
      messages: slice.messages.filter((message) => message.campaignId !== id),
    },
  };
}

// ---------- Números ----------

export function countMessages(messages: CampaignMessage[]): MessageCounts {
  const counts: MessageCounts = { total: 0, naFila: 0, enviadas: 0, falhas: 0, puladas: 0 };
  for (const message of messages) {
    counts.total += 1;
    if (message.status === "na_fila") counts.naFila += 1;
    else if (message.status === "enviada") counts.enviadas += 1;
    else if (message.status === "falhou") counts.falhas += 1;
    else counts.puladas += 1;
  }
  return counts;
}

/** Quantas mensagens já foram enviadas hoje (dia de São Paulo), somando todas as campanhas. */
export function sentToday(messages: CampaignMessage[], now: Date): number {
  const today = localTime(now).day;
  return messages.filter(
    (message) => message.status === "enviada" && message.sentAt && localTime(new Date(message.sentAt)).day === today,
  ).length;
}

// ---------- Rodada de envio (lote) ----------

export type PlannedSend = { messageId: string; campaignId: string; leadId: string; to: string; text: string; templateName: string };
export type PlannedSkip = { messageId: string; reason: string };

export type BatchPlan =
  | { ok: false; error: string }
  | { ok: true; sends: PlannedSend[]; skips: PlannedSkip[]; remainingToday: number };

/** Motivo para NÃO enviar a este contato agora, ou null se pode. Roda no momento do envio, não só na criação. */
export function blockReason(lead: Lead | undefined, message: CampaignMessage): string | null {
  if (!lead) return "O lead foi excluído.";
  if (lead.optOut) return "O contato pediu para sair (opt-out).";
  if (!lead.optIn) return "O contato não tem autorização (opt-in).";
  if (lead.stage === "prospeccao") return "O lead está na etapa Prospecção, que não recebe campanhas.";
  if (!lead.phone || lead.phone !== message.phone) return "O telefone do lead mudou depois que a mensagem entrou na fila.";
  return null;
}

/**
 * Decide o que enviar agora: respeita o horário, o limite diário e o tamanho do lote,
 * e reconfere a autorização de cada contato. Quem não puder receber é pulado.
 */
export function planBatch(slice: Slice, leads: Lead[], now: Date): BatchPlan {
  const active = slice.campaigns
    .filter((campaign) => campaign.status === "em_andamento")
    .sort((a, b) => (a.startedAt ?? "").localeCompare(b.startedAt ?? ""));
  if (active.length === 0) return { ok: false, error: "Nenhuma campanha em andamento. Inicie uma campanha primeiro." };

  const window = checkWindow(slice.settings, now);
  if (!window.open) return { ok: false, error: window.reason };

  const remainingToday = slice.settings.dailyLimit - sentToday(slice.messages, now);
  if (remainingToday <= 0) {
    return { ok: false, error: `O limite de ${slice.settings.dailyLimit} envios de hoje foi atingido. Volta amanhã.` };
  }

  const byId = new Map(leads.map((lead) => [lead.id, lead]));
  const limit = Math.min(BATCH_SIZE, remainingToday);
  const sends: PlannedSend[] = [];
  const skips: PlannedSkip[] = [];

  for (const campaign of active) {
    const queue = slice.messages.filter((message) => message.campaignId === campaign.id && message.status === "na_fila");
    for (const message of queue) {
      if (sends.length >= limit) break;
      const reason = blockReason(byId.get(message.leadId), message);
      if (reason) {
        skips.push({ messageId: message.id, reason });
        continue;
      }
      sends.push({
        messageId: message.id,
        campaignId: campaign.id,
        leadId: message.leadId,
        to: message.phone,
        text: message.text,
        templateName: campaign.templateName,
      });
    }
    if (sends.length >= limit) break;
  }

  return { ok: true, sends, skips, remainingToday };
}

export type SendOutcome = { ok: true; providerId: string } | { ok: false; error: string };

/** Grava o resultado do lote e encerra as campanhas que não têm mais ninguém na fila. */
export function applyBatch(slice: Slice, plan: Extract<BatchPlan, { ok: true }>, outcomes: Map<string, SendOutcome>, ctx: Ctx): Slice {
  const skipReason = new Map(plan.skips.map((skip) => [skip.messageId, skip.reason]));

  const messages = slice.messages.map((message): CampaignMessage => {
    const skip = skipReason.get(message.id);
    if (skip) return { ...message, status: "pulada", reason: skip };

    const outcome = outcomes.get(message.id);
    if (!outcome) return message;
    if (outcome.ok) return { ...message, status: "enviada", reason: "", providerId: outcome.providerId, sentAt: ctx.now };
    return { ...message, status: "falhou", reason: outcome.error };
  });

  const campaigns = slice.campaigns.map((campaign) => {
    if (campaign.status !== "em_andamento") return campaign;
    const stillQueued = messages.some((message) => message.campaignId === campaign.id && message.status === "na_fila");
    return stillQueued ? campaign : { ...campaign, status: "concluida" as const, finishedAt: ctx.now };
  });

  return { ...slice, messages, campaigns };
}
