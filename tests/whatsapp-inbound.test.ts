import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AuditSink, NewEntry } from "@/lib/audit";
import { mockAi } from "@/lib/inbox/ai";
import { createInboxRepository } from "@/lib/inbox/repository";
import { mockSender } from "@/lib/campaigns/sender";
import { mockLeadsRepository as leadsRepo } from "@/lib/leads/mock-repository";
import { processInbound } from "@/lib/whatsapp/inbound";

let dir: string;
let previous: string | undefined;
const logged: NewEntry[] = [];
const audit: AuditSink = { async log(entries) { logged.push(...entries); } };
const inbox = createInboxRepository({ leads: leadsRepo, sender: () => mockSender, ai: () => mockAi, now: () => new Date("2026-10-21T15:00:00.000Z") });

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "wa-in-"));
  previous = process.env.DATA_DIR;
  process.env.DATA_DIR = dir;
  logged.length = 0;
});
afterEach(async () => {
  if (previous === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = previous;
  await rm(dir, { recursive: true, force: true });
});

async function mk(userId: string, phone: string) {
  const r = await leadsRepo.create(userId, {
    name: "Ana", company: "Loja", phone, email: "", source: "manual", tags: [], notes: "",
    stage: "novo", optIn: true, optInSource: "formulario",
  });
  if (!r.ok) throw new Error(r.error);
  return r.lead;
}
const msg = (from: string, id: string, text: string | null = "Oi", type = "text") => ({ from, id, text, type });
const deps = (ownerId = "") => ({ leads: leadsRepo, inbox, audit, ownerId });

describe("processInbound", () => {
  it("entrega ao lead certo, mesmo quando o WhatsApp manda sem o 9 extra", async () => {
    const lead = await mk("u1", "+5547999991234");
    const s = await processInbound(deps("u1"), [msg("554799991234", "w1", "Oi, tudo bem?")]);
    expect(s.unknown).toBe(0);
    const thread = await inbox.getThread("u1", lead.id);
    expect(thread?.messages.some((m) => m.direction === "in" && m.text === "Oi, tudo bem?")).toBe(true);
  });

  it("mesma mensagem entregue duas vezes é processada uma só", async () => {
    const lead = await mk("u1", "+5547999991234");
    await processInbound(deps("u1"), [msg("5547999991234", "w1")]);
    const s = await processInbound(deps("u1"), [msg("5547999991234", "w1")]);
    expect(s.duplicates).toBe(1);
    const thread = await inbox.getThread("u1", lead.id);
    expect(thread?.messages.filter((m) => m.direction === "in")).toHaveLength(1);
  });

  it("número desconhecido é contado e nada é gravado", async () => {
    await mk("u1", "+5547999991234");
    const s = await processInbound(deps("u1"), [msg("5511988887777", "w1")]);
    expect(s.unknown).toBe(1);
  });

  it("com dono definido, ignora leads de outra conta", async () => {
    await mk("u2", "+5547999991234");
    expect((await processInbound(deps("u1"), [msg("5547999991234", "w1")])).unknown).toBe(1);
  });

  it("sem dono e número em duas contas: não adivinha", async () => {
    await mk("u1", "+5547999991234");
    await mk("u2", "+5547999991234");
    expect((await processInbound(deps(""), [msg("5547999991234", "w1")])).unknown).toBe(1);
  });

  it("foto/áudio vai direto para você, sem IA", async () => {
    const lead = await mk("u1", "+5547999991234");
    const s = await processInbound(deps("u1"), [msg("5547999991234", "w1", null, "image")]);
    expect(s.toYou).toBe(1);
    const thread = await inbox.getThread("u1", lead.id);
    expect(thread?.conversation?.mode).toBe("humano");
    expect(thread?.messages.some((m) => m.author === "ia")).toBe(false);
  });

  it("SAIR marca opt-out", async () => {
    const lead = await mk("u1", "+5547999991234");
    const s = await processInbound(deps("u1"), [msg("5547999991234", "w1", "SAIR")]);
    expect(s.optedOut).toBe(1);
    expect((await leadsRepo.get("u1", lead.id))?.optOut).toBe(true);
  });

  it("auditoria guarda só contagens, sem telefone nem texto", async () => {
    await mk("u1", "+5547999991234");
    await processInbound(deps("u1"), [msg("5547999991234", "w1", "meu segredo")]);
    expect(logged).toHaveLength(1);
    expect(logged[0]!.text).not.toMatch(/5547|segredo/);
  });
});
