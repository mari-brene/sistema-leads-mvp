import { describe, expect, it } from "vitest";
import { hasOptOutPhrase, manualBlockReason, MAX_MANUAL_TEXT, validateManualSend, whatsappLink } from "@/lib/whatsapp/manual";

const ok = { optIn: true, optOut: false, stage: "novo" as const, phone: "+5547999991234" };

describe("whatsappLink", () => {
  it("monta o link com só dígitos e a mensagem codificada", () => {
    expect(whatsappLink("+5547999991234", "Oi, Ana!\nTudo bem? R$ 50 & café #1")).toBe(
      "https://wa.me/5547999991234?text=Oi%2C%20Ana!%0ATudo%20bem%3F%20R%24%2050%20%26%20caf%C3%A9%20%231",
    );
  });
  it("sem mensagem, abre só a conversa", () => {
    expect(whatsappLink("+5547999991234", "   ")).toBe("https://wa.me/5547999991234");
  });
  it("telefone ausente ou inválido não gera link", () => {
    expect(whatsappLink(null, "oi")).toBeNull();
    expect(whatsappLink("47999991234", "oi")).toBeNull();
    expect(whatsappLink("+55 47 9999", "oi")).toBeNull();
    expect(whatsappLink("+55479999912345678901", "oi")).toBeNull();
  });
});

describe("manualBlockReason", () => {
  it("libera quem autorizou e não saiu", () => expect(manualBlockReason(ok)).toBeNull());
  it("bloqueia opt-out, sem opt-in, prospecção e sem telefone", () => {
    expect(manualBlockReason({ ...ok, optOut: true })).toMatch(/sair/);
    expect(manualBlockReason({ ...ok, optIn: false })).toMatch(/autorização/);
    expect(manualBlockReason({ ...ok, stage: "prospeccao" })).toMatch(/Prospecção/);
    expect(manualBlockReason({ ...ok, phone: null })).toMatch(/telefone/);
  });
  it("opt-out vale mesmo com opt-in marcado", () => {
    expect(manualBlockReason({ ...ok, optIn: true, optOut: true })).not.toBeNull();
  });
});

describe("validateManualSend", () => {
  it("aceita lead liberado com texto", () => expect(validateManualSend(ok, "Oi! Responda SAIR para sair.")).toBeNull());
  it("recusa lead inexistente, bloqueado, texto vazio ou grande demais", () => {
    expect(validateManualSend(null, "oi")).toMatch(/não encontrado/);
    expect(validateManualSend({ ...ok, optOut: true }, "oi")).not.toBeNull();
    expect(validateManualSend(ok, "   ")).toMatch(/Escreva/);
    expect(validateManualSend(ok, "a".repeat(MAX_MANUAL_TEXT + 1))).toMatch(/no máximo/);
  });
});

describe("hasOptOutPhrase", () => {
  it("reconhece SAIR como palavra", () => {
    expect(hasOptOutPhrase("Para parar, responda SAIR.")).toBe(true);
    expect(hasOptOutPhrase("responda sair")).toBe(true);
    expect(hasOptOutPhrase("saiba mais")).toBe(false);
    expect(hasOptOutPhrase("Oi!")).toBe(false);
  });
});
