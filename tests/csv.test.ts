import { describe, expect, it } from "vitest";
import { detectDelimiter, parseCsv, safeCell, toCsv } from "@/lib/csv";

describe("detectDelimiter", () => {
  it("reconhece ponto e vírgula, vírgula e tab", () => {
    expect(detectDelimiter("nome;telefone\nAna;123")).toBe(";");
    expect(detectDelimiter("nome,telefone\nAna,123")).toBe(",");
    expect(detectDelimiter("nome\ttelefone\nAna\t123")).toBe("\t");
  });

  it("ignora separadores que estão dentro de aspas", () => {
    expect(detectDelimiter('"a,b,c";d\n1;2')).toBe(";");
  });

  it("usa vírgula quando não há nenhum separador", () => {
    expect(detectDelimiter("nome\nAna")).toBe(",");
  });
});

describe("parseCsv", () => {
  it("lê linhas simples", () => {
    expect(parseCsv("nome;telefone\nAna;123\nBruno;456")).toEqual([
      ["nome", "telefone"],
      ["Ana", "123"],
      ["Bruno", "456"],
    ]);
  });

  it("lê aspas com separador, aspas duplas e quebra de linha dentro da célula", () => {
    const text = 'nome,obs\n"Silva, Ana","disse ""oi"""\n"Bruno","linha 1\nlinha 2"';
    expect(parseCsv(text)).toEqual([
      ["nome", "obs"],
      ["Silva, Ana", 'disse "oi"'],
      ["Bruno", "linha 1\nlinha 2"],
    ]);
  });

  it("aceita quebra de linha do Windows (\\r\\n) e arquivo sem quebra no final", () => {
    expect(parseCsv("a;b\r\n1;2\r\n3;4")).toEqual([
      ["a", "b"],
      ["1", "2"],
      ["3", "4"],
    ]);
  });

  it("tira o BOM do começo", () => {
    expect(parseCsv("﻿nome;tel\nAna;1")[0]).toEqual(["nome", "tel"]);
  });

  it("não cria linha extra quando o arquivo termina com quebra de linha", () => {
    expect(parseCsv("a;b\n1;2\n")).toHaveLength(2);
  });

  it("mantém células vazias", () => {
    expect(parseCsv("a;b;c\n1;;3")[1]).toEqual(["1", "", "3"]);
  });

  it("devolve lista vazia para texto vazio", () => {
    expect(parseCsv("")).toEqual([]);
  });
});

describe("escrita de CSV", () => {
  it("protege células que o Excel leria como fórmula", () => {
    expect(safeCell("=1+1")).toBe("'=1+1");
    expect(safeCell("+55")).toBe("'+55");
    expect(safeCell("-2")).toBe("'-2");
    expect(safeCell("@soma")).toBe("'@soma");
    expect(safeCell("Maria")).toBe("Maria");
  });

  it("gera CSV com BOM, separado por ; e com aspas quando precisa", () => {
    const text = toCsv([
      ["nome", "obs"],
      ["Ana", "tem; ponto e vírgula"],
      ["Bruno", 'disse "oi"'],
    ]);
    expect(text.startsWith("﻿")).toBe(true);
    expect(text).toContain('Ana;"tem; ponto e vírgula"');
    expect(text).toContain('Bruno;"disse ""oi"""');
  });

  it("o que foi escrito pode ser lido de volta", () => {
    const rows = [
      ["nome", "obs"],
      ["Ana", "tem; ponto e vírgula"],
      ["Bruno", 'disse "oi"\ne pulou linha'],
    ];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });
});
