import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mockProvider } from "@/lib/places/mock-provider";
import { runSearch, searchesLeft, type SearchDeps } from "@/lib/places/service";
import { fileSearchStore } from "@/lib/places/store";
import type { PlacesProvider } from "@/lib/places/types";
import { dayKey, remainingToday, usedToday } from "@/lib/places/usage";

let dir: string;
let previous: string | undefined;

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "places-"));
  previous = process.env.DATA_DIR;
  process.env.DATA_DIR = dir;
});

afterEach(async () => {
  if (previous === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = previous;
  await rm(dir, { recursive: true, force: true });
});

function counting(provider: PlacesProvider = mockProvider) {
  const state = { calls: 0 };
  const wrapped: PlacesProvider = {
    id: provider.id,
    search: (query) => {
      state.calls += 1;
      return provider.search(query);
    },
  };
  return { state, wrapped };
}

function deps(provider: PlacesProvider, limit: number, now = "2026-10-15T15:00:00.000Z"): Partial<SearchDeps> {
  return { provider, store: fileSearchStore, limit, now: () => new Date(now) };
}

describe("dia e limite", () => {
  it("o dia segue o horário de São Paulo", () => {
    expect(dayKey(new Date("2026-10-15T02:30:00.000Z"))).toBe("2026-10-14"); // 23:30 do dia 14 em SP
    expect(dayKey(new Date("2026-10-15T03:00:00.000Z"))).toBe("2026-10-15");
  });

  it("registro de outro dia conta zero", () => {
    expect(usedToday({ day: "2026-10-14", count: 9 }, "2026-10-15")).toBe(0);
    expect(usedToday({ day: "2026-10-15", count: 9 }, "2026-10-15")).toBe(9);
    expect(remainingToday(10, { day: "2026-10-15", count: 12 }, "2026-10-15")).toBe(0);
  });
});

describe("busca de simulação", () => {
  it("devolve sempre as mesmas empresas para o mesmo termo e cidade", async () => {
    const a = await mockProvider.search({ term: "padaria", city: "Joinville" });
    const b = await mockProvider.search({ term: "padaria", city: "Joinville" });
    expect(a).toEqual(b);
    if (!a.ok) throw new Error("esperava sucesso");
    expect(a.results).toHaveLength(12);
    expect(a.placeLabel).toContain("simulação");
    expect(new Set(a.results.map((r) => r.externalId)).size).toBe(12);
    expect(a.results.every((r) => r.externalId.startsWith("mock:"))).toBe(true);
    expect(a.results.some((r) => r.phones.length === 0)).toBe(true);
  });
});

describe("runSearch", () => {
  it("rejeita termo ou cidade vazios sem gastar o limite", async () => {
    const { state, wrapped } = counting();
    const noTerm = await runSearch("u1", " ", "Joinville", deps(wrapped, 5));
    const noCity = await runSearch("u1", "padaria", "", deps(wrapped, 5));
    expect(noTerm.ok).toBe(false);
    expect(noCity.ok).toBe(false);
    expect(state.calls).toBe(0);
    expect((await searchesLeft("u1", deps(wrapped, 5))).remaining).toBe(5);
  });

  it("gasta uma busca por consulta nova e mostra quantas restam", async () => {
    const { wrapped } = counting();
    const first = await runSearch("u1", "padaria", "Joinville", deps(wrapped, 3));
    expect(first.ok && first.fromCache).toBe(false);
    expect(first.remaining).toBe(2);
  });

  it("a mesma busca repetida vem da memória e não gasta o limite", async () => {
    const { state, wrapped } = counting();
    await runSearch("u1", "padaria", "Joinville", deps(wrapped, 3));
    const again = await runSearch("u1", "  PADARIAS ", "joinville", deps(wrapped, 3));
    expect(again.ok && again.fromCache).toBe(true);
    expect(again.remaining).toBe(2);
    expect(state.calls).toBe(1);
  });

  it("bloqueia depois do limite do dia e libera no dia seguinte", async () => {
    const { state, wrapped } = counting();
    expect((await runSearch("u1", "padaria", "Joinville", deps(wrapped, 2))).ok).toBe(true);
    expect((await runSearch("u1", "dentista", "Joinville", deps(wrapped, 2))).ok).toBe(true);

    const blocked = await runSearch("u1", "academia", "Joinville", deps(wrapped, 2));
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) {
      expect(blocked.error).toContain("2 buscas de hoje");
      expect(blocked.remaining).toBe(0);
    }
    expect(state.calls).toBe(2);

    const tomorrow = await runSearch("u1", "academia", "Joinville", deps(wrapped, 2, "2026-10-16T15:00:00.000Z"));
    expect(tomorrow.ok).toBe(true);
  });

  it("o limite é separado por pessoa", async () => {
    const { wrapped } = counting();
    await runSearch("u1", "padaria", "Joinville", deps(wrapped, 1));
    const other = await runSearch("u2", "dentista", "Joinville", deps(wrapped, 1));
    expect(other.ok).toBe(true);
  });

  it("buscas ao mesmo tempo não passam do limite", async () => {
    const { state, wrapped } = counting();
    const terms = ["padaria", "dentista", "academia", "farmacia", "oficina", "mercado"];
    const results = await Promise.all(terms.map((term) => runSearch("u1", term, "Joinville", deps(wrapped, 3))));
    expect(results.filter((r) => r.ok)).toHaveLength(3);
    expect(state.calls).toBe(3);
  });

  it("erro do provedor também conta no limite e não vai para a memória", async () => {
    const failing: PlacesProvider = { id: "osm", search: async () => ({ ok: false, error: "ocupado" }) };
    const first = await runSearch("u1", "padaria", "Joinville", deps(failing, 5));
    expect(first.ok).toBe(false);
    expect(first.remaining).toBe(4);
    const second = await runSearch("u1", "padaria", "Joinville", deps(failing, 5));
    expect(second.remaining).toBe(3);
  });

  it("a memória da simulação não é usada pela busca real (e vice-versa)", async () => {
    const { state, wrapped } = counting();
    await runSearch("u1", "padaria", "Joinville", deps(wrapped, 5));
    const real: PlacesProvider = {
      id: "osm",
      search: async () => ({ ok: true, placeLabel: "Joinville", results: [], truncated: false, matchedBy: "tipo" }),
    };
    const outcome = await runSearch("u1", "padaria", "Joinville", deps(real, 5));
    expect(outcome.ok && outcome.fromCache).toBe(false);
    expect(state.calls).toBe(1);
  });
});
