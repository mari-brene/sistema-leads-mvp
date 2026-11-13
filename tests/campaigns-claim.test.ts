import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createCampaignsRepository } from "@/lib/campaigns/repository";
import type { WhatsAppSender } from "@/lib/campaigns/sender";
import { createCollectionStore, createTableStore } from "@/lib/campaigns/store";
import { expireStuck, STUCK_MINUTES, STUCK_REASON } from "@/lib/campaigns/logic";
import { DEFAULT_SETTINGS, type CampaignMessage, type Slice } from "@/lib/campaigns/types";
import { mockLeadsRepository as leadsRepo } from "@/lib/leads/mock-repository";
import type { CreateLeadInput } from "@/lib/leads/types";
import { fakeTables } from "./helpers/fake-tables";

let dir: string;
let previous: string | undefined;
const clock = new Date("2026-10-16T15:00:00.000Z");

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "campaigns-claim-"));
  previous = process.env.DATA_DIR;
  process.env.DATA_DIR = dir;
});

afterEach(async () => {
  if (previous === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = previous;
  await rm(dir, { recursive: true, force: true });
});

function lead(name: string, phone: string): CreateLeadInput {
  return { name, company: "Empresa " + name, phone, email: "", source: "manual", tags: [], notes: "", stage: "novo", optIn: true, optInSource: "formulario" };
}

function countingSender(): WhatsAppSender & { to: string[] } {
  const to: string[] = [];
  return {
    simulated: true,
    to,
    async send(input) {
      to.push(input.to);
      await new Promise((resolve) => setTimeout(resolve, 5));
      return { ok: true, providerId: "p-" + to.length };
    },
  } as WhatsAppSender & { to: string[] };
}

async function prepare(repo: ReturnType<typeof createCampaignsRepository>, clientId: string) {
  const added = await repo.addTemplate(clientId, { name: "Oferta", body: "Oi {{nome}}, novidades!" });
  if (!added.ok) throw new Error(added.error);
  await repo.approveTemplate(clientId, added.template.id);
  const created = await repo.createCampaign(clientId, { name: "Outubro", templateId: added.template.id, stages: ["novo"], tag: "" });
  if (!created.ok) throw new Error(created.error);
  await repo.changeCampaign(clientId, created.campaign.id, "start");
  return created.campaign.id;
}

describe("envio duplicado: duas rodadas ao mesmo tempo", () => {
  it("tabelas: dois servidores rodando juntos enviam cada mensagem uma única vez", async () => {
    const db = fakeTables();
    const options = { url: "https://x.supabase.co", secretKey: "sb_secret_teste", fetch: db.fetch };
    const independent = () => ({ ...createTableStore(options), withLock: <T,>(task: () => Promise<T>) => task() });
    const a = createCampaignsRepository({ leads: leadsRepo, store: independent(), now: () => clock });
    const b = createCampaignsRepository({ leads: leadsRepo, store: independent(), now: () => clock });
    await leadsRepo.create("c1", lead("Ana", "+5547999990001"));
    await leadsRepo.create("c1", lead("Bia", "+5547999990002"));
    await leadsRepo.create("c1", lead("Caio", "+5547999990003"));
    await prepare(a, "c1");

    const sender = countingSender();
    const [first, second] = await Promise.all([a.runBatch("c1", sender), b.runBatch("c1", sender)]);

    expect(sender.to).toHaveLength(3);
    expect(new Set(sender.to).size).toBe(3);
    const oks = [first, second].filter((result) => result.ok);
    const blocked = [first, second].filter((result) => !result.ok);
    expect(oks).toHaveLength(1);
    expect(blocked).toHaveLength(1);
    expect(!blocked[0].ok && blocked[0].error).toContain("Outro envio");
    expect(db.tables.campaign_messages.every((row) => row.status === "enviada")).toBe(true);
  });

  it("coleção: duas rodadas ao mesmo tempo também enviam uma vez só", async () => {
    const repo = createCampaignsRepository({ leads: leadsRepo, store: createCollectionStore(), now: () => clock });
    await leadsRepo.create("c2", lead("Ana", "+5547999990011"));
    await leadsRepo.create("c2", lead("Bia", "+5547999990012"));
    await prepare(repo, "c2");
    const sender = countingSender();
    await Promise.all([repo.runBatch("c2", sender), repo.runBatch("c2", sender)]);
    expect(sender.to).toHaveLength(2);
    expect(new Set(sender.to).size).toBe(2);
  });

  it("reserva só mensagens do cliente certo", async () => {
    const db = fakeTables();
    const store = createTableStore({ url: "https://x.supabase.co", secretKey: "sb_secret_teste", fetch: db.fetch });
    const repo = createCampaignsRepository({ leads: leadsRepo, store, now: () => clock });
    await leadsRepo.create("c3", lead("Ana", "+5547999990021"));
    await prepare(repo, "c3");
    const ids = db.tables.campaign_messages.map((row) => String(row.id));
    expect(await store.claimMessages("outro-cliente", ids, clock.toISOString())).toEqual([]);
    expect(db.tables.campaign_messages[0].status).toBe("na_fila");
    expect(await store.claimMessages("c3", ids, clock.toISOString())).toEqual(ids);
    expect(await store.claimMessages("c3", ids, clock.toISOString())).toEqual([]);
  });
});

describe("mensagens presas em Enviando", () => {
  function sliceWith(sentAt: string | null): Slice {
    const message: CampaignMessage = {
      id: "m1", userId: "c1", campaignId: "k1", leadId: "l1", leadName: "Ana", phone: "+5547999990001", text: "oi",
      status: "enviando", reason: "", providerId: null, queuedAt: clock.toISOString(), sentAt,
    };
    return { settings: DEFAULT_SETTINGS, templates: [], campaigns: [], messages: [message] };
  }

  it("vira Falhou depois do prazo, com aviso para conferir no WhatsApp", () => {
    const old = new Date(clock.getTime() - (STUCK_MINUTES + 1) * 60_000).toISOString();
    const result = expireStuck(sliceWith(old), clock);
    expect(result.messages[0].status).toBe("falhou");
    expect(result.messages[0].reason).toBe(STUCK_REASON);
  });

  it("dentro do prazo continua Enviando", () => {
    const recent = new Date(clock.getTime() - 2 * 60_000).toISOString();
    const slice = sliceWith(recent);
    expect(expireStuck(slice, clock)).toBe(slice);
  });

  it("uma rodada nova limpa as presas e segue com a fila", async () => {
    const db = fakeTables();
    const store = createTableStore({ url: "https://x.supabase.co", secretKey: "sb_secret_teste", fetch: db.fetch });
    const repo = createCampaignsRepository({ leads: leadsRepo, store, now: () => clock });
    await leadsRepo.create("c4", lead("Ana", "+5547999990031"));
    await leadsRepo.create("c4", lead("Bia", "+5547999990032"));
    await prepare(repo, "c4");
    const stuck = db.tables.campaign_messages[0];
    stuck.status = "enviando";
    stuck.sent_at = new Date(clock.getTime() - 60 * 60_000).toISOString();

    const sender = countingSender();
    const result = await repo.runBatch("c4", sender);
    expect(result.ok).toBe(true);
    expect(sender.to).toHaveLength(1);
    expect(stuck.status).toBe("falhou");
    expect(String(stuck.reason)).toContain("confira no WhatsApp");
  });
});
