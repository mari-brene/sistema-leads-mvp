import { normalizePhone } from "@/lib/phone";
import type { CreateLeadInput } from "@/lib/leads/types";
import type { PlaceResult } from "./types";

/** Transforma uma empresa encontrada em um lead novo, sempre na coluna Prospecção e SEM autorização. */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EXTERNAL_ID = /^(osm:(node|way|relation)\/\d{1,15}|mock:[a-z0-9-]{1,40})$/;

export function isValidExternalId(value: unknown): value is string {
  return typeof value === "string" && EXTERNAL_ID.test(value);
}

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "";
}

/** O navegador manda os dados da empresa de volta; aqui conferimos tudo de novo antes de gravar. */
export function sanitizePlace(raw: unknown): PlaceResult | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Record<string, unknown>;
  if (!isValidExternalId(item.externalId)) return null;

  const name = text(item.name, 120);
  if (!name) return null;

  const phones = Array.isArray(item.phones)
    ? item.phones.map((phone) => text(phone, 40)).filter(Boolean).slice(0, 4)
    : [];

  const email = text(item.email, 160);
  const website = text(item.website, 200);

  return {
    externalId: item.externalId,
    name,
    category: text(item.category, 40),
    address: text(item.address, 200),
    phones,
    email: EMAIL_PATTERN.test(email) ? email : "",
    website: /^https?:\/\//i.test(website) ? website : "",
    openingHours: text(item.openingHours, 120),
  };
}

export const OSM_COPYRIGHT = "© Contribuidores do OpenStreetMap (licença ODbL)";

function sourceLine(externalId: string): string {
  if (externalId.startsWith("osm:")) {
    return `Fonte: OpenStreetMap, https://www.openstreetmap.org/${externalId.slice(4)} ${OSM_COPYRIGHT}.`;
  }
  return "Fonte: simulação (dados de exemplo, não é uma empresa real).";
}

export type LeadContext = {
  /** O que a pessoa digitou na busca. */
  term: string;
  /** Cidade como o mapa entendeu, ex.: "Joinville, Santa Catarina". */
  placeLabel: string;
};

export function placeToLeadInput(place: PlaceResult, context: LeadContext): CreateLeadInput {
  let phone: string | null = null;
  for (const candidate of place.phones) {
    phone = normalizePhone(candidate);
    if (phone) break;
  }

  const city = text(context.placeLabel.replace(/\(simulação\)/i, ""), 60).split(",")[0].trim();
  const tags = [place.category || text(context.term, 30), city].filter(Boolean).map((tag) => tag.slice(0, 30));

  const notes: string[] = [];
  if (place.address) notes.push(`Endereço: ${place.address}`);
  if (place.website) notes.push(`Site: ${place.website}`);
  if (place.openingHours) notes.push(`Horário: ${place.openingHours}`);
  if (!phone && place.phones.length > 0) notes.push(`Telefone no mapa (formato não reconhecido): ${place.phones.join(", ")}`);
  notes.push(sourceLine(place.externalId));

  return {
    name: place.name,
    company: "",
    phone,
    email: place.email,
    source: "prospeccao",
    tags: [...new Set(tags)],
    notes: notes.join("\n").slice(0, 2000),
    stage: "prospeccao",
    optIn: false,
    optInSource: null,
    externalId: place.externalId,
  };
}
