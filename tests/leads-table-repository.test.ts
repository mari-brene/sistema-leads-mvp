import { describe, expect, it } from "vitest";
import { columnOf } from "@/lib/leads/ordering";
import { createTableLeadsRepository } from "@/lib/leads/table-repository";
import { leadToRow, rowToLead, type LeadRow } from "@/lib/leads/table-mapping";
import { fakeSupabase } from "./helpers/fake-postgrest";
import type { CreateLeadInput } from "@/lib/leads/types";

const input = (name: string, phone: string | null): CreateLeadInput => ({
  name, company: "", phone, email: "", source: "manual", tags: [], notes: "", stage: "novo", optIn: false, optInSource: null,
});

function setup(seed: LeadRow[] = []) {
  const db = fakeSupabase(seed);
  const repo = createTableLeadsRepository({ url: "https://x.supabase.co", secretKey: "sb_secret_teste", fetch: db.fetch });
  return { db, repo };
}

describe("leads na tabela do Supabase", () => {
  it("converte lead <-> linha sem perder nada", () => {
    const row = leadToRow({
      id: "l1", userId: "c1", name: "Ana", company: "A", phone: "+5547999990001", email: "a@a.com", source: "csv",
      stage: "novo", position: 2, tags: ["x"], notes: "n", externalId: "osm:1", optIn: true, optInAt: "2026-01-01T00:00:00.000Z",
      optInSource: "formulario", optOut: false, optOutAt: null, createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z", lastInteractionAt: "2026-01-02T00:00:00.000Z",
      events: [{ id: "e", at: "2026-01-01T00:00:00.000Z", type: "criado", text: "t" }],
    });
    expect(row.client_id).toBe("c1");
    expect(rowToLead(row).userId).toBe("c1");
    expect(rowToLead(row).externalId).toBe("osm:1");
    expect(leadToRow(rowToLead(row))).toEqual(row);
  });

  it("cria, lista, arrasta entre colunas e a ordem continua depois de 'recarregar'", async () => {
    const { repo } = setup();
    const a = await repo.create("c1", input("Ana", "+5547999990001"));
    const b = await repo.create("c1", input("Bruno", "+5547999990002"));
    const c = await repo.create("c1", input("Carla", "+5547999990003"));
    if (!a.ok || !b.ok || !c.ok) throw new Error("criação deveria funcionar");
    await repo.move("c1", b.lead.id, "contatado", 0);
    await repo.move("c1", c.lead.id, "contatado", 0);
    const leads = await repo.list("c1");
    expect(columnOf(leads, "novo").map((l) => l.name)).toEqual(["Ana"]);
    expect(columnOf(leads, "contatado").map((l) => l.name)).toEqual(["Carla", "Bruno"]);
  });

  it("um cliente nunca vê, altera nem apaga lead de outro cliente", async () => {
    const { repo, db } = setup();
    const a = await repo.create("c1", input("Ana", "+5547999990001"));
    if (!a.ok) throw new Error("x");
    expect(await repo.list("c2")).toEqual([]);
    expect(await repo.get("c2", a.lead.id)).toBeNull();
    expect((await repo.update("c2", a.lead.id, input("Invasor", null))).ok).toBe(false);
    expect((await repo.addNote("c2", a.lead.id, "oi")).ok).toBe(false);
    expect((await repo.remove("c2", a.lead.id)).ok).toBe(false);
    expect(db.rows).toHaveLength(1);
    expect(db.rows[0].name).toBe("Ana");
    expect(db.rows[0].client_id).toBe("c1");
  });

  it("o mesmo telefone pode existir em clientes diferentes, mas não duas vezes no mesmo", async () => {
    const { repo } = setup();
    expect((await repo.create("c1", input("Ana", "+5547999990001"))).ok).toBe(true);
    expect((await repo.create("c2", input("Ana", "+5547999990001"))).ok).toBe(true);
    expect((await repo.create("c1", input("Outra", "+5547999990001"))).ok).toBe(false);
  });

  it("só grava as linhas que mudaram", async () => {
    const { repo, db } = setup();
    const a = await repo.create("c1", input("Ana", "+5547999990001"));
    await repo.create("c1", input("Bruno", "+5547999990002"));
    if (!a.ok) throw new Error("x");
    db.calls.length = 0;
    await repo.addNote("c1", a.lead.id, "ligar amanhã");
    expect(db.calls.filter((c) => c.method === "PATCH")).toHaveLength(1);
    expect(db.calls.filter((c) => c.method === "POST" || c.method === "DELETE")).toHaveLength(0);
  });

  it("apaga só o lead pedido", async () => {
    const { repo, db } = setup();
    const a = await repo.create("c1", input("Ana", "+5547999990001"));
    await repo.create("c1", input("Bruno", "+5547999990002"));
    if (!a.ok) throw new Error("x");
    expect((await repo.remove("c1", a.lead.id)).ok).toBe(true);
    expect(db.rows.map((r) => r.name)).toEqual(["Bruno"]);
  });

  it("importa vários e pula os repetidos", async () => {
    const { repo, db } = setup();
    await repo.create("c1", input("Ana", "+5547999990001"));
    const result = await repo.importMany("c1", [input("Ana 2", "+5547999990001"), input("Bia", "+5547999990005")]);
    expect(result.created).toBe(1);
    expect(result.skipped).toHaveLength(1);
    expect(db.rows.map((r) => r.name).sort()).toEqual(["Ana", "Bia"]);
  });

  it("acha leads por telefone em qualquer cliente (recebimento do WhatsApp)", async () => {
    const { repo } = setup();
    await repo.create("c1", input("Ana", "+5547999990001"));
    await repo.create("c2", input("Bia", "+5547999990002"));
    const found = await repo.findByPhone(["+5547999990001", "+5547999990002"]);
    expect(found.map((l) => l.name).sort()).toEqual(["Ana", "Bia"]);
    expect(await repo.findByPhone([])).toEqual([]);
  });

  it("lê todas as páginas quando há mais de 1000 leads", async () => {
    const seed: LeadRow[] = Array.from({ length: 1200 }, (_, i) =>
      leadToRow({
        id: `id-${String(i).padStart(5, "0")}`, userId: "c1", name: `L${i}`, company: "", phone: null, email: "", source: "csv",
        stage: "novo", position: i, tags: [], notes: "", optIn: false, optInAt: null, optInSource: null, optOut: false,
        optOutAt: null, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
        lastInteractionAt: "2026-01-01T00:00:00.000Z", events: [],
      }),
    );
    const { repo } = setup(seed);
    expect(await repo.list("c1")).toHaveLength(1200);
  });

  it("erro do Supabase não vaza o corpo da resposta", async () => {
    const { repo, db } = setup();
    db.failWith(500);
    let message = "";
    try {
      await repo.list("c1");
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain("erro 500");
    expect(message).not.toContain("dados-do-cliente");
    expect(message).not.toContain("sb_secret_teste");
  });
});
