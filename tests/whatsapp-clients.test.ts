import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AuditSink, NewEntry } from "@/lib/audit";
import { mockSender } from "@/lib/campaigns/sender";
import { createCampaignsRepository } from "@/lib/campaigns/repository";
import { mockAi } from "@/lib/inbox/ai";
import { createInboxRepository } from "@/lib/inbox/repository";
import { mockLeadsRepository as leadsRepo } from "@/lib/leads/mock-repository";
import { decryptSecret, encryptSecret, SecretsError } from "@/lib/secrets/crypto";
import { createAccountsService, createCollectionStore, createTableStore } from "@/lib/whatsapp/accounts";
import { createRoutingSender, NOT_CONNECTED } from "@/lib/whatsapp/router-sender";
import { routeInbound } from "@/lib/whatsapp/route-inbound";
import { parseInbound, parseInboundAll } from "@/lib/whatsapp/webhook";
import { fakeTables } from "./helpers/fake-tables";

function throwsSecrets(task: () => unknown): boolean {
  try {
    task();
    return false;
  } catch (error) {
    return error instanceof SecretsError;
  }
}

const KEY = "a".repeat(64);
const OTHER_KEY = "b".repeat(64);
const TOKEN_A = "EAAG-token-do-cliente-A-1234567890";
const TOKEN_B = "EAAG-token-do-cliente-B-0987654321";

let dir: string;
let previous: string | undefined;
beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "wa-clients-"));
  previous = process.env.DATA_DIR;
  process.env.DATA_DIR = dir;
});
afterEach(async () => {
  if (previous === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = previous;
  await rm(dir, { recursive: true, force: true });
});

function tableService() {
  const db = fakeTables({}, { whatsapp_accounts: "client_id" });
  const store = createTableStore({ url: "https://x.supabase.co", secretKey: "sb_secret_teste", fetch: db.fetch });
  return { db, accounts: createAccountsService({ store, encryptionKey: () => KEY, now: () => new Date("2026-11-13T12:00:00.000Z") }) };
}

describe("criptografia dos segredos", () => {
  it("cifra e decifra, e cada vez gera um texto diferente", () => {
    const a = encryptSecret(TOKEN_A, KEY);
    const b = encryptSecret(TOKEN_A, KEY);
    expect(a).not.toBe(b);
    expect(a).not.toContain(TOKEN_A);
    expect(decryptSecret(a, KEY)).toBe(TOKEN_A);
  });
  it("chave errada ou dado alterado não abre", () => {
    const stored = encryptSecret(TOKEN_A, KEY);
    expect(throwsSecrets(() => decryptSecret(stored, OTHER_KEY))).toBe(true);
    const parts = stored.split(".");
    parts[3] = parts[3].slice(0, -2) + (parts[3].endsWith("AA") ? "BB" : "AA");
    expect(throwsSecrets(() => decryptSecret(parts.join("."), KEY))).toBe(true);
  });
  it("recusa chave curta ou fora do formato", () => {
    expect(throwsSecrets(() => encryptSecret("x", "123"))).toBe(true);
    expect(throwsSecrets(() => encryptSecret("x", "z".repeat(64)))).toBe(true);
  });
});

describe("número de WhatsApp por cliente", () => {
  it("guarda o token criptografado e nunca o devolve no status", async () => {
    const { db, accounts } = tableService();
    expect(await accounts.connect("c1", { phoneNumberId: "111222333", token: TOKEN_A, displayPhone: "+55 47 99999-1111" })).toEqual({ ok: true });
    expect(JSON.stringify(db.tables.whatsapp_accounts)).not.toContain(TOKEN_A);
    const status = await accounts.status("c1");
    expect(status).toMatchObject({ connected: true, phoneNumberId: "111222333" });
    expect(JSON.stringify(status)).not.toContain(TOKEN_A);
    expect(await accounts.credentials("c1")).toEqual({ token: TOKEN_A, phoneNumberId: "111222333" });
    expect(await accounts.status("c2")).toEqual({ connected: false });
    expect(await accounts.credentials("c2")).toBeNull();
  });

  it("o mesmo número não pode ficar em dois clientes", async () => {
    const accounts = createAccountsService({ store: createCollectionStore(), encryptionKey: () => KEY });
    await accounts.connect("c1", { phoneNumberId: "111222333", token: TOKEN_A, displayPhone: "" });
    const second = await accounts.connect("c2", { phoneNumberId: "111222333", token: TOKEN_B, displayPhone: "" });
    expect(second.ok).toBe(false);
    expect(await accounts.credentials("c2")).toBeNull();
    expect((await accounts.credentials("c1"))?.token).toBe(TOKEN_A);
  });

  it("valida o formulário e desconecta", async () => {
    const accounts = createAccountsService({ store: createCollectionStore(), encryptionKey: () => KEY });
    expect((await accounts.connect("c1", { phoneNumberId: "abc", token: TOKEN_A, displayPhone: "" })).ok).toBe(false);
    expect((await accounts.connect("c1", { phoneNumberId: "12345", token: "curto", displayPhone: "" })).ok).toBe(false);
    expect((await accounts.connect("c1", { phoneNumberId: "12345", token: "com espaço no meio do token grande", displayPhone: "" })).ok).toBe(false);
    await accounts.connect("c1", { phoneNumberId: "12345", token: TOKEN_A, displayPhone: "" });
    await accounts.disconnect("c1");
    expect(await accounts.status("c1")).toEqual({ connected: false });
  });

  it("descobre o cliente pelo número que recebeu a mensagem", async () => {
    const { accounts } = tableService();
    await accounts.connect("c1", { phoneNumberId: "111", token: TOKEN_A, displayPhone: "" }).catch(() => undefined);
    await accounts.connect("c1", { phoneNumberId: "11111", token: TOKEN_A, displayPhone: "" });
    expect(await accounts.clientForPhoneNumberId("11111")).toBe("c1");
    expect(await accounts.clientForPhoneNumberId("99999")).toBeNull();
  });
});

describe("envio sempre pelo número do cliente certo", () => {
  function setup() {
    const accounts = createAccountsService({ store: createCollectionStore(), encryptionKey: () => KEY });
    const calls: { url: string; auth: string }[] = [];
    const fetcher = async (url: string, init: { headers: Record<string, string> }) => {
      calls.push({ url, auth: init.headers.Authorization });
      return { ok: true, status: 200, json: async () => ({ messages: [{ id: "wamid.1" }] }) };
    };
    const sender = createRoutingSender({ accounts, apiVersion: "v23.0", templateLanguage: "pt_BR", fetch: fetcher as never, legacy: null });
    return { accounts, calls, sender };
  }

  it("cada cliente envia com o próprio número e o próprio token", async () => {
    const { accounts, calls, sender } = setup();
    await accounts.connect("c1", { phoneNumberId: "11111", token: TOKEN_A, displayPhone: "" });
    await accounts.connect("c2", { phoneNumberId: "22222", token: TOKEN_B, displayPhone: "" });
    const base = { to: "+5547999990001", text: "oi", templateName: "t", purpose: "service" as const };
    await sender.send({ ...base, clientId: "c1" });
    await sender.send({ ...base, clientId: "c2" });
    expect(calls[0].url).toContain("/11111/messages");
    expect(calls[0].auth).toBe(`Bearer ${TOKEN_A}`);
    expect(calls[1].url).toContain("/22222/messages");
    expect(calls[1].auth).toBe(`Bearer ${TOKEN_B}`);
  });

  it("cliente sem número não envia (e não usa o de outro)", async () => {
    const { accounts, calls, sender } = setup();
    await accounts.connect("c1", { phoneNumberId: "11111", token: TOKEN_A, displayPhone: "" });
    const result = await sender.send({ to: "+5547999990001", text: "oi", templateName: "t", purpose: "service", clientId: "c3" });
    expect(result).toEqual({ ok: false, error: NOT_CONNECTED });
    const noClient = await sender.send({ to: "+5547999990001", text: "oi", templateName: "t", purpose: "service" });
    expect(noClient.ok).toBe(false);
    expect(calls).toHaveLength(0);
    expect(await sender.canSend!("c3")).toBe(NOT_CONNECTED);
    expect(await sender.canSend!("c1")).toBeNull();
  });

  it("o número antigo (variáveis de ambiente) vale só para o cliente indicado", async () => {
    const accounts = createAccountsService({ store: createCollectionStore(), encryptionKey: () => KEY });
    const sender = createRoutingSender({
      accounts, apiVersion: "v23.0", templateLanguage: "pt_BR",
      legacy: { clientId: "antigo", token: TOKEN_A, phoneNumberId: "99999" },
      fetch: (async () => ({ ok: true, status: 200, json: async () => ({ messages: [{ id: "w" }] }) })) as never,
    });
    expect(await sender.canSend!("antigo")).toBeNull();
    expect(await sender.canSend!("outro")).toBe(NOT_CONNECTED);
  });

  it("lote de campanha não consome a fila de quem não conectou o número", async () => {
    const { sender } = setup();
    const clock = new Date("2026-10-16T15:00:00.000Z");
    const repo = createCampaignsRepository({ leads: leadsRepo, now: () => clock });
    await leadsRepo.create("c9", { name: "Ana", company: "L", phone: "+5547999990001", email: "", source: "manual", tags: [], notes: "", stage: "novo", optIn: true, optInSource: "formulario" });
    const added = await repo.addTemplate("c9", { name: "Oferta", body: "Oi {{nome}}", metaName: "oferta" });
    if (!added.ok) throw new Error(added.error);
    await repo.approveTemplate("c9", added.template.id);
    const created = await repo.createCampaign("c9", { name: "X", templateId: added.template.id, stages: ["novo"], tag: "" });
    if (!created.ok) throw new Error(created.error);
    await repo.changeCampaign("c9", created.campaign.id, "start");
    const result = await repo.runBatch("c9", sender);
    expect(result).toEqual({ ok: false, error: NOT_CONNECTED });
    const detail = await repo.getCampaign("c9", created.campaign.id);
    expect(detail?.counts.naFila).toBe(1);
    expect(detail?.counts.falhas).toBe(0);
  });
});

describe("recebimento: cada mensagem vai para o cliente dono do número", () => {
  const logged: NewEntry[] = [];
  const audit: AuditSink = { async log(entries) { logged.push(...entries); } };
  const inbox = createInboxRepository({ leads: leadsRepo, sender: () => mockSender, ai: () => mockAi, now: () => new Date("2026-10-21T15:00:00.000Z") });

  function payload(numberId: string, from: string, id: string) {
    return { entry: [{ changes: [{ field: "messages", value: { metadata: { phone_number_id: numberId }, messages: [{ from, id, type: "text", text: { body: "Oi" } }] } }] }] };
  }

  it("lê o número de cada mensagem e o filtro antigo continua valendo", () => {
    const all = parseInboundAll(payload("11111", "5547999990001", "w1"));
    expect(all).toHaveLength(1);
    expect(all[0].phoneNumberId).toBe("11111");
    expect(parseInbound(payload("11111", "5547999990001", "w1"), "22222")).toEqual([]);
    expect(parseInbound(payload("11111", "5547999990001", "w1"), "11111")).toHaveLength(1);
  });

  it("o mesmo telefone em dois clientes: cada um recebe só pelo seu número", async () => {
    const leadA = await leadsRepo.create("cA", { name: "Ana", company: "L", phone: "+5547999990001", email: "", source: "manual", tags: [], notes: "", stage: "novo", optIn: true, optInSource: "formulario" });
    const leadB = await leadsRepo.create("cB", { name: "Ana", company: "L", phone: "+5547999990001", email: "", source: "manual", tags: [], notes: "", stage: "novo", optIn: true, optInSource: "formulario" });
    if (!leadA.ok || !leadB.ok) throw new Error("falha");
    const owners: Record<string, string> = { "11111": "cA", "22222": "cB" };
    const deps = { leads: leadsRepo, inbox, audit, clientForNumber: async (n: string) => owners[n] ?? null };

    const a = await routeInbound(deps, parseInboundAll(payload("11111", "5547999990001", "wamid.A")));
    expect(a.received).toBe(1);
    const convA = await inbox.getThread("cA", leadA.lead.id);
    const convB = await inbox.getThread("cB", leadB.lead.id);
    expect(convA?.messages.length ?? 0).toBeGreaterThan(0);
    expect(convB?.messages.length ?? 0).toBe(0);

    const b = await routeInbound(deps, parseInboundAll(payload("22222", "5547999990001", "wamid.B")));
    expect(b.received).toBe(1);
    expect((await inbox.getThread("cB", leadB.lead.id))?.messages.length ?? 0).toBeGreaterThan(0);
  });

  it("número desconhecido é ignorado", async () => {
    const result = await routeInbound({ leads: leadsRepo, inbox, audit, clientForNumber: async () => null }, parseInboundAll(payload("00000", "5547999990001", "w9")));
    expect(result.ignored).toBe(1);
    expect(result.received).toBe(0);
  });
});
