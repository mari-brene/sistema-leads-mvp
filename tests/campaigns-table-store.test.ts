import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createCampaignsRepository } from "@/lib/campaigns/repository";
import { mockSender } from "@/lib/campaigns/sender";
import { createTableStore } from "@/lib/campaigns/store";
import { mockLeadsRepository as leadsRepo } from "@/lib/leads/mock-repository";
import type { CreateLeadInput } from "@/lib/leads/types";
import { fakeTables } from "./helpers/fake-tables";

let dir: string;
let previous: string | undefined;
let clock = new Date("2026-10-16T15:00:00.000Z"); // sexta, 12:00 em São Paulo

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "campaigns-table-"));
  previous = process.env.DATA_DIR;
  process.env.DATA_DIR = dir;
  clock = new Date("2026-10-16T15:00:00.000Z");
});

afterEach(async () => {
  if (previous === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = previous;
  await rm(dir, { recursive: true, force: true });
});

function setup(seed = {}) {
  const db = fakeTables(seed);
  const repo = createCampaignsRepository({
    leads: leadsRepo,
    store: createTableStore({ url: "https://x.supabase.co", secretKey: "sb_secret_teste", fetch: db.fetch }),
    now: () => clock,
  });
  return { db, repo };
}

function lead(name: string, phone: string): CreateLeadInput {
  return { name, company: "Empresa " + name, phone, email: "", source: "manual", tags: [], notes: "", stage: "novo", optIn: true, optInSource: "formulario" };
}

async function started(repo: ReturnType<typeof setup>["repo"], clientId: string) {
  const added = await repo.addTemplate(clientId, { name: "Oferta", body: "Oi {{nome}}, novidades!" });
  if (!added.ok) throw new Error(added.error);
  await repo.approveTemplate(clientId, added.template.id);
  const created = await repo.createCampaign(clientId, { name: "Outubro", templateId: added.template.id, stages: ["novo"], tag: "" });
  if (!created.ok) throw new Error(created.error);
  await repo.changeCampaign(clientId, created.campaign.id, "start");
  return created.campaign.id;
}

describe("campanhas nas tabelas próprias (Supabase de mentira)", () => {
  it("ciclo completo: modelo, campanha, envio, conclusão", async () => {
    const { db, repo } = setup();
    await leadsRepo.create("c1", lead("Ana Lima", "+5547999990001"));
    const id = await started(repo, "c1");

    expect(db.tables.message_templates).toHaveLength(1);
    expect(db.tables.campaigns).toHaveLength(1);
    expect(db.tables.campaign_messages).toHaveLength(1);
    expect(db.tables.campaign_messages[0]).toMatchObject({ client_id: "c1", status: "na_fila" });

    expect(await repo.runBatch("c1", mockSender)).toMatchObject({ ok: true, sent: 1, queuedLeft: 0, simulated: true });
    expect(db.tables.campaign_messages[0]).toMatchObject({ status: "enviada" });

    const detail = await repo.getCampaign("c1", id);
    expect(detail?.campaign.status).toBe("concluida");
    expect(detail?.counts.enviadas).toBe(1);
    expect(detail?.campaign.startedAt).toMatch(/Z$/);
  });

  it("configurações: padrão se não existir, e gravar de novo troca a mesma linha", async () => {
    const { db, repo } = setup();
    expect((await repo.getSettings("c1")).dailyLimit).toBe(30);
    await repo.saveSettings("c1", { ...(await repo.getSettings("c1")), dailyLimit: 12 });
    await repo.saveSettings("c1", { ...(await repo.getSettings("c1")), dailyLimit: 15 });
    expect(db.tables.campaign_settings).toHaveLength(1);
    expect((await repo.getSettings("c1")).dailyLimit).toBe(15);
  });

  it("um cliente nunca vê nem mexe nos dados de outro", async () => {
    const { db, repo } = setup();
    await leadsRepo.create("c1", lead("Ana", "+5547999990001"));
    const id = await started(repo, "c1");
    await repo.saveSettings("c1", { ...(await repo.getSettings("c1")), dailyLimit: 7 });

    expect(await repo.listCampaigns("c2")).toEqual([]);
    expect(await repo.listTemplates("c2")).toEqual([]);
    expect(await repo.getCampaign("c2", id)).toBeNull();
    expect((await repo.getSettings("c2")).dailyLimit).toBe(30);

    expect((await repo.changeCampaign("c2", id, "pause")).ok).toBe(false);
    expect((await repo.removeCampaign("c2", id)).ok).toBe(false);
    expect((await repo.runBatch("c2", mockSender)).ok).toBe(false);
    expect(db.tables.campaigns[0]).toMatchObject({ client_id: "c1", status: "em_andamento" });
    expect(db.tables.campaign_messages).toHaveLength(1);
  });

  it("toda consulta e gravação carrega o filtro do cliente", async () => {
    const { db, repo } = setup();
    await leadsRepo.create("c1", lead("Ana", "+5547999990001"));
    await started(repo, "c1");
    await repo.runBatch("c1", mockSender);
    await repo.listCampaigns("c1");
    const scoped = db.calls.filter((c) => c.method !== "POST" || c.url.includes("on_conflict"));
    for (const call of scoped) expect(call.url).toContain("client_id=eq.c1");
  });

  it("remover um rascunho apaga também as mensagens dele; campanha enviada não pode ser removida", async () => {
    const { db, repo } = setup();
    await leadsRepo.create("c1", lead("Ana", "+5547999990001"));
    const added = await repo.addTemplate("c1", { name: "T", body: "Oi {{nome}}" });
    if (!added.ok) throw new Error(added.error);
    await repo.approveTemplate("c1", added.template.id);
    const draft = await repo.createCampaign("c1", { name: "Rascunho", templateId: added.template.id, stages: ["novo"], tag: "" });
    if (!draft.ok) throw new Error(draft.error);
    expect(db.tables.campaign_messages).toHaveLength(1);
    expect((await repo.removeCampaign("c1", draft.campaign.id)).ok).toBe(true);
    expect(db.tables.campaigns).toHaveLength(0);
    expect(db.tables.campaign_messages).toHaveLength(0);

    const running = await started(repo, "c1");
    expect((await repo.removeCampaign("c1", running)).ok).toBe(false);
    expect(db.tables.campaigns).toHaveLength(1);
  });

  it("agendador: lista só clientes com campanha em andamento", async () => {
    const { repo } = setup();
    await leadsRepo.create("c1", lead("Ana", "+5547999990001"));
    await leadsRepo.create("c2", lead("Bia", "+5547999990002"));
    await started(repo, "c1");
    const added = await repo.addTemplate("c2", { name: "T", body: "Oi" });
    if (added.ok) await repo.createCampaign("c2", { name: "Rascunho", templateId: added.template.id, stages: ["novo"], tag: "" });
    expect(await repo.listActiveUserIds()).toEqual(["c1"]);
  });

  it("não grava nada de outro cliente mesmo se a regra devolver dado trocado", async () => {
    const { db } = setup();
    const store = createTableStore({ url: "https://x.supabase.co", secretKey: "sb_secret_teste", fetch: db.fetch });
    const before = await store.load("c1");
    const intruso = { id: "t9", userId: "c2", name: "X", body: "Y", status: "pendente" as const, createdAt: "2026-10-16T15:00:00.000Z" };
    let message = "";
    try {
      await store.save("c1", before, { ...before, templates: [intruso] });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain("outro cliente");
    expect(db.tables.message_templates ?? []).toHaveLength(0);
  });

  it("erro do Supabase vira mensagem clara, sem vazar dados nem chave", async () => {
    const { db, repo } = setup();
    db.failWith(500);
    try {
      await repo.listCampaigns("c1");
      throw new Error("deveria falhar");
    } catch (error) {
      const text = (error as Error).message;
      expect(text).toContain("500");
      expect(text).not.toContain("dados-do-cliente");
      expect(text).not.toContain("sb_secret");
    }
  });
});
