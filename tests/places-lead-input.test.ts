import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mockLeadsRepository as repo } from "@/lib/leads/mock-repository";
import { isValidExternalId, placeToLeadInput, sanitizePlace } from "@/lib/places/lead-input";
import type { PlaceResult } from "@/lib/places/types";

const PLACE: PlaceResult = {
  externalId: "osm:node/123",
  name: "Padaria Sol",
  category: "Padaria",
  address: "Rua A, 10 - Centro",
  phones: ["+55 47 3333-4444", "(47) 99999-1234"],
  email: "oi@sol.com",
  website: "https://padariasol.com.br/",
  openingHours: "Mo-Fr 07:00-19:00",
};
const CONTEXT = { term: "padaria", placeLabel: "Joinville, Santa Catarina" };

describe("isValidExternalId", () => {
  it("aceita só ids conhecidos", () => {
    expect(isValidExternalId("osm:node/123")).toBe(true);
    expect(isValidExternalId("osm:way/9")).toBe(true);
    expect(isValidExternalId("mock:abc-1")).toBe(true);
    expect(isValidExternalId("osm:planet/1")).toBe(false);
    expect(isValidExternalId("osm:node/12a")).toBe(false);
    expect(isValidExternalId("<script>")).toBe(false);
    expect(isValidExternalId(42)).toBe(false);
  });
});

describe("sanitizePlace", () => {
  it("aceita uma empresa válida e limpa os campos", () => {
    expect(sanitizePlace({ ...PLACE, name: "  Padaria\n Sol  " })?.name).toBe("Padaria Sol");
  });

  it("recusa lixo, id inválido e nome vazio", () => {
    expect(sanitizePlace(null)).toBeNull();
    expect(sanitizePlace("texto")).toBeNull();
    expect(sanitizePlace({ ...PLACE, externalId: "x" })).toBeNull();
    expect(sanitizePlace({ ...PLACE, name: "   " })).toBeNull();
  });

  it("derruba site com protocolo estranho, e-mail inválido e telefones demais", () => {
    const clean = sanitizePlace({ ...PLACE, website: "javascript:alert(1)", email: "x", phones: ["1", "2", "3", "4", "5", "6"] });
    expect(clean?.website).toBe("");
    expect(clean?.email).toBe("");
    expect(clean?.phones).toHaveLength(4);
  });
});

describe("placeToLeadInput", () => {
  it("cria um lead de Prospecção, SEM autorização, com o primeiro telefone válido", () => {
    const input = placeToLeadInput(PLACE, CONTEXT);
    expect(input.source).toBe("prospeccao");
    expect(input.stage).toBe("prospeccao");
    expect(input.optIn).toBe(false);
    expect(input.optInSource).toBeNull();
    expect(input.phone).toBe("+554733334444");
    expect(input.externalId).toBe("osm:node/123");
    expect(input.tags).toEqual(["Padaria", "Joinville"]);
    expect(input.notes).toContain("Endereço: Rua A, 10 - Centro");
    expect(input.notes).toContain("Site: https://padariasol.com.br/");
    expect(input.notes).toContain("https://www.openstreetmap.org/node/123");
    expect(input.notes).toContain("OpenStreetMap");
  });

  it("sem telefone válido, guarda o original nas notas e deixa o telefone em branco", () => {
    const input = placeToLeadInput({ ...PLACE, phones: ["0800 123"] }, CONTEXT);
    expect(input.phone).toBeNull();
    expect(input.notes).toContain("Telefone no mapa (formato não reconhecido): 0800 123");
  });

  it("dados de simulação dizem que não são reais e usam o termo como tag quando não há tipo", () => {
    const input = placeToLeadInput(
      { ...PLACE, externalId: "mock:abc-1", category: "" },
      { term: "pão quente", placeLabel: "Joinville (simulação)" },
    );
    expect(input.notes).toContain("simulação");
    expect(input.notes).not.toContain("openstreetmap.org");
    expect(input.tags).toEqual(["pão quente", "Joinville"]);
  });
});

describe("adicionar empresas como leads", () => {
  let dir: string;
  let previous: string | undefined;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "prospect-"));
    previous = process.env.DATA_DIR;
    process.env.DATA_DIR = dir;
  });
  afterEach(async () => {
    if (previous === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = previous;
    await rm(dir, { recursive: true, force: true });
  });

  it("entram na coluna Prospecção e a mesma empresa não entra duas vezes", async () => {
    const input = placeToLeadInput(PLACE, CONTEXT);
    const first = await repo.importMany("u1", [input]);
    expect(first.created).toBe(1);

    // Mesma empresa, outro telefone: continua repetida pelo identificador do mapa.
    const again = await repo.importMany("u1", [{ ...input, phone: null }]);
    expect(again.created).toBe(0);
    expect(again.skipped[0].reason).toContain("Esta empresa já está na sua base");

    const [lead] = await repo.list("u1");
    expect(lead.stage).toBe("prospeccao");
    expect(lead.optIn).toBe(false);
    expect(lead.externalId).toBe("osm:node/123");
  });

  it("outra empresa com o mesmo telefone também é barrada", async () => {
    await repo.importMany("u1", [placeToLeadInput(PLACE, CONTEXT)]);
    const other = placeToLeadInput({ ...PLACE, externalId: "osm:node/999", name: "Outra" }, CONTEXT);
    const result = await repo.importMany("u1", [other]);
    expect(result.created).toBe(0);
    expect(result.skipped[0].reason).toContain("telefone");
  });

  it("outra pessoa pode ter a mesma empresa", async () => {
    const input = placeToLeadInput(PLACE, CONTEXT);
    await repo.importMany("u1", [input]);
    expect((await repo.importMany("u2", [input])).created).toBe(1);
  });
});
