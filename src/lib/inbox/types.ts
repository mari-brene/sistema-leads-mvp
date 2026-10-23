/**
 * Tipos e limites da caixa de entrada.
 * Arquivo "puro" (sem fs/crypto), pode ser usado também nas telas do navegador.
 */

/** "ia" = a IA responde sozinha. "humano" = só você responde. */
export type ConversationMode = "ia" | "humano";

export type MessageDirection = "in" | "out";

/** Quem escreveu: o contato, a IA, você, ou o sistema (ex.: confirmação de saída). */
export type MessageAuthor = "contato" | "ia" | "voce" | "sistema";

export type InboxMessage = {
  id: string;
  userId: string;
  leadId: string;
  direction: MessageDirection;
  author: MessageAuthor;
  text: string;
  at: string;
  /** Só nas mensagens enviadas por nós. */
  status?: "enviada" | "falhou";
  error?: string;
};

export type Conversation = {
  userId: string;
  leadId: string;
  mode: ConversationMode;
  /** true = o contato escreveu e ainda falta uma resposta SUA. */
  needsHuman: boolean;
  /** Por que a IA passou a conversa para você (aparece na tela). */
  handoffReason: string | null;
  /** Quantas respostas seguidas a IA deu sem você entrar (zera quando você responde ou devolve). */
  aiRepliesInRow: number;
  lastInboundAt: string | null;
  lastMessageAt: string;
  lastPreview: string;
  createdAt: string;
};

export type InboxSettings = {
  aiEnabled: boolean;
  businessName: string;
  /** Texto com o que a IA pode responder (preços, horários, endereço...). */
  knowledge: string;
};

export const DEFAULT_INBOX_SETTINGS: InboxSettings = { aiEnabled: true, businessName: "", knowledge: "" };

export const MAX_KNOWLEDGE = 6000;
export const MAX_BUSINESS_NAME = 80;
export const MAX_MESSAGE = 1000;
/** Depois de tantas respostas seguidas da IA, a conversa passa para você. */
export const MAX_AI_REPLIES_IN_ROW = 5;
/** Máximo de respostas da IA por dia (protege o plano gratuito). */
export const DAILY_AI_LIMIT = 100;
/** Janela de atendimento do WhatsApp: 24h depois da última mensagem do contato. */
export const SERVICE_WINDOW_HOURS = 24;

export type ConversationState = "ia" | "aguardando" | "humano" | "saiu";

export const STATE_LABEL: Record<ConversationState, string> = {
  ia: "IA atendendo",
  aguardando: "Aguardando você",
  humano: "Você atende",
  saiu: "Saiu",
};

export function conversationState(convo: Pick<Conversation, "mode" | "needsHuman">, optOut: boolean): ConversationState {
  if (optOut) return "saiu";
  if (convo.mode === "ia") return "ia";
  return convo.needsHuman ? "aguardando" : "humano";
}
