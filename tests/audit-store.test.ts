import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAuditSink, MAX_ENTRIES, readAudit } from "@/lib/audit";
import { createCollectionStore, createTableStore, RETENTION_DAYS } from "@/lib/audit/store";
import { fakeTables } from "./helpers/fake-tables";

let dir: string;
let previous: string | undefined;

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "audit-store-"));
  previous = process.env.DATA_DIR;
  process.env.DATA_DIR = dir;
});

afterEach(async () => {
  if (previous === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = previous;
  await rm(dir, { recursive: true, force: true });
});

function table(seed = {}) {
  const db = fakeTables(seed);
  let n = 0;
  const store = createTableStore({ url: "https://x.supabase.co", secretKey: "sb_secret_teste", fetch: db.fetch }, () => `id-${String(++n).padStart(4, "0")}`);
  return { db, store };
}

describe("auditoria nas tabelas próprias", () => {
  it("grava, lê só o do cliente + do sistema e mostra o mais novo primeiro", async () => {
    const { store } = table();
    let clock = new Date("2026-11-13T12:00:00.000Z");
    const sink = createAuditSink(() => clock, store);
    await sink.log([{ userId: "c1", kind: "agendador", text: "cliente 1" }], "rodou 1");
    clock = new Date("2026-11-13T12:10:00.000Z");
    await sink.log([{ userId: "c2", kind: "agendador", text: "cliente 2" }, { userId: null, kind: "erro", text: "sistema" }], "rodou 2");

    const c1 = await readAudit("c1", store);
    expect(c1.entries.map((entry) => entry.text)).toEqual(["sistema", "cliente 1"]);
    expect(c1.lastCron).toEqual({ at: "2026-11-13T12:10:00.000Z", text: "rodou 2" });
    const c2 = await readAudit("c2", store);
    expect(c2.entries.map((entry) => entry.text)).toEqual(["sistema", "cliente 2"]);
    expect(c2.entries.some((entry) => entry.text === "cliente 1")).toBe(false);
  });

  it("uma chamada sem registros só atualiza a última chamada (uma linha só)", async () => {
    const { db, store } = table();
    const sink = createAuditSink(() => new Date("2026-11-13T12:00:00.000Z"), store);
    await sink.log([], "nada a fazer");
    await sink.log([], "nada a fazer de novo");
    expect(db.tables.audit_state).toHaveLength(1);
    expect((await readAudit("c1", store)).lastCron?.text).toBe("nada a fazer de novo");
  });

  it("mostra no máximo os mais recentes", async () => {
    const { store } = table();
    const sink = createAuditSink(() => new Date("2026-11-13T12:00:00.000Z"), store);
    await sink.log(Array.from({ length: MAX_ENTRIES + 20 }, (_, i) => ({ userId: "c1", kind: "agendador" as const, text: `r${i}` })), "x");
    const result = await readAudit("c1", store);
    expect(result.entries).toHaveLength(MAX_ENTRIES);
    expect(result.entries[0].text).toBe(`r${MAX_ENTRIES + 19}`);
  });

  it("apaga registros com mais de 90 dias", async () => {
    const old = new Date("2026-11-13T12:00:00.000Z").getTime() - (RETENTION_DAYS + 1) * 86_400_000;
    const { db, store } = table({ audit_log: [{ id: "velho", client_id: "c1", at: new Date(old).toISOString(), kind: "erro", text: "antigo" }] });
    await createAuditSink(() => new Date("2026-11-13T12:00:00.000Z"), store).log([{ userId: "c1", kind: "agendador", text: "novo" }], "x");
    expect(db.tables.audit_log.map((row) => row.text)).toEqual(["novo"]);
  });

  it("corta textos enormes", async () => {
    const { db, store } = table();
    await createAuditSink(() => new Date(), store).log([{ userId: null, kind: "erro", text: "x".repeat(1000) }], "y".repeat(1000));
    expect(String(db.tables.audit_log[0].text)).toHaveLength(300);
    expect(String(db.tables.audit_state[0].text)).toHaveLength(300);
  });

  it("erro do Supabase não vaza dados", async () => {
    const { db, store } = table();
    db.failWith(500);
    let message = "";
    try {
      await readAudit("c1", store);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain("500");
    expect(message).not.toContain("dados-do-cliente");
  });
});

describe("auditoria na coleção (como sempre foi)", () => {
  it("continua filtrando por cliente", async () => {
    const store = createCollectionStore();
    const sink = createAuditSink(() => new Date("2026-11-13T12:00:00.000Z"), store);
    await sink.log([{ userId: "c1", kind: "agendador", text: "um" }, { userId: "c2", kind: "agendador", text: "dois" }, { userId: null, kind: "erro", text: "todos" }], "ok");
    const result = await readAudit("c1", store);
    expect(result.entries.map((entry) => entry.text).sort()).toEqual(["todos", "um"]);
    expect(result.lastCron?.text).toBe("ok");
  });
});

describe("a última chamada do agendador não é apagada por outros registros", () => {
  it("registro sem texto de agendador (ex.: exportação) mantém a última chamada", async () => {
    const { store } = table();
    const sink = createAuditSink(() => new Date("2026-11-13T12:00:00.000Z"), store);
    await sink.log([], "rodou o agendador");
    await sink.log([{ userId: "c1", kind: "exportacao", text: "Exportação" }], "");
    expect((await readAudit("c1", store)).lastCron?.text).toBe("rodou o agendador");

    const collection = createCollectionStore();
    const sink2 = createAuditSink(() => new Date("2026-11-13T12:00:00.000Z"), collection);
    await sink2.log([], "rodou o agendador");
    await sink2.log([{ userId: "c1", kind: "exportacao", text: "Exportação" }], "");
    expect((await readAudit("c1", collection)).lastCron?.text).toBe("rodou o agendador");
  });
});
