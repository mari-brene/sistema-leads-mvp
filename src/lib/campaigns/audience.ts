import type { Lead, StageId } from "@/lib/leads/types";

/**
 * Quem pode receber uma campanha de marketing.
 * Regras de conformidade: precisa ter autorização (opt-in), não pode ter pedido para sair,
 * precisa ter telefone, e quem está em "Prospecção" NUNCA entra.
 */

export type AudienceReport = {
  /** Leads nas etapas escolhidas (e com a tag, se houver). */
  considered: number;
  eligible: Lead[];
  excluded: { semOptIn: number; optOut: number; semTelefone: number };
};

/** Etapas que podem ser escolhidas para uma campanha (Prospecção fica de fora de propósito). */
export const CAMPAIGN_STAGES: StageId[] = ["novo", "contatado", "respondeu", "reuniao", "fechado"];

export function selectAudience(leads: Lead[], stages: StageId[], tag: string): AudienceReport {
  const wanted = new Set<StageId>(stages.filter((stage) => stage !== "prospeccao"));
  const cleanTag = tag.trim().toLowerCase();

  const considered = leads.filter(
    (lead) =>
      wanted.has(lead.stage) && (!cleanTag || lead.tags.some((item) => item.trim().toLowerCase() === cleanTag)),
  );

  const report: AudienceReport = {
    considered: considered.length,
    eligible: [],
    excluded: { semOptIn: 0, optOut: 0, semTelefone: 0 },
  };

  for (const lead of considered) {
    if (lead.optOut) report.excluded.optOut += 1;
    else if (!lead.optIn) report.excluded.semOptIn += 1;
    else if (!lead.phone) report.excluded.semTelefone += 1;
    else report.eligible.push(lead);
  }

  report.eligible.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.name.localeCompare(b.name, "pt-BR"));
  return report;
}
