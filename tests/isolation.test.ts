import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { addEntries, emptyAudit, readAudit, createAuditSink } from "@/lib/audit";
import { createCampaignsRepository } from "@/lib/campaigns/repository";
import { mockSender } from "@/lib/campaigns/sender";
import { mockAi } from "@/lib/inbox/ai";
import { createInboxRepository } from "@/lib/inbox/repository";
import { mockLeadsRepository as leads } from "@/lib/leads/mock-repository";
import type { CreateLeadInput } from "@/lib/leads/types";
import { fileSearchStore } from "@/lib/places/store";

/**
 * Isolamento entre clientes: o cliente "A" faz de tudo e o cliente "B" tenta ver, mexer e apagar.
 * Nos testes o id do cliente faz o papel de userId (é assim no sistema: Lead.userId = id do cliente).
 */

let dir: string;
let previous: string | undefined;
const clock = new Date("2026-10-16T15:00:00.000Z"); // sexta, 12:00 em São Paulo

const campaigns = createCampaignsRepository({ leads, now: () => clock });
const inbox = createInboxRepository({ leads, sender: () => mockSender, ai: () => mockAi, now: () => clock });

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "isolation-"));
  previous = process.env.DATA_DIR;
  process.env.DATA_DIR = dir;
});
afterEach(async () => {
  if (previous === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = previous;
  await rm(dir, { recursive: true, force: true });
});

const input = (name: string, phone: string): CreateLeadInput => ({
  name, company: "", phone, email: "", source: "manual", tags: [], notes: "", stage: "novo", optIn: true, optInSource: "formulario",
});

async function leadOf(client: string, name: string, phone: string) {
  const r = await leads.create(client, input(name, phone));
  if (!r.ok) throw new Error(r.error);
  return r.lead;
}

describe("isolamento entre clientes", () => {
  it("leads: B não vê, não edita, não move e não apaga os leads de A", async () => {
    const ana = await leadOf("A", "Ana", "+5547999990001");
    const eventsBefore = ana.events.length;
    expect(await leads.list("B")).toEqual([]);
    expect(await leads.get("B", ana.id)).toBeNull();
    expect((await leads.update("B", ana.id, input("Invasor", "+5547999990009"))).ok).toBe(false);
    expect((await leads.move("B", ana.id, "contatado", 0)).ok).toBe(false);
    expect((await leads.addNote("B", ana.id, "x")).ok).toBe(false);
    expect((await leads.registerOptIn("B", ana.id, "formulario")).ok).toBe(false);
    expect((await leads.registerOptOut("B", ana.id)).ok).toBe(false);
    expect((await leads.recordCampaignMessage("B", ana.id, "x")).ok).toBe(false);
    expect((await leads.recordInboundMessage("B", ana.id, "x")).ok).toBe(false);
    expect((await leads.remove("B", ana.id)).ok).toBe(false);
    const still = await leads.get("A", ana.id);
    expect(still?.name).toBe("Ana");
    expect(still?.stage).toBe("novo");
    expect(still?.events).toHaveLength(eventsBefore);
  });

  it("leads: importação em B não mexe nos leads de A (mesmo telefone pode existir nos dois)", async () => {
    await leadOf("A", "Ana", "+5547999990001");
    const result = await leads.importMany("B", [input("Ana de B", "+5547999990001")]);
    expect(result.created).toBe(1);
    expect((await leads.list("A")).map((l) => l.name)).toEqual(["Ana"]);
    expect((await leads.list("B")).map((l) => l.name)).toEqual(["Ana de B"]);
  });

  it("campanhas: modelos, campanhas, fila e configurações são só de cada cliente", async () => {
    await leadOf("A", "Ana", "+5547999990001");
    const template = await campaigns.addTemplate("A", { name: "Oferta", body: "Oi {{nome}}!" });
    if (!template.ok) throw new Error(template.error);
    await campaigns.approveTemplate("A", template.template.id);
    const created = await campaigns.createCampaign("A", { name: "C1", templateId: template.template.id, stages: ["novo"], tag: "" });
    if (!created.ok) throw new Error(created.error);
    await campaigns.changeCampaign("A", created.campaign.id, "start");

    expect(await campaigns.listTemplates("B")).toEqual([]);
    expect(await campaigns.listCampaigns("B")).toEqual([]);
    expect(await campaigns.getCampaign("B", created.campaign.id)).toBeNull();
    expect((await campaigns.changeCampaign("B", created.campaign.id, "cancel")).ok).toBe(false);
    expect((await campaigns.removeCampaign("B", created.campaign.id)).ok).toBe(false);
    expect((await campaigns.removeTemplate("B", template.template.id)).ok).toBe(false);
    expect((await campaigns.approveTemplate("B", template.template.id)).ok).toBe(false);
    expect((await campaigns.previewAudience("B", ["novo"], "")).eligible).toEqual([]);

    // B não consegue criar campanha com modelo de A.
    const crossed = await campaigns.createCampaign("B", { name: "Roubo", templateId: template.template.id, stages: ["novo"], tag: "" });
    expect(crossed.ok).toBe(false);

    // Disparar o lote de B não envia nada do que é de A.
    const batch = await campaigns.runBatch("B", mockSender);
    expect(batch.ok === true ? batch.sent : 0).toBe(0);
    expect((await campaigns.getCampaign("A", created.campaign.id))?.counts.enviadas).toBe(0);

    // Configurações são separadas.
    await campaigns.saveSettings("A", { ...(await campaigns.getSettings("A")), dailyLimit: 7 });
    expect((await campaigns.getSettings("B")).dailyLimit).not.toBe(7);
  });

  it("campanhas: o agendador só considera quem tem campanha em andamento e roda cada cliente separado", async () => {
    await leadOf("A", "Ana", "+5547999990001");
    await leadOf("B", "Bia", "+5547999990002");
    const ta = await campaigns.addTemplate("A", { name: "Oferta", body: "Oi {{nome}}!" });
    if (!ta.ok) throw new Error(ta.error);
    await campaigns.approveTemplate("A", ta.template.id);
    const ca = await campaigns.createCampaign("A", { name: "C", templateId: ta.template.id, stages: ["novo"], tag: "" });
    if (!ca.ok) throw new Error(ca.error);
    await campaigns.changeCampaign("A", ca.campaign.id, "start");
    expect(await campaigns.listActiveUserIds()).toEqual(["A"]);
    await campaigns.runBatch("A", mockSender);
    expect((await leads.get("B", (await leads.list("B"))[0].id))?.stage).toBe("novo");
    expect((await leads.list("A"))[0].stage).toBe("contatado");
  });

  it("caixa de entrada: conversas, mensagens e configurações são só de cada cliente", async () => {
    const ana = await leadOf("A", "Ana", "+5547999990001");
    await inbox.saveSettings("A", { aiEnabled: true, businessName: "Studio A", knowledge: "Horário: segunda a sexta, das 9h às 18h." });
    const received = await inbox.receive("A", ana.id, "Qual o horário?");
    expect(received.ok).toBe(true);

    expect(await inbox.listConversations("B")).toEqual([]);
    expect(await inbox.getThread("B", ana.id)).toBeNull();
    expect((await inbox.receive("B", ana.id, "oi")).ok).toBe(false);
    expect((await inbox.sendHuman("B", ana.id, "oi")).ok).toBe(false);
    expect((await inbox.takeOver("B", ana.id)).ok).toBe(false);
    expect((await inbox.handBack("B", ana.id)).ok).toBe(false);
    expect((await inbox.getSettings("B")).businessName).not.toBe("Studio A");
    expect((await inbox.getThread("A", ana.id))?.messages.length).toBeGreaterThan(0);
  });

  it("auditoria: cada cliente só lê os próprios registros e os do sistema", async () => {
    const sink = createAuditSink(() => clock);
    await sink.log(
      [
        { userId: "A", kind: "agendador", text: "lote de A" },
        { userId: "B", kind: "agendador", text: "lote de B" },
        { userId: null, kind: "erro", text: "evento do sistema" },
      ],
      "ok",
    );
    const forB = (await readAudit("B")).entries.map((e) => e.text).sort();
    expect(forB).toEqual(["evento do sistema", "lote de B"]);
    expect((await readAudit("A")).entries.map((e) => e.text)).not.toContain("lote de B");
    expect(addEntries(emptyAudit(), [], clock.toISOString(), () => "x").entries).toEqual([]);
  });

  it("busca de empresas: o limite diário é separado por cliente", async () => {
    const day = "2026-10-16";
    expect((await fileSearchStore.reserve("A", day, 1)).ok).toBe(true);
    expect((await fileSearchStore.reserve("A", day, 1)).ok).toBe(false);
    expect((await fileSearchStore.reserve("B", day, 1)).ok).toBe(true);
    expect(await fileSearchStore.used("B", day)).toBe(1);
  });
});
