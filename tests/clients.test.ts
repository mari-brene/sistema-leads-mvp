import { describe, expect, it } from "vitest";
import { createClientsService } from "@/lib/tenancy/clients-service";
import { cleanClientName, createClient, renameClient, signupAllowed } from "@/lib/tenancy/clients";
import { accessibleClients, pickAccess } from "@/lib/tenancy/logic";
import { createTableStore } from "@/lib/tenancy/store";
import { fakeTables } from "./helpers/fake-tables";

const T = "2026-11-01T00:00:00.000Z";
const data = {
  clients: [
    { id: "admin", name: "Demonstração", createdAt: T },
    { id: "c1", name: "Bela", createdAt: T },
    { id: "c2", name: "Alfa", createdAt: T },
    { id: "c3", name: "Zeta", createdAt: T },
  ],
  memberships: [
    { userId: "admin", clientId: "admin", role: "agency_admin" as const },
    { userId: "m1", clientId: "c1", role: "client_manager" as const },
    { userId: "multi", clientId: "c1", role: "agent" as const },
    { userId: "multi", clientId: "c2", role: "client_manager" as const },
  ],
};

describe("clientes acessíveis", () => {
  it("administrador vê todos, o próprio primeiro e os outros por nome, sempre como administrador", () => {
    const list = accessibleClients(data, "admin");
    expect(list.map((a) => a.client.id)).toEqual(["admin", "c2", "c1", "c3"]);
    expect(list.every((a) => a.role === "agency_admin")).toBe(true);
  });

  it("os demais veem só os clientes onde têm vínculo, com o papel de cada um", () => {
    expect(accessibleClients(data, "m1").map((a) => [a.client.id, a.role])).toEqual([["c1", "client_manager"]]);
    expect(accessibleClients(data, "multi").map((a) => [a.client.id, a.role])).toEqual([["c1", "agent"], ["c2", "client_manager"]]);
    expect(accessibleClients(data, "estranho")).toEqual([]);
  });

  it("a preferência só vale para cliente acessível; senão cai no primeiro", () => {
    expect(pickAccess(data, "multi", "c2")?.scope).toEqual({ userId: "multi", clientId: "c2", role: "client_manager" });
    expect(pickAccess(data, "multi", "c3")?.scope.clientId).toBe("c1");
    expect(pickAccess(data, "m1", "c2")?.scope.clientId).toBe("c1");
    expect(pickAccess(data, "admin", "c3")?.scope).toEqual({ userId: "admin", clientId: "c3", role: "agency_admin" });
    expect(pickAccess(data, "estranho")).toBeNull();
  });
});

describe("criar e renomear clientes", () => {
  const now = new Date(T);
  it("só o administrador cria; nome limpo, sem repetir", () => {
    expect(createClient(data, "m1", "Novo", now, "n1").ok).toBe(false);
    expect(createClient(data, "multi", "Novo", now, "n1").ok).toBe(false);
    const ok = createClient(data, "admin", "  Studio   Novo ", now, "n1");
    expect(ok.ok && ok.client).toEqual({ id: "n1", name: "Studio Novo", createdAt: T });
    expect(createClient(data, "admin", "bela", now, "n2").ok).toBe(false);
    expect(createClient(data, "admin", "   ", now, "n3").ok).toBe(false);
    expect(cleanClientName("x".repeat(81)).ok).toBe(false);
  });

  it("gestor renomeia só o próprio cliente; atendente não renomeia; sem nome repetido", () => {
    expect(renameClient(data, "m1", "c1", "Bela Nova").ok).toBe(true);
    expect(renameClient(data, "m1", "c2", "Outro").ok).toBe(false);
    expect(renameClient(data, "multi", "c1", "Outro").ok).toBe(false); // atendente em c1
    expect(renameClient(data, "multi", "c2", "Outro").ok).toBe(true); // gestor em c2
    expect(renameClient(data, "admin", "c3", "Alfa").ok).toBe(false);
    expect(renameClient(data, "admin", "c3", "Zeta").ok).toBe(true);
    expect(renameClient(data, "admin", "nao-existe", "X").ok).toBe(false);
  });

  it("cadastro aberto só quando permitido ou com convite", () => {
    expect(signupAllowed(true, false)).toBe(true);
    expect(signupAllowed(false, false)).toBe(false);
    expect(signupAllowed(false, true)).toBe(true);
  });
});

describe("serviço de clientes nas tabelas próprias", () => {
  function setup() {
    const db = fakeTables({
      clients: data.clients.map((c) => ({ id: c.id, name: c.name, created_at: c.createdAt })),
      memberships: data.memberships.map((m) => ({ user_id: m.userId, client_id: m.clientId, role: m.role })),
    });
    const tenancy = createTableStore({ url: "https://x.supabase.co", secretKey: "sb_secret_teste", fetch: db.fetch });
    return { db, service: createClientsService({ tenancy, now: () => new Date(T), newId: () => "novo-id" }) };
  }

  it("cria e renomeia gravando na tabela; lista só para o administrador", async () => {
    const { db, service } = setup();
    expect((await service.create("admin", "Studio Novo")).ok).toBe(true);
    expect(db.tables.clients.find((c) => c.id === "novo-id")).toMatchObject({ name: "Studio Novo" });
    expect(await service.rename("admin", "c3", "Zeta 2")).toEqual({ ok: true });
    expect(db.tables.clients.find((c) => c.id === "c3")?.name).toBe("Zeta 2");

    const listed = await service.list("admin");
    if (!listed.ok) throw new Error(listed.error);
    expect(listed.rows.map((r) => r.client.name)).toEqual(["Alfa", "Bela", "Demonstração", "Studio Novo", "Zeta 2"]);
    expect(listed.rows.find((r) => r.client.id === "c1")?.members).toBe(2);
    expect((await service.list("m1")).ok).toBe(false);
    expect((await service.create("m1", "Intruso")).ok).toBe(false);
    expect(db.tables.clients.some((c) => c.name === "Intruso")).toBe(false);
  });
});
