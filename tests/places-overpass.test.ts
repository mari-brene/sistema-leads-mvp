import { describe, expect, it } from "vitest";
import {
  buildOverpassQuery,
  escapeForOverpass,
  parseElements,
  pickArea,
  shortLabel,
  type Area,
  type OverpassElement,
} from "@/lib/places/overpass";

const AREA: Area = { kind: "area", id: 3_600_000_000 + 297_000, label: "Joinville" };

describe("shortLabel", () => {
  it("deixa só cidade e estado", () => {
    expect(shortLabel("Joinville, Região Geográfica Imediata de Joinville, Santa Catarina, Região Sul, Brasil")).toBe(
      "Joinville, Santa Catarina",
    );
    expect(shortLabel("Joinville")).toBe("Joinville");
  });
});

describe("pickArea", () => {
  it("prefere uma relação de limite administrativo e soma 3.600.000.000 ao número", () => {
    const area = pickArea([
      { osm_type: "node", osm_id: 5, class: "place", type: "suburb", display_name: "Centro, Joinville" },
      { osm_type: "relation", osm_id: 297, class: "boundary", display_name: "Joinville, Santa Catarina, Brasil" },
    ]);
    expect(area).toEqual({ kind: "area", id: 3_600_000_297, label: "Joinville, Santa Catarina" });
  });

  it("usa a caixa de coordenadas quando não há relação", () => {
    const area = pickArea([
      {
        osm_type: "node",
        osm_id: 9,
        class: "place",
        display_name: "Vila Pequena, Paraná, Brasil",
        boundingbox: ["-25.5", "-25.4", "-49.3", "-49.2"],
      },
    ]);
    expect(area).toEqual({ kind: "bbox", south: -25.5, north: -25.4, west: -49.3, east: -49.2, label: "Vila Pequena, Paraná" });
  });

  it("devolve null quando nada serve", () => {
    expect(pickArea([])).toBeNull();
    expect(pickArea([{ display_name: "sem id" }])).toBeNull();
    expect(pickArea([{ osm_type: "node", osm_id: 1, display_name: "sem caixa" }])).toBeNull();
  });
});

describe("escapeForOverpass", () => {
  it("protege aspas, barras e símbolos de regex", () => {
    expect(escapeForOverpass('Padaria "Zé"')).toBe('Padaria \\"Zé\\"');
    expect(escapeForOverpass("a.b")).toBe("a\\\\.b");
    expect(escapeForOverpass("a\\b")).toBe("a\\\\\\\\b");
    expect(escapeForOverpass("(x|y)*")).toBe("\\\\(x\\\\|y\\\\)\\\\*");
  });

  it("troca caracteres de controle por espaço", () => {
    expect(escapeForOverpass("a\nb\u0000c")).toBe("a b c");
  });

  it("um termo malicioso não consegue fechar a aspa e injetar comandos", () => {
    const { query } = buildOverpassQuery('x"]; out; node["a', AREA);
    // Toda aspa que veio do termo está precedida de barra: sobra só a estrutura normal da consulta.
    const unescapedQuotes = query.match(/(^|[^\\])"/g) ?? [];
    const structural = query.replace(/\\"/g, "");
    expect(structural).not.toContain('x"]');
    expect(unescapedQuotes.length % 2).toBe(0);
  });
});

describe("buildOverpassQuery", () => {
  it("usa as etiquetas do tipo de negócio e a área da cidade", () => {
    const built = buildOverpassQuery("padaria", AREA);
    expect(built.matchedBy).toBe("tipo");
    expect(built.query).toContain("area(3600297000)->.a;");
    expect(built.query).toContain('nwr["shop"="bakery"]["name"](area.a);');
    expect(built.query).toContain('nwr["shop"="pastry"]["name"](area.a);');
    expect(built.query).toContain("out center tags 120;");
  });

  it("procura no nome quando o termo não é um tipo conhecido", () => {
    const built = buildOverpassQuery("Pão Quente", AREA);
    expect(built.matchedBy).toBe("nome");
    expect(built.query).toContain('["name"~"Pão Quente",i]["shop"](area.a);');
  });

  it("usa a caixa de coordenadas quando a cidade não tem área", () => {
    const built = buildOverpassQuery("dentista", { kind: "bbox", south: 1, west: 2, north: 3, east: 4, label: "X" });
    expect(built.query).toContain('["amenity"="dentist"]["name"](1,2,3,4);');
    expect(built.query).not.toContain("area(");
  });
});

describe("parseElements", () => {
  const elements: OverpassElement[] = [
    { type: "node", id: 1, tags: { name: "Padaria Sol", shop: "bakery", phone: "+55 47 3333-4444; (47) 99999-1234", "addr:street": "Rua A", "addr:housenumber": "10", "addr:suburb": "Centro", website: "padariasol.com.br", email: "oi@sol.com", opening_hours: "Mo-Fr 07:00-19:00" } },
    { type: "way", id: 2, tags: { name: "Pão e Cia", shop: "bakery" } },
    { type: "node", id: 3, tags: { shop: "bakery" } },
    { type: "node", id: 1, tags: { name: "Padaria Sol", shop: "bakery" } },
    { type: "node", id: 4, tags: { name: "Padaria Lua", shop: "bakery", phone: "4733335555", website: "javascript:alert(1)", email: "nao e email" } },
    { type: "area", id: 5, tags: { name: "Ignorado" } },
  ];

  it("lê nome, tipo, endereço, telefones, site, e-mail e horário", () => {
    const { results } = parseElements(elements);
    const sol = results.find((r) => r.externalId === "osm:node/1");
    expect(sol).toEqual({
      externalId: "osm:node/1",
      name: "Padaria Sol",
      category: "Padaria",
      address: "Rua A, 10 - Centro",
      phones: ["+55 47 3333-4444", "(47) 99999-1234"],
      email: "oi@sol.com",
      website: "http://padariasol.com.br/",
      openingHours: "Mo-Fr 07:00-19:00",
    });
  });

  it("descarta sem nome, repetidos e tipos estranhos", () => {
    const { results } = parseElements(elements);
    expect(results.map((r) => r.externalId).sort()).toEqual(["osm:node/1", "osm:node/4", "osm:way/2"]);
  });

  it("rejeita site com protocolo perigoso e e-mail inválido", () => {
    const lua = parseElements(elements).results.find((r) => r.externalId === "osm:node/4");
    expect(lua?.website).toBe("");
    expect(lua?.email).toBe("");
  });

  it("coloca quem tem telefone primeiro", () => {
    const { results } = parseElements(elements);
    expect(results[results.length - 1].name).toBe("Pão e Cia");
  });

  it("corta em 60 e avisa que cortou", () => {
    const many = Array.from({ length: 75 }, (_, i) => ({ type: "node", id: i + 1, tags: { name: `Loja ${i}` } }));
    const { results, truncated } = parseElements(many);
    expect(results).toHaveLength(60);
    expect(truncated).toBe(true);
    expect(parseElements(many.slice(0, 60)).truncated).toBe(false);
  });
});
