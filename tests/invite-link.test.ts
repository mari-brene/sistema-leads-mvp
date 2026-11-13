import { describe, expect, it } from "vitest";
import { NAV_ITEMS } from "@/lib/nav";
import { INVITE_FAILURE_TEXT, failureOf, invitePath, isInviteFailure, isTokenShape } from "@/lib/tenancy/invite-link";
import { navForRole } from "@/lib/tenancy/permissions";
import { randomBytes } from "node:crypto";

describe("link de convite", () => {
  it("aceita o formato do token gerado e recusa o resto", () => {
    expect(isTokenShape(randomBytes(32).toString("base64url"))).toBe(true);
    for (const bad of ["", "curto", "a".repeat(101), "../../etc/passwd" + "a".repeat(20), "com espaço " + "a".repeat(20), "a".repeat(30) + "?x=1", undefined, 5]) {
      expect(isTokenShape(bad)).toBe(false);
    }
  });

  it("monta o caminho do convite", () => {
    expect(invitePath("abc")).toBe("/convite/abc");
  });

  it("traduz o erro do serviço em um motivo conhecido", () => {
    expect(failureOf("Você já faz parte deste cliente.")).toBe("ja-membro");
    expect(failureOf("Convite inválido ou expirado. Peça um novo link.")).toBe("invalido");
    expect(isInviteFailure("ja-membro")).toBe(true);
    expect(isInviteFailure("<script>")).toBe(false);
    expect(Object.keys(INVITE_FAILURE_TEXT).sort()).toEqual(["erro", "invalido", "ja-membro"]);
  });
});

describe("menu Equipe", () => {
  it("aparece para administrador e gestor, não para atendente", () => {
    expect(navForRole(NAV_ITEMS, "agency_admin").map((i) => i.slug)).toContain("equipe");
    expect(navForRole(NAV_ITEMS, "client_manager").map((i) => i.slug)).toContain("equipe");
    expect(navForRole(NAV_ITEMS, "agent").map((i) => i.slug)).not.toContain("equipe");
  });
});
