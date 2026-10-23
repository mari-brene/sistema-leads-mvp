import { describe, expect, it } from "vitest";
import { createLead, recordInboundMessage, type Ctx, type Op } from "@/lib/leads/logic";
import type { CreateLeadInput, Lead, StageId } from "@/lib/leads/types";

const ctx: Ctx = { now: "2026-10-21T12:00:00.000Z", newId: (() => { let n = 0; return () => `id-${++n}`; })() };

function seed(stage: StageId): { leads: Lead[]; id: string } {
  const input: CreateLeadInput = {
    name: "Ana", company: "X", phone: "+5547999991234", email: "", source: "manual", tags: [], notes: "",
    stage, optIn: false, optInSource: null,
  };
  const op: Op = createLead([], "u1", input, ctx);
  if (!op.ok) throw new Error(op.error);
  return { leads: op.leads, id: op.lead.id };
}

describe("recordInboundMessage", () => {
  it("move Novo e Contatado para Respondeu e anota no histórico", () => {
    for (const stage of ["novo", "contatado"] as StageId[]) {
      const { leads, id } = seed(stage);
      const op = recordInboundMessage(leads, id, "Qual o preço?", ctx);
      if (!op.ok) throw new Error(op.error);
      expect(op.lead.stage).toBe("respondeu");
      expect(op.lead.events[op.lead.events.length - 1].text).toBe("Mensagem recebida: Qual o preço?");
    }
  });
  it("não mexe na etapa de quem está em Prospecção, Reunião ou Fechado", () => {
    for (const stage of ["prospeccao", "reuniao", "fechado"] as StageId[]) {
      const { leads, id } = seed(stage);
      const op = recordInboundMessage(leads, id, "oi", ctx);
      if (!op.ok) throw new Error(op.error);
      expect(op.lead.stage).toBe(stage);
    }
  });
  it("erro para lead inexistente", () => {
    expect(recordInboundMessage([], "nada", "oi", ctx).ok).toBe(false);
  });
});
