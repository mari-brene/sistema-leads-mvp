import { describe, expect, it } from "vitest";
import { renderTemplate, validateFooter, validateTemplate, withFooter } from "@/lib/campaigns/templates";
import { checkWindow, describeWindow, localTime } from "@/lib/campaigns/time";
import { DEFAULT_SETTINGS } from "@/lib/campaigns/types";

describe("validateTemplate", () => {
  it("aceita um modelo normal com variáveis conhecidas", () => {
    expect(validateTemplate("Oferta", "Oi {{nome}}, temos novidades para a {{ empresa }}!")).toBeNull();
  });

  it("exige nome e texto", () => {
    expect(validateTemplate("  ", "texto")).toContain("nome");
    expect(validateTemplate("Oferta", "   ")).toContain("texto");
  });

  it("recusa variável desconhecida e chaves soltas", () => {
    expect(validateTemplate("Oferta", "Oi {{sobrenome}}")).toContain("{{sobrenome}}");
    expect(validateTemplate("Oferta", "Oi {nome}")).toContain("chaves");
  });

  it("recusa texto grande demais", () => {
    expect(validateTemplate("Oferta", "a".repeat(901))).toContain("900");
    expect(validateTemplate("Oferta", "a".repeat(900))).toBeNull();
  });
});

describe("renderTemplate", () => {
  it("usa o primeiro nome e a empresa", () => {
    expect(renderTemplate("Oi {{nome}}! Como vai a {{empresa}}?", { name: "Maria da Silva", company: "Padaria Sol" })).toBe(
      "Oi Maria! Como vai a Padaria Sol?",
    );
  });

  it("aceita maiúsculas e espaços dentro das chaves", () => {
    expect(renderTemplate("{{ NOME }}", { name: "João", company: "" })).toBe("João");
  });

  it("usa um texto neutro quando não há empresa", () => {
    expect(renderTemplate("Como vai {{empresa}}?", { name: "Ana", company: "  " })).toBe("Como vai sua empresa?");
  });
});

describe("frase de saída", () => {
  it("é obrigatória e precisa conter SAIR", () => {
    expect(validateFooter("")).toContain("obrigatória");
    expect(validateFooter("Obrigado!")).toContain("SAIR");
    expect(validateFooter("Responda sair para parar.")).toBeNull();
  });

  it("vai no fim da mensagem", () => {
    expect(withFooter("Oi", "Responda SAIR.")).toBe("Oi\n\nResponda SAIR.");
  });
});

describe("horário de envio (fuso de São Paulo)", () => {
  // 2026-10-16 é uma sexta-feira. 15:00 UTC = 12:00 em São Paulo.
  const friNoon = new Date("2026-10-16T15:00:00.000Z");

  it("converte para o horário e dia de São Paulo", () => {
    expect(localTime(friNoon)).toEqual({ day: "2026-10-16", hour: 12, weekday: 5 });
    // 02:30 UTC ainda é 23:30 do dia anterior em São Paulo.
    expect(localTime(new Date("2026-10-17T02:30:00.000Z"))).toEqual({ day: "2026-10-16", hour: 23, weekday: 5 });
  });

  it("abre dentro da janela", () => {
    expect(checkWindow(DEFAULT_SETTINGS, friNoon)).toEqual({ open: true });
  });

  it("fecha antes do início e a partir da hora final", () => {
    const early = checkWindow(DEFAULT_SETTINGS, new Date("2026-10-16T11:59:00.000Z")); // 08:59
    const late = checkWindow(DEFAULT_SETTINGS, new Date("2026-10-16T21:00:00.000Z")); // 18:00
    expect(early.open).toBe(false);
    expect(late.open).toBe(false);
    if (!early.open) expect(early.reason).toContain("Fora do horário");
  });

  it("não envia no fim de semana quando a opção está ligada", () => {
    const saturday = new Date("2026-10-17T15:00:00.000Z");
    const blocked = checkWindow(DEFAULT_SETTINGS, saturday);
    expect(blocked.open).toBe(false);
    if (!blocked.open) expect(blocked.reason).toContain("fim de semana");
    expect(checkWindow({ ...DEFAULT_SETTINGS, weekdaysOnly: false }, saturday)).toEqual({ open: true });
  });

  it("janela até as 24h vale até o fim do dia", () => {
    const settings = { ...DEFAULT_SETTINGS, windowStart: 0, windowEnd: 24 };
    expect(checkWindow(settings, new Date("2026-10-17T02:30:00.000Z"))).toEqual({ open: true }); // 23:30 de sexta
    expect(describeWindow(settings)).toContain("00:00 às 00:00");
  });
});
