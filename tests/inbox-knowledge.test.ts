import { describe, expect, it } from "vitest";
import { findAnswer, isGreeting, splitKnowledge, tokens } from "@/lib/inbox/knowledge";

const BASE = `Horário: atendemos de segunda a sexta, das 9h às 18h.

Preços: o corte custa R$ 50 e a barba R$ 30.

Endereço: Rua das Flores, 120, centro.`;

describe("base de conhecimento", () => {
  it("divide em trechos por linha em branco (ou por linha, se não houver)", () => {
    expect(splitKnowledge(BASE)).toHaveLength(3);
    expect(splitKnowledge("a\nb\nc")).toEqual(["a", "b", "c"]);
    expect(splitKnowledge("   ")).toEqual([]);
  });

  it("ignora acentos, maiúsculas e plural ao comparar", () => {
    expect(tokens("Quais são os PREÇOS?")).toEqual(["preco"]);
    expect(tokens("preço")).toEqual(["preco"]);
  });

  it("acha o trecho certo", () => {
    expect(findAnswer(BASE, "Qual o horário de atendimento?")?.chunk).toContain("segunda a sexta");
    expect(findAnswer(BASE, "quanto custa o corte")?.chunk).toContain("R$ 50");
    expect(findAnswer(BASE, "onde fica? qual o endereco")?.chunk).toContain("Rua das Flores");
  });

  it("devolve null quando a base não cobre o assunto", () => {
    expect(findAnswer(BASE, "vocês fazem tatuagem?")).toBeNull();
    expect(findAnswer(BASE, "?")).toBeNull();
    expect(findAnswer("", "qual o horário")).toBeNull();
  });

  it("reconhece saudações", () => {
    expect(isGreeting("Oi!")).toBe(true);
    expect(isGreeting("Bom dia")).toBe(true);
    expect(isGreeting("oi, qual o preço?")).toBe(false);
  });
});
