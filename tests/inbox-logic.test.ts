import { describe, expect, it } from "vitest";
import { canHumanReply, dayKey, decideInbound, validateInboxSettings, validateMessageText, windowHoursLeft } from "@/lib/inbox/logic";
import { DAILY_AI_LIMIT, MAX_AI_REPLIES_IN_ROW, MAX_KNOWLEDGE, conversationState } from "@/lib/inbox/types";

const SETTINGS = { aiEnabled: true, businessName: "X", knowledge: "Horário: 9h às 18h." };
const base = {
  text: "qual o horário?",
  leadOptedOut: false,
  settings: SETTINGS,
  conversation: null,
  aiUsedToday: 0,
  hasPhone: true,
};

describe("decideInbound", () => {
  it("caso normal: a IA responde", () => {
    expect(decideInbound(base)).toEqual({ kind: "ai" });
  });
  it("SAIR/PARAR/CANCELAR exatos registram saída, mesmo com a IA desligada ou conversa assumida", () => {
    for (const text of ["SAIR", "parar", "Cancelar"]) {
      expect(decideInbound({ ...base, text }).kind).toBe("optout");
    }
    expect(decideInbound({ ...base, text: "SAIR", settings: { ...SETTINGS, aiEnabled: false } }).kind).toBe("optout");
    expect(decideInbound({ ...base, text: "SAIR", conversation: { mode: "humano", aiRepliesInRow: 0 } }).kind).toBe("optout");
  });
  it("quem já saiu da lista NUNCA recebe resposta automática", () => {
    expect(decideInbound({ ...base, leadOptedOut: true }).kind).toBe("human");
    expect(decideInbound({ ...base, leadOptedOut: true, text: "SAIR" }).kind).toBe("human");
  });
  it("frase que só cita 'cancelar' vai para você, não para a IA", () => {
    const d = decideInbound({ ...base, text: "quero cancelar meu pedido" });
    expect(d.kind).toBe("human");
  });
  it("transfere para você nos casos de segurança", () => {
    expect(decideInbound({ ...base, conversation: { mode: "humano", aiRepliesInRow: 0 } }).kind).toBe("human");
    expect(decideInbound({ ...base, settings: { ...SETTINGS, aiEnabled: false } }).kind).toBe("human");
    expect(decideInbound({ ...base, settings: { ...SETTINGS, knowledge: "  " } }).kind).toBe("human");
    expect(decideInbound({ ...base, hasPhone: false }).kind).toBe("human");
    expect(decideInbound({ ...base, conversation: { mode: "ia", aiRepliesInRow: MAX_AI_REPLIES_IN_ROW } }).kind).toBe("human");
    expect(decideInbound({ ...base, conversation: { mode: "ia", aiRepliesInRow: MAX_AI_REPLIES_IN_ROW - 1 } }).kind).toBe("ai");
    expect(decideInbound({ ...base, aiUsedToday: DAILY_AI_LIMIT }).kind).toBe("human");
    expect(decideInbound({ ...base, aiUsedToday: DAILY_AI_LIMIT - 1 }).kind).toBe("ai");
  });
});

describe("janela de 24h", () => {
  const last = "2026-10-21T12:00:00.000Z";
  it("abre por 24h depois da última mensagem do contato", () => {
    expect(canHumanReply(last, new Date("2026-10-22T11:59:00.000Z"))).toBe(true);
    expect(canHumanReply(last, new Date("2026-10-22T12:00:00.000Z"))).toBe(false);
    expect(canHumanReply(null, new Date(last))).toBe(false);
    expect(canHumanReply("lixo", new Date(last))).toBe(false);
  });
  it("calcula as horas que restam", () => {
    expect(windowHoursLeft(last, new Date("2026-10-21T13:00:00.000Z"))).toBe(23);
    expect(windowHoursLeft(last, new Date("2026-10-23T00:00:00.000Z"))).toBe(0);
  });
});

describe("dia da IA e validações", () => {
  it("usa o dia de São Paulo (21h em SP ainda é o mesmo dia, mesmo já sendo madrugada em UTC)", () => {
    expect(dayKey(new Date("2026-10-22T01:30:00.000Z"))).toBe("2026-10-21");
    expect(dayKey(new Date("2026-10-22T03:30:00.000Z"))).toBe("2026-10-22");
  });
  it("valida configurações", () => {
    expect(validateInboxSettings({ aiEnabled: true, businessName: "  Studio   Bela ", knowledge: " texto " })).toEqual({
      ok: true,
      value: { aiEnabled: true, businessName: "Studio Bela", knowledge: "texto" },
    });
    expect(validateInboxSettings({ aiEnabled: true, businessName: "x", knowledge: "a".repeat(MAX_KNOWLEDGE + 1) }).ok).toBe(false);
    expect(validateInboxSettings({ aiEnabled: true, businessName: "n".repeat(81), knowledge: "" }).ok).toBe(false);
  });
  it("valida mensagens", () => {
    expect(validateMessageText("  oi ")).toEqual({ ok: true, text: "oi" });
    expect(validateMessageText("   ").ok).toBe(false);
    expect(validateMessageText(42).ok).toBe(false);
    expect(validateMessageText("a".repeat(1001)).ok).toBe(false);
  });
  it("estado da conversa", () => {
    expect(conversationState({ mode: "ia", needsHuman: false }, false)).toBe("ia");
    expect(conversationState({ mode: "humano", needsHuman: true }, false)).toBe("aguardando");
    expect(conversationState({ mode: "humano", needsHuman: false }, false)).toBe("humano");
    expect(conversationState({ mode: "ia", needsHuman: false }, true)).toBe("saiu");
  });
});
