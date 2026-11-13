import { describe, expect, it } from "vitest";
import { resolveScope } from "@/lib/tenancy";
import { createTableStore } from "@/lib/tenancy/store";
import { fakeTables } from "./helpers/fake-tables";

function setup(seed = {}) {
  const db = fakeTables(seed);
  const store = createTableStore({ url: "https://x.supabase.co", secretKey: "sb_secret_teste", fetch: db.fetch });
  return { db, store };
}

describe("clientes e vínculos nas tabelas próprias", () => {
  it("a primeira pessoa vira administradora e o cliente dela é criado na tabela clients", async () => {
    const { db, store } = setup();
    expect(await resolveScope("u1", undefined, store)).toEqual({ userId: "u1", clientId: "u1", role: "agency_admin" });
    expect(db.tables.clients).toHaveLength(1);
    expect(db.tables.clients[0]).toMatchObject({ id: "u1", name: "Demonstração" });
    expect(db.tables.memberships).toEqual([{ user_id: "u1", client_id: "u1", role: "agency_admin" }]);
  });

  it("a segunda pessoa vira gestora do próprio cliente", async () => {
    const { db, store } = setup();
    await resolveScope("u1", undefined, store);
    expect(await resolveScope("u2", undefined, store)).toMatchObject({ clientId: "u2", role: "client_manager" });
    expect(db.tables.clients).toHaveLength(2);
  });

  it("entrar de novo não cria nem altera nada", async () => {
    const { db, store } = setup();
    await resolveScope("u1", undefined, store);
    const before = db.calls.length;
    await resolveScope("u1", undefined, store);
    expect(db.calls.slice(before).every((c) => c.method === "GET")).toBe(true);
  });

  it("dois pedidos ao mesmo tempo da mesma pessoa não duplicam cliente nem vínculo", async () => {
    const { db, store } = setup();
    await Promise.all([resolveScope("u1", undefined, store), resolveScope("u1", undefined, store)]);
    expect(db.tables.clients).toHaveLength(1);
    expect(db.tables.memberships).toHaveLength(1);
  });

  it("se não der para ler os vínculos, dá erro e ninguém vira administrador", async () => {
    const { db, store } = setup({ clients: [{ id: "u1", name: "X", created_at: "2026-11-01T00:00:00Z" }], memberships: [{ user_id: "u1", client_id: "u1", role: "client_manager" }] });
    db.failWith(500);
    let failed = false;
    try {
      await resolveScope("u1", undefined, store);
    } catch {
      failed = true;
    }
    expect(failed).toBe(true);
    db.failWith(null);
    expect(db.calls.some((c) => c.method !== "GET")).toBe(false);
    expect(db.tables.memberships[0].role).toBe("client_manager");
  });

  it("papel alterado vira atualização; vínculo removido vira exclusão; clientes nunca são apagados", async () => {
    const { db, store } = setup();
    await resolveScope("u1", undefined, store);
    await resolveScope("u2", undefined, store);
    const before = await store.load();
    const after = {
      clients: before.clients.filter((c) => c.id !== "u2"),
      memberships: before.memberships.filter((m) => m.userId !== "u2").map((m) => ({ ...m, role: "agent" as const })),
    };
    await store.save(before, after);
    expect(db.tables.memberships).toEqual([{ user_id: "u1", client_id: "u1", role: "agent" }]);
    expect(db.tables.clients).toHaveLength(2);
  });

  it("erro do Supabase não vaza dados nem chave", async () => {
    const { db, store } = setup();
    db.failWith(500);
    let text = "";
    try {
      await store.load();
    } catch (error) {
      text = (error as Error).message;
    }
    expect(text).toContain("500");
    expect(text).not.toContain("dados-do-cliente");
    expect(text).not.toContain("sb_secret");
  });
});
