import { describe, expect, it } from "vitest";
import { securityHeaders } from "../security-headers.mjs";

const get = (name: string) =>
  (securityHeaders as { key: string; value: string }[]).find((h) => h.key === name)?.value;

describe("cabeçalhos de segurança", () => {
  it("bloqueia embutir o sistema em outro site", () => {
    expect(get("X-Frame-Options")).toBe("DENY");
  });
  it("impede adivinhação de tipo de arquivo", () => {
    expect(get("X-Content-Type-Options")).toBe("nosniff");
  });
  it("força HTTPS por pelo menos 1 ano", () => {
    const v = get("Strict-Transport-Security") ?? "";
    const age = Number(/max-age=(\d+)/.exec(v)?.[1] ?? 0);
    expect(age).toBeGreaterThanOrEqual(31536000);
  });
  it("define política de referência e de permissões", () => {
    expect(get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(get("Permissions-Policy")).toContain("camera=()");
  });
  it("não repete cabeçalhos", () => {
    const keys = (securityHeaders as { key: string }[]).map((h) => h.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
