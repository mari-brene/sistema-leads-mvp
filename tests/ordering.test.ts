import { describe, expect, it } from "vitest";
import { columnOf, moveLead, renumberColumn } from "@/lib/leads/ordering";
import type { StageId } from "@/lib/leads/types";

type Item = { id: string; stage: StageId; position: number };

const base: Item[] = [
  { id: "a", stage: "novo", position: 0 },
  { id: "b", stage: "novo", position: 1 },
  { id: "c", stage: "novo", position: 2 },
  { id: "d", stage: "contatado", position: 0 },
  { id: "e", stage: "contatado", position: 1 },
];

function ids(items: Item[], stage: StageId): string[] {
  return columnOf(items, stage).map((item) => item.id);
}

describe("moveLead", () => {
  it("move para outra coluna na posição pedida e renumera as duas colunas", () => {
    const result = moveLead(base, "b", "contatado", 1);
    expect(result).not.toBeNull();
    expect(ids(result!, "novo")).toEqual(["a", "c"]);
    expect(ids(result!, "contatado")).toEqual(["d", "b", "e"]);
    expect(columnOf(result!, "novo").map((i) => i.position)).toEqual([0, 1]);
    expect(columnOf(result!, "contatado").map((i) => i.position)).toEqual([0, 1, 2]);
  });

  it("mover para o topo e para o fim", () => {
    expect(ids(moveLead(base, "c", "novo", 0)!, "novo")).toEqual(["c", "a", "b"]);
    expect(ids(moveLead(base, "a", "novo", 99)!, "novo")).toEqual(["b", "c", "a"]);
  });

  it("move para uma coluna vazia", () => {
    const result = moveLead(base, "a", "fechado", 0)!;
    expect(ids(result, "fechado")).toEqual(["a"]);
    expect(ids(result, "novo")).toEqual(["b", "c"]);
  });

  it("limita posições absurdas (negativas, NaN, enormes)", () => {
    expect(ids(moveLead(base, "a", "contatado", -5)!, "contatado")).toEqual(["a", "d", "e"]);
    expect(ids(moveLead(base, "a", "contatado", Number.NaN)!, "contatado")).toEqual(["d", "e", "a"]);
    expect(ids(moveLead(base, "a", "contatado", 1e9)!, "contatado")).toEqual(["d", "e", "a"]);
  });

  it("devolve null se o lead não existe e não altera a lista original", () => {
    const copy = JSON.parse(JSON.stringify(base));
    expect(moveLead(base, "zzz", "novo", 0)).toBeNull();
    moveLead(base, "a", "contatado", 0);
    expect(base).toEqual(copy);
  });

  it("não perde nem duplica leads", () => {
    const result = moveLead(base, "b", "respondeu", 0)!;
    expect(result.map((i) => i.id).sort()).toEqual(["a", "b", "c", "d", "e"]);
  });
});

describe("renumberColumn", () => {
  it("fecha o buraco depois de remover alguém", () => {
    const withoutB = base.filter((item) => item.id !== "b");
    const result = renumberColumn(withoutB, "novo");
    expect(columnOf(result, "novo").map((i) => i.position)).toEqual([0, 1]);
  });
});
