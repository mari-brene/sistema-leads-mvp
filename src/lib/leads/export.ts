import { toCsv } from "@/lib/csv";
import { consentSourceLabel, sourceLabel, stageInfo, type Lead } from "./types";

export const EXPORT_HEADER = ["Nome", "Empresa", "Telefone (com DDI, só números)", "E-mail", "Etapa", "Origem", "Etiquetas", "Opt-in", "Data do opt-in", "Origem do opt-in", "Saiu (opt-out)", "Criado em", "Última interação", "Notas"];

const yesNo = (value: boolean) => (value ? "Sim" : "Não");

/** CSV dos leads de UM cliente, pronto para o Excel brasileiro (separador ";", acentos certos, sem fórmulas perigosas). */
export function leadsToCsv(leads: Lead[]): string {
  const rows = leads.map((lead) => [
    lead.name,
    lead.company,
    (lead.phone ?? "").replace(/\D/g, ""),
    lead.email,
    stageInfo(lead.stage).label,
    sourceLabel(lead.source),
    lead.tags.join(", "),
    yesNo(lead.optIn),
    lead.optInAt ?? "",
    consentSourceLabel(lead.optInSource),
    yesNo(lead.optOut),
    lead.createdAt,
    lead.lastInteractionAt,
    lead.notes,
  ]);
  return toCsv([EXPORT_HEADER, ...rows]);
}
