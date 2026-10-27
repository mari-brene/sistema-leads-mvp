import { detectOptOut } from "./optout";
import {
  DAILY_AI_LIMIT,
  MAX_AI_REPLIES_IN_ROW,
  MAX_BUSINESS_NAME,
  MAX_KNOWLEDGE,
  MAX_MESSAGE,
  SERVICE_WINDOW_HOURS,
  type Conversation,
  type InboxSettings,
} from "./types";

/** Regras de decisão da caixa de entrada, sem gravar nada (fáceis de testar). */

export type InboundDecision =
  | { kind: "optout" }
  | { kind: "human"; reason: string }
  | { kind: "ai" };

export type DecideInput = {
  text: string;
  leadOptedOut: boolean;
  settings: InboxSettings;
  /** Estado da conversa ANTES desta mensagem (null = conversa nova). */
  conversation: Pick<Conversation, "mode" | "aiRepliesInRow"> | null;
  aiUsedToday: number;
  hasPhone: boolean;
  /** Se informado, a conversa vai para você com este motivo (ex.: o contato mandou foto ou áudio). */
  forceHumanReason?: string;
};

/**
 * Decide o que fazer quando o contato escreve. A ordem importa:
 * segurança e consentimento vêm antes de qualquer resposta automática.
 */
export function decideInbound(input: DecideInput): InboundDecision {
  const signal = detectOptOut(input.text);

  if (signal === "exact" && !input.leadOptedOut) return { kind: "optout" };
  if (input.leadOptedOut) {
    return { kind: "human", reason: "Este contato saiu da lista; nenhuma resposta automática é enviada." };
  }
  if (signal === "mention") {
    return {
      kind: "human",
      reason: "A mensagem cita uma palavra de saída (sair/parar/cancelar). Confira e, se for um pedido de saída, use “Registrar saída” no lead.",
    };
  }
  if (input.forceHumanReason) return { kind: "human", reason: input.forceHumanReason };
  if (input.conversation?.mode === "humano") return { kind: "human", reason: "Você assumiu esta conversa." };
  if (!input.settings.aiEnabled) return { kind: "human", reason: "A resposta automática está desligada." };
  if (!input.settings.knowledge.trim()) {
    return { kind: "human", reason: "A base de conhecimento está vazia (Configurações → Base de conhecimento)." };
  }
  if (!input.hasPhone) return { kind: "human", reason: "O lead não tem telefone cadastrado." };
  if ((input.conversation?.aiRepliesInRow ?? 0) >= MAX_AI_REPLIES_IN_ROW) {
    return { kind: "human", reason: `A IA já respondeu ${MAX_AI_REPLIES_IN_ROW} vezes seguidas; sua vez.` };
  }
  if (input.aiUsedToday >= DAILY_AI_LIMIT) {
    return { kind: "human", reason: `Limite diário de ${DAILY_AI_LIMIT} respostas da IA atingido.` };
  }
  return { kind: "ai" };
}

/** Você só pode escrever livremente até 24h depois da última mensagem do contato. */
export function canHumanReply(lastInboundAt: string | null, now: Date): boolean {
  if (!lastInboundAt) return false;
  const last = new Date(lastInboundAt).getTime();
  if (Number.isNaN(last)) return false;
  return now.getTime() - last < SERVICE_WINDOW_HOURS * 3_600_000;
}

/** Quanto tempo resta da janela de 24h, em horas (arredondado para cima); 0 = fechada. */
export function windowHoursLeft(lastInboundAt: string | null, now: Date): number {
  if (!canHumanReply(lastInboundAt, now)) return 0;
  const left = SERVICE_WINDOW_HOURS * 3_600_000 - (now.getTime() - new Date(lastInboundAt as string).getTime());
  return Math.max(1, Math.ceil(left / 3_600_000));
}

const dayFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** "2026-10-21" no fuso de São Paulo (para o contador diário da IA). */
export function dayKey(now: Date): string {
  return dayFormat.format(now);
}

export type ValidSettings = { ok: true; value: InboxSettings } | { ok: false; error: string };

export function validateInboxSettings(input: { aiEnabled: boolean; businessName: unknown; knowledge: unknown }): ValidSettings {
  const businessName = typeof input.businessName === "string" ? input.businessName.replace(/\s+/g, " ").trim() : "";
  const knowledge = typeof input.knowledge === "string" ? input.knowledge.replace(/\r\n?/g, "\n").trim() : "";
  if (businessName.length > MAX_BUSINESS_NAME) {
    return { ok: false, error: `O nome da empresa pode ter até ${MAX_BUSINESS_NAME} caracteres.` };
  }
  if (knowledge.length > MAX_KNOWLEDGE) {
    return { ok: false, error: `A base de conhecimento pode ter até ${MAX_KNOWLEDGE} caracteres (agora tem ${knowledge.length}).` };
  }
  return { ok: true, value: { aiEnabled: input.aiEnabled, businessName, knowledge } };
}

export type ValidMessage = { ok: true; text: string } | { ok: false; error: string };

export function validateMessageText(input: unknown): ValidMessage {
  const text = typeof input === "string" ? input.replace(/\r\n?/g, "\n").trim() : "";
  if (!text) return { ok: false, error: "Escreva a mensagem." };
  if (text.length > MAX_MESSAGE) return { ok: false, error: `A mensagem pode ter até ${MAX_MESSAGE} caracteres.` };
  return { ok: true, text };
}
