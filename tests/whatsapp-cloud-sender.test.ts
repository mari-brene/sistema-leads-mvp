import { describe, expect, it } from "vitest";
import { createCloudSender } from "@/lib/whatsapp/cloud-sender";

type Call = { url: string; init: { method: string; headers: Record<string, string>; body: string } };

function make(response: { ok: boolean; status: number; json: unknown } = { ok: true, status: 200, json: { messages: [{ id: "wamid.1" }] } }) {
  const calls: Call[] = [];
  const sender = createCloudSender({
    token: "TOKEN-SECRETO-123",
    phoneNumberId: "555",
    apiVersion: "v23.0",
    templateLanguage: "pt_BR",
    fetch: async (url, init) => {
      calls.push({ url, init });
      return { ok: response.ok, status: response.status, json: async () => response.json };
    },
  });
  return { sender, calls };
}

describe("cloud sender", () => {
  it("modelo: manda type template com idioma e variáveis em ordem", async () => {
    const { sender, calls } = make();
    const r = await sender.send({ to: "+5547999990001", text: "x", templateName: "t", purpose: "marketing", template: { name: "promo", params: ["Ana", "Loja"] } });
    expect(r).toEqual({ ok: true, providerId: "wamid.1" });
    expect(calls[0]!.url).toBe("https://graph.facebook.com/v23.0/555/messages");
    expect(calls[0]!.init.headers.Authorization).toBe("Bearer TOKEN-SECRETO-123");
    const body = JSON.parse(calls[0]!.init.body);
    expect(body.to).toBe("5547999990001");
    expect(body.type).toBe("template");
    expect(body.template.name).toBe("promo");
    expect(body.template.language.code).toBe("pt_BR");
    expect(body.template.components[0].parameters.map((p: { text: string }) => p.text)).toEqual(["Ana", "Loja"]);
  });

  it("modelo sem variáveis não manda components", async () => {
    const { sender, calls } = make();
    await sender.send({ to: "+5547999990001", text: "x", templateName: "t", purpose: "marketing", template: { name: "hello_world", params: [] } });
    expect(JSON.parse(calls[0]!.init.body).template.components).toBeUndefined();
  });

  it("atendimento: manda texto livre", async () => {
    const { sender, calls } = make();
    await sender.send({ to: "+5547999990001", text: "Olá!", templateName: "", purpose: "service" });
    const body = JSON.parse(calls[0]!.init.body);
    expect(body.type).toBe("text");
    expect(body.text.body).toBe("Olá!");
  });

  it("marketing sem modelo é bloqueado e NÃO chama a rede", async () => {
    const { sender, calls } = make();
    const r = await sender.send({ to: "+5547999990001", text: "Promoção!", templateName: "t", purpose: "marketing" });
    expect(r.ok).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it("traduz erros conhecidos e nunca vaza token nem corpo da resposta", async () => {
    const known = make({ ok: false, status: 400, json: { error: { code: 131030, message: "segredo do contato" } } });
    const a = await known.sender.send({ to: "+5547999990001", text: "x", templateName: "", purpose: "service" });
    expect(a.ok === false && a.error).toContain("lista de destinatários");
    const other = make({ ok: false, status: 400, json: { error: { code: 99999, message: "segredo do contato TOKEN-SECRETO-123" } } });
    const b = await other.sender.send({ to: "+5547999990001", text: "x", templateName: "", purpose: "service" });
    expect(b).toEqual({ ok: false, error: "A Meta recusou o envio (erro 99999)." });
  });

  it("sem token ou sem ID do número: erro claro, sem rede", async () => {
    const calls: unknown[] = [];
    const sender = createCloudSender({ token: "", phoneNumberId: "", apiVersion: "v23.0", templateLanguage: "pt_BR", fetch: async () => { calls.push(1); return { ok: true, status: 200, json: async () => ({}) }; } });
    const r = await sender.send({ to: "+5547999990001", text: "x", templateName: "", purpose: "service" });
    expect(r.ok).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it("falha de rede vira erro simples", async () => {
    const sender = createCloudSender({ token: "t", phoneNumberId: "1", apiVersion: "v23.0", templateLanguage: "pt_BR", fetch: async () => { throw new Error("boom TOKEN"); } });
    const r = await sender.send({ to: "+5547999990001", text: "x", templateName: "", purpose: "service" });
    expect(r.ok === false && r.error).not.toContain("boom");
  });
});
