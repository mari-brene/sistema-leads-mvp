import { findCategory, normalizeText } from "./categories";
import type { PlaceResult, PlacesProvider, SearchOutcome, SearchQuery } from "./types";

/**
 * Busca de SIMULAÇÃO: inventa empresas de exemplo, sempre as mesmas para o mesmo termo e cidade.
 * Serve para testar a tela sem internet. Nada disso existe de verdade.
 */

const SUFFIXES = [
  "Central", "Bom Sabor", "do Bairro", "Estrela", "Nova Era", "Premium", "da Praça", "Sol Nascente",
  "Express", "Família", "Ouro Verde", "Vitória",
];
const STREETS = ["Rua das Flores", "Avenida Brasil", "Rua XV de Novembro", "Rua Sete de Setembro", "Avenida Central"];
const SUBURBS = ["Centro", "Jardim América", "Bela Vista", "Vila Nova"];

function hash(text: string): number {
  let value = 2166136261;
  for (const char of text) {
    value ^= char.charCodeAt(0);
    value = Math.imul(value, 16777619) >>> 0;
  }
  return value;
}

function titleCase(text: string): string {
  return text.replace(/\b\p{L}/gu, (letter) => letter.toUpperCase());
}

export const mockProvider: PlacesProvider = {
  id: "mock",

  async search({ term, city }: SearchQuery): Promise<SearchOutcome> {
    const key = normalizeText(`${term}|${city}`);
    const category = findCategory(term);
    const base = category ? category.label : titleCase(term.trim());
    const seed = hash(key);
    const slug = hash(key).toString(36);

    const results: PlaceResult[] = SUFFIXES.map((suffix, index) => {
      const n = (seed + index * 7919) >>> 0;
      const hasPhone = index % 4 !== 3; // 1 em cada 4 sem telefone
      const phones: string[] = [];
      if (hasPhone) {
        // Alterna fixo e celular, com DDD 47.
        const tail = String(1000 + (n % 9000));
        phones.push(index % 2 === 0 ? `(47) 3${(n % 900) + 100}-${tail}` : `(47) 9${8000 + (n % 1999)}-${tail}`);
      }
      return {
        externalId: `mock:${slug}-${index + 1}`,
        name: `${base} ${suffix}`,
        category: category?.label ?? "",
        address: `${STREETS[n % STREETS.length]}, ${100 + (n % 800)} - ${SUBURBS[n % SUBURBS.length]}`,
        phones,
        email: index % 3 === 0 ? `contato${index + 1}@exemplo.com.br` : "",
        website: index % 2 === 0 ? `https://www.exemplo-${index + 1}.com.br` : "",
        openingHours: index % 2 === 0 ? "Mo-Fr 08:00-18:00" : "",
      };
    });

    return {
      ok: true,
      placeLabel: `${titleCase(city.trim())} (simulação)`,
      results,
      truncated: false,
      matchedBy: category ? "tipo" : "nome",
    };
  },
};
