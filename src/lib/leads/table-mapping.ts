import type { Lead } from "./types";

/** Uma linha da tabela "leads" do Supabase (nomes das colunas em snake_case). */
export type LeadRow = {
  id: string;
  client_id: string;
  name: string;
  company: string;
  phone: string | null;
  email: string;
  source: string;
  stage: string;
  position: number;
  tags: string[];
  notes: string;
  external_id: string | null;
  opt_in: boolean;
  opt_in_at: string | null;
  opt_in_source: string | null;
  opt_out: boolean;
  opt_out_at: string | null;
  created_at: string;
  updated_at: string;
  last_interaction_at: string;
  events: Lead["events"];
};

/** No sistema, Lead.userId guarda o id do CLIENTE dono (veja lib/tenancy). */
export function leadToRow(lead: Lead): LeadRow {
  return {
    id: lead.id,
    client_id: lead.userId,
    name: lead.name,
    company: lead.company,
    phone: lead.phone,
    email: lead.email,
    source: lead.source,
    stage: lead.stage,
    position: lead.position,
    tags: lead.tags,
    notes: lead.notes,
    external_id: lead.externalId ?? null,
    opt_in: lead.optIn,
    opt_in_at: lead.optInAt,
    opt_in_source: lead.optInSource,
    opt_out: lead.optOut,
    opt_out_at: lead.optOutAt,
    created_at: lead.createdAt,
    updated_at: lead.updatedAt,
    last_interaction_at: lead.lastInteractionAt,
    events: lead.events,
  };
}

export function rowToLead(row: LeadRow): Lead {
  return {
    id: row.id,
    userId: row.client_id,
    name: row.name,
    company: row.company,
    phone: row.phone,
    email: row.email,
    source: row.source as Lead["source"],
    stage: row.stage as Lead["stage"],
    position: row.position,
    tags: row.tags ?? [],
    notes: row.notes,
    externalId: row.external_id,
    optIn: row.opt_in,
    optInAt: row.opt_in_at,
    optInSource: row.opt_in_source as Lead["optInSource"],
    optOut: row.opt_out,
    optOutAt: row.opt_out_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastInteractionAt: row.last_interaction_at,
    events: row.events ?? [],
  };
}
