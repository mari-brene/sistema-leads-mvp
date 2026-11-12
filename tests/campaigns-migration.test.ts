import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { planCampaignsMigration, type CampaignsExisting } from "@/lib/migration/campaigns-plan";
import { createCampaignsMigration } from "@/lib/migration/campaigns-run";
import { fakeTables } from "./helpers/fake-tables";

const T = "2026-10-01T10:00:00.000Z";
const tpl = (id: string, userId: string) => ({ id, userId, name: "T", body: "Oi", status: "aprovado", createdAt: T });
const camp = (id: string, userId: string) => ({ id, userId, name: "C", templateId: "t1", templateName: "T", body: "Oi", stages: ["novo"], tag: "", status: "rascunho", createdAt: T, startedAt: null, finishedAt: null });
const msg = (id: string, userId: string, campaignId: string) => ({ id, userId, campaignId, leadId: "l1", leadName: "Ana", phone: "+5547999990001", text: "Oi", status: "na_fila", reason: "", providerId: null, queuedAt: T, sentAt: null });
const none = (): CampaignsExisting => ({ clientIds: new Set(["c1"]), settingsClientIds: new Set(), templateIds: new Set(), campaignIds: new Set(), messageIds: new Set() });
const source = () => ({
  settings: { c1: { dailyLimit: 12 } },
  templates: [tpl("t1", "c1")],
  campaigns: [camp("k1", "c1")],
  messages: [msg("m1", "c1", "k1")],
});

describe("plano de migração das campanhas", () => {
  it("copia tudo o que falta e completa limites com os padrões", () => {
    const plan = planCampaignsMigration(source(), none());
    expect(plan.templates.map((r) => r.id)).toEqual(["t1"]);
    expect(plan.campaigns.map((r) => r.id)).toEqual(["k1"]);
    expect(plan.messages.map((r) => r.id)).toEqual(["m1"]);
    expect(plan.settings[0]).toMatchObject({ client_id: "c1", daily_limit: 12, window_start: 9 });
  });

  it("não copia de novo o que já está nas tabelas novas", () => {
    const existing = { ...none(), templateIds: new Set(["t1"]), campaignIds: new Set(["k1"]), messageIds: new Set(["m1"]), settingsClientIds: new Set(["c1"]) };
    const plan = planCampaignsMigration(source(), existing);
    expect(plan.templates.length + plan.campaigns.length + plan.messages.length + plan.settings.length).toBe(0);
    expect(plan.counts.messages.alreadyCopied).toBe(1);
  });

  it("bloqueia o que pertence a cliente inexistente e mensagem sem campanha", () => {
    const plan = planCampaignsMigration(
      { settings: {}, templates: [tpl("t2", "fantasma")], campaigns: [camp("k2", "fantasma")], messages: [msg("m2", "c1", "k-sumida")] },
      none(),
    );
    expect(plan.counts.templates.blocked).toBe(1);
    expect(plan.counts.campaigns.blocked).toBe(1);
    expect(plan.counts.messages.blocked).toBe(1);
    expect(plan.messages).toHaveLength(0);
  });

  it("pula linhas inválidas e ids repetidos; aceita formato estranho", () => {
    const plan = planCampaignsMigration({ settings: [], templates: [null, { name: "sem id" }, tpl("t1", "c1"), tpl("t1", "c1")], campaigns: {}, messages: undefined }, none());
    expect(plan.templates).toHaveLength(1);
    expect(plan.counts.templates.invalid).toBe(3);
  });
});

describe("cópia das campanhas (Supabase de mentira)", () => {
  let dir: string;
  let previous: string | undefined;
  let previousBackend: string | undefined;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "camp-mig-"));
    previous = process.env.DATA_DIR;
    previousBackend = process.env.DATA_BACKEND;
    process.env.DATA_DIR = dir;
    delete process.env.DATA_BACKEND;
    await writeFile(path.join(dir, "campaigns.json"), JSON.stringify(source()));
  });
  afterEach(async () => {
    if (previous === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = previous;
    if (previousBackend !== undefined) process.env.DATA_BACKEND = previousBackend;
    await rm(dir, { recursive: true, force: true });
  });

  const make = (db: ReturnType<typeof fakeTables>) => createCampaignsMigration({ url: "https://x.supabase.co", secretKey: "sb_secret_teste", fetch: db.fetch });

  it("a prévia não grava nada", async () => {
    const db = fakeTables({ clients: [{ id: "c1", name: "Demo" }] });
    const report = await make(db).preview();
    expect(report.plan.counts.messages.toCopy).toBe(1);
    expect(db.calls.every((c) => c.method === "GET")).toBe(true);
  });

  it("copia, confere, e rodar de novo não duplica nem sobrescreve", async () => {
    const db = fakeTables({ clients: [{ id: "c1", name: "Demo" }] });
    const migration = make(db);
    const first = await migration.run();
    expect(first.copied).toEqual({ settings: 1, templates: 1, campaigns: 1, messages: 1 });
    expect(first.missing).toBe(0);
    expect(db.tables.campaign_messages[0]).toMatchObject({ id: "m1", client_id: "c1" });

    db.tables.message_templates[0].name = "Editado depois";
    const second = await migration.run();
    expect(second.copied).toEqual({ settings: 0, templates: 0, campaigns: 0, messages: 0 });
    expect(db.tables.message_templates).toHaveLength(1);
    expect(db.tables.message_templates[0].name).toBe("Editado depois");
  });

  it("sem o cliente na tabela de clientes, nada é copiado", async () => {
    const db = fakeTables({ clients: [] });
    const result = await make(db).run();
    expect(result.copied.templates + result.copied.campaigns + result.copied.messages + result.copied.settings).toBe(0);
    expect(db.calls.some((c) => c.method === "POST")).toBe(false);
  });
});
