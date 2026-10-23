import { config } from "@/lib/config";
import { findCategory, normalizeText } from "./categories";
import { getPlacesProvider } from "./index";
import { fileSearchStore, type SearchStore } from "./store";
import { MAX_CITY, MAX_TERM, type PlacesProvider, type SearchFound } from "./types";
import { dayKey } from "./usage";

export type SearchResponse =
  | { ok: false; error: string; remaining: number; limit: number }
  | { ok: true; outcome: SearchFound; fromCache: boolean; remaining: number; limit: number };

export type SearchDeps = {
  provider: PlacesProvider;
  store: SearchStore;
  now: () => Date;
  limit: number;
};

function defaults(): SearchDeps {
  return { provider: getPlacesProvider(), store: fileSearchStore, now: () => new Date(), limit: config.searchDailyLimit };
}

function squash(value: string, max: number): string {
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

/** Quantas buscas ainda restam hoje (para mostrar na tela). */
export async function searchesLeft(userId: string, overrides: Partial<SearchDeps> = {}): Promise<{ remaining: number; limit: number }> {
  const deps = { ...defaults(), ...overrides };
  const used = await deps.store.used(userId, dayKey(deps.now()));
  return { remaining: Math.max(0, deps.limit - used), limit: deps.limit };
}

/**
 * Faz uma busca: confere os campos, usa a resposta guardada se a busca já foi feita hoje (não gasta o limite),
 * senão separa uma busca do limite diário e pergunta ao provedor.
 * Todas as idas ao OpenStreetMap contam no limite, inclusive as que dão erro (o servidor deles trabalhou do mesmo jeito).
 */
export async function runSearch(
  userId: string,
  rawTerm: unknown,
  rawCity: unknown,
  overrides: Partial<SearchDeps> = {},
): Promise<SearchResponse> {
  const deps = { ...defaults(), ...overrides };
  const today = dayKey(deps.now());
  const left = async () => Math.max(0, deps.limit - (await deps.store.used(userId, today)));
  const fail = async (error: string): Promise<SearchResponse> => ({
    ok: false,
    error,
    remaining: await left(),
    limit: deps.limit,
  });

  const term = squash(typeof rawTerm === "string" ? rawTerm : "", MAX_TERM);
  const city = squash(typeof rawCity === "string" ? rawCity : "", MAX_CITY);

  if (term.length < 2) return fail("Digite o que você quer procurar, por exemplo: padaria.");
  if (city.length < 2) return fail("Digite a cidade, por exemplo: Joinville, SC.");

  // "padaria", "Padarias" e "panificadora" são o mesmo tipo de negócio: usam a mesma busca guardada.
  const termKey = findCategory(term)?.id ?? normalizeText(term);
  const key = `${deps.provider.id}|${termKey}|${normalizeText(city)}`;
  const nowMs = deps.now().getTime();

  const cached = await deps.store.getCached(key, nowMs);
  if (cached) return { ok: true, outcome: cached, fromCache: true, remaining: await left(), limit: deps.limit };

  const slot = await deps.store.reserve(userId, today, deps.limit);
  if (!slot.ok) {
    return fail(`Você já fez as ${deps.limit} buscas de hoje. O limite volta amanhã (horário de Brasília).`);
  }

  const outcome = await deps.provider.search({ term, city });
  if (!outcome.ok) return fail(outcome.error);

  await deps.store.putCached(key, outcome, nowMs);
  return { ok: true, outcome, fromCache: false, remaining: await left(), limit: deps.limit };
}
