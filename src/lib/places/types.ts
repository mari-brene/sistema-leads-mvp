/**
 * Tipos da busca de empresas.
 * Arquivo "puro" (sem fs), então também pode ser usado nas telas do navegador.
 */

export const MAX_TERM = 60;
export const MAX_CITY = 80;
export const MAX_RESULTS = 60;

/** Uma empresa encontrada. Tudo aqui vem de dados públicos do OpenStreetMap. */
export type PlaceResult = {
  /** Identificador estável, ex.: "osm:node/123456". Evita adicionar a mesma empresa duas vezes. */
  externalId: string;
  name: string;
  /** Tipo de negócio em português ("Padaria"), quando conhecido. */
  category: string;
  /** Endereço em uma linha, quando o mapa tem. */
  address: string;
  /** Telefones como estão no mapa (podem estar em qualquer formato). */
  phones: string[];
  email: string;
  website: string;
  openingHours: string;
};

export type SearchQuery = { term: string; city: string };

export type SearchFound = {
  ok: true;
  /** Nome da cidade como o mapa entendeu (para a pessoa conferir). */
  placeLabel: string;
  results: PlaceResult[];
  /** true quando a lista foi cortada em MAX_RESULTS. */
  truncated: boolean;
  /** "tipo" quando o termo virou um tipo de negócio conhecido; "nome" quando foi procurado no nome. */
  matchedBy: "tipo" | "nome";
};

export type SearchFailed = { ok: false; error: string };

export type SearchOutcome = SearchFound | SearchFailed;

export interface PlacesProvider {
  readonly id: "mock" | "osm";
  search(query: SearchQuery): Promise<SearchOutcome>;
}
