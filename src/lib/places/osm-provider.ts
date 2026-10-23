import { config } from "@/lib/config";
import { buildOverpassQuery, parseElements, pickArea, type NominatimHit, type OverpassElement } from "./overpass";
import type { PlacesProvider, SearchOutcome, SearchQuery } from "./types";

/**
 * Busca de verdade no OpenStreetMap (grátis, sem chave e sem cartão):
 *  1) Nominatim descobre onde fica a cidade;
 *  2) Overpass lista as empresas daquele tipo dentro da cidade.
 * Regras de boa vizinhança dos servidores públicos: identificar o app (User-Agent),
 * poucas buscas, sem repetir a mesma busca (o cache fica em service.ts).
 */

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const OVERPASS_URLS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];
const TIMEOUT_MS = 30_000;

type FetchLike = typeof fetch;

const BUSY = "O servidor gratuito do OpenStreetMap está ocupado agora. Espere alguns minutos e tente de novo.";

async function fetchWithTimeout(fetchFn: FetchLike, url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetchFn(url, { ...init, signal: controller.signal, cache: "no-store" });
  } finally {
    clearTimeout(timer);
  }
}

export function createOsmProvider(fetchFn: FetchLike = fetch): PlacesProvider {
  async function search({ term, city }: SearchQuery): Promise<SearchOutcome> {
    const headers = { "User-Agent": config.osmUserAgent, "Accept-Language": "pt-BR" };

    // 1) A cidade
    let hits: NominatimHit[];
    try {
      const url = `${NOMINATIM_URL}?${new URLSearchParams({
        q: city,
        format: "jsonv2",
        limit: "5",
        countrycodes: "br",
      }).toString()}`;
      const response = await fetchWithTimeout(fetchFn, url, { headers });
      if (!response.ok) return { ok: false, error: BUSY };
      const data: unknown = await response.json();
      hits = Array.isArray(data) ? (data as NominatimHit[]) : [];
    } catch {
      return { ok: false, error: "Não consegui falar com o OpenStreetMap. Confira sua internet e tente de novo." };
    }

    const area = pickArea(hits);
    if (!area) {
      return {
        ok: false,
        error: `Não encontrei a cidade "${city}". Tente escrever a cidade e o estado, por exemplo: Joinville, SC.`,
      };
    }

    // 2) As empresas
    const built = buildOverpassQuery(term, area);
    let elements: OverpassElement[] | null = null;

    for (const endpoint of OVERPASS_URLS) {
      try {
        const response = await fetchWithTimeout(fetchFn, endpoint, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ data: built.query }).toString(),
        });
        if (!response.ok) continue; // 429/504: tenta o servidor reserva
        const data = (await response.json()) as { elements?: OverpassElement[] };
        elements = Array.isArray(data.elements) ? data.elements : [];
        break;
      } catch {
        // tenta o próximo servidor
      }
    }

    if (!elements) return { ok: false, error: BUSY };

    const { results, truncated } = parseElements(elements);
    return { ok: true, placeLabel: area.label, results, truncated, matchedBy: built.matchedBy };
  }

  return { id: "osm", search };
}
