import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { columnOf } from "@/lib/leads/ordering";
import { mockLeadsRepository as repo } from "@/lib/leads/mock-repository";
import type { CreateLeadInput } from "@/lib/leads/types";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "leads-repo-"));
  process.env.DATA_DIR = dir;
});

afterEach(async () => {
  delete process.env.DATA_DIR;
  await rm(dir, { recursive: true, force: true });
});

function input(name: string, phone: string | null): CreateLeadInput {
  return {
    name,
    company: "",
    phone,
    email: "",
    source: "manual",
    tags: [],
    notes: "",
    stage: "novo",
    optIn: false,
    optInSource: null,
  };
}

describe("repositório de simulação (arquivo local)", () => {
  it("cria 3 leads, arrasta entre colunas e a posição continua depois de 'recarregar'", async () => {
    const a = await repo.create("u1", input("Ana", "+5547999990001"));
    const b = await repo.create("u1", input("Bruno", "+5547999990002"));
    const c = await repo.create("u1", input("Carla", "+5547999990003"));
    if (!a.ok || !b.ok || !c.ok) throw new Error("criação deveria funcionar");

    await repo.move("u1", b.lead.id, "contatado", 0);
    await repo.move("u1", c.lead.id, "contatado", 0);

    // "recarregar a página" = ler tudo de novo do arquivo
    const leads = await repo.list("u1");
    expect(columnOf(leads, "novo").map((l) => l.name)).toEqual(["Ana"]);
    expect(columnOf(leads, "contatado").map((l) => l.name)).toEqual(["Carla", "Bruno"]);
  });

  it("não deixa duas pessoas verem ou mexerem nos leads uma da outra", async () => {
    const mine = await repo.create("u1", input("Ana", "+5547999990001"));
    if (!mine.ok) throw new Error("criação deveria funcionar");

    expect(await repo.list("u2")).toEqual([]);
    expect(await repo.get("u2", mine.lead.id)).toBeNull();
    expect((await repo.move("u2", mine.lead.id, "contatado", 0)).ok).toBe(false);
    expect((await repo.remove("u2", mine.lead.id)).ok).toBe(false);

    // o mesmo telefone pode existir em contas diferentes
    expect((await repo.create("u2", input("Ana (outra conta)", "+5547999990001"))).ok).toBe(true);
    expect(await repo.list("u1")).toHaveLength(1);
  });

  it("vários arrastes ao mesmo tempo não se atropelam", async () => {
    const created = await Promise.all(
      ["A", "B", "C", "D"].map((name, i) => repo.create("u1", input(name, `+554799999000${i}`))),
    );
    expect(created.every((result) => result.ok)).toBe(true);

    const leads = await repo.list("u1");
    await Promise.all(leads.map((lead) => repo.move("u1", lead.id, "respondeu", 0)));

    const after = await repo.list("u1");
    expect(after).toHaveLength(4);
    expect(columnOf(after, "respondeu").map((l) => l.position)).toEqual([0, 1, 2, 3]);
  });

  it("rejeita telefone duplicado dentro da mesma conta", async () => {
    await repo.create("u1", input("Ana", "+5547999990001"));
    const again = await repo.create("u1", input("Outra", "+5547999990001"));
    expect(again.ok).toBe(false);
    expect(await repo.list("u1")).toHaveLength(1);
  });
});
