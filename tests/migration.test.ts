import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createMigration } from "@/lib/migration/run";
import { membershipKey, planMigration, verifyCopy, type Existing } from "@/lib/migration/plan";
import type { Lead } from "@/lib/leads/types";
import type { FetchLike } from "@/lib/storage/supabase-store";

const lead = (id: string, userId: string, extra: Partial<Lead> = {}): Lead => ({
  id, userId, name: `L-${id}`, company: "", phone: null, email: "", source: "manual", stage: "novo", position: 0, tags: [],
  notes: "", optIn: false, optInAt: null, optInSource: null, optOut: false, optOutAt: null,
  createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", lastInteractionAt: "2026-01-01T00:00:00.000Z",
  events: [], ...extra,
});
const client = (id: string) => ({ id, name: "Demonstração", createdAt: "2026-11-11T00:00:00.000Z" });
const empty = (): Existing => ({ leadIds: new Set(), clientIds: new Set(), membershipKeys: new Set() });

describe("plano de migração", () => {
  it("copia clientes, vínculos e leads que faltam", () => {
    const plan = planMigration(
      { leads: [lead("a", "c1"), lead("b", "c1")], clients: [client("c1")], memberships: [{ userId: "c1", clientId: "c1", role: "agency_admin" }] },
      empty(),
    );
    expect(plan.leads.map((r) => r.id)).toEqual(["a", "b"]);
    expect(plan.leads[0].client_id).toBe("c1");
    expect(plan.clients).toHaveLength(1);
    expect(plan.memberships).toEqual([{ user_id: "c1", client_id: "c1", role: "agency_admin" }]);
  });

  it("não copia de novo o que já está na tabela nova", () => {
    const existing = { leadIds: new Set(["a"]), clientIds: new Set(["c1"]), membershipKeys: new Set([membershipKey("c1", "c1")]) };
    const plan = planMigration(
      { leads: [lead("a", "c1"), lead("b", "c1")], clients: [client("c1")], memberships: [{ userId: "c1", clientId: "c1", role: "agency_admin" }] },
      existing,
    );
    expect(plan.leads.map((r) => r.id)).toEqual(["b"]);
    expect(plan.alreadyCopied).toBe(1);
    expect(plan.clients).toHaveLength(0);
    expect(plan.memberships).toHaveLength(0);
  });

  it("bloqueia lead cujo cliente dono não existe, sem inventar cliente", () => {
    const plan = planMigration({ leads: [lead("a", "fantasma"), lead("b", "c1")], clients: [client("c1")], memberships: [] }, empty());
    expect(plan.leads.map((r) => r.id)).toEqual(["b"]);
    expect(plan.blockedNoClient).toBe(1);
  });

  it("pula linhas inválidas e ids repetidos", () => {
    const plan = planMigration({ leads: [null, { name: "sem id" }, lead("a", "c1"), lead("a", "c1")], clients: [client("c1")], memberships: [] }, empty());
    expect(plan.leads).toHaveLength(1);
    expect(plan.invalid).toBe(3);
  });

  it("aceita coleção vazia ou em formato estranho", () => {
    expect(planMigration({ leads: {}, clients: [], memberships: [] }, empty()).sourceLeads).toBe(0);
  });

  it("confere o que ficou faltando depois da cópia", () => {
    expect(verifyCopy(["a", "b", "c"], new Set(["a", "c", "z"]))).toEqual({ missing: 1, extra: 1 });
  });
});

/** Supabase de mentira com as 3 tabelas e "ignorar duplicados". */
function fake() {
  const tables: Record<string, Record<string, unknown>[]> = { clients: [], memberships: [], leads: [] };
  const writes: string[] = [];
  const keyOf = (table: string, r: Record<string, unknown>) => (table === "memberships" ? `${r.user_id}::${r.client_id}` : String(r.id));
  const fetchLike: FetchLike = async (url, init) => {
    const u = new URL(url);
    const table = u.pathname.split("/").pop()!;
    if (init.method === "GET") {
      const limit = Number(u.searchParams.get("limit") ?? 1000);
      const offset = Number(u.searchParams.get("offset") ?? 0);
      return { ok: true, status: 200, json: async () => tables[table].slice(offset, offset + limit) };
    }
    if (init.method === "POST") {
      writes.push(table);
      for (const row of JSON.parse(init.body!) as Record<string, unknown>[]) {
        if (!tables[table].some((r) => keyOf(table, r) === keyOf(table, row))) tables[table].push(row);
      }
      return { ok: true, status: 201, json: async () => [] };
    }
    return { ok: false, status: 405, json: async () => ({}) };
  };
  return { tables, writes, fetch: fetchLike };
}

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "migracao-"));
  process.env.DATA_DIR = dir;
});
afterEach(async () => {
  delete process.env.DATA_DIR;
  await rm(dir, { recursive: true, force: true });
});

async function seedSource(leads: unknown[]) {
  await writeFile(path.join(dir, "leads.json"), JSON.stringify(leads));
  await writeFile(path.join(dir, "clients.json"), JSON.stringify([client("c1")]));
  await writeFile(path.join(dir, "memberships.json"), JSON.stringify([{ userId: "c1", clientId: "c1", role: "agency_admin" }]));
}

describe("execução da migração", () => {
  it("prévia não grava nada", async () => {
    await seedSource([lead("a", "c1")]);
    const db = fake();
    const migration = createMigration({ url: "https://x.supabase.co", secretKey: "sb_secret_t", fetch: db.fetch });
    const report = await migration.preview();
    expect(report.plan.leads).toHaveLength(1);
    expect(db.writes).toEqual([]);
  });

  it("copia tudo, confere e rodar de novo não duplica nem sobrescreve", async () => {
    await seedSource([lead("a", "c1"), lead("b", "c1", { name: "Original" })]);
    const db = fake();
    const migration = createMigration({ url: "https://x.supabase.co", secretKey: "sb_secret_t", fetch: db.fetch });

    const first = await migration.run();
    expect(first.copied).toEqual({ clients: 1, memberships: 1, leads: 2 });
    expect(first.missing).toBe(0);
    expect(db.tables.leads).toHaveLength(2);

    db.tables.leads.find((r) => r.id === "b")!.name = "Editado depois"; // alguém editou na tabela nova
    const second = await migration.run();
    expect(second.copied.leads).toBe(0);
    expect(db.tables.leads).toHaveLength(2);
    expect(db.tables.leads.find((r) => r.id === "b")!.name).toBe("Editado depois");
  });

  it("não copia lead sem cliente e informa que ficou faltando", async () => {
    await seedSource([lead("a", "c1"), lead("x", "fantasma")]);
    const db = fake();
    const result = await createMigration({ url: "https://x.supabase.co", secretKey: "sb_secret_t", fetch: db.fetch }).run();
    expect(result.missing).toBe(1);
    expect(db.tables.leads.map((r) => r.id)).toEqual(["a"]);
  });

  it("erro do Supabase aponta para a Parte C2a sem mostrar chave", async () => {
    await seedSource([lead("a", "c1")]);
    const failing: FetchLike = async () => ({ ok: false, status: 404, json: async () => ({}) });
    let message = "";
    try {
      await createMigration({ url: "https://x.supabase.co", secretKey: "sb_secret_t", fetch: failing }).preview();
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain("C2a");
    expect(message).not.toContain("sb_secret_t");
  });
});
