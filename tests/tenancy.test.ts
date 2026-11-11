import { describe, expect, it } from "vitest";
import { canConfigure, ensureDefaultClient, pickScope } from "@/lib/tenancy/logic";

const now = new Date("2026-11-11T12:00:00Z");
const empty = { clients: [], memberships: [] };

describe("clientes e papéis", () => {
  it("a primeira pessoa vira administradora da agência, com cliente de id igual ao dela", () => {
    const { data, changed } = ensureDefaultClient(empty, "u1", now);
    expect(changed).toBe(true);
    expect(data.clients).toEqual([{ id: "u1", name: "Demonstração", createdAt: now.toISOString() }]);
    expect(data.memberships).toEqual([{ userId: "u1", clientId: "u1", role: "agency_admin" }]);
  });

  it("as próximas pessoas viram gestoras do próprio cliente", () => {
    const first = ensureDefaultClient(empty, "u1", now).data;
    const { data } = ensureDefaultClient(first, "u2", now);
    expect(data.memberships.find((m) => m.userId === "u2")).toEqual({ userId: "u2", clientId: "u2", role: "client_manager" });
    expect(data.clients).toHaveLength(2);
  });

  it("não cria nada de novo para quem já tem vínculo", () => {
    const first = ensureDefaultClient(empty, "u1", now).data;
    const again = ensureDefaultClient(first, "u1", now);
    expect(again.changed).toBe(false);
    expect(again.data).toBe(first);
  });

  it("o cliente ativo é o escolhido, ou o primeiro; desconhecido cai no primeiro", () => {
    const memberships = [
      { userId: "u1", clientId: "a", role: "agent" as const },
      { userId: "u1", clientId: "b", role: "client_manager" as const },
      { userId: "u2", clientId: "c", role: "agent" as const },
    ];
    expect(pickScope("u1", memberships)?.clientId).toBe("a");
    expect(pickScope("u1", memberships, "b")).toEqual({ userId: "u1", clientId: "b", role: "client_manager" });
    expect(pickScope("u1", memberships, "c")?.clientId).toBe("a"); // não pode entrar em cliente alheio
    expect(pickScope("u9", memberships)).toBeNull();
  });

  it("só administrador e gestor mexem em configurações", () => {
    expect(canConfigure("agency_admin")).toBe(true);
    expect(canConfigure("client_manager")).toBe(true);
    expect(canConfigure("agent")).toBe(false);
  });
});
