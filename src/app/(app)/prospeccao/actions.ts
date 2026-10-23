"use server";

import { revalidatePath } from "next/cache";
import { config } from "@/lib/config";
import { getLeadsRepository } from "@/lib/leads";
import { normalizePhone } from "@/lib/phone";
import { placeToLeadInput, sanitizePlace } from "@/lib/places/lead-input";
import { runSearch } from "@/lib/places/service";
import { MAX_RESULTS, type PlaceResult } from "@/lib/places/types";
import { requireUser } from "@/lib/require-user";

export type FoundPlace = PlaceResult & {
  /** Nome do lead, quando esta empresa já está na base. */
  inBase: string | null;
};

export type SearchActionResult =
  | { ok: false; error: string; remaining: number; limit: number }
  | {
      ok: true;
      provider: "mock" | "osm";
      placeLabel: string;
      matchedBy: "tipo" | "nome";
      truncated: boolean;
      fromCache: boolean;
      remaining: number;
      limit: number;
      results: FoundPlace[];
    };

export type AddActionResult =
  | { ok: false; error: string }
  | { ok: true; created: number; skipped: number; addedIds: string[] };

/** Procura empresas. Cada ida ao OpenStreetMap conta no limite diário. */
export async function searchPlacesAction(term: string, city: string): Promise<SearchActionResult> {
  const user = await requireUser();
  const response = await runSearch(user.id, term, city);
  if (!response.ok) return response;

  const leads = await getLeadsRepository().list(user.id);
  const byExternalId = new Map<string, string>();
  const byPhone = new Map<string, string>();
  for (const lead of leads) {
    if (lead.externalId) byExternalId.set(lead.externalId, lead.name);
    if (lead.phone) byPhone.set(lead.phone, lead.name);
  }

  const results: FoundPlace[] = response.outcome.results.map((place) => {
    let inBase = byExternalId.get(place.externalId) ?? null;
    if (!inBase) {
      for (const raw of place.phones) {
        const phone = normalizePhone(raw);
        const found = phone ? byPhone.get(phone) : undefined;
        if (found) {
          inBase = found;
          break;
        }
      }
    }
    return { ...place, inBase };
  });

  return {
    ok: true,
    provider: config.placesProvider,
    placeLabel: response.outcome.placeLabel,
    matchedBy: response.outcome.matchedBy,
    truncated: response.outcome.truncated,
    fromCache: response.fromCache,
    remaining: response.remaining,
    limit: response.limit,
    results,
  };
}

/** Coloca as empresas escolhidas na coluna Prospecção, sem autorização (opt-in). */
export async function addProspectsAction(
  places: unknown,
  context: { term: string; placeLabel: string },
): Promise<AddActionResult> {
  const user = await requireUser();

  if (!Array.isArray(places) || places.length === 0) {
    return { ok: false, error: "Marque pelo menos uma empresa." };
  }
  if (places.length > MAX_RESULTS) {
    return { ok: false, error: `Escolha no máximo ${MAX_RESULTS} empresas de cada vez.` };
  }

  const term = typeof context?.term === "string" ? context.term.slice(0, 60) : "";
  const placeLabel = typeof context?.placeLabel === "string" ? context.placeLabel.slice(0, 120) : "";

  const clean: PlaceResult[] = [];
  for (const raw of places) {
    const place = sanitizePlace(raw);
    if (place && !clean.some((other) => other.externalId === place.externalId)) clean.push(place);
  }
  if (clean.length === 0) return { ok: false, error: "Não consegui ler as empresas escolhidas. Faça a busca de novo." };

  const inputs = clean.map((place) => placeToLeadInput(place, { term, placeLabel }));
  const result = await getLeadsRepository().importMany(user.id, inputs);

  const skippedIndexes = new Set(result.skipped.map((skip) => skip.index));
  const addedIds = clean.filter((_, index) => !skippedIndexes.has(index)).map((place) => place.externalId);

  revalidatePath("/kanban");
  revalidatePath("/leads");

  return { ok: true, created: result.created, skipped: result.skipped.length, addedIds };
}
