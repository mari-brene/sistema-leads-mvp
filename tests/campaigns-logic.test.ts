import { describe, expect, it } from "vitest";
import { CAMPAIGN_STAGES, selectAudience } from "@/lib/campaigns/audience";
import * as logic from "@/lib/campaigns/logic";
import { BATCH_SIZE, DEFAULT_SETTINGS, type Slice } from "@/lib/campaigns/types";
import type { Lead } from "@/lib/leads/types";

let counter = 0;
const ctx = (now = "2026-10-16T15:00:00.000Z") => ({ now, newId: () => `id-${++counter}` });
const NOON = new Date("2026-10-16T15:00:00.000Z"); // sexta, 12:00 em São Paulo

function lead(over: Partial<Lead> & { name: string }): Lead {
  counter += 1;
  return {
    id: `lead-${counter}`,
    userId: "u1",
    company: "",
    phone: `+55479999${String(1000 + counter)}`,
    email: "",
    source: "manual",
    stage: "novo",
    position: 0,
    tags: [],
    notes: "",
    externalId: null,
    optIn: true,
    optInAt: "2026-10-01T00:00:00.000Z",
    optInSource: "formulario",
    optOut: false,
    optOutAt: null,
    createdAt: `2026-10-0${(counter % 8) + 1}T00:00:00.000Z`,
    updatedAt: "2026-10-01T00:00:00.000Z",
    lastInteractionAt: "2026-10-01T00:00:00.000Z",
    events: [],
    ...over,
  };
}

function emptySlice(): Slice {
  return { settings: { ...DEFAULT_SETTINGS }, templates: [], campaigns: [], messages: [] };
}

/** Slice com um modelo aprovado. */
function withApprovedTemplate(): { slice: Slice; templateId: string } {
  const added = logic.addTemplate(emptySlice(), "u1", { name: "Oferta", body: "Oi {{nome}}! Novidades para a {{empresa}}." }, ctx());
  if (!added.ok) throw new Error(added.error);
  const approved = logic.approveTemplate(added.slice, added.template.id);
  if (!approved.ok) throw new Error(approved.error);
  return { slice: approved.slice, templateId: added.template.id };
}

describe("público da campanha (conformidade)", () => {
  const ana = lead({ name: "Ana" });
  const semOptIn = lead({ name: "Sem Opt-in", optIn: false, optInAt: null, optInSource: null });
  const saiu = lead({ name: "Saiu", optIn: false, optOut: true, optOutAt: "2026-10-05T00:00:00.000Z" });
  const prospect = lead({ name: "Prospect", stage: "prospeccao", source: "prospeccao" });
  const contatado = lead({ name: "Contatado", stage: "contatado", tags: ["VIP"] });
  const all = [ana, semOptIn, saiu, prospect, contatado];

  it("só entra quem tem opt-in, telefone e não saiu", () => {
    const report = selectAudience(all, ["novo", "contatado"], "");
    expect(report.eligible.map((l) => l.name).sort()).toEqual(["Ana", "Contatado"]);
    expect(report.excluded).toEqual({ semOptIn: 1, optOut: 1, semTelefone: 0 });
  });

  it("Prospecção nunca entra, mesmo se for pedida e mesmo com opt-in", () => {
    const report = selectAudience([prospect], ["prospeccao" as never, "novo"], "");
    expect(report.eligible).toHaveLength(0);
    expect(report.considered).toBe(0);
    expect(CAMPAIGN_STAGES).not.toContain("prospeccao");
  });

  it("filtra por tag sem diferenciar maiúsculas", () => {
    const report = selectAudience(all, ["novo", "contatado"], "vip");
    expect(report.eligible.map((l) => l.name)).toEqual(["Contatado"]);
  });

  it("opt-in sem telefone não entra", () => {
    const report = selectAudience([lead({ name: "Sem Fone", phone: null })], ["novo"], "");
    expect(report.eligible).toHaveLength(0);
    expect(report.excluded.semTelefone).toBe(1);
  });
});

describe("modelos", () => {
  it("nasce aguardando aprovação e não aceita nome repetido", () => {
    const first = logic.addTemplate(emptySlice(), "u1", { name: "Oferta", body: "Oi {{nome}}" }, ctx());
    expect(first.ok && first.template.status).toBe("pendente");
    if (!first.ok) return;
    const again = logic.addTemplate(first.slice, "u1", { name: "oferta", body: "Outro" }, ctx());
    expect(again.ok).toBe(false);
  });
});

describe("criar campanha", () => {
  it("monta a fila só com quem pode receber e escreve o texto de cada um", () => {
    const { slice, templateId } = withApprovedTemplate();
    const leads = [lead({ name: "Maria Souza", company: "Padaria Sol" }), lead({ name: "Sem", optIn: false, optInAt: null, optInSource: null })];
    const result = logic.createCampaign(slice, leads, "u1", { name: "Outubro", templateId, stages: ["novo"], tag: "" }, ctx());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.campaign.status).toBe("rascunho");
    expect(result.slice.messages).toHaveLength(1);
    expect(result.slice.messages[0].text).toBe(
      "Oi Maria! Novidades para a Padaria Sol.\n\nPara não receber mais mensagens, responda SAIR.",
    );
  });

  it("recusa modelo não aprovado, sem etapa e público vazio", () => {
    const added = logic.addTemplate(emptySlice(), "u1", { name: "Oferta", body: "Oi" }, ctx());
    if (!added.ok) throw new Error("x");
    const pending = logic.createCampaign(added.slice, [lead({ name: "A" })], "u1", { name: "C", templateId: added.template.id, stages: ["novo"], tag: "" }, ctx());
    expect(pending.ok).toBe(false);

    const { slice, templateId } = withApprovedTemplate();
    const noStage = logic.createCampaign(slice, [lead({ name: "A" })], "u1", { name: "C", templateId, stages: [], tag: "" }, ctx());
    expect(noStage.ok).toBe(false);
    const onlyProspect = logic.createCampaign(slice, [lead({ name: "P", stage: "prospeccao" })], "u1", { name: "C", templateId, stages: ["prospeccao"], tag: "" }, ctx());
    expect(onlyProspect.ok).toBe(false);
    const empty = logic.createCampaign(slice, [lead({ name: "A", optIn: false, optInAt: null, optInSource: null })], "u1", { name: "C", templateId, stages: ["novo"], tag: "" }, ctx());
    expect(empty.ok).toBe(false);
  });

  it("limita o tamanho do público", () => {
    const { slice, templateId } = withApprovedTemplate();
    const many = Array.from({ length: 201 }, (_, i) => lead({ name: `L${i}` }));
    const result = logic.createCampaign(slice, many, "u1", { name: "C", templateId, stages: ["novo"], tag: "" }, ctx());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("200");
  });
});

describe("estados da campanha", () => {
  function draft(count = 3) {
    const { slice, templateId } = withApprovedTemplate();
    const leads = Array.from({ length: count }, (_, i) => lead({ name: `Contato ${i}` }));
    const created = logic.createCampaign(slice, leads, "u1", { name: "C", templateId, stages: ["novo"], tag: "" }, ctx());
    if (!created.ok) throw new Error(created.error);
    return { slice: created.slice, campaign: created.campaign, leads };
  }

  it("rascunho → em andamento → pausada → em andamento", () => {
    const { slice, campaign } = draft();
    const started = logic.changeCampaign(slice, campaign.id, "start", ctx());
    expect(started.ok && started.slice.campaigns[0].status).toBe("em_andamento");
    if (!started.ok) return;
    const paused = logic.changeCampaign(started.slice, campaign.id, "pause", ctx());
    expect(paused.ok && paused.slice.campaigns[0].status).toBe("pausada");
    if (!paused.ok) return;
    expect(logic.changeCampaign(paused.slice, campaign.id, "pause", ctx()).ok).toBe(false);
    expect(logic.changeCampaign(paused.slice, campaign.id, "start", ctx()).ok).toBe(true);
  });

  it("cancelar pula quem ainda estava na fila", () => {
    const { slice, campaign } = draft();
    const cancelled = logic.changeCampaign(slice, campaign.id, "cancel", ctx());
    expect(cancelled.ok).toBe(true);
    if (!cancelled.ok) return;
    expect(cancelled.slice.campaigns[0].status).toBe("cancelada");
    expect(cancelled.slice.messages.every((m) => m.status === "pulada")).toBe(true);
    expect(logic.changeCampaign(cancelled.slice, campaign.id, "cancel", ctx()).ok).toBe(false);
  });

  it("só rascunho pode ser excluído", () => {
    const { slice, campaign } = draft();
    const started = logic.changeCampaign(slice, campaign.id, "start", ctx());
    if (!started.ok) throw new Error("x");
    expect(logic.removeCampaign(started.slice, campaign.id).ok).toBe(false);
    const removed = logic.removeCampaign(slice, campaign.id);
    expect(removed.ok && removed.slice.messages).toHaveLength(0);
  });
});

describe("lote de envio", () => {
  function running(count: number, settings: Partial<Slice["settings"]> = {}) {
    const { slice, templateId } = withApprovedTemplate();
    const leads = Array.from({ length: count }, (_, i) => lead({ name: `Contato ${i}` }));
    const created = logic.createCampaign({ ...slice, settings: { ...slice.settings, ...settings } }, leads, "u1", { name: "C", templateId, stages: ["novo"], tag: "" }, ctx());
    if (!created.ok) throw new Error(created.error);
    const started = logic.changeCampaign(created.slice, created.campaign.id, "start", ctx());
    if (!started.ok) throw new Error(started.error);
    return { slice: started.slice, leads, campaign: created.campaign };
  }

  it("envia no máximo um lote por vez", () => {
    const { slice, leads } = running(25);
    const plan = logic.planBatch(slice, leads, NOON);
    expect(plan.ok && plan.sends).toHaveLength(BATCH_SIZE);
  });

  it("respeita o limite diário já usado hoje", () => {
    const { slice, leads } = running(25, { dailyLimit: 4 });
    const already = slice.messages.slice(0, 3).map((m) => ({ ...m, status: "enviada" as const, sentAt: "2026-10-16T14:00:00.000Z" }));
    const withSent = { ...slice, messages: [...already, ...slice.messages.slice(3)] };
    const plan = logic.planBatch(withSent, leads, NOON);
    expect(plan.ok && plan.sends).toHaveLength(1);

    const done = { ...withSent, messages: withSent.messages.map((m, i) => (i === 3 ? { ...m, status: "enviada" as const, sentAt: "2026-10-16T14:30:00.000Z" } : m)) };
    const blocked = logic.planBatch(done, leads, NOON);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.error).toContain("limite");
  });

  it("envios de ontem não contam no limite de hoje", () => {
    const { slice, leads } = running(5, { dailyLimit: 2 });
    const yesterday = slice.messages.slice(0, 2).map((m) => ({ ...m, status: "enviada" as const, sentAt: "2026-10-15T15:00:00.000Z" }));
    const plan = logic.planBatch({ ...slice, messages: [...yesterday, ...slice.messages.slice(2)] }, leads, NOON);
    expect(plan.ok && plan.sends).toHaveLength(2);
  });

  it("não envia fora do horário nem sem campanha em andamento", () => {
    const { slice, leads } = running(3);
    expect(logic.planBatch(slice, leads, new Date("2026-10-16T22:00:00.000Z")).ok).toBe(false); // 19:00
    const paused = logic.changeCampaign(slice, slice.campaigns[0].id, "pause", ctx());
    if (!paused.ok) throw new Error("x");
    expect(logic.planBatch(paused.slice, leads, NOON).ok).toBe(false);
  });

  it("reconfere o consentimento no momento do envio", () => {
    const { slice, leads } = running(5);
    const [a, b, c, d] = leads;
    const changed = leads.map((l) => {
      if (l.id === a.id) return { ...l, optOut: true, optIn: false };
      if (l.id === b.id) return { ...l, optIn: false };
      if (l.id === c.id) return { ...l, phone: "+5547988887777" };
      if (l.id === d.id) return { ...l, stage: "prospeccao" as const };
      return l;
    });
    const plan = logic.planBatch(slice, changed.slice(0, 5).filter((l) => l.id !== leads[4].id), NOON); // o 5º foi excluído
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.sends).toHaveLength(0);
    expect(plan.skips.map((s) => s.reason)).toEqual([
      "O contato pediu para sair (opt-out).",
      "O contato não tem autorização (opt-in).",
      "O telefone do lead mudou depois que a mensagem entrou na fila.",
      "O lead está na etapa Prospecção, que não recebe campanhas.",
      "O lead foi excluído.",
    ]);
  });

  it("aplica o resultado, conta enviadas/falhas e conclui a campanha quando a fila acaba", () => {
    const { slice, leads } = running(3);
    const plan = logic.planBatch(slice, leads, NOON);
    if (!plan.ok) throw new Error(plan.error);
    const outcomes = new Map<string, logic.SendOutcome>([
      [plan.sends[0].messageId, { ok: true, providerId: "p1" }],
      [plan.sends[1].messageId, { ok: false, error: "Número não encontrado" }],
      [plan.sends[2].messageId, { ok: true, providerId: "p3" }],
    ]);
    const after = logic.applyBatch(slice, plan, outcomes, ctx());
    expect(logic.countMessages(after.messages)).toEqual({ total: 3, naFila: 0, enviadas: 2, falhas: 1, puladas: 0 });
    expect(after.campaigns[0].status).toBe("concluida");
    expect(after.campaigns[0].finishedAt).not.toBeNull();
    expect(logic.sentToday(after.messages, NOON)).toBe(2);
  });

  it("campanha continua em andamento enquanto houver fila", () => {
    const { slice, leads } = running(12);
    const plan = logic.planBatch(slice, leads, NOON);
    if (!plan.ok) throw new Error(plan.error);
    const outcomes = new Map(plan.sends.map((s) => [s.messageId, { ok: true as const, providerId: s.messageId }]));
    const after = logic.applyBatch(slice, plan, outcomes, ctx());
    expect(after.campaigns[0].status).toBe("em_andamento");
    expect(logic.countMessages(after.messages).naFila).toBe(2);
  });
});

describe("configurações", () => {
  const ok = { dailyLimit: "30", windowStart: "9", windowEnd: "18", weekdaysOnly: "on", optOutFooter: "Responda SAIR para parar." };

  it("aceita valores válidos", () => {
    const result = logic.validateSettings(ok);
    expect(result).toEqual({
      ok: true,
      value: { dailyLimit: 30, windowStart: 9, windowEnd: 18, weekdaysOnly: true, optOutFooter: "Responda SAIR para parar." },
    });
  });

  it("recusa limite, horários e frase de saída inválidos", () => {
    expect(logic.validateSettings({ ...ok, dailyLimit: "0" }).ok).toBe(false);
    expect(logic.validateSettings({ ...ok, dailyLimit: "9999" }).ok).toBe(false);
    expect(logic.validateSettings({ ...ok, dailyLimit: "abc" }).ok).toBe(false);
    expect(logic.validateSettings({ ...ok, windowStart: "18", windowEnd: "9" }).ok).toBe(false);
    expect(logic.validateSettings({ ...ok, windowEnd: "25" }).ok).toBe(false);
    expect(logic.validateSettings({ ...ok, optOutFooter: "" }).ok).toBe(false);
    expect(logic.validateSettings({ ...ok, optOutFooter: "Tchau" }).ok).toBe(false);
  });

  it("caixa de seleção desmarcada vira falso", () => {
    const result = logic.validateSettings({ ...ok, weekdaysOnly: null });
    expect(result.ok && result.value.weekdaysOnly).toBe(false);
  });
});
