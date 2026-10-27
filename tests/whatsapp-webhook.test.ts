import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { parseInbound, verifyChallenge, verifySignature } from "@/lib/whatsapp/webhook";

const sign = (body: string, secret: string) => "sha256=" + createHmac("sha256", secret).update(body).digest("hex");

describe("verifySignature", () => {
  const body = '{"a":1}';
  it("aceita assinatura correta", () => expect(verifySignature(body, sign(body, "segredo"), "segredo")).toBe(true));
  it("recusa assinatura de outro segredo, corpo alterado, sem cabeçalho ou sem segredo", () => {
    expect(verifySignature(body, sign(body, "outro"), "segredo")).toBe(false);
    expect(verifySignature(body + " ", sign(body, "segredo"), "segredo")).toBe(false);
    expect(verifySignature(body, null, "segredo")).toBe(false);
    expect(verifySignature(body, sign(body, ""), "")).toBe(false);
    expect(verifySignature(body, "sha256=", "segredo")).toBe(false);
    expect(verifySignature(body, sign(body, "segredo").slice(7), "segredo")).toBe(false);
  });
});

describe("verifyChallenge", () => {
  const p = (o: Record<string, string>) => new URLSearchParams(o);
  it("devolve o desafio quando o token confere", () => {
    expect(verifyChallenge(p({ "hub.mode": "subscribe", "hub.verify_token": "token-12345", "hub.challenge": "999" }), "token-12345")).toBe("999");
  });
  it("recusa token errado, modo errado, token curto ou ausente", () => {
    expect(verifyChallenge(p({ "hub.mode": "subscribe", "hub.verify_token": "errado!!!", "hub.challenge": "9" }), "token-12345")).toBeNull();
    expect(verifyChallenge(p({ "hub.mode": "x", "hub.verify_token": "token-12345", "hub.challenge": "9" }), "token-12345")).toBeNull();
    expect(verifyChallenge(p({ "hub.mode": "subscribe", "hub.verify_token": "abc", "hub.challenge": "9" }), "abc")).toBeNull();
    expect(verifyChallenge(p({ "hub.mode": "subscribe", "hub.verify_token": "", "hub.challenge": "9" }), "")).toBeNull();
  });
});

const payload = (messages: unknown[], phoneNumberId = "555") => ({
  object: "whatsapp_business_account",
  entry: [{ changes: [{ field: "messages", value: { metadata: { phone_number_id: phoneNumberId }, messages } }] }],
});

describe("parseInbound", () => {
  it("lê texto e marca o que não é texto", () => {
    const r = parseInbound(payload([
      { from: "5547999990001", id: "w1", type: "text", text: { body: "Oi" } },
      { from: "5547999990001", id: "w2", type: "image" },
    ]), "555");
    expect(r).toEqual([
      { from: "5547999990001", id: "w1", type: "text", text: "Oi" },
      { from: "5547999990001", id: "w2", type: "image", text: null },
    ]);
  });
  it("ignora outro número da conta, malformados e lixo", () => {
    expect(parseInbound(payload([{ from: "5547999990001", id: "w1", type: "text", text: { body: "Oi" } }], "999"), "555")).toEqual([]);
    expect(parseInbound(payload([{ from: "abc", id: "w1", type: "text", text: { body: "x" } }, { from: "5547999990001", type: "text" }, null]), "555")).toEqual([]);
    expect(parseInbound(null, "555")).toEqual([]);
    expect(parseInbound({ entry: "x" }, "555")).toEqual([]);
    expect(parseInbound(payload([{ from: "5547999990001", id: "w1", type: "text", text: { body: "Oi" } }]), "")).toEqual([]);
  });
  it("ignora atualizações de status (sem messages)", () => {
    expect(parseInbound({ entry: [{ changes: [{ field: "messages", value: { metadata: { phone_number_id: "555" }, statuses: [{}] } }] }] }, "555")).toEqual([]);
  });
});
