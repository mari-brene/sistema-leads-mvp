import { describe, expect, it } from "vitest";
import { parseCreateForm, parseTags, parseUpdateForm, rawValues } from "@/lib/leads/form";

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

describe("parseTags", () => {
  it("separa por vírgula, ponto e vírgula ou linha, sem repetidas", () => {
    expect(parseTags("VIP, indicação; quente\nvip ,, ")).toEqual(["VIP", "indicação", "quente"]);
  });

  it("limita a 10 tags de até 30 caracteres", () => {
    const many = Array.from({ length: 15 }, (_, i) => `tag${i}`).join(",");
    expect(parseTags(many)).toHaveLength(10);
    expect(parseTags("x".repeat(50))[0]).toHaveLength(30);
  });
});

describe("parseUpdateForm", () => {
  it("normaliza o telefone para E.164", () => {
    const result = parseUpdateForm(form({ name: "Maria", phone: "(47) 99999-1234" }));
    expect(result.ok && result.value.phone).toBe("+5547999991234");
  });

  it("aceita telefone em branco", () => {
    const result = parseUpdateForm(form({ name: "Maria", phone: "" }));
    expect(result.ok && result.value.phone).toBeNull();
  });

  it("recusa nome vazio, telefone inválido e e-mail inválido", () => {
    expect(parseUpdateForm(form({ name: "  " })).ok).toBe(false);
    expect(parseUpdateForm(form({ name: "Maria", phone: "123" })).ok).toBe(false);
    expect(parseUpdateForm(form({ name: "Maria", email: "isso-nao-e-email" })).ok).toBe(false);
  });

  it("usa 'manual' quando a origem é desconhecida", () => {
    const result = parseUpdateForm(form({ name: "Maria", source: "hacker" }));
    expect(result.ok && result.value.source).toBe("manual");
  });
});

describe("parseCreateForm", () => {
  it("opt-in marcado exige a origem da autorização", () => {
    expect(parseCreateForm(form({ name: "Maria", optIn: "on" })).ok).toBe(false);

    const ok = parseCreateForm(form({ name: "Maria", optIn: "on", optInSource: "formulario" }));
    expect(ok.ok && ok.value.optIn).toBe(true);
    expect(ok.ok && ok.value.optInSource).toBe("formulario");
  });

  it("sem marcar opt-in, ignora a origem enviada", () => {
    const result = parseCreateForm(form({ name: "Maria", optInSource: "formulario" }));
    expect(result.ok && result.value.optIn).toBe(false);
    expect(result.ok && result.value.optInSource).toBeNull();
  });

  it("etapa inválida vira 'novo'", () => {
    const result = parseCreateForm(form({ name: "Maria", stage: "xyz" }));
    expect(result.ok && result.value.stage).toBe("novo");
  });
});

describe("rawValues", () => {
  it("devolve só os campos conhecidos", () => {
    const values = rawValues(form({ name: "Maria", phone: "123", senha: "segredo" }));
    expect(values).toEqual({ name: "Maria", phone: "123" });
  });
});
