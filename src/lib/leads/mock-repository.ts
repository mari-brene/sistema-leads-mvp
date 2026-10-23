import { randomUUID } from "node:crypto";
import { readJson, writeJson } from "@/lib/storage";
import * as logic from "./logic";
import type { CreateLeadInput, Lead, LeadResult, UpdateLeadInput } from "./types";

/**
 * Repositório de SIMULAÇÃO: guarda os leads em um arquivo local (.data/leads.json).
 * Na fase de contas reais, um repositório do Supabase com a mesma forma entra no lugar.
 */

export interface LeadsRepository {
  list(userId: string): Promise<Lead[]>;
  get(userId: string, id: string): Promise<Lead | null>;
  create(userId: string, input: CreateLeadInput): Promise<LeadResult>;
  update(userId: string, id: string, input: UpdateLeadInput): Promise<LeadResult>;
  move(userId: string, id: string, stage: string, index: number): Promise<LeadResult>;
  addNote(userId: string, id: string, text: string): Promise<LeadResult>;
  registerOptIn(userId: string, id: string, source: string): Promise<LeadResult>;
  registerOptOut(userId: string, id: string): Promise<LeadResult>;
  remove(userId: string, id: string): Promise<LeadResult>;
  /** Anota no histórico que uma mensagem de campanha foi enviada (e move Novo → Contatado). */
  recordCampaignMessage(userId: string, id: string, text: string): Promise<LeadResult>;
  /** Anota no histórico que o contato mandou uma mensagem (e move Novo/Contatado → Respondeu). */
  recordInboundMessage(userId: string, id: string, text: string): Promise<LeadResult>;
  /** Cria vários leads de uma vez (importação de CSV). Os que quebrarem uma regra são pulados. */
  importMany(userId: string, inputs: CreateLeadInput[]): Promise<ImportManyResult>;
}

/** Resultado de uma importação: quantos entraram e quais foram pulados (e por quê). */
export type ImportManyResult = { created: number; skipped: logic.ImportSkip[] };

async function readAll(): Promise<Lead[]> {
  const data = await readJson<unknown>("leads", []);
  return Array.isArray(data) ? (data as Lead[]) : [];
}

async function writeAll(leads: Lead[]): Promise<void> {
  await writeJson("leads", leads);
}

// Fila simples: uma gravação de cada vez, para dois arrastes rápidos não se atropelarem.
// Fica no "globalThis" porque o Next pode carregar este arquivo mais de uma vez.
const globalWithLock = globalThis as typeof globalThis & { __leadsLock?: Promise<unknown> };

function withLock<T>(task: () => Promise<T>): Promise<T> {
  const previous = globalWithLock.__leadsLock ?? Promise.resolve();
  const run = previous.then(task, task);
  globalWithLock.__leadsLock = run.catch(() => undefined);
  return run;
}

function makeCtx(): logic.Ctx {
  return { now: new Date().toISOString(), newId: () => randomUUID() };
}

/** Lê tudo, aplica a regra só sobre os leads desta pessoa, grava e devolve o resultado. */
function mutate(userId: string, apply: (mine: Lead[], ctx: logic.Ctx) => logic.Op): Promise<LeadResult> {
  return withLock(async () => {
    const all = await readAll();
    const mine = all.filter((lead) => lead.userId === userId);
    const others = all.filter((lead) => lead.userId !== userId);

    const result = apply(mine, makeCtx());
    if (!result.ok) return result;

    await writeAll([...others, ...result.leads]);
    return { ok: true, lead: result.lead } as const;
  });
}

export const mockLeadsRepository: LeadsRepository = {
  async list(userId) {
    const all = await readAll();
    return all.filter((lead) => lead.userId === userId);
  },

  async get(userId, id) {
    const all = await readAll();
    return all.find((lead) => lead.userId === userId && lead.id === id) ?? null;
  },

  create: (userId, input) => mutate(userId, (mine, ctx) => logic.createLead(mine, userId, input, ctx)),
  update: (userId, id, input) => mutate(userId, (mine, ctx) => logic.updateLead(mine, id, input, ctx)),
  move: (userId, id, stage, index) =>
    mutate(userId, (mine, ctx) => logic.moveLeadOp(mine, id, stage, index, ctx)),
  addNote: (userId, id, text) => mutate(userId, (mine, ctx) => logic.addNote(mine, id, text, ctx)),
  registerOptIn: (userId, id, source) =>
    mutate(userId, (mine, ctx) => logic.registerOptIn(mine, id, source, ctx)),
  registerOptOut: (userId, id) => mutate(userId, (mine, ctx) => logic.registerOptOut(mine, id, ctx)),
  remove: (userId, id) => mutate(userId, (mine) => logic.removeLead(mine, id)),
  recordCampaignMessage: (userId, id, text) =>
    mutate(userId, (mine, ctx) => logic.recordCampaignMessage(mine, id, text, ctx)),
  recordInboundMessage: (userId, id, text) =>
    mutate(userId, (mine, ctx) => logic.recordInboundMessage(mine, id, text, ctx)),

  importMany: (userId, inputs) =>
    withLock(async () => {
      const all = await readAll();
      const mine = all.filter((lead) => lead.userId === userId);
      const others = all.filter((lead) => lead.userId !== userId);

      const result = logic.importLeads(mine, userId, inputs, makeCtx());
      if (result.created > 0) await writeAll([...others, ...result.leads]);
      return { created: result.created, skipped: result.skipped };
    }),
};
