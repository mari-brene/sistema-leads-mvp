import { describe, expect, it } from "vitest";
import {
  hashPassword,
  safeEqual,
  signSessionToken,
  verifyPassword,
  verifySessionToken,
} from "@/lib/security";

describe("senhas", () => {
  it("aceita a senha correta e recusa a errada", () => {
    const hash = hashPassword("minha-senha-forte");
    expect(verifyPassword("minha-senha-forte", hash)).toBe(true);
    expect(verifyPassword("outra-senha", hash)).toBe(false);
  });

  it("gera hashes diferentes para a mesma senha (sal aleatório)", () => {
    expect(hashPassword("igual")).not.toBe(hashPassword("igual"));
  });

  it("nunca guarda a senha em texto puro", () => {
    expect(hashPassword("segredo123")).not.toContain("segredo123");
  });

  it("recusa hash malformado sem quebrar", () => {
    expect(verifyPassword("x", "")).toBe(false);
    expect(verifyPassword("x", "texto-qualquer")).toBe(false);
    expect(verifyPassword("x", "scrypt$$")).toBe(false);
    expect(verifyPassword("x", "bcrypt$aa$bb")).toBe(false);
  });
});

describe("cookie de sessão", () => {
  const secret = "segredo-de-teste-com-mais-de-16-caracteres";
  const now = 1_700_000_000;

  it("aceita um cookie válido", () => {
    const token = signSessionToken({ uid: "u1", exp: now + 60 }, secret);
    expect(verifySessionToken(token, secret, now)).toEqual({ uid: "u1", exp: now + 60 });
  });

  it("recusa cookie expirado", () => {
    const token = signSessionToken({ uid: "u1", exp: now - 1 }, secret);
    expect(verifySessionToken(token, secret, now)).toBeNull();
  });

  it("recusa cookie assinado com outro segredo", () => {
    const token = signSessionToken({ uid: "u1", exp: now + 60 }, "outro-segredo-bem-diferente-123");
    expect(verifySessionToken(token, secret, now)).toBeNull();
  });

  it("recusa cookie adulterado", () => {
    const token = signSessionToken({ uid: "u1", exp: now + 60 }, secret);
    const [, signature] = token.split(".");
    const forgedBody = Buffer.from(JSON.stringify({ uid: "admin", exp: now + 999 })).toString("base64url");
    expect(verifySessionToken(`${forgedBody}.${signature}`, secret, now)).toBeNull();
  });

  it("recusa textos que não parecem um cookie", () => {
    expect(verifySessionToken("", secret, now)).toBeNull();
    expect(verifySessionToken("abc", secret, now)).toBeNull();
    expect(verifySessionToken("a.b.c", secret, now)).toBeNull();
    expect(verifySessionToken(".", secret, now)).toBeNull();
  });
});

describe("safeEqual", () => {
  it("compara textos iguais e diferentes", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
    expect(safeEqual("", "")).toBe(true);
  });
});
