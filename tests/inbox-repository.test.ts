import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AiProvider, AiRequest, AiResult } from "@/lib/inbox/ai";
import { mockAi } from "@/lib/inbox/ai";
import { createInboxRepository } from "@/lib/inbox/repository";
import { mockSender, type SendRequest, type WhatsAppSender } from "@/lib/campaigns/sender";
import { mockLeadsRepository as leadsRepo } from "@/lib/leads/mock-repository";
import type { CreateLeadInput } from "@/lib/leads/types";

let dir: string;
let previous: string | undefined;
let clock = new Date("2026-10-21T15:00:00.000Z");
let sentLog: SendRequest[] = [];
let aiCalls: AiRequest[] = [];
let aiImpl: (req: AiRequest) => Promise<AiResult> = (req) => mockAi.reply(req);

const recordingSender: WhatsAppSender = {
  id: "mock",
  simulated: true,
  async send(request) {
    sentLog.push(request);
    return mockSender.send(request);
  },
};
const fakeAi: AiProvider = {
  id: "mock",
  simulated: true,
  async reply(req) {
    aiCalls.push(req);
    return aiImpl(req);
  },
};

const repo = createInboxRepository({ leads: leadsRepo, sender: () => recordingSender, ai: () => fakeAi, now: () => clock });

const KNOW = "Horário: atendemos de segunda a sexta, das 9h às 18h.\n\nPreços: o corte custa R$ 50.";

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "inbox-"));
  previous = process.env.DATA_DIR;
  process.env.DATA_DIR = dir;
  clock = new Date("2026-10-21T15:00:00.000Z");
  sentLog = [];
  aiCalls = [];
  aiImpl = (req) => mockAi.reply(req);
});

afterEach(async () => {
  if (previous === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = previous;
  await rm(dir, { recursive: true, force: true });
});

function input(name: string, phone: string | null): CreateLeadInput {
  return {
    name, company: "Empresa " + name, phone, email: "", source: "manual", tags: [], notes: "",
    stage: "novo", optIn: phone !== null, optInSource: phone !== null ? "formulario" : null,
  };
}

async function lead(name = "Ana Lima", phone: string | null = "+5547999990001") {
  const r = await leadsRepo.create("u1", input(name, phone));
  if (!r.ok) throw new Error(r.error);
  return r.lead;
}

async function setup(knowledge = KNOW, aiEnabled = true) {
  const saved = await repo.saveSettings("u1", { aiEnabled, businessName: "Studio Bela", knowledge });
  if (!saved.ok) throw new Error(saved.error);
}

describe("caixa de entrada de ponta a ponta (arquivos locais, envio e IA simulados)", () => {
  it("a IA responde com a base, registra a conversa e move o lead para Respondeu", async () => {
    await setup();
    const l = await lead();
    const r = await repo.receive("u1", l.id, "Qual o horário de atendimento?");
    expect(r).toEqual({ ok: true, outcome: "ia_respondeu" });

    const thread = await repo.getThread("u1", l.id);
    expect(thread?.messages.map((m) => [m.direction, m.author])).toEqual([["in", "contato"], ["out", "ia"]]);
    expect(thread?.messages[1].text).toContain("segunda a sexta");
    expect(thread?.conversation?.mode).toBe("ia");
    expect(thread?.conversation?.aiRepliesInRow).toBe(1);
    expect(sentLog).toHaveLength(1);
    expect(sentLog[0].to).toBe("+5547999990001");

    const after = await leadsRepo.get("u1", l.id);
    expect(after?.stage).toBe("respondeu");
    expect(after?.events.some((e) => e.text.startsWith("Mensagem recebida"))).toBe(true);
  });

  it("SAIR registra opt-out, confirma e NÃO chama a IA", async () => {
    await setup();
    const l = await lead();
    const r = await repo.receive("u1", l.id, "SAIR");
    expect(r).toEqual({ ok: true, outcome: "saiu" });
    expect(aiCalls).toHaveLength(0);
    const after = await leadsRepo.get("u1", l.id);
    expect(after?.optOut).toBe(true);
    expect(after?.optIn).toBe(false);
    const thread = await repo.getThread("u1", l.id);
    expect(thread?.messages.map((m) => m.author)).toEqual(["contato", "sistema"]);
    expect(thread?.canReply).toBe(false);
    expect(await repo.sendHuman("u1", l.id, "oi")).toEqual({ ok: false, error: "Este contato saiu da lista. Não é possível enviar mensagens." });
  });

  it("depois de sair, nenhuma mensagem do contato recebe resposta automática", async () => {
    await setup();
    const l = await lead();
    await repo.receive("u1", l.id, "PARAR");
    sentLog = [];
    const r = await repo.receive("u1", l.id, "qual o horário?");
    expect(r).toEqual({ ok: true, outcome: "para_voce" });
    expect(sentLog).toHaveLength(0);
    expect(aiCalls).toHaveLength(0);
    expect((await repo.handBack("u1", l.id)).ok).toBe(false);
  });

  it("pergunta fora da base: a IA transfere e avisa o motivo", async () => {
    await setup();
    const l = await lead();
    const r = await repo.receive("u1", l.id, "vocês fazem tatuagem?");
    expect(r).toEqual({ ok: true, outcome: "para_voce" });
    const thread = await repo.getThread("u1", l.id);
    expect(thread?.conversation?.mode).toBe("humano");
    expect(thread?.conversation?.needsHuman).toBe(true);
    expect(thread?.conversation?.handoffReason).toContain("base de conhecimento");
    expect(sentLog).toHaveLength(0);
  });

  it("falha da IA vira transferência (nada é enviado)", async () => {
    await setup();
    aiImpl = async () => ({ ok: false, error: "Groq respondeu com erro 429." });
    const l = await lead();
    expect(await repo.receive("u1", l.id, "qual o horário?")).toEqual({ ok: true, outcome: "para_voce" });
    expect(sentLog).toHaveLength(0);
    expect((await repo.getThread("u1", l.id))?.conversation?.handoffReason).toContain("429");
  });

  it("IA desligada ou base vazia: só você responde", async () => {
    await setup(KNOW, false);
    const l = await lead();
    expect((await repo.receive("u1", l.id, "qual o horário?"))).toEqual({ ok: true, outcome: "para_voce" });
    expect(aiCalls).toHaveLength(0);

    const l2 = await lead("Bia", "+5547999990002");
    await setup("", true);
    expect((await repo.receive("u1", l2.id, "qual o horário?"))).toEqual({ ok: true, outcome: "para_voce" });
    expect(aiCalls).toHaveLength(0);
  });

  it("depois de 5 respostas seguidas, a conversa passa para você", async () => {
    await setup();
    const l = await lead();
    for (let i = 0; i < 5; i += 1) {
      expect((await repo.receive("u1", l.id, "qual o horário?")).ok).toBe(true);
    }
    expect(sentLog).toHaveLength(5);
    const sixth = await repo.receive("u1", l.id, "qual o horário?");
    expect(sixth).toEqual({ ok: true, outcome: "para_voce" });
    expect(sentLog).toHaveLength(5);
  });

  it("assumir e devolver à IA", async () => {
    await setup();
    const l = await lead();
    await repo.receive("u1", l.id, "oi");
    await repo.takeOver("u1", l.id);
    sentLog = [];
    expect(await repo.receive("u1", l.id, "qual o horário?")).toEqual({ ok: true, outcome: "para_voce" });
    expect(sentLog).toHaveLength(0);

    await repo.handBack("u1", l.id);
    const thread = await repo.getThread("u1", l.id);
    expect(thread?.conversation?.mode).toBe("ia");
    expect(thread?.conversation?.aiRepliesInRow).toBe(0);
    expect(await repo.receive("u1", l.id, "qual o horário?")).toEqual({ ok: true, outcome: "ia_respondeu" });
  });

  it("resposta humana: dentro de 24h envia; depois de 24h é bloqueada", async () => {
    await setup("", true);
    const l = await lead();
    await repo.receive("u1", l.id, "preciso de ajuda");
    expect((await repo.sendHuman("u1", l.id, "Já te ajudo!")).ok).toBe(true);
    expect(sentLog.map((s) => s.text)).toEqual(["Já te ajudo!"]);
    const thread = await repo.getThread("u1", l.id);
    expect(thread?.conversation?.needsHuman).toBe(false);
    expect(thread?.messages[thread.messages.length - 1].author).toBe("voce");

    clock = new Date("2026-10-22T15:00:01.000Z");
    const late = await repo.sendHuman("u1", l.id, "ainda aí?");
    expect(late.ok).toBe(false);
    expect((await repo.getThread("u1", l.id))?.canReply).toBe(false);
    expect(sentLog).toHaveLength(1);
  });

  it("falha no envio (número ...0000) vira transferência e fica registrada", async () => {
    await setup();
    const l = await lead("Caio", "+5547999990000");
    expect(await repo.receive("u1", l.id, "qual o horário?")).toEqual({ ok: true, outcome: "para_voce" });
    const thread = await repo.getThread("u1", l.id);
    const out = thread?.messages.find((m) => m.direction === "out");
    expect(out?.status).toBe("falhou");
    expect(thread?.conversation?.needsHuman).toBe(true);
  });

  it("se você assume enquanto a IA pensa, a resposta da IA é descartada", async () => {
    await setup();
    const l = await lead();
    aiImpl = async (req) => {
      await repo.takeOver("u1", l.id);
      return mockAi.reply(req);
    };
    expect(await repo.receive("u1", l.id, "qual o horário?")).toEqual({ ok: true, outcome: "para_voce" });
    expect(sentLog).toHaveLength(0);
  });

  it("se o contato sai enquanto a IA pensa, nada é enviado", async () => {
    await setup();
    const l = await lead();
    aiImpl = async (req) => {
      await leadsRepo.registerOptOut("u1", l.id);
      return mockAi.reply(req);
    };
    expect(await repo.receive("u1", l.id, "qual o horário?")).toEqual({ ok: true, outcome: "para_voce" });
    expect(sentLog).toHaveLength(0);
  });

  it("limite diário da IA", async () => {
    await setup();
    const l = await lead();
    // 100 por dia: simulamos várias conversas, cada uma com 1 resposta
    for (let i = 0; i < 100; i += 1) {
      const x = await leadsRepo.create("u1", input("Pessoa" + i, `+55479999${String(10000 + i)}`));
      if (!x.ok) throw new Error(x.error);
      await repo.receive("u1", x.lead.id, "qual o horário?");
    }
    expect(aiCalls).toHaveLength(100);
    expect(await repo.receive("u1", l.id, "qual o horário?")).toEqual({ ok: true, outcome: "para_voce" });
    expect(aiCalls).toHaveLength(100);
    clock = new Date("2026-10-22T15:00:00.000Z"); // outro dia
    await repo.handBack("u1", l.id); // a conversa tinha passado para você; devolvemos à IA
    expect(await repo.receive("u1", l.id, "qual o horário?")).toEqual({ ok: true, outcome: "ia_respondeu" });
  }, 120_000);

  it("valida entradas e isola por usuária", async () => {
    await setup();
    const l = await lead();
    expect((await repo.receive("u1", l.id, "   ")).ok).toBe(false);
    expect((await repo.receive("u1", "nao-existe", "oi")).ok).toBe(false);
    expect((await repo.receive("u2", l.id, "oi")).ok).toBe(false);
    const semTelefone = await lead("Sem Tel", null);
    expect((await repo.receive("u1", semTelefone.id, "oi")).ok).toBe(false);
    expect(await repo.getThread("u2", l.id)).toBeNull();
    expect((await repo.listConversations("u2"))).toHaveLength(0);
  });

  it("lista: quem espera você aparece primeiro", async () => {
    await setup();
    const a = await lead("Ana", "+5547999990001");
    const b = await lead("Bia", "+5547999990002");
    await repo.receive("u1", a.id, "qual o horário?"); // IA responde
    clock = new Date("2026-10-21T15:05:00.000Z");
    await repo.receive("u1", b.id, "vocês fazem tatuagem?"); // vai para você
    clock = new Date("2026-10-21T15:10:00.000Z");
    await repo.receive("u1", a.id, "qual o horário?");
    const rows = await repo.listConversations("u1");
    expect(rows.map((r) => r.lead.name)).toEqual(["Bia", "Ana"]);
  });

  it("configurações: salva, lê e rejeita base grande demais", async () => {
    expect(await repo.getSettings("u1")).toEqual({ aiEnabled: true, businessName: "", knowledge: "" });
    await setup();
    expect((await repo.getSettings("u1")).businessName).toBe("Studio Bela");
    expect((await repo.saveSettings("u1", { aiEnabled: true, businessName: "", knowledge: "a".repeat(7000) })).ok).toBe(false);
    expect((await repo.getSettings("u1")).knowledge).toBe(KNOW);
    expect((await repo.getSettings("u2")).knowledge).toBe("");
  });
});
