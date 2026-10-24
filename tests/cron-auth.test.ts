import { describe, expect, it } from "vitest";
import { authorizeCron } from "@/lib/cron/auth";

const SECRET = "a".repeat(32);

describe("authorizeCron", () => {
  it("aceita só a senha certa no formato Bearer", () => {
    expect(authorizeCron(`Bearer ${SECRET}`, SECRET)).toBe("ok");
  });
  it("recusa senha errada, parecida, vazia ou sem Bearer", () => {
    expect(authorizeCron(`Bearer ${"b".repeat(32)}`, SECRET)).toBe("unauthorized");
    expect(authorizeCron(`Bearer ${SECRET}x`, SECRET)).toBe("unauthorized");
    expect(authorizeCron(`Bearer ${SECRET.slice(0, -1)}`, SECRET)).toBe("unauthorized");
    expect(authorizeCron(SECRET, SECRET)).toBe("unauthorized");
    expect(authorizeCron("Bearer ", SECRET)).toBe("unauthorized");
    expect(authorizeCron("", SECRET)).toBe("unauthorized");
    expect(authorizeCron(null, SECRET)).toBe("unauthorized");
    expect(authorizeCron(undefined, SECRET)).toBe("unauthorized");
  });
  it("sem senha configurada (ou curta) a rota fica DESLIGADA, nunca aberta", () => {
    expect(authorizeCron("Bearer ", "")).toBe("disabled");
    expect(authorizeCron("", "")).toBe("disabled");
    expect(authorizeCron("Bearer curta", "curta")).toBe("disabled");
    expect(authorizeCron(`Bearer ${SECRET}`, "x".repeat(23))).toBe("disabled");
  });
});
