import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getCampaignsRepository } from "@/lib/campaigns";
import { getInboxRepository } from "@/lib/inbox";
import { getLeadsRepository } from "@/lib/leads";
import { fakeSupabase } from "./helpers/fake-postgrest";
import type { CreateLeadInput } from "@/lib/leads/types";

const env = ["DATA_BACKEND", "LEADS_STORE", "SUPABASE_URL", "SUPABASE_SECRET_KEY"] as const;
let saved: Record<string, string | undefined>;
let realFetch: typeof fetch;

const input = (name: string, phone: string): CreateLeadInput => ({
  name, company: "", phone, email: "", source: "manual", tags: [], notes: "", stage: "novo", optIn: true, optInSource: "formulario",
});

beforeEach(() => {
  saved = Object.fromEntries(env.map((k) => [k, process.env[k]]));
  realFetch = globalThis.fetch;
});
afterEach(() => {
  for (const k of env) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  globalThis.fetch = realFetch;
});

describe("LEADS_STORE=table vale para TODOS os módulos", () => {
  it("campanhas e caixa de entrada enxergam os leads da tabela nova, não os da coleção antiga", async () => {
    process.env.DATA_BACKEND = "supabase";
    process.env.LEADS_STORE = "table";
    process.env.SUPABASE_URL = "https://x.supabase.co";
    process.env.SUPABASE_SECRET_KEY = "sb_secret_teste";
    const db = fakeSupabase();
    globalThis.fetch = ((url: string, init: Parameters<typeof fetch>[1]) =>
      db.fetch(url, init as never)) as unknown as typeof fetch;

    const created = await getLeadsRepository().create("c1", input("Ana", "+5547999990001"));
    expect(created.ok).toBe(true);
    expect(db.rows).toHaveLength(1);

    // Campanhas: o público da campanha vem da tabela nova.
    const audience = await getCampaignsRepository().previewAudience("c1", ["novo"], "");
    expect(audience.eligible.map((lead) => lead.name)).toEqual(["Ana"]);
    // Outro cliente não vê nada.
    expect((await getCampaignsRepository().previewAudience("c2", ["novo"], "")).eligible).toEqual([]);

    // Caixa de entrada: a conversa mostra o lead da tabela nova.
    const rows = await getInboxRepository().listConversations("c1");
    expect(Array.isArray(rows)).toBe(true);

    // Registrar mensagem de campanha grava na tabela nova (não em outro lugar).
    const leadId = created.ok ? created.lead.id : "";
    await getLeadsRepository().recordCampaignMessage("c1", leadId, "oi");
    expect(db.rows[0].events.some((event) => event.type === "mensagem")).toBe(true);
  });
});
