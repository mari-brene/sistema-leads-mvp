import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/**
 * Funções de segurança: comparação em tempo constante, senhas e cookie de sessão.
 * Só usam o módulo "crypto" do próprio Node.js (nada para instalar).
 */

/** Compara dois textos sem vazar, pelo tempo de resposta, onde eles diferem. */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    // Faz uma comparação "à toa" para o tempo não denunciar o tamanho.
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

// ---------- Senhas ----------

/** Transforma a senha em um "hash" irreversível: scrypt$sal$hash. */
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

/** Confere uma senha digitada contra o hash guardado. */
export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;

  const salt = Buffer.from(parts[1], "hex");
  const expected = Buffer.from(parts[2], "hex");
  if (salt.length === 0 || expected.length === 0) return false;

  const actual = scryptSync(password, salt, expected.length);
  return timingSafeEqual(actual, expected);
}

// ---------- Cookie de sessão assinado ----------

export type SessionPayload = {
  /** id do usuário */
  uid: string;
  /** quando expira, em segundos desde 1970 (timestamp Unix) */
  exp: number;
};

function sign(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("base64url");
}

/** Gera o texto do cookie: corpo.assinatura */
export function signSessionToken(payload: SessionPayload, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body, secret)}`;
}

/** Devolve o conteúdo se o cookie for autêntico e não tiver expirado; senão, null. */
export function verifySessionToken(
  token: string,
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): SessionPayload | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;

  const [body, signature] = parts;
  if (!body || !signature) return null;
  if (!safeEqual(signature, sign(body, secret))) return null;

  try {
    const data: unknown = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (typeof data !== "object" || data === null) return null;

    const { uid, exp } = data as Record<string, unknown>;
    if (typeof uid !== "string" || typeof exp !== "number") return null;
    if (exp <= nowSeconds) return null;

    return { uid, exp };
  } catch {
    return null;
  }
}
