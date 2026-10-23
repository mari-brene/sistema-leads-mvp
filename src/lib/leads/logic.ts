import { END_OF_COLUMN, moveLead, renumberColumn, columnOf } from "./ordering";
import {
  consentSourceLabel,
  isConsentSourceId,
  isStageId,
  sourceLabel,
  stageInfo,
  type CreateLeadInput,
  type Lead,
  type LeadEvent,
  type LeadEventType,
  type UpdateLeadInput,
} from "./types";

/**
 * Regras de negócio dos leads, escritas como funções "puras":
 * recebem a lista de leads de UMA pessoa e devolvem a lista nova.
 * Quem grava (arquivo local agora, Supabase depois) fica em outro lugar.
 */

export type Ctx = {
  /** Data/hora atual em ISO (ex.: 2026-10-08T17:30:00.000Z). */
  now: string;
  newId: () => string;
};

export type Op =
  | { ok: true; leads: Lead[]; lead: Lead }
  | { ok: false; error: string; duplicateId?: string };

const NOT_FOUND = "Lead não encontrado.";
const MAX_NOTE = 2000;

function makeEvent(ctx: Ctx, type: LeadEventType, text: string): LeadEvent {
  return { id: ctx.newId(), at: ctx.now, type, text };
}

function replaceLead(leads: Lead[], updated: Lead): Lead[] {
  return leads.map((lead) => (lead.id === updated.id ? updated : lead));
}

function findDuplicate(leads: Lead[], phone: string | null, exceptId?: string): Lead | undefined {
  if (!phone) return undefined;
  return leads.find((lead) => lead.phone === phone && lead.id !== exceptId);
}

function duplicateError(duplicate: Lead): Op {
  return {
    ok: false,
    error: `Já existe um lead com este telefone: ${duplicate.name}.`,
    duplicateId: duplicate.id,
  };
}

// ---------- Criar ----------

export function createLead(leads: Lead[], userId: string, input: CreateLeadInput, ctx: Ctx): Op {
  if (!input.name.trim()) return { ok: false, error: "Digite o nome do lead." };

  const duplicate = findDuplicate(leads, input.phone);
  if (duplicate) return duplicateError(duplicate);

  const externalId = input.externalId || null;
  if (externalId) {
    const same = leads.find((lead) => lead.externalId === externalId);
    if (same) {
      return { ok: false, error: `Esta empresa já está na sua base: ${same.name}.`, duplicateId: same.id };
    }
  }

  if (input.optIn) {
    if (!input.phone) {
      return { ok: false, error: "Para registrar a autorização (opt-in), informe o telefone." };
    }
    if (!input.optInSource) {
      return { ok: false, error: "Informe de onde veio a autorização (opt-in)." };
    }
  }

  // Regra de conformidade: leads vindos de busca de empresas sempre entram em "Prospecção".
  const stage = input.source === "prospeccao" ? "prospeccao" : input.stage;

  const events: LeadEvent[] = [
    makeEvent(ctx, "criado", `Lead criado (origem: ${sourceLabel(input.source)}).`),
  ];
  if (input.optIn && input.optInSource) {
    events.push(
      makeEvent(
        ctx,
        "consentimento",
        `Autorização de marketing registrada (${consentSourceLabel(input.optInSource)}).`,
      ),
    );
  }

  const lead: Lead = {
    id: ctx.newId(),
    userId,
    name: input.name.trim(),
    company: input.company,
    phone: input.phone,
    email: input.email,
    source: input.source,
    stage,
    position: columnOf(leads, stage).length,
    tags: input.tags,
    notes: input.notes,
    externalId,
    optIn: input.optIn,
    optInAt: input.optIn ? ctx.now : null,
    optInSource: input.optIn ? input.optInSource : null,
    optOut: false,
    optOutAt: null,
    createdAt: ctx.now,
    updatedAt: ctx.now,
    lastInteractionAt: ctx.now,
    events,
  };

  return { ok: true, leads: [...leads, lead], lead };
}

// ---------- Editar ----------

const FIELD_LABELS: Record<keyof UpdateLeadInput, string> = {
  name: "nome",
  company: "empresa",
  phone: "telefone",
  email: "e-mail",
  source: "origem",
  tags: "tags",
  notes: "observações",
};

function sameValue(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) return a.join("\u0000") === b.join("\u0000");
  return a === b;
}

export function updateLead(leads: Lead[], id: string, input: UpdateLeadInput, ctx: Ctx): Op {
  const current = leads.find((lead) => lead.id === id);
  if (!current) return { ok: false, error: NOT_FOUND };
  if (!input.name.trim()) return { ok: false, error: "Digite o nome do lead." };

  const duplicate = findDuplicate(leads, input.phone, id);
  if (duplicate) return duplicateError(duplicate);

  const changed = (Object.keys(FIELD_LABELS) as Array<keyof UpdateLeadInput>).filter(
    (field) => !sameValue(current[field], field === "name" ? input.name.trim() : input[field]),
  );
  if (changed.length === 0) return { ok: true, leads, lead: current };

  const events: LeadEvent[] = [
    ...current.events,
    makeEvent(ctx, "editado", `Dados atualizados: ${changed.map((f) => FIELD_LABELS[f]).join(", ")}.`),
  ];

  let updated: Lead = {
    ...current,
    name: input.name.trim(),
    company: input.company,
    phone: input.phone,
    email: input.email,
    source: input.source,
    tags: input.tags,
    notes: input.notes,
    updatedAt: ctx.now,
    events,
  };

  // A autorização vale para aquele número. Se o telefone mudou, ela precisa ser registrada de novo.
  if (changed.includes("phone") && current.optIn) {
    updated = {
      ...updated,
      optIn: false,
      optInAt: null,
      optInSource: null,
      events: [
        ...events,
        makeEvent(
          ctx,
          "consentimento",
          "Telefone alterado: a autorização (opt-in) foi removida e precisa ser registrada de novo.",
        ),
      ],
    };
  }

  return { ok: true, leads: replaceLead(leads, updated), lead: updated };
}

// ---------- Mover no Kanban ----------

export function moveLeadOp(leads: Lead[], id: string, stage: string, index: number, ctx: Ctx): Op {
  if (!isStageId(stage)) return { ok: false, error: "Etapa inválida." };

  const current = leads.find((lead) => lead.id === id);
  if (!current) return { ok: false, error: NOT_FOUND };

  const moved = moveLead(leads, id, stage, index);
  if (!moved) return { ok: false, error: NOT_FOUND };

  if (current.stage === stage) {
    // Só reordenou dentro da mesma coluna: não conta como interação.
    return { ok: true, leads: moved, lead: moved.find((lead) => lead.id === id) as Lead };
  }

  const withEvent = moved.map((lead) =>
    lead.id === id
      ? {
          ...lead,
          updatedAt: ctx.now,
          lastInteractionAt: ctx.now,
          events: [
            ...lead.events,
            makeEvent(
              ctx,
              "etapa",
              `Movido de "${stageInfo(current.stage).label}" para "${stageInfo(stage).label}".`,
            ),
          ],
        }
      : lead,
  );

  return { ok: true, leads: withEvent, lead: withEvent.find((lead) => lead.id === id) as Lead };
}

// ---------- Notas ----------

export function addNote(leads: Lead[], id: string, text: string, ctx: Ctx): Op {
  const current = leads.find((lead) => lead.id === id);
  if (!current) return { ok: false, error: NOT_FOUND };

  const clean = text.trim();
  if (!clean) return { ok: false, error: "Escreva a nota antes de salvar." };
  if (clean.length > MAX_NOTE) {
    return { ok: false, error: `A nota pode ter no máximo ${MAX_NOTE} caracteres.` };
  }

  const updated: Lead = {
    ...current,
    updatedAt: ctx.now,
    lastInteractionAt: ctx.now,
    events: [...current.events, makeEvent(ctx, "nota", clean)],
  };
  return { ok: true, leads: replaceLead(leads, updated), lead: updated };
}

// ---------- Consentimento (opt-in / opt-out) ----------

export function registerOptIn(leads: Lead[], id: string, source: string, ctx: Ctx): Op {
  const current = leads.find((lead) => lead.id === id);
  if (!current) return { ok: false, error: NOT_FOUND };

  if (current.optOut) {
    return {
      ok: false,
      error: "Este contato pediu para sair e não pode mais receber marketing.",
    };
  }
  if (!isConsentSourceId(source)) {
    return { ok: false, error: "Escolha de onde veio a autorização." };
  }
  if (!current.phone) {
    return { ok: false, error: "Cadastre um telefone antes de registrar a autorização." };
  }
  if (current.optIn) return { ok: true, leads, lead: current };

  const updated: Lead = {
    ...current,
    optIn: true,
    optInAt: ctx.now,
    optInSource: source,
    updatedAt: ctx.now,
    events: [
      ...current.events,
      makeEvent(ctx, "consentimento", `Autorização de marketing registrada (${consentSourceLabel(source)}).`),
    ],
  };
  return { ok: true, leads: replaceLead(leads, updated), lead: updated };
}

export function registerOptOut(leads: Lead[], id: string, ctx: Ctx): Op {
  const current = leads.find((lead) => lead.id === id);
  if (!current) return { ok: false, error: NOT_FOUND };
  if (current.optOut) return { ok: true, leads, lead: current };

  const updated: Lead = {
    ...current,
    optIn: false,
    optOut: true,
    optOutAt: ctx.now,
    updatedAt: ctx.now,
    events: [
      ...current.events,
      makeEvent(ctx, "consentimento", "Contato saiu da lista de marketing (opt-out). Nenhum envio será feito."),
    ],
  };
  return { ok: true, leads: replaceLead(leads, updated), lead: updated };
}

// ---------- Importar vários de uma vez (CSV) ----------

export type ImportSkip = {
  /** Posição do item na lista enviada (0 = primeiro). */
  index: number;
  reason: string;
};

export type ImportOp = {
  leads: Lead[];
  created: number;
  skipped: ImportSkip[];
};

/**
 * Cria vários leads em sequência. Cada um passa pelas mesmas regras de createLead
 * (nome obrigatório, telefone repetido, opt-in com origem). Quem não passar é pulado, e o resto entra.
 */
export function importLeads(leads: Lead[], userId: string, inputs: CreateLeadInput[], ctx: Ctx): ImportOp {
  let current = leads;
  let created = 0;
  const skipped: ImportSkip[] = [];

  inputs.forEach((input, index) => {
    const result = createLead(current, userId, input, ctx);
    if (result.ok) {
      current = result.leads;
      created += 1;
    } else {
      skipped.push({ index, reason: result.error });
    }
  });

  return { leads: current, created, skipped };
}

// ---------- Excluir ----------

export function removeLead(leads: Lead[], id: string): Op {
  const current = leads.find((lead) => lead.id === id);
  if (!current) return { ok: false, error: NOT_FOUND };

  const rest = leads.filter((lead) => lead.id !== id);
  return { ok: true, leads: renumberColumn(rest, current.stage), lead: current };
}


// ---------- Mensagem de campanha enviada ----------

/**
 * Registra no histórico que uma mensagem de campanha foi enviada.
 * Quem estava em "Novo" passa para "Contatado" (a primeira abordagem foi feita).
 */
export function recordCampaignMessage(leads: Lead[], id: string, text: string, ctx: Ctx): Op {
  const current = leads.find((lead) => lead.id === id);
  if (!current) return { ok: false, error: NOT_FOUND };

  let working = leads;
  if (current.stage === "novo") {
    const moved = moveLeadOp(leads, id, "contatado", END_OF_COLUMN, ctx);
    if (moved.ok) working = moved.leads;
  }

  const base = working.find((lead) => lead.id === id) as Lead;
  const updated: Lead = {
    ...base,
    updatedAt: ctx.now,
    lastInteractionAt: ctx.now,
    events: [...base.events, makeEvent(ctx, "mensagem", text.slice(0, 300))],
  };
  return { ok: true, leads: replaceLead(working, updated), lead: updated };
}

/**
 * Anota no histórico que o contato ENVIOU uma mensagem (caixa de entrada).
 * Se o lead estava em Novo ou Contatado, vai para Respondeu.
 */
export function recordInboundMessage(leads: Lead[], id: string, text: string, ctx: Ctx): Op {
  const current = leads.find((lead) => lead.id === id);
  if (!current) return { ok: false, error: NOT_FOUND };

  let working = leads;
  if (current.stage === "novo" || current.stage === "contatado") {
    const moved = moveLeadOp(leads, id, "respondeu", END_OF_COLUMN, ctx);
    if (moved.ok) working = moved.leads;
  }

  const base = working.find((lead) => lead.id === id) as Lead;
  const updated: Lead = {
    ...base,
    updatedAt: ctx.now,
    lastInteractionAt: ctx.now,
    events: [...base.events, makeEvent(ctx, "mensagem", `Mensagem recebida: ${text.slice(0, 280)}`)],
  };
  return { ok: true, leads: replaceLead(working, updated), lead: updated };
}
