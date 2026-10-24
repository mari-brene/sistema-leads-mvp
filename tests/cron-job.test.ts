import { describe, expect, it } from "vitest";
import type { AuditSink, NewEntry } from "@/lib/audit";
import type { BatchResult } from "@/lib/campaigns/repository";
import { mockSender } from "@/lib/campaigns/sender";
import { runCampaignsJob } from "@/lib/cron/campaigns-job";
import { StorageConflictError } from "@/lib/storage";

function fakeAudit() {
  const logged: { entries: NewEntry[]; text: string }[] = [];
  const sink: AuditSink = { async log(entries, text) { logged.push({ entries, text }); } };
  return { sink, logged };
}

const ok = (sent: number, failed = 0, skipped = 0): BatchResult => ({ ok: true, sent, failed, skipped, remainingToday: 10, queuedLeft: 0, simulated: true });

describe("runCampaignsJob", () => {
  it("roda um lote por pessoa e soma os resultados, sem dados pessoais no registro", async () => {
    const calls: string[] = [];
    const { sink, logged } = fakeAudit();
    const summary = await runCampaignsJob({
      campaigns: {
        listActiveUserIds: async () => ["u1", "u2"],
        runBatch: async (userId) => { calls.push(userId); return userId === "u1" ? ok(7, 1, 2) : ok(3); },
      },
      sender: mockSender,
      audit: sink,
    });
    expect(calls).toEqual(["u1", "u2"]);
    expect(summary).toEqual({ users: 2, sent: 10, failed: 1, skipped: 2, waiting: 0, errors: 0, simulated: true });
    expect(logged).toHaveLength(1);
    expect(logged[0].entries.map((e) => e.userId)).toEqual(["u1", "u2"]);
    expect(logged[0].entries[0].text).toBe("Lote automático: 7 enviada(s), 1 falha(s), 2 pulada(s) (simulação).");
    expect(logged[0].text).toContain("10 enviada(s)");
  });

  it("fora do horário / limite atingido é 'aguardando', não erro, e não gera registro", async () => {
    const { sink, logged } = fakeAudit();
    const summary = await runCampaignsJob({
      campaigns: { listActiveUserIds: async () => ["u1"], runBatch: async () => ({ ok: false, error: "Fora do horário" }) },
      sender: mockSender,
      audit: sink,
    });
    expect(summary).toMatchObject({ users: 1, sent: 0, waiting: 1, errors: 0 });
    expect(logged[0].entries).toEqual([]);
  });

  it("sem campanhas em andamento só marca a chamada", async () => {
    const { sink, logged } = fakeAudit();
    const summary = await runCampaignsJob({ campaigns: { listActiveUserIds: async () => [], runBatch: async () => ok(0) }, sender: mockSender, audit: sink });
    expect(summary.users).toBe(0);
    expect(logged).toHaveLength(1);
    expect(logged[0].entries).toEqual([]);
  });

  it("erro em uma pessoa não impede as outras, e a mensagem do erro não vai para o registro", async () => {
    const { sink, logged } = fakeAudit();
    const summary = await runCampaignsJob({
      campaigns: {
        listActiveUserIds: async () => ["u1", "u2"],
        runBatch: async (userId) => { if (userId === "u1") throw new Error("segredo-sb_secret_123 telefone +5547999990001"); return ok(2); },
      },
      sender: mockSender,
      audit: sink,
    });
    expect(summary).toMatchObject({ sent: 2, errors: 1 });
    const text = JSON.stringify(logged);
    expect(text).not.toContain("sb_secret_123");
    expect(text).not.toContain("5547999990001");
    expect(logged[0].entries.find((e) => e.kind === "erro")?.userId).toBe("u1");
  });

  it("conflito de gravação vira aviso amigável", async () => {
    const { sink, logged } = fakeAudit();
    await runCampaignsJob({
      campaigns: { listActiveUserIds: async () => ["u1"], runBatch: async () => { throw new StorageConflictError(); } },
      sender: mockSender,
      audit: sink,
    });
    expect(logged[0].entries[0].text).toContain("tenta de novo");
  });

  it("falha ao listar pessoas ou ao gravar a auditoria é contada, não derruba", async () => {
    const failingAudit: AuditSink = { async log() { throw new Error("x"); } };
    const a = await runCampaignsJob({ campaigns: { listActiveUserIds: async () => { throw new Error("y"); }, runBatch: async () => ok(0) }, sender: mockSender, audit: failingAudit });
    expect(a.errors).toBe(2);
  });
});
