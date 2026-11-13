import { describe, expect, it } from "vitest";
import { buildDashboard } from "@/lib/dashboard/logic";
import { EXPORT_HEADER, leadsToCsv } from "@/lib/leads/export";
import type { Lead } from "@/lib/leads/types";

const now = new Date("2026-11-13T12:00:00.000Z");

function lead(over: Partial<Lead>): Lead {
  return {
    id: "l1", userId: "c1", name: "Ana", company: "Loja", phone: "+5547999990001", email: "ana@loja.com", source: "manual", stage: "novo", position: 0,
    tags: ["vip"], notes: "", externalId: null, optIn: true, optInAt: "2026-11-01T10:00:00.000Z", optInSource: "formulario", optOut: false, optOutAt: null,
    createdAt: "2026-11-10T10:00:00.000Z", updatedAt: "2026-11-10T10:00:00.000Z", lastInteractionAt: "2026-11-10T10:00:00.000Z", events: [], ...over,
  };
}

describe("painel", () => {
  it("conta leads por etapa, origem, consentimento e novos no mês", () => {
    const data = buildDashboard({
      leads: [
        lead({ stage: "novo" }),
        lead({ stage: "contatado", source: "csv", createdAt: "2026-09-01T10:00:00.000Z" }),
        lead({ stage: "respondeu", optOut: true }),
        lead({ stage: "reuniao", optIn: false }),
      ],
      campaigns: [],
      conversations: [],
      now,
    });
    expect(data.totalLeads).toBe(4);
    expect(data.newLast30Days).toBe(3);
    expect(data.byStage.find((s) => s.id === "contatado")?.count).toBe(1);
    expect(data.bySource.map((s) => s.id)).toEqual(["manual", "csv"]);
    expect(data.optOut).toBe(1);
    expect(data.optIn).toBe(2);
    expect(data.responseRate).toBe(67);
  });

  it("soma campanhas e conversas; sem contatados a taxa é 0", () => {
    const counts = (n: number) => ({ total: n, naFila: 1, enviadas: n - 2, falhas: 1, puladas: 0 });
    const data = buildDashboard({
      leads: [lead({ stage: "novo" })],
      campaigns: [{ status: "em_andamento", counts: counts(5) }, { status: "concluida", counts: counts(4) }],
      conversations: [{ mode: "ia", needsHuman: false }, { mode: "humano", needsHuman: true }],
      now,
    });
    expect(data.messages).toEqual({ sent: 5, failed: 2, skipped: 0, queued: 2 });
    expect(data.activeCampaigns).toBe(1);
    expect(data.conversations).toEqual({ total: 2, needsHuman: 1, withAi: 1 });
    expect(data.responseRate).toBe(0);
  });
});

describe("exportação CSV", () => {
  it("tem cabeçalho e uma linha por lead, com BOM e separador ;", () => {
    const csv = leadsToCsv([lead({}), lead({ id: "l2", name: "Bia" })]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const lines = csv.trim().split("\r\n");
    expect(lines).toHaveLength(3);
    expect(lines[0].replace("﻿", "")).toBe(EXPORT_HEADER.join(";"));
    expect(lines[1]).toContain("Ana;Loja;5547999990001");
    expect(lines[1]).toContain("Novo;Cadastro manual");
  });

  it("protege contra fórmulas do Excel e escapa aspas e quebras de linha", () => {
    const csv = leadsToCsv([lead({ name: "=CMD()", notes: 'disse "oi";\nvolta' })]);
    expect(csv).toContain("'=CMD()");
    expect(csv).toContain('"disse ""oi"";\nvolta"');
  });

  it("sem leads sai só o cabeçalho", () => {
    expect(leadsToCsv([]).trim().split("\r\n")).toHaveLength(1);
  });
});
