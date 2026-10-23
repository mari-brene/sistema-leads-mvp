import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createCampaignsRepository } from "@/lib/campaigns/repository";
import { mockSender, type WhatsAppSender } from "@/lib/campaigns/sender";
import { mockLeadsRepository as leadsRepo } from "@/lib/leads/mock-repository";
import type { CreateLeadInput } from "@/lib/leads/types";

let dir: string;
let previous: string | undefined;
// Sexta-feira, 12:00 em São Paulo.
let clock = new Date("2026-10-16T15:00:00.000Z");

const repo = createCampaignsRepository({ leads: leadsRepo, now: () => clock });

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "campaigns-"));
  previous = process.env.DATA_DIR;
  process.env.DATA_DIR = dir;
  clock = new Date("2026-10-16T15:00:00.000Z");
});

afterEach(async () => {
  if (previous === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = previous;
  await rm(dir, { recursive: true, force: true });
});

function input(name: string, phone: string | null, optIn = true): CreateLeadInput {
  return {
    name,
    company: "Empresa " + name,
    phone,
    email: "",
    source: "manual",
    tags: [],
    notes: "",
    stage: "novo",
    optIn: optIn && phone !== null,
    optInSource: optIn && phone !== null ? "formulario" : null,
  };
}

async function approvedTemplate(userId = "u1") {
  const added = await repo.addTemplate(userId, { name: "Oferta", body: "Oi {{nome}}, novidades para a {{empresa}}!" });
  if (!added.ok) throw new Error(added.error);
  await repo.approveTemplate(userId, added.template.id);
  return added.template.id;
}

async function startedCampaign(userId = "u1") {
  const templateId = await approvedTemplate(userId);
  const created = await repo.createCampaign(userId, { name: "Outubro", templateId, stages: ["novo"], tag: "" });
  if (!created.ok) throw new Error(created.error);
  await repo.changeCampaign(userId, created.campaign.id, "start");
  return created.campaign.id;
}

describe("campanhas de ponta a ponta (arquivos locais, envio simulado)", () => {
  it("envia só para quem tem opt-in, registra no histórico e move Novo → Contatado", async () => {
    await leadsRepo.create("u1", input("Ana Lima", "+5547999990001"));
    await leadsRepo.create("u1", input("Bruno Reis", "+5547999990002", false)); // sem opt-in
    const campaignId = await startedCampaign();

    const detail = await repo.getCampaign("u1", campaignId);
    expect(detail?.messages).toHaveLength(1);
    expect(detail?.messages[0].text).toContain("Oi Ana, novidades para a Empresa Ana Lima!");
    expect(detail?.messages[0].text).toContain("responda SAIR");

    const batch = await repo.runBatch("u1", mockSender);
    expect(batch).toMatchObject({ ok: true, sent: 1, failed: 0, skipped: 0, queuedLeft: 0, simulated: true });

    const after = await repo.getCampaign("u1", campaignId);
    expect(after?.campaign.status).toBe("concluida");
    expect(after?.counts.enviadas).toBe(1);

    const leads = await leadsRepo.list("u1");
    const ana = leads.find((l) => l.name === "Ana Lima");
    const bruno = leads.find((l) => l.name === "Bruno Reis");
    expect(ana?.stage).toBe("contatado");
    expect(ana?.events.some((e) => e.type === "mensagem" && e.text.includes("(simulação)"))).toBe(true);
    expect(bruno?.stage).toBe("novo");
    expect(bruno?.events.some((e) => e.type === "mensagem")).toBe(false);
  });

  it("quem pede para sair depois de entrar na fila não recebe", async () => {
    const a = await leadsRepo.create("u1", input("Ana", "+5547999990001"));
    await leadsRepo.create("u1", input("Bia", "+5547999990003"));
    const campaignId = await startedCampaign();
    if (a.ok) await leadsRepo.registerOptOut("u1", a.lead.id);

    const batch = await repo.runBatch("u1", mockSender);
    expect(batch).toMatchObject({ ok: true, sent: 1, skipped: 1 });

    const detail = await repo.getCampaign("u1", campaignId);
    const skipped = detail?.messages.find((m) => m.status === "pulada");
    expect(skipped?.leadName).toBe("Ana");
    expect(skipped?.reason).toContain("opt-out");
  });

  it("número que falha na simulação (final 0000) fica como falha e não mexe no lead", async () => {
    await leadsRepo.create("u1", input("Falha", "+5547999990000"));
    await leadsRepo.create("u1", input("Certo", "+5547999990005"));
    const campaignId = await startedCampaign();

    const batch = await repo.runBatch("u1", mockSender);
    expect(batch).toMatchObject({ ok: true, sent: 1, failed: 1 });

    const detail = await repo.getCampaign("u1", campaignId);
    const failed = detail?.messages.find((m) => m.status === "falhou");
    expect(failed?.leadName).toBe("Falha");
    expect(failed?.reason).toContain("simulação");

    const leads = await leadsRepo.list("u1");
    expect(leads.find((l) => l.name === "Falha")?.stage).toBe("novo");
    expect(leads.find((l) => l.name === "Certo")?.stage).toBe("contatado");
  });

  it("não envia fora do horário e nada é gravado", async () => {
    await leadsRepo.create("u1", input("Ana", "+5547999990001"));
    const campaignId = await startedCampaign();

    clock = new Date("2026-10-16T22:30:00.000Z"); // 19:30
    const blocked = await repo.runBatch("u1", mockSender);
    expect(blocked.ok).toBe(false);
    expect((await repo.getCampaign("u1", campaignId))?.counts.enviadas).toBe(0);

    clock = new Date("2026-10-19T13:00:00.000Z"); // segunda, 10:00
    expect((await repo.runBatch("u1", mockSender)).ok).toBe(true);
  });

  it("limite diário vale somando campanhas e libera no dia seguinte", async () => {
    for (let i = 1; i <= 5; i++) await leadsRepo.create("u1", input(`Lead ${i}`, `+554799999100${i}`));
    await repo.saveSettings("u1", { ...(await repo.getSettings("u1")), dailyLimit: 3 });
    const campaignId = await startedCampaign();

    expect(await repo.runBatch("u1", mockSender)).toMatchObject({ ok: true, sent: 3, queuedLeft: 2 });
    expect((await repo.usage("u1")).sent).toBe(3);

    const blocked = await repo.runBatch("u1", mockSender);
    expect(blocked.ok).toBe(false);

    clock = new Date("2026-10-19T13:00:00.000Z"); // segunda
    expect(await repo.runBatch("u1", mockSender)).toMatchObject({ ok: true, sent: 2, queuedLeft: 0 });
    expect((await repo.getCampaign("u1", campaignId))?.campaign.status).toBe("concluida");
  });

  it("pausar impede o envio; retomar volta a enviar", async () => {
    await leadsRepo.create("u1", input("Ana", "+5547999990001"));
    const campaignId = await startedCampaign();
    await repo.changeCampaign("u1", campaignId, "pause");
    expect((await repo.runBatch("u1", mockSender)).ok).toBe(false);
    await repo.changeCampaign("u1", campaignId, "start");
    expect((await repo.runBatch("u1", mockSender)).ok).toBe(true);
  });

  it("um erro inesperado do envio não derruba os outros", async () => {
    await leadsRepo.create("u1", input("Ana", "+5547999990001"));
    await leadsRepo.create("u1", input("Bia", "+5547999990003"));
    await startedCampaign();
    let calls = 0;
    const flaky: WhatsAppSender = {
      id: "mock",
      simulated: true,
      send: async (request) => {
        calls += 1;
        if (calls === 1) throw new Error("rede caiu");
        return mockSender.send(request);
      },
    };
    expect(await repo.runBatch("u1", flaky)).toMatchObject({ ok: true, sent: 1, failed: 1 });
  });

  it("cada pessoa vê só as suas campanhas, modelos e configurações", async () => {
    await leadsRepo.create("u1", input("Ana", "+5547999990001"));
    await startedCampaign("u1");
    await repo.saveSettings("u1", { ...(await repo.getSettings("u1")), dailyLimit: 7 });

    expect(await repo.listCampaigns("u2")).toHaveLength(0);
    expect(await repo.listTemplates("u2")).toHaveLength(0);
    expect((await repo.getSettings("u2")).dailyLimit).toBe(30);
    expect((await repo.getSettings("u1")).dailyLimit).toBe(7);
    expect((await repo.runBatch("u2", mockSender)).ok).toBe(false);
  });

  it("o simulador falha para números terminados em 0000 e funciona para os outros", async () => {
    expect((await mockSender.send({ to: "+5547999990000", text: "x", templateName: "t" })).ok).toBe(false);
    expect((await mockSender.send({ to: "+5547999990001", text: "x", templateName: "t" })).ok).toBe(true);
  });
});
