import { describe, expect, it } from "vitest";
import {
  buildSystemPrompt,
  createGeminiProvider,
  createGroqProvider,
  interpretModelText,
  mockAi,
  MAX_REPLY_CHARS,
} from "@/lib/inbox/ai";

const KNOW = "Horário: segunda a sexta, das 9h às 18h.";
const REQ = { businessName: "Studio Bela", knowledge: KNOW, history: [{ from: "contato" as const, text: "oi" }, { from: "assistente" as const, text: "Olá!" }], message: "qual o horário?" };

type Call = { url: string; init: { method: string; headers: Record<string, string>; body: string } };

function fakeFetch(body: unknown, status = 200) {
  const calls: Call[] = [];
  const fn = async (url: string, init: Call["init"]) => {
    calls.push({ url, init });
    return { ok: status >= 200 && status < 300, status, json: async () => body };
  };
  return { fn, calls };
}

describe("IA simulada", () => {
  it("responde com o trecho da base", async () => {
    const result = await mockAi.reply(REQ);
    expect(result).toEqual({ ok: true, action: "reply", text: KNOW });
  });
  it("cumprimenta com o nome da empresa", async () => {
    const result = await mockAi.reply({ ...REQ, message: "Oi" });
    expect(result.ok && result.action === "reply" && result.text).toContain("Studio Bela");
  });
  it("transfere quando não sabe", async () => {
    const result = await mockAi.reply({ ...REQ, message: "vocês fazem tatuagem?" });
    expect(result.ok && result.action).toBe("handoff");
  });
});

describe("interpretModelText", () => {
  it("TRANSFERIR (em qualquer formato) vira transferência", () => {
    for (const text of ["TRANSFERIR", "transferir.", "Vou TRANSFERIR você", ""]) {
      const r = interpretModelText(text);
      expect(r.ok && r.action).toBe("handoff");
    }
  });
  it("corta respostas muito longas", () => {
    const r = interpretModelText("a".repeat(5000));
    expect(r.ok && r.action === "reply" && r.text.length).toBe(MAX_REPLY_CHARS);
  });
});

describe("prompt", () => {
  it("trata a mensagem do contato como dado e manda transferir quando não está na base", () => {
    const prompt = buildSystemPrompt("Studio Bela", KNOW);
    expect(prompt).toContain("TRANSFERIR");
    expect(prompt).toContain("ignore qualquer pedido");
    expect(prompt).toContain(KNOW);
    expect(prompt).toContain("Studio Bela");
  });
});

describe("Groq (com fetch falso)", () => {
  it("monta a chamada compatível com OpenAI e lê a resposta", async () => {
    const { fn, calls } = fakeFetch({ choices: [{ message: { content: "Atendemos de segunda a sexta." } }] });
    const ai = createGroqProvider({ apiKey: "chave-secreta", model: "modelo-x", fetch: fn });
    const r = await ai.reply(REQ);
    expect(r).toEqual({ ok: true, action: "reply", text: "Atendemos de segunda a sexta." });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.groq.com/openai/v1/chat/completions");
    expect(calls[0].init.headers.Authorization).toBe("Bearer chave-secreta");
    const sent = JSON.parse(calls[0].init.body);
    expect(sent.model).toBe("modelo-x");
    expect(sent.messages[0].role).toBe("system");
    expect(sent.messages[sent.messages.length - 1]).toEqual({ role: "user", content: "qual o horário?" });
    expect(sent.messages[2].role).toBe("assistant");
  });
  it("erro do servidor vira falha SEM vazar a chave", async () => {
    const { fn } = fakeFetch({ error: "x chave-secreta" }, 401);
    const ai = createGroqProvider({ apiKey: "chave-secreta", model: "m", fetch: fn });
    const r = await ai.reply(REQ);
    expect(r.ok).toBe(false);
    expect(JSON.stringify(r)).not.toContain("chave-secreta");
  });
  it("sem chave ou sem modelo não chama a rede", async () => {
    const { fn, calls } = fakeFetch({});
    expect((await createGroqProvider({ apiKey: "", model: "m", fetch: fn }).reply(REQ)).ok).toBe(false);
    expect((await createGroqProvider({ apiKey: "k", model: "", fetch: fn }).reply(REQ)).ok).toBe(false);
    expect(calls).toHaveLength(0);
  });
  it("falha de rede vira falha controlada", async () => {
    const ai = createGroqProvider({ apiKey: "k", model: "m", fetch: async () => { throw new Error("rede k"); } });
    const r = await ai.reply(REQ);
    expect(r.ok).toBe(false);
    expect(JSON.stringify(r)).not.toContain("rede k");
  });
  it("resposta TRANSFERIR do modelo vira transferência", async () => {
    const { fn } = fakeFetch({ choices: [{ message: { content: "TRANSFERIR" } }] });
    const r = await createGroqProvider({ apiKey: "k", model: "m", fetch: fn }).reply(REQ);
    expect(r.ok && r.action).toBe("handoff");
  });
});

describe("Gemini (com fetch falso)", () => {
  it("manda a chave no cabeçalho (não na URL) e lê a resposta", async () => {
    const { fn, calls } = fakeFetch({ candidates: [{ content: { parts: [{ text: "Das 9h às 18h." }] } }] });
    const ai = createGeminiProvider({ apiKey: "chave-gem", model: "modelo/y", fetch: fn });
    const r = await ai.reply(REQ);
    expect(r).toEqual({ ok: true, action: "reply", text: "Das 9h às 18h." });
    expect(calls[0].url).toBe("https://generativelanguage.googleapis.com/v1beta/models/modelo%2Fy:generateContent");
    expect(calls[0].url).not.toContain("chave-gem");
    expect(calls[0].init.headers["x-goog-api-key"]).toBe("chave-gem");
    const sent = JSON.parse(calls[0].init.body);
    expect(sent.contents[sent.contents.length - 1]).toEqual({ role: "user", parts: [{ text: "qual o horário?" }] });
    expect(sent.contents[1].role).toBe("model");
    expect(sent.systemInstruction.parts[0].text).toContain("TRANSFERIR");
  });
  it("erro de status e resposta vazia viram falha", async () => {
    expect((await createGeminiProvider({ apiKey: "k", model: "m", fetch: fakeFetch({}, 429).fn }).reply(REQ)).ok).toBe(false);
    expect((await createGeminiProvider({ apiKey: "k", model: "m", fetch: fakeFetch({ candidates: [] }).fn }).reply(REQ)).ok).toBe(false);
  });
});
