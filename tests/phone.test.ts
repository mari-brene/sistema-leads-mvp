import { describe, expect, it } from "vitest";
import { formatPhone, normalizePhone } from "@/lib/phone";

describe("normalizePhone (E.164)", () => {
  it("aceita celular brasileiro em vários formatos", () => {
    const formatos = [
      "(47) 99999-1234",
      "47999991234",
      "47 99999 1234",
      "+55 47 99999-1234",
      "5547999991234",
      "047 99999-1234",
      "0055 47 99999-1234",
      "  (47)99999-1234  ",
    ];
    for (const formato of formatos) {
      expect(normalizePhone(formato), formato).toBe("+5547999991234");
    }
  });

  it("aceita telefone fixo", () => {
    expect(normalizePhone("(47) 3333-4444")).toBe("+554733334444");
    expect(normalizePhone("+55 47 3333-4444")).toBe("+554733334444");
  });

  it("não confunde o DDD 55 com o código do país", () => {
    expect(normalizePhone("55 99999-1234")).toBe("+5555999991234");
    expect(normalizePhone("+55 55 99999-1234")).toBe("+5555999991234");
    expect(normalizePhone("(55) 3333-4444")).toBe("+555533334444");
  });

  it("aceita números de outros países quando começam com +", () => {
    expect(normalizePhone("+1 212 555 1234")).toBe("+12125551234");
    expect(normalizePhone("+44 20 7946 0958")).toBe("+442079460958");
  });

  it("recusa números inválidos em vez de adivinhar", () => {
    const invalidos = [
      "",
      "   ",
      "abc",
      "123",
      "47 9999-1234", // 10 dígitos começando com 9 (celular sem o 9 extra)
      "(47) 89999-1234", // celular com terceiro dígito 8
      "00000000000",
      "+12", // curto demais
      "+0123456789", // país não pode começar com 0
      "5547999991234567", // comprido demais
    ];
    for (const numero of invalidos) {
      expect(normalizePhone(numero), numero).toBeNull();
    }
  });

  it("o mesmo número em formatos diferentes dá o mesmo resultado (base da deduplicação)", () => {
    expect(normalizePhone("(47) 99999-1234")).toBe(normalizePhone("+55 47 999991234"));
  });
});

describe("formatPhone", () => {
  it("formata celular e fixo do Brasil", () => {
    expect(formatPhone("+5547999991234")).toBe("+55 (47) 99999-1234");
    expect(formatPhone("+554733334444")).toBe("+55 (47) 3333-4444");
  });

  it("mantém números de outros países e mostra traço para vazio", () => {
    expect(formatPhone("+12125551234")).toBe("+12125551234");
    expect(formatPhone(null)).toBe("—");
    expect(formatPhone("")).toBe("—");
  });
});
