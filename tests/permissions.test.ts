import { describe, expect, it } from "vitest";
import { NAV_ITEMS } from "@/lib/nav";
import { can, navForRole, type Permission } from "@/lib/tenancy/permissions";
import type { Role } from "@/lib/tenancy";

const ALL: Permission[] = ["campaigns", "settings", "audit", "team", "admin"];

describe("permissões por papel", () => {
  it("administrador da agência pode tudo", () => {
    for (const p of ALL) expect(can("agency_admin", p)).toBe(true);
  });

  it("gestor configura, faz campanhas e vê auditoria, mas não administra a agência", () => {
    expect(can("client_manager", "campaigns")).toBe(true);
    expect(can("client_manager", "settings")).toBe(true);
    expect(can("client_manager", "audit")).toBe(true);
    expect(can("client_manager", "team")).toBe(true);
    expect(can("client_manager", "admin")).toBe(false);
  });

  it("atendente não tem nenhuma permissão extra", () => {
    for (const p of ALL) expect(can("agent", p)).toBe(false);
  });

  it("menu do atendente não mostra campanhas, configurações nem auditoria", () => {
    const slugs = navForRole(NAV_ITEMS, "agent").map((i) => i.slug);
    for (const s of ["campanhas", "configuracoes", "auditoria"]) expect(slugs).not.toContain(s);
    for (const s of ["kanban", "leads", "inbox", "painel"]) expect(slugs).toContain(s);
  });

  it("menu do gestor e do administrador mostra tudo", () => {
    const all = NAV_ITEMS.map((i) => i.slug);
    for (const role of ["agency_admin", "client_manager"] as Role[]) {
      expect(navForRole(NAV_ITEMS, role).map((i) => i.slug)).toEqual(role === "agency_admin" ? all : all.filter((s) => s !== "clientes"));
    }
  });
});
