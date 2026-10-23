import { categoryOfTags, findCategory, normalizeText, type Category } from "./categories";
import { MAX_RESULTS, type PlaceResult } from "./types";

/**
 * Peças "puras" da conversa com o OpenStreetMap: montar as perguntas e entender as respostas.
 * Nada aqui acessa a internet, então tudo pode ser testado sem rede.
 */

// ---------- Cidade (Nominatim) ----------

export type NominatimHit = {
  osm_type?: string;
  osm_id?: number;
  class?: string;
  type?: string;
  display_name?: string;
  boundingbox?: string[];
};

export type Area =
  | { kind: "area"; id: number; label: string }
  | { kind: "bbox"; south: number; west: number; north: number; east: number; label: string };

/** "Joinville, Santa Catarina, Região Sul, Brasil" → "Joinville, Santa Catarina". */
export function shortLabel(displayName: string): string {
  const parts = displayName.split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length <= 2) return parts.join(", ");
  const withoutCountry = parts.filter((part) => normalizeText(part) !== "brasil");
  const first = withoutCountry[0] ?? parts[0];
  const state = withoutCountry.find((part, index) => index > 0 && !/regi[aã]o/i.test(part) && !/^\d/.test(part));
  return state ? `${first}, ${state}` : first;
}

/** Escolhe, entre as respostas do Nominatim, a que mais parece uma cidade (de preferência uma "relação" com limites). */
export function pickArea(hits: NominatimHit[]): Area | null {
  const usable = hits.filter((hit) => hit.osm_type && typeof hit.osm_id === "number");
  if (usable.length === 0) return null;

  const isPlace = (hit: NominatimHit) => hit.class === "boundary" || hit.class === "place";
  const best =
    usable.find((hit) => hit.osm_type === "relation" && isPlace(hit)) ??
    usable.find((hit) => isPlace(hit)) ??
    usable[0];

  const label = shortLabel(best.display_name ?? "");

  if (best.osm_type === "relation" && typeof best.osm_id === "number") {
    // No Overpass, a "área" de uma relação tem o número da relação + 3.600.000.000.
    return { kind: "area", id: 3_600_000_000 + best.osm_id, label };
  }

  const box = (best.boundingbox ?? []).map(Number);
  if (box.length === 4 && box.every((n) => Number.isFinite(n))) {
    const [south, north, west, east] = box;
    return { kind: "bbox", south, west, north, east, label };
  }
  return null;
}

// ---------- Pergunta (Overpass) ----------

/**
 * Deixa um texto seguro para ir entre aspas dentro de uma expressão regular do Overpass.
 * Duas camadas: (1) símbolos de regex viram texto comum; (2) barras e aspas são protegidas na linguagem do Overpass.
 */
export function escapeForOverpass(value: string): string {
  return value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .trim();
}

/** Para achar "Padaria" também em "PADARIA" e "padaria" sem depender de maiúsculas. */
function nameRegex(term: string): string {
  return escapeForOverpass(term.trim());
}

export type BuiltQuery = { query: string; matchedBy: "tipo" | "nome"; category: Category | null };

export function buildOverpassQuery(term: string, area: Area): BuiltQuery {
  const category = findCategory(term);
  const scope = area.kind === "area" ? "(area.a)" : `(${area.south},${area.west},${area.north},${area.east})`;

  const lines: string[] = [];
  if (category) {
    for (const [key, value] of category.tags) {
      lines.push(`  nwr["${key}"="${value}"]["name"]${scope};`);
    }
  } else {
    lines.push(`  nwr["name"~"${nameRegex(term)}",i]["shop"]${scope};`);
    lines.push(`  nwr["name"~"${nameRegex(term)}",i]["amenity"]${scope};`);
    lines.push(`  nwr["name"~"${nameRegex(term)}",i]["office"]${scope};`);
    lines.push(`  nwr["name"~"${nameRegex(term)}",i]["craft"]${scope};`);
    lines.push(`  nwr["name"~"${nameRegex(term)}",i]["leisure"]${scope};`);
    lines.push(`  nwr["name"~"${nameRegex(term)}",i]["tourism"]${scope};`);
  }

  const header = area.kind === "area" ? `area(${area.id})->.a;\n` : "";
  const query = `[out:json][timeout:25];\n${header}(\n${lines.join("\n")}\n);\nout center tags ${MAX_RESULTS * 2};`;
  return { query, matchedBy: category ? "tipo" : "nome", category };
}

// ---------- Resposta (Overpass) ----------

export type OverpassElement = {
  type?: string;
  id?: number;
  tags?: Record<string, string>;
};

const EMAIL_PATTERN = /^[^\s@;]+@[^\s@;]+\.[^\s@;]+$/;

function clean(value: string | undefined, max: number): string {
  return (value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function firstOf(tags: Record<string, string>, keys: string[], max: number): string {
  for (const key of keys) {
    const value = clean(tags[key], max);
    if (value) return value.split(";")[0].trim();
  }
  return "";
}

function phonesOf(tags: Record<string, string>): string[] {
  const found: string[] = [];
  for (const key of ["phone", "contact:phone", "mobile", "contact:mobile", "contact:whatsapp", "whatsapp"]) {
    for (const piece of clean(tags[key], 200).split(";")) {
      const phone = piece.trim();
      if (phone && !found.includes(phone)) found.push(phone);
    }
  }
  return found.slice(0, 4);
}

function safeUrl(value: string): string {
  if (!value) return "";
  const withScheme = /^https?:\/\//i.test(value) ? value : `http://${value}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    return url.toString().slice(0, 200);
  } catch {
    return "";
  }
}

function addressOf(tags: Record<string, string>): string {
  const street = clean(tags["addr:street"], 80);
  const number = clean(tags["addr:housenumber"], 12);
  const suburb = clean(tags["addr:suburb"] || tags["addr:neighbourhood"], 60);
  const city = clean(tags["addr:city"], 60);

  const firstPart = street ? (number ? `${street}, ${number}` : street) : "";
  return [firstPart, suburb, city].filter(Boolean).join(" - ");
}

export function parseElements(elements: OverpassElement[]): { results: PlaceResult[]; truncated: boolean } {
  const seen = new Set<string>();
  const results: PlaceResult[] = [];

  for (const element of elements) {
    const tags = element.tags;
    if (!tags || !element.type || typeof element.id !== "number") continue;
    if (!["node", "way", "relation"].includes(element.type)) continue;

    const name = clean(tags.name, 120);
    if (!name) continue;

    const externalId = `osm:${element.type}/${element.id}`;
    if (seen.has(externalId)) continue;
    seen.add(externalId);

    const email = firstOf(tags, ["email", "contact:email"], 160);

    results.push({
      externalId,
      name,
      category: categoryOfTags(tags),
      address: addressOf(tags),
      phones: phonesOf(tags),
      email: EMAIL_PATTERN.test(email) ? email : "",
      website: safeUrl(firstOf(tags, ["website", "contact:website", "url"], 200)),
      openingHours: clean(tags.opening_hours, 120),
    });
  }

  // Quem tem telefone vem primeiro (é quem dá para contatar); depois, ordem alfabética.
  results.sort((a, b) => {
    const phoneDiff = Number(b.phones.length > 0) - Number(a.phones.length > 0);
    return phoneDiff !== 0 ? phoneDiff : a.name.localeCompare(b.name, "pt-BR");
  });

  return { results: results.slice(0, MAX_RESULTS), truncated: results.length > MAX_RESULTS };
}
