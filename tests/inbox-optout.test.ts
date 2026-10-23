import { describe, expect, it } from "vitest";
import { detectOptOut } from "@/lib/inbox/optout";

describe("detectOptOut", () => {
  it("reconhece a mensagem inteira sendo uma palavra de saída (com acento, maiúsculas e pontuação)", () => {
    for (const text of ["SAIR", "sair", " Parar ", "Cancelar!", "STOP", "parar.", "Descadastrar", "SAIR 🙏"]) {
      expect(detectOptOut(text)).toBe("exact");
    }
  });

  it("palavra no meio de uma frase é só uma menção (vai para você decidir)", () => {
    expect(detectOptOut("quero cancelar o meu pedido")).toBe("mention");
    expect(detectOptOut("pode parar de mandar mensagem")).toBe("mention");
    expect(detectOptOut("não quero mais receber")).toBe("mention");
  });

  it("não confunde palavras parecidas nem textos normais", () => {
    expect(detectOptOut("Qual o horário de vocês?")).toBeNull();
    expect(detectOptOut("Vou passar aí, posso estacionar?")).toBeNull();
    expect(detectOptOut("pararelo")).toBeNull();
    expect(detectOptOut("")).toBeNull();
    expect(detectOptOut("   ")).toBeNull();
  });
});
