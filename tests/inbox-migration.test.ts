import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { planInboxMigration, type InboxExisting } from "@/lib/migration/inbox-plan";
import { createInboxMigration } from "@/lib/migration/inbox-run";
import { fakeTables } from "./helpers/fake-tables";

const T = "2026-10-21T10:00:00.000Z";
const convo = (userId: string, leadId: string) => ({ userId, leadId, mode: "ia", needsHuman: false, handoffReason: null, aiRepliesInRow: 0, lastInboundAt: T, lastMessageAt: T, lastPreview: "Oi", createdAt: T });
const msg = (id: string, userId: string, extra = {}) => ({ id, userId, leadId: "l1", direction: "in", author: "contato", text: "Oi", at: T, ...extra });
const none = (): InboxExisting => ({ clientIds: new Set(["c1"]), settingsClientIds: new Set(), conversationKeys: new Set(), messageIds: new Set(), usageKeys: new Set() });
const source = () => ({
  settings: { c1: { aiEnabled: true, businessName: "Studio", knowledge: "x" } },
  conversations: [convo("c1", "l1")],
  messages: [msg("m1", "c1", { externalId: "w1" }), msg("m2", "c1", { direction: "out", author: "ia" })],
  aiUsage: { "c1|2026-10-21": 3 },
});

describe("plano de migração da caixa de entrada", () => {
  it("copia tudo o que falta", () => {
    const plan = planInboxMigration(source(), none());
    expect(plan.settings).toHaveLength(1);
    expect(plan.conversations[0]).toMatchObject({ client_id: "c1", lead_id: "l1" });
    expect(plan.messages.map((r) => r.id)).toEqual(["m1", "m2"]);
    expect(plan.usage).toEqual([{ client_id: "c1", day: "2026-10-21", count: 3 }]);
  });

  it("não copia de novo o que já existe", () => {
    const ex = { ...none(), settingsClientIds: new Set(["c1"]), conversationKeys: new Set(["c1|l1"]), messageIds: new Set(["m1", "m2"]), usageKeys: new Set(["c1|2026-10-21"]) };
    const plan = planInboxMigration(source(), ex);
    expect(plan.settings.length + plan.conversations.length + plan.messages.length + plan.usage.length).toBe(0);
    expect(plan.counts.messages.alreadyCopied).toBe(2);
  });

  it("bloqueia o que é de cliente inexistente", () => {
    const plan = planInboxMigration({ settings: {}, conversations: [convo("fantasma", "l1")], messages: [msg("m9", "fantasma")], aiUsage: { "fantasma|2026-10-21": 1 } }, none());
    expect(plan.counts.conversations.blocked + plan.counts.messages.blocked + plan.counts.usage.blocked).toBe(3);
    expect(plan.messages).toHaveLength(0);
  });

  it("pula inválidos, ids repetidos e externalId repetido; aceita formato estranho", () => {
    const plan = planInboxMigration(
      { settings: [], conversations: [null, convo("c1", "l1"), convo("c1", "l1")], messages: [null, msg("a", "c1", { externalId: "w" }), msg("a", "c1"), msg("b", "c1", { externalId: "w" })], aiUsage: { semBarra: 2, "c1|d": "x" } },
      none(),
    );
    expect(plan.conversations).toHaveLength(1);
    expect(plan.messages.map((r) => r.id)).toEqual(["a"]);
    expect(plan.counts.usage.invalid).toBe(2);
    expect(planInboxMigration({ settings: 1, conversations: {}, messages: undefined, aiUsage: [] }, none()).counts.messages.source).toBe(0);
  });
});

describe("cópia da caixa de entrada (Supabase de mentira)", () => {
  let dir: string;
  let previous: string | undefined;
  let previousBackend: string | undefined;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "inbox-mig-"));
    previous = process.env.DATA_DIR;
    previousBackend = process.env.DATA_BACKEND;
    process.env.DATA_DIR = dir;
    delete process.env.DATA_BACKEND;
    await writeFile(path.join(dir, "inbox.json"), JSON.stringify(source()));
  });
  afterEach(async () => {
    if (previous === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = previous;
    if (previousBackend !== undefined) process.env.DATA_BACKEND = previousBackend;
    await rm(dir, { recursive: true, force: true });
  });
  const make = (db: ReturnType<typeof fakeTables>) => createInboxMigration({ url: "https://x.supabase.co", secretKey: "sb_secret_teste", fetch: db.fetch });

  it("a prévia não grava nada", async () => {
    const db = fakeTables({ clients: [{ id: "c1" }] });
    const report = await make(db).preview();
    expect(report.plan.counts.messages.toCopy).toBe(2);
    expect(db.calls.every((c) => c.method === "GET")).toBe(true);
  });

  it("copia, confere, e rodar de novo não duplica nem sobrescreve", async () => {
    const db = fakeTables({ clients: [{ id: "c1" }] });
    const migration = make(db);
    const first = await migration.run();
    expect(first.copied).toEqual({ settings: 1, conversations: 1, messages: 2, usage: 1 });
    expect(first.missing).toBe(0);
    expect(db.tables.ai_usage[0]).toMatchObject({ client_id: "c1", day: "2026-10-21", count: 3 });

    db.tables.conversations[0].mode = "humano";
    const second = await migration.run();
    expect(second.copied).toEqual({ settings: 0, conversations: 0, messages: 0, usage: 0 });
    expect(db.tables.conversations[0].mode).toBe("humano");
  });

  it("sem o cliente na tabela de clientes, nada é copiado", async () => {
    const db = fakeTables({ clients: [] });
    const result = await make(db).run();
    expect(Object.values(result.copied).reduce((a, b) => a + b, 0)).toBe(0);
    expect(db.calls.some((c) => c.method === "POST")).toBe(false);
  });
});
