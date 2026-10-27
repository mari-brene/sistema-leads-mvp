import { randomUUID } from "node:crypto";
import { readJson, writeJson } from "@/lib/storage";
import type { LeadsRepository } from "@/lib/leads";
import type { Lead } from "@/lib/leads/types";
import type { WhatsAppSender } from "@/lib/campaigns/sender";
import type { AiProvider, AiTurn } from "./ai";
import { canHumanReply, dayKey, decideInbound, validateInboxSettings, validateMessageText } from "./logic";
import {
  DEFAULT_INBOX_SETTINGS,
  type Conversation,
  type InboxMessage,
  type InboxSettings,
} from "./types";

/**
 * Repositório de SIMULAÇÃO da caixa de entrada: arquivo local (.data/inbox.json).
 * Na fase de contas reais, um repositório do Supabase com a mesma forma entra no lugar.
 */

type Simple = { ok: true } | { ok: false; error: string };

export type ConversationRow = {
  conversation: Conversation;
  lead: Pick<Lead, "id" | "name" | "company" | "phone" | "optOut">;
};

export type Thread = {
  lead: Lead;
  conversation: Conversation | null;
  messages: InboxMessage[];
  canReply: boolean;
};

export type ReceiveResult =
  | { ok: false; error: string }
  | { ok: true; outcome: "ia_respondeu" | "para_voce" | "saiu" | "duplicada" };

export type ReceiveOptions = {
  /** Identificador da mensagem na Meta: se já foi processada, é ignorada. */
  externalId?: string;
  /** A conversa vai direto para você, com este motivo (ex.: mensagem com foto ou áudio). */
  forceHumanReason?: string;
};

export interface InboxRepository {
  getSettings(userId: string): Promise<InboxSettings>;
  saveSettings(userId: string, input: { aiEnabled: boolean; businessName: unknown; knowledge: unknown }): Promise<Simple>;
  listConversations(userId: string): Promise<ConversationRow[]>;
  getThread(userId: string, leadId: string): Promise<Thread | null>;
  /** Uma mensagem do contato chegou (na simulação, digitada por você; na fase 8, vem do webhook da Meta). */
  receive(userId: string, leadId: string, text: string, opts?: ReceiveOptions): Promise<ReceiveResult>;
  sendHuman(userId: string, leadId: string, text: string): Promise<Simple>;
  takeOver(userId: string, leadId: string): Promise<Simple>;
  handBack(userId: string, leadId: string): Promise<Simple>;
}

type FileData = {
  settings: Record<string, InboxSettings>;
  conversations: Conversation[];
  messages: InboxMessage[];
  /** "usuário|2026-10-21" → respostas da IA nesse dia. */
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

async function writeAll(data: FileData): Promise<void> {
  await writeJson("inbox", data);
}

const globalWithLock = globalThis as typeof globalThis & { __inboxLock?: Promise<unknown> };

function withLock<T>(task: () => Promise<T>): Promise<T> {
  const previous = globalWithLock.__inboxLock ?? Promise.resolve();
  const run = previous.then(task, task);
  globalWithLock.__inboxLock = run.catch(() => undefined);
  return run;
}

/** Lê, deixa a função alterar, e grava. Tudo dentro da fila (uma gravação de cada vez). */
function edit<T>(change: (data: FileData) => T): Promise<T> {
  return withLock(async () => {
    const data = await readAll();
    const result = change(data);
    await writeAll(data);
    return result;
  });
}

type Deps = {
  leads: LeadsRepository;
  sender: () => WhatsAppSender;
  ai: () => AiProvider;
  now?: () => Date;
};

const HISTORY_TURNS = 8;

function preview(text: string): string {
  return text.replace(/\s+/g, " ").slice(0, 80);
}

function newConversation(userId: string, leadId: string, nowIso: string): Conversation {
  return {
    userId,
    leadId,
    mode: "ia",
    needsHuman: false,
    handoffReason: null,
    aiRepliesInRow: 0,
    lastInboundAt: null,
    lastMessageAt: nowIso,
    lastPreview: "",
    createdAt: nowIso,
  };
}

function findConversation(data: FileData, userId: string, leadId: string): Conversation | undefined {
  return data.conversations.find((c) => c.userId === userId && c.leadId === leadId);
}

function pushMessage(data: FileData, message: Omit<InboxMessage, "id">): InboxMessage {
  const full: InboxMessage = { id: randomUUID(), ...message };
  data.messages.push(full);
  return full;
}

export function createInboxRepository(deps: Deps): InboxRepository {
  const clock = () => (deps.now ? deps.now() : new Date());

  /** Registra uma mensagem enviada por nós e atualiza a conversa. */
  function recordOut(
    data: FileData,
    convo: Conversation,
    message: { author: "ia" | "voce" | "sistema"; text: string; status: "enviada" | "falhou"; error?: string },
    nowIso: string,
  ): void {
    pushMessage(data, {
      userId: convo.userId,
      leadId: convo.leadId,
      direction: "out",
      author: message.author,
      text: message.text,
      at: nowIso,
      status: message.status,
      ...(message.error ? { error: message.error } : {}),
    });
    convo.lastMessageAt = nowIso;
    convo.lastPreview = preview(message.text);
  }

  async function handoff(userId: string, leadId: string, reason: string): Promise<void> {
    await edit((data) => {
      const convo = findConversation(data, userId, leadId);
      if (!convo) return;
      convo.mode = "humano";
      convo.needsHuman = true;
      convo.handoffReason = reason;
    });
  }

  return {
    async getSettings(userId) {
      const data = await readAll();
      return { ...DEFAULT_INBOX_SETTINGS, ...(data.settings[userId] ?? {}) };
    },

    async saveSettings(userId, input) {
      const parsed = validateInboxSettings(input);
      if (!parsed.ok) return parsed;
      await edit((data) => {
        data.settings[userId] = parsed.value;
      });
      return { ok: true };
    },

    async listConversations(userId) {
      const [data, leads] = await Promise.all([readAll(), deps.leads.list(userId)]);
      const byId = new Map(leads.map((lead) => [lead.id, lead]));
      const rows: ConversationRow[] = [];
      for (const conversation of data.conversations) {
        if (conversation.userId !== userId) continue;
        const lead = byId.get(conversation.leadId);
        if (!lead) continue;
        rows.push({
          conversation,
          lead: { id: lead.id, name: lead.name, company: lead.company, phone: lead.phone, optOut: lead.optOut },
        });
      }
      rows.sort((a, b) => {
        if (a.conversation.needsHuman !== b.conversation.needsHuman) return a.conversation.needsHuman ? -1 : 1;
        return b.conversation.lastMessageAt.localeCompare(a.conversation.lastMessageAt);
      });
      return rows;
    },

    async getThread(userId, leadId) {
      const [data, lead] = await Promise.all([readAll(), deps.leads.get(userId, leadId)]);
      if (!lead) return null;
      const conversation = findConversation(data, userId, leadId) ?? null;
      const messages = data.messages
        .filter((m) => m.userId === userId && m.leadId === leadId)
        .sort((a, b) => a.at.localeCompare(b.at));
      return {
        lead,
        conversation,
        messages,
        canReply: !lead.optOut && canHumanReply(conversation?.lastInboundAt ?? null, clock()),
      };
    },

    async receive(userId, leadId, rawText, opts) {
      const checked = validateMessageText(rawText);
      if (!checked.ok) return checked;
      const text = checked.text;

      const lead = await deps.leads.get(userId, leadId);
      if (!lead) return { ok: false, error: "Lead não encontrado." };
      if (!lead.phone) return { ok: false, error: "Este lead não tem telefone. Cadastre um telefone para receber mensagens." };

      const settings = await this.getSettings(userId);
      const now = clock();
      const nowIso = now.toISOString();
      const usageKey = `${userId}|${dayKey(now)}`;

      // ETAPA A (dentro da fila): guarda a mensagem recebida e decide o que fazer.
      const plan = await edit((data) => {
        if (opts?.externalId && data.messages.some((m) => m.userId === userId && m.externalId === opts.externalId)) {
          return { duplicate: true as const };
        }
        let convo = findConversation(data, userId, leadId);
        if (!convo) {
          convo = newConversation(userId, leadId, nowIso);
          data.conversations.push(convo);
        }
        const history: AiTurn[] = data.messages
          .filter((m) => m.userId === userId && m.leadId === leadId && (m.author === "contato" || m.author === "ia" || m.author === "voce"))
          .sort((a, b) => a.at.localeCompare(b.at))
          .slice(-HISTORY_TURNS)
          .map((m) => ({ from: m.author === "contato" ? "contato" : "assistente", text: m.text }));

        pushMessage(data, {
          userId,
          leadId,
          direction: "in",
          author: "contato",
          text,
          at: nowIso,
          ...(opts?.externalId ? { externalId: opts.externalId } : {}),
        });
        convo.lastInboundAt = nowIso;
        convo.lastMessageAt = nowIso;
        convo.lastPreview = preview(text);

        const decision = decideInbound({
          text,
          leadOptedOut: lead.optOut,
          settings,
          conversation: convo,
          aiUsedToday: data.aiUsage[usageKey] ?? 0,
          hasPhone: true,
          ...(opts?.forceHumanReason ? { forceHumanReason: opts.forceHumanReason } : {}),
        });

        if (decision.kind === "ai") {
          data.aiUsage[usageKey] = (data.aiUsage[usageKey] ?? 0) + 1;
          convo.handoffReason = null;
        } else if (decision.kind === "human") {
          convo.mode = "humano";
          convo.needsHuman = true;
          convo.handoffReason = decision.reason;
        } else {
          convo.mode = "humano";
          convo.needsHuman = false;
          convo.handoffReason = "Contato pediu para sair da lista.";
        }
        return { duplicate: false as const, decision, history };
      });
      if (plan.duplicate) return { ok: true, outcome: "duplicada" };

      // O histórico do lead (e a etapa do Kanban) são atualizados fora da nossa fila.
      await deps.leads.recordInboundMessage(userId, leadId, text);

      // ETAPA B: efeitos de fora (sem segurar a fila).
      if (plan.decision.kind === "optout") {
        await deps.leads.registerOptOut(userId, leadId);
        const confirmation = "Tudo certo! Você não receberá mais mensagens de marketing nossas. Obrigado e até mais.";
        const sent = await deps.sender().send({ to: lead.phone, text: confirmation, templateName: "confirmacao-saida", purpose: "service" });
        await edit((data) => {
          const convo = findConversation(data, userId, leadId);
          if (!convo) return;
          recordOut(
            data,
            convo,
            { author: "sistema", text: confirmation, status: sent.ok ? "enviada" : "falhou", ...(sent.ok ? {} : { error: sent.error }) },
            clock().toISOString(),
          );
        });
        return { ok: true, outcome: "saiu" };
      }

      if (plan.decision.kind === "human") return { ok: true, outcome: "para_voce" };

      // Resposta da IA.
      const result = await deps.ai().reply({
        businessName: settings.businessName,
        knowledge: settings.knowledge,
        history: plan.history,
        message: text,
      });

      if (!result.ok) {
        await handoff(userId, leadId, `A IA falhou (${result.error}). Responda você.`);
        return { ok: true, outcome: "para_voce" };
      }
      if (result.action === "handoff") {
        await handoff(userId, leadId, result.reason);
        return { ok: true, outcome: "para_voce" };
      }

      // Antes de enviar, confere de novo: você pode ter assumido, ou o contato pode ter pedido para sair.
      const [freshLead, stillAi] = await Promise.all([
        deps.leads.get(userId, leadId),
        withLock(async () => {
          const convo = findConversation(await readAll(), userId, leadId);
          return convo?.mode === "ia";
        }),
      ]);
      if (!freshLead || freshLead.optOut || !freshLead.phone || !stillAi) return { ok: true, outcome: "para_voce" };

      const sent = await deps.sender().send({ to: freshLead.phone, text: result.text, templateName: "resposta-ia", purpose: "service" });
      await edit((data) => {
        const convo = findConversation(data, userId, leadId);
        if (!convo) return;
        recordOut(
          data,
          convo,
          { author: "ia", text: result.text, status: sent.ok ? "enviada" : "falhou", ...(sent.ok ? {} : { error: sent.error }) },
          clock().toISOString(),
        );
        if (sent.ok) {
          convo.aiRepliesInRow += 1;
        } else {
          convo.mode = "humano";
          convo.needsHuman = true;
          convo.handoffReason = `Não foi possível enviar a resposta da IA (${sent.error}). Responda você.`;
        }
      });
      return { ok: true, outcome: sent.ok ? "ia_respondeu" : "para_voce" };
    },

    async sendHuman(userId, leadId, rawText) {
      const checked = validateMessageText(rawText);
      if (!checked.ok) return checked;

      const [lead, data] = await Promise.all([deps.leads.get(userId, leadId), readAll()]);
      if (!lead) return { ok: false, error: "Lead não encontrado." };
      if (lead.optOut) return { ok: false, error: "Este contato saiu da lista. Não é possível enviar mensagens." };
      if (!lead.phone) return { ok: false, error: "Este lead não tem telefone." };

      const convo = findConversation(data, userId, leadId);
      if (!canHumanReply(convo?.lastInboundAt ?? null, clock())) {
        return {
          ok: false,
          error: "Já se passaram mais de 24h desde a última mensagem do contato. Fora desse prazo só é possível enviar um modelo aprovado (campanha).",
        };
      }

      const sent = await deps.sender().send({ to: lead.phone, text: checked.text, templateName: "resposta-manual", purpose: "service" });
      return edit((fresh) => {
        const current = findConversation(fresh, userId, leadId);
        if (!current) return { ok: false, error: "Conversa não encontrada." } as const;
        recordOut(
          fresh,
          current,
          { author: "voce", text: checked.text, status: sent.ok ? "enviada" : "falhou", ...(sent.ok ? {} : { error: sent.error }) },
          clock().toISOString(),
        );
        if (!sent.ok) return { ok: false, error: `Não enviou: ${sent.error}` } as const;
        current.mode = "humano";
        current.needsHuman = false;
        current.aiRepliesInRow = 0;
        return { ok: true } as const;
      });
    },

    async takeOver(userId, leadId) {
      return edit((data) => {
        const convo = findConversation(data, userId, leadId);
        if (!convo) return { ok: false, error: "Conversa não encontrada." } as const;
        convo.mode = "humano";
        convo.needsHuman = false;
        convo.handoffReason = null;
        return { ok: true } as const;
      });
    },

    async handBack(userId, leadId) {
      const lead = await deps.leads.get(userId, leadId);
      if (!lead) return { ok: false, error: "Lead não encontrado." };
      if (lead.optOut) return { ok: false, error: "Este contato saiu da lista; a IA não pode responder." };
      return edit((data) => {
        const convo = findConversation(data, userId, leadId);
        if (!convo) return { ok: false, error: "Conversa não encontrada." } as const;
        convo.mode = "ia";
        convo.needsHuman = false;
        convo.handoffReason = null;
        convo.aiRepliesInRow = 0;
        return { ok: true } as const;
      });
    },
  };
}
