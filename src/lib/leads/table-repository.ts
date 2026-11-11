import { randomUUID } from "node:crypto";
import { keyHeaders, type FetchLike } from "@/lib/storage/supabase-store";
import * as logic from "./logic";
import type { LeadsRepository } from "./mock-repository";
import { leadToRow, rowToLead, type LeadRow } from "./table-mapping";
import type { Lead } from "./types";

/**
 * Repositório dos leads na tabela própria "leads" do Supabase (uma linha por lead, sempre com client_id).
 * Reaproveita as MESMAS regras de logic.ts: lê os leads do cliente, aplica a regra e grava só as linhas que mudaram.
 * Toda consulta e toda gravação carregam o client_id: um cliente nunca toca em linha de outro.
 */

type Options = { url: string; secretKey: string; fetch?: FetchLike };

const TIMEOUT_MS = 15_000;
const PAGE = 1000;
const PARALLEL = 10;

export function createTableLeadsRepository(options: Options): LeadsRepository {
  const doFetch: FetchLike = options.fetch ?? ((url, init) => fetch(url, init) as unknown as ReturnType<FetchLike>);

  async function call(method: string, query: string, body?: unknown, prefer?: string) {
    if (!options.url || !options.secretKey) {
      throw new Error("Faltam SUPABASE_URL e SUPABASE_SECRET_KEY no arquivo .env.local.");
    }
    try {
      return await doFetch(`${options.url}/rest/v1/leads${query}`, {
        method,
        headers: { ...keyHeaders(options.secretKey), "Content-Type": "application/json", ...(prefer ? { Prefer: prefer } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      throw new Error("Não foi possível falar com o Supabase (rede ou tempo esgotado).");
    }
  }

  // Nunca registramos o corpo da resposta (pode ter dados de clientes) nem a chave: só o código.
  function fail(status: number, what: string): never {
    throw new Error(`O Supabase respondeu com erro ${status} ao ${what} os leads.`);
  }

  async function fetchRows(filter: string): Promise<LeadRow[]> {
    const rows: LeadRow[] = [];
    for (let offset = 0; ; offset += PAGE) {
      const response = await call("GET", `?${filter}&select=*&order=id.asc&limit=${PAGE}&offset=${offset}`);
      if (!response.ok) fail(response.status, "ler");
      const page = (await response.json()) as LeadRow[];
      if (!Array.isArray(page)) fail(500, "ler");
      rows.push(...page);
      if (page.length < PAGE) return rows;
    }
  }

  const ofClient = (clientId: string) => `client_id=eq.${encodeURIComponent(clientId)}`;
  const listLeads = async (clientId: string) => (await fetchRows(ofClient(clientId))).map(rowToLead);

  async function inBatches<T>(items: T[], task: (item: T) => Promise<void>): Promise<void> {
    for (let i = 0; i < items.length; i += PARALLEL) await Promise.all(items.slice(i, i + PARALLEL).map(task));
  }

  /** Grava a diferença entre "antes" e "depois": novas (insert), alteradas (update) e removidas (delete). */
  async function save(clientId: string, before: Lead[], after: Lead[]): Promise<void> {
    const beforeById = new Map(before.map((lead) => [lead.id, JSON.stringify(leadToRow(lead))]));
    const afterIds = new Set(after.map((lead) => lead.id));

    const created = after.filter((lead) => !beforeById.has(lead.id));
    const changed = after.filter((lead) => beforeById.has(lead.id) && beforeById.get(lead.id) !== JSON.stringify(leadToRow(lead)));
    const removed = before.filter((lead) => !afterIds.has(lead.id));

    for (const lead of [...created, ...changed]) {
      if (lead.userId !== clientId) throw new Error("Lead de outro cliente: gravação bloqueada.");
    }

    if (created.length > 0) {
      for (let i = 0; i < created.length; i += 500) {
        const response = await call("POST", "", created.slice(i, i + 500).map(leadToRow), "return=minimal");
        if (!response.ok) fail(response.status, "gravar");
      }
    }
    await inBatches(changed, async (lead) => {
      const response = await call("PATCH", `?id=eq.${encodeURIComponent(lead.id)}&${ofClient(clientId)}`, leadToRow(lead), "return=minimal");
      if (!response.ok) fail(response.status, "gravar");
    });
    for (let i = 0; i < removed.length; i += PARALLEL * 5) {
      const ids = removed.slice(i, i + PARALLEL * 5).map((lead) => `"${lead.id}"`).join(",");
      const response = await call("DELETE", `?${ofClient(clientId)}&id=in.(${encodeURIComponent(ids)})`, undefined, "return=minimal");
      if (!response.ok) fail(response.status, "apagar");
    }
  }

  const makeCtx = (): logic.Ctx => ({ now: new Date().toISOString(), newId: () => randomUUID() });

  async function mutate(clientId: string, apply: (mine: Lead[], ctx: logic.Ctx) => logic.Op) {
    const before = await listLeads(clientId);
    const result = apply(before, makeCtx());
    if (!result.ok) return result;
    await save(clientId, before, result.leads);
    return { ok: true, lead: result.lead } as const;
  }

  return {
    list: listLeads,

    async get(clientId, id) {
      const rows = await fetchRows(`${ofClient(clientId)}&id=eq.${encodeURIComponent(id)}`);
      return rows[0] ? rowToLead(rows[0]) : null;
    },

    async findByPhone(phones) {
      if (phones.length === 0) return [];
      const list = phones.map((phone) => `"${phone}"`).join(",");
      return (await fetchRows(`phone=in.(${encodeURIComponent(list)})`)).map(rowToLead);
    },

    create: (clientId, input) => mutate(clientId, (mine, ctx) => logic.createLead(mine, clientId, input, ctx)),
    update: (clientId, id, input) => mutate(clientId, (mine, ctx) => logic.updateLead(mine, id, input, ctx)),
    move: (clientId, id, stage, index) => mutate(clientId, (mine, ctx) => logic.moveLeadOp(mine, id, stage, index, ctx)),
    addNote: (clientId, id, text) => mutate(clientId, (mine, ctx) => logic.addNote(mine, id, text, ctx)),
    registerOptIn: (clientId, id, source) => mutate(clientId, (mine, ctx) => logic.registerOptIn(mine, id, source, ctx)),
    registerOptOut: (clientId, id) => mutate(clientId, (mine, ctx) => logic.registerOptOut(mine, id, ctx)),
    remove: (clientId, id) => mutate(clientId, (mine) => logic.removeLead(mine, id)),
    recordCampaignMessage: (clientId, id, text) =>
      mutate(clientId, (mine, ctx) => logic.recordCampaignMessage(mine, id, text, ctx)),
    recordInboundMessage: (clientId, id, text) =>
      mutate(clientId, (mine, ctx) => logic.recordInboundMessage(mine, id, text, ctx)),

    async importMany(clientId, inputs) {
      const before = await listLeads(clientId);
      const result = logic.importLeads(before, clientId, inputs, makeCtx());
      if (result.created > 0) await save(clientId, before, result.leads);
      return { created: result.created, skipped: result.skipped };
    },
  };
}
