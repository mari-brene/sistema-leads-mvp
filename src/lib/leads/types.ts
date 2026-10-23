/**
 * Tipos e listas do módulo de leads.
 * Este arquivo é "puro" (sem fs/crypto), então pode ser usado também nas telas do navegador.
 */

export const STAGES = [
  { id: "prospeccao", label: "Prospecção", header: "bg-slate-100 text-slate-700", dot: "bg-slate-400" },
  { id: "novo", label: "Novo", header: "bg-sky-100 text-sky-800", dot: "bg-sky-500" },
  { id: "contatado", label: "Contatado", header: "bg-violet-100 text-violet-800", dot: "bg-violet-500" },
  { id: "respondeu", label: "Respondeu", header: "bg-amber-100 text-amber-800", dot: "bg-amber-500" },
  { id: "reuniao", label: "Reunião agendada", header: "bg-indigo-100 text-indigo-800", dot: "bg-indigo-500" },
  { id: "fechado", label: "Fechado/Perdido", header: "bg-emerald-100 text-emerald-800", dot: "bg-emerald-500" },
] as const;

export type StageId = (typeof STAGES)[number]["id"];

export const STAGE_IDS: StageId[] = STAGES.map((stage) => stage.id);

export function isStageId(value: unknown): value is StageId {
  return typeof value === "string" && (STAGE_IDS as string[]).includes(value);
}

export function stageInfo(id: StageId) {
  return STAGES.find((stage) => stage.id === id) ?? STAGES[0];
}

export const SOURCES = [
  { id: "manual", label: "Cadastro manual" },
  { id: "csv", label: "Importação CSV" },
  { id: "prospeccao", label: "Prospecção (busca de empresas)" },
  { id: "whatsapp", label: "WhatsApp" },
  { id: "instagram", label: "Instagram" },
  { id: "indicacao", label: "Indicação" },
  { id: "site", label: "Site / formulário" },
  { id: "outro", label: "Outro" },
] as const;

export type SourceId = (typeof SOURCES)[number]["id"];

export function isSourceId(value: unknown): value is SourceId {
  return typeof value === "string" && SOURCES.some((source) => source.id === value);
}

export function sourceLabel(id: string): string {
  return SOURCES.find((source) => source.id === id)?.label ?? id;
}

/** De onde veio a autorização (opt-in) para receber mensagens de marketing. */
export const CONSENT_SOURCES = [
  { id: "formulario", label: "Preencheu formulário / site" },
  { id: "whatsapp", label: "Pediu contato pelo WhatsApp" },
  { id: "cliente", label: "Já é cliente" },
  { id: "presencial", label: "Presencial / evento" },
  { id: "outro", label: "Outro" },
] as const;

export type ConsentSourceId = (typeof CONSENT_SOURCES)[number]["id"];

export function isConsentSourceId(value: unknown): value is ConsentSourceId {
  return typeof value === "string" && CONSENT_SOURCES.some((source) => source.id === value);
}

export function consentSourceLabel(id: string | null): string {
  if (!id) return "—";
  return CONSENT_SOURCES.find((source) => source.id === id)?.label ?? id;
}

export type LeadEventType = "criado" | "etapa" | "nota" | "consentimento" | "editado" | "mensagem";

export type LeadEvent = {
  id: string;
  at: string;
  type: LeadEventType;
  text: string;
};

export type Lead = {
  id: string;
  userId: string;
  name: string;
  company: string;
  /** Telefone no formato E.164 (+5547999991234) ou null. */
  phone: string | null;
  email: string;
  source: SourceId;
  stage: StageId;
  /** Posição dentro da coluna do Kanban (0 = topo). */
  position: number;
  tags: string[];
  notes: string;
  /** Identificador na fonte de origem (ex.: "osm:node/123" na busca de empresas). Serve para não repetir. */
  externalId?: string | null;
  optIn: boolean;
  optInAt: string | null;
  optInSource: ConsentSourceId | null;
  optOut: boolean;
  optOutAt: string | null;
  createdAt: string;
  updatedAt: string;
  lastInteractionAt: string;
  events: LeadEvent[];
};

/** Só o que o quadro Kanban precisa (não envia notas, histórico nem e-mail para o navegador). */
export type KanbanLead = Pick<
  Lead,
  | "id"
  | "name"
  | "company"
  | "phone"
  | "source"
  | "stage"
  | "position"
  | "tags"
  | "optIn"
  | "optOut"
  | "lastInteractionAt"
>;

export function toKanbanLead(lead: Lead): KanbanLead {
  return {
    id: lead.id,
    name: lead.name,
    company: lead.company,
    phone: lead.phone,
    source: lead.source,
    stage: lead.stage,
    position: lead.position,
    tags: lead.tags,
    optIn: lead.optIn,
    optOut: lead.optOut,
    lastInteractionAt: lead.lastInteractionAt,
  };
}

/** Dados que o formulário de edição envia. */
export type UpdateLeadInput = {
  name: string;
  company: string;
  phone: string | null;
  email: string;
  source: SourceId;
  tags: string[];
  notes: string;
};

/** Dados que o formulário de criação envia. */
export type CreateLeadInput = UpdateLeadInput & {
  externalId?: string | null;
  stage: StageId;
  optIn: boolean;
  optInSource: ConsentSourceId | null;
};

export type LeadResult =
  | { ok: true; lead: Lead }
  | { ok: false; error: string; duplicateId?: string };
