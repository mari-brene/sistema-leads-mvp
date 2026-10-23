import { config } from "@/lib/config";
import { mockProvider } from "./mock-provider";
import { createOsmProvider } from "./osm-provider";
import type { PlacesProvider } from "./types";

export type { PlaceResult, PlacesProvider, SearchOutcome, SearchQuery } from "./types";

/**
 * Escolhe quem responde às buscas: simulação (padrão) ou OpenStreetMap de verdade.
 * Diferente das outras peças, a busca real é grátis e não precisa de chave,
 * então ela tem a própria chave de ligar: PLACES_PROVIDER=osm no arquivo .env.local.
 */
export function getPlacesProvider(): PlacesProvider {
  return config.placesProvider === "osm" ? createOsmProvider() : mockProvider;
}
