import { randomUUID } from "node:crypto";
import type { LeadsRepository } from "@/lib/leads";
import type { Ctx } from "@/lib/leads/logic";
import { selectAudience, type AudienceReport } from "./audience";
import * as logic from "./logic";
import type { WhatsAppSender } from "./sender";
import { createCollectionStore, type CampaignsStore } from "./store";
import { checkWindow } from "./time";
import {
  type Campaign,
  type CampaignMessage,
  type MessageCounts,
  type Settings,
  type Slice,
  type Template,
} from "./types";
import type { StageId } from "@/lib/leads/types";

/**
 * Repositório das campanhas. As regras ficam em logic.ts; onde os dados moram é escolhido pelo "store" (store.ts).
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
  addTemplate(userId: string, input: { name: string; body: string; metaName?: string }): Promise<{ ok: true; template: Template } | { ok: false; error: string }>;
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
  /** Quem tem alguma campanha em andamento (usado pelo agendador). */
  listActiveUserIds(): Promise<string[]>;
}

export type RepositoryDeps = {
  leads: LeadsRepository;
  /** Onde guardar (padrão: arquivo/coleção; DATA_BACKEND e CAMPAIGNS_STORE escolhem em index.ts). */
  store?: CampaignsStore;
  /** Relógio (os testes trocam por um relógio fixo). */
  now?: () => Date;
};

export function createCampaignsRepository({ leads, store = createCollectionStore(), now = () => new Date() }: RepositoryDeps): CampaignsRepository {
  const { withLock } = store;
  const makeCtx = (): Ctx => ({ now: now().toISOString(), newId: () => randomUUID() });

  /** Lê, aplica uma regra pura sobre os dados desta pessoa e grava se deu certo. */
  function mutate<T extends object>(
    userId: string,
    apply: (slice: Slice, ctx: Ctx) => logic.Res<T>,
  ): Promise<({ ok: true } & T) | { ok: false; error: string }> {
    return withLock(async () => {
      const before = await store.load(userId);
      const result = apply(before, makeCtx());
      if (!result.ok) return result;
      await store.save(userId, before, result.slice);
      const rest: Record<string, unknown> = { ...result };
      delete rest.slice;
      return rest as { ok: true } & T;
    });
  }

  return {
    async getSettings(userId) {
      return (await store.load(userId)).settings;
    },

    saveSettings: (userId, settings) => withLock(() => store.saveSettings(userId, settings)),

    async listTemplates(userId) {
      return (await store.load(userId)).templates;
    },

    addTemplate: (userId, input) => mutate(userId, (slice, ctx) => logic.addTemplate(slice, userId, input, ctx)),
    approveTemplate: (userId, id) => mutate(userId, (slice) => logic.approveTemplate(slice, id)),
    removeTemplate: (userId, id) => mutate(userId, (slice) => logic.removeTemplate(slice, id)),

    async previewAudience(userId, stages, tag) {
      return selectAudience(await leads.list(userId), stages, tag);
    },

    async listCampaigns(userId) {
      const slice = await store.load(userId);
      return slice.campaigns
        .map((campaign) => ({
          campaign,
          counts: logic.countMessages(slice.messages.filter((message) => message.campaignId === campaign.id)),
        }))
        .sort((a, b) => b.campaign.createdAt.localeCompare(a.campaign.createdAt));
    },

    async getCampaign(userId, id) {
      const slice = await store.load(userId);
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
      const slice = await store.load(userId);
      const current = now();
      return {
        sent: logic.sentToday(slice.messages, current),
        limit: slice.settings.dailyLimit,
        window: checkWindow(slice.settings, current),
      };
    },

    async listActiveUserIds() {
      return store.listActiveClientIds();
    },

    runBatch(userId, sender) {
      return withLock(async (): Promise<BatchResult> => {
        const current = now();
        const loaded = await store.load(userId);
        const loadedFresh = logic.expireStuck(loaded, current);
        if (loadedFresh !== loaded) await store.save(userId, loaded, loadedFresh);
        const allLeads = await leads.list(userId);

        const firstPlan = logic.planBatch(loadedFresh, allLeads, current);
        if (!firstPlan.ok) return firstPlan;

        const wanted = [...firstPlan.sends.map((item) => item.messageId), ...firstPlan.skips.map((item) => item.messageId)];
        const claimed = new Set(wanted.length > 0 ? await store.claimMessages(userId, wanted, current.toISOString()) : []);
        if (wanted.length > 0 && claimed.size === 0) {
          return { ok: false, error: "Outro envio já está em andamento. Tente de novo em alguns minutos." };
        }
        const plan = { ...firstPlan, sends: firstPlan.sends.filter((item) => claimed.has(item.messageId)), skips: firstPlan.skips.filter((item) => claimed.has(item.messageId)) };
        const slice = logic.markClaimed(loadedFresh, claimed, current.toISOString());

        // Envia um por vez (simples e fácil de acompanhar). Um erro em um contato não para os outros.
        const outcomes = new Map<string, logic.SendOutcome>();
        for (const item of plan.sends) {
          try {
            outcomes.set(
              item.messageId,
              await sender.send({
                to: item.to,
                text: item.text,
                templateName: item.templateName,
                purpose: "marketing",
                ...(item.template ? { template: item.template } : {}),
              }),
            );
          } catch {
            outcomes.set(item.messageId, { ok: false, error: "Erro inesperado ao enviar." });
          }
        }

        const ctx: Ctx = { now: current.toISOString(), newId: () => randomUUID() };
        const updated = logic.applyBatch(slice, plan, outcomes, ctx);
        await store.save(userId, slice, updated);

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
          queuedLeft: updated.messages.filter((message) => message.status === "na_fila").length,
          simulated: sender.simulated,
        };
      });
    },
  };
}
