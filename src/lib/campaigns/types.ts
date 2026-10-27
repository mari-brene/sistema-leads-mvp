import type { StageId } from "@/lib/leads/types";

/**
 * Tipos e limites das campanhas de WhatsApp.
 * Arquivo "puro" (sem fs), então também pode ser usado nas telas do navegador.
 */

/** Máximo de destinatários em uma campanha (divida em partes usando tags). */
export const MAX_AUDIENCE = 200;
/** Quantas mensagens cada clique em "Enviar próximo lote" manda. */
export const BATCH_SIZE = 10;
export const MAX_NAME = 80;
export const MAX_TEMPLATE_BODY = 900;
export const MAX_FOOTER = 120;
export const MAX_DAILY_LIMIT = 250;

export const DEFAULT_FOOTER = "Para não receber mais mensagens, responda SAIR.";

export type Settings = {
  /** Máximo de mensagens enviadas por dia (somando todas as campanhas). */
  dailyLimit: number;
  /** Hora (0 a 23) a partir da qual pode enviar. */
  windowStart: number;
  /** Hora (1 a 24) em que para de enviar. 24 = até o fim do dia. */
  windowEnd: number;
  /** true = não envia aos sábados e domingos. */
  weekdaysOnly: boolean;
  /** Frase de saída colocada no fim de toda mensagem de marketing. */
  optOutFooter: string;
};

export const DEFAULT_SETTINGS: Settings = {
  dailyLimit: 30,
  windowStart: 9,
  windowEnd: 18,
  weekdaysOnly: true,
  optOutFooter: DEFAULT_FOOTER,
};

export type TemplateStatus = "pendente" | "aprovado" | "rejeitado";

export const TEMPLATE_STATUS_LABEL: Record<TemplateStatus, string> = {
  pendente: "Aguardando aprovação",
  aprovado: "Aprovado",
  rejeitado: "Rejeitado",
};

/** Modelo de mensagem. Na API oficial do WhatsApp, marketing só sai por modelos aprovados pela Meta. */
export type Template = {
  id: string;
  userId: string;
  name: string;
  body: string;
  /** Nome do modelo aprovado na Meta (obrigatório para enviar no WhatsApp real). */
  metaName?: string;
  status: TemplateStatus;
  createdAt: string;
};

export type CampaignStatus = "rascunho" | "em_andamento" | "pausada" | "concluida" | "cancelada";

export const CAMPAIGN_STATUS_LABEL: Record<CampaignStatus, string> = {
  rascunho: "Rascunho",
  em_andamento: "Em andamento",
  pausada: "Pausada",
  concluida: "Concluída",
  cancelada: "Cancelada",
};

export type Campaign = {
  id: string;
  userId: string;
  name: string;
  templateId: string;
  templateName: string;
  /** Cópia do texto do modelo na hora da criação (mudar o modelo depois não altera campanhas já criadas). */
  body: string;
  stages: StageId[];
  tag: string;
  status: CampaignStatus;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
};

export type MessageStatus = "na_fila" | "enviada" | "falhou" | "pulada";

export const MESSAGE_STATUS_LABEL: Record<MessageStatus, string> = {
  na_fila: "Na fila",
  enviada: "Enviada",
  falhou: "Falhou",
  pulada: "Pulada",
};

/** Um item da fila: uma mensagem para um contato. */
export type CampaignMessage = {
  id: string;
  userId: string;
  campaignId: string;
  leadId: string;
  leadName: string;
  /** Telefone no formato E.164 no momento em que entrou na fila. */
  phone: string;
  /** Texto final (já com o nome e a frase de saída). */
  text: string;
  status: MessageStatus;
  /** Por que falhou ou foi pulada. */
  reason: string;
  providerId: string | null;
  queuedAt: string;
  sentAt: string | null;
};

/** Tudo de uma pessoa nesta área. */
export type Slice = {
  settings: Settings;
  templates: Template[];
  campaigns: Campaign[];
  messages: CampaignMessage[];
};

export type MessageCounts = { total: number; naFila: number; enviadas: number; falhas: number; puladas: number };
