import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  analyzeImport,
  MAX_IMPORT_ROWS,
  normalizeHeader,
  parseConsentSource,
  toView,
  type ImportAnalysis,
} from "@/lib/leads/import";
import { importLeads, type Ctx } from "@/lib/leads/logic";
import { mockLeadsRepository as repo } from "@/lib/leads/mock-repository";
import { columnOf } from "@/lib/leads/ordering";
import type { CreateLeadInput, Lead } from "@/lib/leads/types";

function ok(analysis: ImportAnalysis) {
  if (!analysis.ok) throw new Error(`esperava sucesso, mas deu erro: ${analysis.error}`);
  return analysis;
}

const none: Array<{ phone: string | null; name: string }> = [];

describe("normalizeHeader", () => {
  it("tira acento, maiúsculas e símbolos", () => {
    expect(normalizeHeader("Observações")).toBe("observacoes");
    expect(normalizeHeader(" Origem do Opt-in ")).toBe("origem_do_opt_in");
    expect(normalizeHeader("E-mail")).toBe("e_mail");
  });
});

describe("analisar planilha", () => {
  it("lê uma planilha do Excel brasileiro (ponto e vírgula, títulos com acento)", () => {
    const text = [
      "Nome;Empresa;Telefone;E-mail;Tags;Observações",
      "Maria Silva;Padaria Sol;(47) 99999-1234;maria@exemplo.com;vip, quente;Pediu orçamento",
      "João Souza;Oficina;(11) 98888-5678;;;",
    ].join("\r\n");

    const result = ok(analyzeImport(text, none));
    expect(result.counts.total).toBe(2);
    expect(result.counts.novos).toBe(2);

    const [maria, joao] = result.rows;
    expect(maria.input).toMatchObject({
      name: "Maria Silva",
      company: "Padaria Sol",
      phone: "+5547999991234",
      email: "maria@exemplo.com",
      tags: ["vip", "quente"],
      notes: "Pediu orçamento",
      source: "csv",
      stage: "novo",
    });
    expect(joao.input?.phone).toBe("+5511988885678");
  });

  it("aceita CSV com vírgula e títulos em inglês", () => {
    const result = ok(analyzeImport("name,phone\nAna,47999991234", none));
    expect(result.rows[0].input?.name).toBe("Ana");
    expect(result.rows[0].input?.phone).toBe("+5547999991234");
  });

  it("normaliza telefones escritos de jeitos diferentes", () => {
    const text = ["nome;telefone", "A;(47) 99999-1234", "B;47 3333-4444", "C;+55 11 98888-5678"].join("\n");
    const phones = ok(analyzeImport(text, none)).rows.map((r) => r.phoneNormalized);
    expect(phones).toEqual(["+5547999991234", "+554733334444", "+5511988885678"]);
  });

  it("o número da linha é o mesmo que o Excel mostra (títulos = 1) e linhas em branco não contam como leads", () => {
    const text = "nome;telefone\nAna;47999991234\n;\nBruno;123";
    const result = ok(analyzeImport(text, none));
    expect(result.rows.map((r) => r.row)).toEqual([2, 4]);
    expect(result.rows[1].status).toBe("invalido");
  });

  it("recusa linha sem nome, telefone inválido e e-mail inválido, com o motivo", () => {
    const text = [
      "nome;telefone;email",
      ";47999991234;",
      "Bruno;123;",
      "Carla;;isso-nao-e-email",
      "Dani;;",
    ].join("\n");
    const result = ok(analyzeImport(text, none));

    expect(result.rows.map((r) => r.status)).toEqual(["invalido", "invalido", "invalido", "novo"]);
    expect(result.rows[0].message).toContain("nome");
    expect(result.rows[1].message).toContain("Telefone inválido");
    expect(result.rows[2].message).toContain("E-mail");
    expect(result.counts).toMatchObject({ total: 4, novos: 1, invalidos: 3 });
  });

  it("aceita contato sem telefone", () => {
    const row = ok(analyzeImport("nome\nAna", none)).rows[0];
    expect(row.status).toBe("novo");
    expect(row.input?.phone).toBeNull();
  });

  it("acha telefone repetido na planilha: a primeira linha vale, as outras são puladas", () => {
    const text = "nome;telefone\nAna;(47) 99999-1234\nOutra Ana;47999991234\nBruno;47988887777";
    const result = ok(analyzeImport(text, none));

    expect(result.rows.map((r) => r.status)).toEqual(["novo", "duplicado_arquivo", "novo"]);
    expect(result.rows[1].message).toContain("linha 2");
    expect(result.counts.duplicadosArquivo).toBe(1);
  });

  it("acha telefone que já existe na base", () => {
    const existing = [{ phone: "+5547999991234", name: "João da base" }];
    const result = ok(analyzeImport("nome;telefone\nAna;(47) 99999-1234", existing));

    expect(result.rows[0].status).toBe("duplicado_base");
    expect(result.rows[0].message).toContain("João da base");
    expect(result.counts.duplicadosBase).toBe(1);
    expect(result.counts.novos).toBe(0);
  });

  it("lista as colunas reconhecidas e as ignoradas", () => {
    const result = ok(analyzeImport("nome;cor favorita;telefone\nAna;azul;47999991234", none));
    expect(result.recognized).toEqual(["nome", "telefone"]);
    expect(result.ignored).toEqual(["cor favorita"]);
  });

  it("dá erro claro sem a coluna do nome, com arquivo vazio, só com títulos e com linhas demais", () => {
    const noName = analyzeImport("telefone\n47999991234", none);
    expect(noName.ok).toBe(false);
    if (!noName.ok) expect(noName.error).toContain("nome");

    expect(analyzeImport("", none).ok).toBe(false);
    expect(analyzeImport("   \n  ", none).ok).toBe(false);
    expect(analyzeImport("nome;telefone", none).ok).toBe(false);

    const many = ["nome", ...Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, i) => `Pessoa ${i}`)].join("\n");
    const tooMany = analyzeImport(many, none);
    expect(tooMany.ok).toBe(false);
    if (!tooMany.ok) expect(tooMany.error).toContain("1000");
  });

  it("aceita exatamente o limite de linhas", () => {
    const text = ["nome", ...Array.from({ length: MAX_IMPORT_ROWS }, (_, i) => `Pessoa ${i}`)].join("\n");
    const result = ok(analyzeImport(text, none));
    expect(result.counts.novos).toBe(MAX_IMPORT_ROWS);
  });

  it("toView não leva o objeto completo do lead para a tela", () => {
    const row = ok(analyzeImport("nome\nAna", none)).rows[0];
    expect(Object.keys(toView(row))).not.toContain("input");
  });
});

describe("autorização (opt-in) na importação", () => {
  it("sem coluna de opt-in, NINGUÉM entra com autorização", () => {
    const text = "nome;telefone\nAna;47999991234\nBruno;47988887777";
    const result = ok(analyzeImport(text, none));
    expect(result.rows.every((r) => r.input?.optIn === false)).toBe(true);
    expect(result.counts.comOptIn).toBe(0);
  });

  it("opt_in = sim COM origem registra a autorização", () => {
    const text = "nome;telefone;opt_in;origem_opt_in\nAna;47999991234;Sim;Preencheu formulário / site\nBruno;47988887777;sim;cliente";
    const result = ok(analyzeImport(text, none));

    expect(result.rows[0].input).toMatchObject({ optIn: true, optInSource: "formulario" });
    expect(result.rows[1].input).toMatchObject({ optIn: true, optInSource: "cliente" });
    expect(result.counts.comOptIn).toBe(2);
  });

  it("opt_in = sim SEM origem é ignorado (entra sem autorização) e avisa", () => {
    const row = ok(analyzeImport("nome;telefone;opt_in\nAna;47999991234;sim", none)).rows[0];
    expect(row.status).toBe("novo");
    expect(row.input?.optIn).toBe(false);
    expect(row.input?.optInSource).toBeNull();
    expect(row.warning).toContain("origem");
  });

  it("opt_in = sim com origem inválida também é ignorado", () => {
    const row = ok(analyzeImport("nome;telefone;opt_in;origem_opt_in\nAna;47999991234;sim;sei lá", none)).rows[0];
    expect(row.input?.optIn).toBe(false);
    expect(row.warning).not.toBe("");
  });

  it("opt_in = sim SEM telefone é ignorado", () => {
    const row = ok(analyzeImport("nome;opt_in;origem_opt_in\nAna;sim;formulario", none)).rows[0];
    expect(row.input?.optIn).toBe(false);
    expect(row.warning).toContain("telefone");
  });

  it("valores diferentes de sim (não, vazio, talvez) não dão autorização", () => {
    const text = "nome;telefone;opt_in;origem_opt_in\nA;47999990001;não;formulario\nB;47999990002;;formulario\nC;47999990003;talvez;formulario";
    const result = ok(analyzeImport(text, none));
    expect(result.rows.every((r) => r.input?.optIn === false)).toBe(true);
    expect(result.counts.comAviso).toBe(0);
  });

  it("reconhece as origens pelo código, pelo nome e por palavras-chave", () => {
    expect(parseConsentSource("formulario")).toBe("formulario");
    expect(parseConsentSource("Pediu contato pelo WhatsApp")).toBe("whatsapp");
    expect(parseConsentSource("Já é cliente")).toBe("cliente");
    expect(parseConsentSource("evento")).toBe("presencial");
    expect(parseConsentSource("outro")).toBe("outro");
    expect(parseConsentSource("")).toBeNull();
    expect(parseConsentSource("sei lá")).toBeNull();
  });
});

describe("gravar a importação", () => {
  function makeCtx(): Ctx {
    let counter = 0;
    return { now: "2026-10-15T12:00:00.000Z", newId: () => `id-${++counter}` };
  }

  function input(name: string, phone: string | null, extra: Partial<CreateLeadInput> = {}): CreateLeadInput {
    return {
      name,
      company: "",
      phone,
      email: "",
      source: "csv",
      tags: [],
      notes: "",
      stage: "novo",
      optIn: false,
      optInSource: null,
      ...extra,
    };
  }

  it("cria todos no fim da coluna Novo, com origem CSV no histórico", () => {
    const result = importLeads([], "u1", [input("Ana", "+5547999990001"), input("Bruno", null)], makeCtx());
    expect(result.created).toBe(2);
    expect(result.skipped).toEqual([]);
    expect(columnOf(result.leads, "novo").map((l) => l.name)).toEqual(["Ana", "Bruno"]);
    expect(result.leads[0].source).toBe("csv");
    expect(result.leads[0].events[0].text).toContain("Importação CSV");
    expect(result.leads.every((l) => !l.optIn && l.optInAt === null)).toBe(true);
  });

  it("registra a data e a origem do opt-in dos que vieram autorizados", () => {
    const result = importLeads(
      [],
      "u1",
      [input("Ana", "+5547999990001", { optIn: true, optInSource: "formulario" })],
      makeCtx(),
    );
    const lead: Lead = result.leads[0];
    expect(lead.optIn).toBe(true);
    expect(lead.optInSource).toBe("formulario");
    expect(lead.optInAt).toBe("2026-10-15T12:00:00.000Z");
  });

  it("pula quem repete telefone (inclusive dentro da própria lista) e importa o resto", () => {
    const first = importLeads([], "u1", [input("Ana", "+5547999990001")], makeCtx());
    const second = importLeads(
      first.leads,
      "u1",
      [input("Outra", "+5547999990001"), input("Bruno", "+5547999990002"), input("Bruno 2", "+5547999990002")],
      makeCtx(),
    );
    expect(second.created).toBe(1);
    expect(second.skipped.map((s) => s.index)).toEqual([0, 2]);
    expect(second.leads).toHaveLength(2);
  });
});

describe("importação no repositório de simulação (arquivo local)", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "leads-import-"));
    process.env.DATA_DIR = dir;
  });

  afterEach(async () => {
    delete process.env.DATA_DIR;
    await rm(dir, { recursive: true, force: true });
  });

  const lead = (name: string, phone: string | null): CreateLeadInput => ({
    name,
    company: "",
    phone,
    email: "",
    source: "csv",
    tags: [],
    notes: "",
    stage: "novo",
    optIn: false,
    optInSource: null,
  });

  it("grava, e os leads continuam lá depois de 'recarregar'", async () => {
    const result = await repo.importMany("u1", [lead("Ana", "+5547999990001"), lead("Bruno", "+5547999990002")]);
    expect(result).toEqual({ created: 2, skipped: [] });

    const leads = await repo.list("u1");
    expect(leads.map((l) => l.name).sort()).toEqual(["Ana", "Bruno"]);
  });

  it("importar o mesmo arquivo duas vezes não duplica ninguém", async () => {
    const rows = [lead("Ana", "+5547999990001"), lead("Bruno", "+5547999990002")];
    await repo.importMany("u1", rows);
    const again = await repo.importMany("u1", rows);

    expect(again.created).toBe(0);
    expect(again.skipped).toHaveLength(2);
    expect(await repo.list("u1")).toHaveLength(2);
  });

  it("cada conta tem a sua base: o mesmo telefone pode ser importado em outra conta", async () => {
    await repo.importMany("u1", [lead("Ana", "+5547999990001")]);
    const other = await repo.importMany("u2", [lead("Ana", "+5547999990001")]);

    expect(other.created).toBe(1);
    expect(await repo.list("u1")).toHaveLength(1);
    expect(await repo.list("u2")).toHaveLength(1);
  });

  it("não mexe nos leads de outra conta", async () => {
    await repo.importMany("u1", [lead("Ana", "+5547999990001")]);
    await repo.importMany("u2", [lead("Bruno", "+5547999990002")]);
    expect((await repo.list("u1")).map((l) => l.name)).toEqual(["Ana"]);
  });

  it("importação sem nenhum lead novo não quebra", async () => {
    expect(await repo.importMany("u1", [])).toEqual({ created: 0, skipped: [] });
  });
});
