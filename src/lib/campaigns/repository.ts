import { randomUUID } from "node:crypto";
import { readJson, writeJson } from "@/lib/storage";
import type { LeadsRepository } from "@/lib/leads";
import type { Ctx } from "@/lib/leads/logic";
import { selectAudience, type AudienceReport } from "./audience";
import * as logic from "./logic";
import type { WhatsAppSender } from "./sender";
import { checkWindow } from "./time";
import {
  DEFAULT_SETTINGS,
  type Campaign,
  type CampaignMessage,
  type MessageCounts,
  type Settings,
  type Slice,
  type Template,
} from "./types";
import type { StageId } from "@/lib/leads/types";

/**
 * Repositório de SIMULAÇÃO das campanhas: tudo em um arquivo local (.data/campaigns.json).
 * Na fase de contas reais, um repositório do Supabase com a mesma forma entra no lugar.
 */

type Simple = { ok: true } | { ok: false; error: string };

export type CampaignSummary = { campaign: Campaign; counts: MessageCounts };
export type CampaignDetail = CampaignSummary & { messages: CampaignMessage[] };

export type BatchResult =
  | { ok: false; error: string }
  | { ok: true; sent: number; failed: number; skipped: number; remainingToday: number; queuedLeft: number; simulated: boolean };

export type Usage = { sent: number; limit: number; window: { open: true } | { open: false; reason: string } };

export interface CampaignsRepository {
  getSettings(userId: string): Promise<Settings>;
  saveSettings(userId: string, settings: Settings): Promise<void>;
  listTemplates(userId: string): Promise<Template[]>;
  addTemplate(userId: string, input: { name: string; body: string }): Promise<{ ok: true; template: Template } | { ok: false; error: string }>;
  approveTemplate(userId: string, id: string): Promise<Simple>;
  removeTemplate(userId: string, id: string): Promise<Simple>;
  previewAudience(userId: string, stages: StageId[], tag: string): Promise<AudienceReport>;
  listCampaigns(userId: string): Promise<CampaignSummary[]>;
  getCampaign(userId: string, id: string): Promise<CampaignDetail | null>;
  createCampaign(userId: string, input: logic.CampaignInput): Promise<{ ok: true; campaign: Campaign } | { ok: false; error: string }>;
  changeCampaign(userId: string, id: string, action: logic.CampaignAction): Promise<Simple>;
  removeCampaign(userId: string, id: string): Promise<Simple>;
  usage(userId: string): Promise<Usage>;
  runBatch(userId: string, sender: WhatsAppSender): Promise<BatchResult>;
}

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

async function writeAll(data: FileData): Promise<void> {
  await writeJson("campaigns", data);
}

const globalWithLock = globalThis as typeof globalThis & { __campaignsLock?: Promise<unknown> };

function withLock<T>(task: () => Promise<T>): Promise<T> {
  const previous = globalWithLock.__campaignsLock ?? Promise.resolve();
  const run = previous.then(task, task);
  globalWithLock.__campaignsLock = run.catch(() => undefined);
  return run;
}

function sliceOf(data: FileData, userId: string): Slice {
  return {
    settings: { ...DEFAULT_SETTINGS, ...(data.settings[userId] ?? {}) },
    templates: data.templates.filter((item) => item.userId === userId),
    campaigns: data.campaigns.filter((item) => item.userId === userId),
    messages: data.messages.filter((item) => item.userId === userId),
  };
}

function merge(data: FileData, userId: string, slice: Slice): FileData {
  return {
    settings: { ...data.settings, [userId]: slice.settings },
    templates: [...data.templates.filter((item) => item.userId !== userId), ...slice.templates],
    campaigns: [...data.campaigns.filter((item) => item.userId !== userId), ...slice.campaigns],
    messages: [...data.messages.filter((item) => item.userId !== userId), ...slice.messages],
  };
}

export type RepositoryDeps = {
  leads: LeadsRepository;
  /** Relógio (os testes trocam por um relógio fixo). */
  now?: () => Date;
};

export function createCampaignsRepository({ leads, now = () => new Date() }: RepositoryDeps): CampaignsRepository {
  const makeCtx = (): Ctx => ({ now: now().toISOString(), newId: () => randomUUID() });

  /** Lê, aplica uma regra pura sobre os dados desta pessoa e grava se deu certo. */
  function mutate<T extends object>(
    userId: string,
    apply: (slice: Slice, ctx: Ctx) => logic.Res<T>,
  ): Promise<({ ok: true } & T) | { ok: false; error: string }> {
    return withLock(async () => {
      const data = await readAll();
      const result = apply(sliceOf(data, userId), makeCtx());
      if (!result.ok) return result;
      await writeAll(merge(data, userId, result.slice));
      const rest: Record<string, unknown> = { ...result };
      delete rest.slice;
      return rest as { ok: true } & T;
    });
  }

  return {
    async getSettings(userId) {
      return sliceOf(await readAll(), userId).settings;
    },

    saveSettings: (userId, settings) =>
      withLock(async () => {
        const data = await readAll();
        await writeAll({ ...data, settings: { ...data.settings, [userId]: settings } });
      }),

    async listTemplates(userId) {
      return sliceOf(await readAll(), userId).templates;
    },

    addTemplate: (userId, input) => mutate(userId, (slice, ctx) => logic.addTemplate(slice, userId, input, ctx)),
    approveTemplate: (userId, id) => mutate(userId, (slice) => logic.approveTemplate(slice, id)),
    removeTemplate: (userId, id) => mutate(userId, (slice) => logic.removeTemplate(slice, id)),

    async previewAudience(userId, stages, tag) {
      return selectAudience(await leads.list(userId), stages, tag);
    },

    async listCampaigns(userId) {
      const slice = sliceOf(await readAll(), userId);
      return slice.campaigns
        .map((campaign) => ({
          campaign,
          counts: logic.countMessages(slice.messages.filter((message) => message.campaignId === campaign.id)),
        }))
        .sort((a, b) => b.campaign.createdAt.localeCompare(a.campaign.createdAt));
    },

    async getCampaign(userId, id) {
      const slice = sliceOf(await readAll(), userId);
      const campaign = slice.campaigns.find((item) => item.id === id);
      if (!campaign) return null;
      const messages = slice.messages.filter((message) => message.campaignId === id);
      return { campaign, messages, counts: logic.countMessages(messages) };
    },

    async createCampaign(userId, input) {
      const allLeads = await leads.list(userId);
      return mutate(userId, (slice, ctx) => logic.createCampaign(slice, allLeads, userId, input, ctx));
    },

    changeCampaign: (userId, id, action) => mutate(userId, (slice, ctx) => logic.changeCampaign(slice, id, action, ctx)),
    removeCampaign: (userId, id) => mutate(userId, (slice) => logic.removeCampaign(slice, id)),

    async usage(userId) {
      const slice = sliceOf(await readAll(), userId);
      const current = now();
      return {
        sent: logic.sentToday(slice.messages, current),
        limit: slice.settings.dailyLimit,
        window: checkWindow(slice.settings, current),
      };
    },

    runBatch(userId, sender) {
      return withLock(async (): Promise<BatchResult> => {
        const data = await readAll();
        const slice = sliceOf(data, userId);
        const allLeads = await leads.list(userId);
        const current = now();

        const plan = logic.planBatch(slice, allLeads, current);
        if (!plan.ok) return plan;

        // Envia um por vez (simples e fácil de acompanhar). Um erro em um contato não para os outros.
        const outcomes = new Map<string, logic.SendOutcome>();
        for (const item of plan.sends) {
          try {
            outcomes.set(item.messageId, await sender.send({ to: item.to, text: item.text, templateName: item.templateName }));
          } catch {
            outcomes.set(item.messageId, { ok: false, error: "Erro inesperado ao enviar." });
          }
        }

        const ctx: Ctx = { now: current.toISOString(), newId: () => randomUUID() };
        const updated = logic.applyBatch(slice, plan, outcomes, ctx);
        await writeAll(merge(data, userId, updated));

        // Histórico do lead (e Novo → Contatado) só para quem recebeu de verdade.
        const campaignName = new Map(slice.campaigns.map((campaign) => [campaign.id, campaign.name]));
        for (const item of plan.sends) {
          if (!outcomes.get(item.messageId)?.ok) continue;
          const label = `Mensagem da campanha "${campaignName.get(item.campaignId) ?? ""}" enviada${sender.simulated ? " (simulação)" : ""}.`;
          await leads.recordCampaignMessage(userId, item.leadId, label);
        }

        const results = [...outcomes.values()];
        return {
          ok: true,
          sent: results.filter((outcome) => outcome.ok).length,
          failed: results.filter((outcome) => !outcome.ok).length,
          skipped: plan.skips.length,
          remainingToday: Math.max(0, plan.remainingToday - results.filter((outcome) => outcome.ok).length),
          queuedLeft: updated.messages.filter((message) => message.userId === userId && message.status === "na_fila").length,
          simulated: sender.simulated,
        };
      });
    },
  };
}
