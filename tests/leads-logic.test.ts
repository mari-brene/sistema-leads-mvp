import { describe, expect, it } from "vitest";
import { canReceiveMarketing, consentStatus } from "@/lib/leads/consent";
import {
  addNote,
  createLead,
  moveLeadOp,
  registerOptIn,
  registerOptOut,
  removeLead,
  updateLead,
  type Ctx,
  type Op,
} from "@/lib/leads/logic";
import { columnOf } from "@/lib/leads/ordering";
import type { CreateLeadInput, Lead } from "@/lib/leads/types";

function makeCtx(now = "2026-10-08T12:00:00.000Z"): Ctx {
  let counter = 0;
  return { now, newId: () => `id-${now}-${++counter}` };
}

const baseInput: CreateLeadInput = {
  name: "Maria Silva",
  company: "Padaria Sol",
  phone: "+5547999991234",
  email: "",
  source: "manual",
  tags: [],
  notes: "",
  stage: "novo",
  optIn: false,
  optInSource: null,
};

function must(op: Op): { leads: Lead[]; lead: Lead } {
  if (!op.ok) throw new Error(`esperava sucesso, mas deu erro: ${op.error}`);
  return op;
}

function seed(): Lead[] {
  let leads: Lead[] = [];
  const ctx = makeCtx();
  for (const [name, phone] of [
    ["Ana", "+5547999990001"],
    ["Bruno", "+5547999990002"],
    ["Carla", "+5547999990003"],
  ] as const) {
    leads = must(createLead(leads, "u1", { ...baseInput, name, phone }, ctx)).leads;
  }
  return leads;
}

describe("criar lead", () => {
  it("cria no fim da coluna escolhida, com histórico", () => {
    const leads = seed();
    expect(columnOf(leads, "novo").map((l) => l.name)).toEqual(["Ana", "Bruno", "Carla"]);
    expect(leads[0].events[0].type).toBe("criado");
    expect(leads[0].optIn).toBe(false);
  });

  it("exige nome", () => {
    const result = createLead([], "u1", { ...baseInput, name: "   " }, makeCtx());
    expect(result.ok).toBe(false);
  });

  it("recusa telefone duplicado e aponta o lead existente", () => {
    const leads = seed();
    const result = createLead(leads, "u1", { ...baseInput, name: "Outra pessoa", phone: "+5547999990002" }, makeCtx());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("Bruno");
      expect(result.duplicateId).toBe(leads[1].id);
    }
  });

  it("aceita vários leads sem telefone", () => {
    let leads: Lead[] = [];
    leads = must(createLead(leads, "u1", { ...baseInput, name: "Sem tel 1", phone: null }, makeCtx())).leads;
    leads = must(createLead(leads, "u1", { ...baseInput, name: "Sem tel 2", phone: null }, makeCtx())).leads;
    expect(leads).toHaveLength(2);
  });

  it("lead de busca de empresas sempre entra em Prospecção e sem autorização", () => {
    const { lead } = must(
      createLead([], "u1", { ...baseInput, source: "prospeccao", stage: "contatado" }, makeCtx()),
    );
    expect(lead.stage).toBe("prospeccao");
    expect(lead.optIn).toBe(false);
    expect(canReceiveMarketing(lead)).toBe(false);
  });

  it("opt-in registra data e origem; sem origem ou sem telefone é recusado", () => {
    const ok = must(
      createLead([], "u1", { ...baseInput, optIn: true, optInSource: "formulario" }, makeCtx()),
    );
    expect(ok.lead.optIn).toBe(true);
    expect(ok.lead.optInAt).toBe("2026-10-08T12:00:00.000Z");
    expect(ok.lead.optInSource).toBe("formulario");
    expect(canReceiveMarketing(ok.lead)).toBe(true);

    expect(createLead([], "u1", { ...baseInput, optIn: true, optInSource: null }, makeCtx()).ok).toBe(false);
    expect(
      createLead([], "u1", { ...baseInput, phone: null, optIn: true, optInSource: "outro" }, makeCtx()).ok,
    ).toBe(false);
  });
});

describe("mover lead", () => {
  it("muda de etapa, guarda a posição e registra no histórico", () => {
    const leads = seed();
    const bruno = leads[1];
    const result = must(moveLeadOp(leads, bruno.id, "contatado", 0, makeCtx("2026-10-08T13:00:00.000Z")));

    expect(result.lead.stage).toBe("contatado");
    expect(result.lead.position).toBe(0);
    expect(result.lead.lastInteractionAt).toBe("2026-10-08T13:00:00.000Z");
    expect(result.lead.events.at(-1)?.type).toBe("etapa");
    expect(columnOf(result.leads, "novo").map((l) => l.name)).toEqual(["Ana", "Carla"]);
    expect(columnOf(result.leads, "novo").map((l) => l.position)).toEqual([0, 1]);
  });

  it("reordenar na mesma coluna não conta como interação", () => {
    const leads = seed();
    const result = must(moveLeadOp(leads, leads[2].id, "novo", 0, makeCtx("2026-10-08T13:00:00.000Z")));
    expect(columnOf(result.leads, "novo").map((l) => l.name)).toEqual(["Carla", "Ana", "Bruno"]);
    expect(result.lead.lastInteractionAt).toBe("2026-10-08T12:00:00.000Z");
    expect(result.lead.events).toHaveLength(1);
  });

  it("recusa etapa inválida e lead inexistente", () => {
    const leads = seed();
    expect(moveLeadOp(leads, leads[0].id, "inexistente", 0, makeCtx()).ok).toBe(false);
    expect(moveLeadOp(leads, "nao-existe", "novo", 0, makeCtx()).ok).toBe(false);
  });

  it("a posição sobrevive a gravar e ler de novo (simula recarregar a página)", () => {
    const leads = seed();
    const moved = must(moveLeadOp(leads, leads[0].id, "respondeu", 0, makeCtx())).leads;
    const reloaded: Lead[] = JSON.parse(JSON.stringify(moved));
    expect(columnOf(reloaded, "respondeu").map((l) => l.name)).toEqual(["Ana"]);
    expect(columnOf(reloaded, "novo").map((l) => l.name)).toEqual(["Bruno", "Carla"]);
  });
});

describe("editar lead", () => {
  const edit = (lead: Lead, patch: Partial<CreateLeadInput>) => ({
    name: lead.name,
    company: lead.company,
    phone: lead.phone,
    email: lead.email,
    source: lead.source,
    tags: lead.tags,
    notes: lead.notes,
    ...patch,
  });

  it("registra quais campos mudaram", () => {
    const leads = seed();
    const result = must(updateLead(leads, leads[0].id, edit(leads[0], { company: "Nova Empresa", tags: ["vip"] }), makeCtx()));
    expect(result.lead.company).toBe("Nova Empresa");
    expect(result.lead.events.at(-1)?.text).toContain("empresa");
    expect(result.lead.events.at(-1)?.text).toContain("tags");
  });

  it("sem mudanças, não cria evento", () => {
    const leads = seed();
    const result = must(updateLead(leads, leads[0].id, edit(leads[0], {}), makeCtx()));
    expect(result.lead.events).toHaveLength(1);
  });

  it("não deixa trocar o telefone por um que já existe", () => {
    const leads = seed();
    const result = updateLead(leads, leads[0].id, edit(leads[0], { phone: leads[1].phone }), makeCtx());
    expect(result.ok).toBe(false);
  });

  it("manter o próprio telefone não conta como duplicado", () => {
    const leads = seed();
    expect(updateLead(leads, leads[0].id, edit(leads[0], { company: "X" }), makeCtx()).ok).toBe(true);
  });

  it("trocar o telefone remove a autorização (opt-in)", () => {
    const created = must(
      createLead([], "u1", { ...baseInput, optIn: true, optInSource: "cliente" }, makeCtx()),
    );
    const result = must(
      updateLead(created.leads, created.lead.id, edit(created.lead, { phone: "+5547988887777" }), makeCtx()),
    );
    expect(result.lead.optIn).toBe(false);
    expect(result.lead.optInAt).toBeNull();
    expect(canReceiveMarketing(result.lead)).toBe(false);
  });
});

describe("notas e histórico", () => {
  it("nota entra no histórico e atualiza a última interação", () => {
    const leads = seed();
    const result = must(addNote(leads, leads[0].id, "  Ligar na segunda  ", makeCtx("2026-10-09T09:00:00.000Z")));
    expect(result.lead.events.at(-1)).toMatchObject({ type: "nota", text: "Ligar na segunda" });
    expect(result.lead.lastInteractionAt).toBe("2026-10-09T09:00:00.000Z");
  });

  it("recusa nota vazia ou grande demais", () => {
    const leads = seed();
    expect(addNote(leads, leads[0].id, "   ", makeCtx()).ok).toBe(false);
    expect(addNote(leads, leads[0].id, "x".repeat(2001), makeCtx()).ok).toBe(false);
  });
});

describe("opt-in e opt-out", () => {
  it("registrar autorização depois de criar", () => {
    const leads = seed();
    const result = must(registerOptIn(leads, leads[0].id, "whatsapp", makeCtx()));
    expect(result.lead.optIn).toBe(true);
    expect(result.lead.optInSource).toBe("whatsapp");
    expect(consentStatus(result.lead)).toBe("autorizado");
  });

  it("recusa origem inválida e lead sem telefone", () => {
    const leads = seed();
    expect(registerOptIn(leads, leads[0].id, "qualquer", makeCtx()).ok).toBe(false);

    const noPhone = must(createLead([], "u1", { ...baseInput, phone: null }, makeCtx()));
    expect(registerOptIn(noPhone.leads, noPhone.lead.id, "outro", makeCtx()).ok).toBe(false);
  });

  it("opt-out bloqueia o marketing e não pode ser desfeito pelo sistema", () => {
    const leads = seed();
    const withOptIn = must(registerOptIn(leads, leads[0].id, "cliente", makeCtx())).leads;
    const out = must(registerOptOut(withOptIn, leads[0].id, makeCtx()));

    expect(out.lead.optOut).toBe(true);
    expect(out.lead.optIn).toBe(false);
    expect(out.lead.optOutAt).not.toBeNull();
    expect(consentStatus(out.lead)).toBe("saiu");
    expect(canReceiveMarketing(out.lead)).toBe(false);

    const again = registerOptIn(out.leads, leads[0].id, "cliente", makeCtx());
    expect(again.ok).toBe(false);
  });

  it("canReceiveMarketing exige opt-in, sem opt-out e com telefone", () => {
    expect(canReceiveMarketing({ optIn: true, optOut: false, phone: "+5547999991234" })).toBe(true);
    expect(canReceiveMarketing({ optIn: false, optOut: false, phone: "+5547999991234" })).toBe(false);
    expect(canReceiveMarketing({ optIn: true, optOut: true, phone: "+5547999991234" })).toBe(false);
    expect(canReceiveMarketing({ optIn: true, optOut: false, phone: null })).toBe(false);
  });
});

describe("excluir lead", () => {
  it("remove e renumera a coluna", () => {
    const leads = seed();
    const result = must(removeLead(leads, leads[1].id));
    expect(result.leads).toHaveLength(2);
    expect(columnOf(result.leads, "novo").map((l) => l.position)).toEqual([0, 1]);
    expect(removeLead(result.leads, "nao-existe").ok).toBe(false);
  });
});
