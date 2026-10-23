import { cookies } from "next/headers";
import { getAuthAdapter, type AuthUser } from "@/lib/auth";
import { config } from "@/lib/config";
import { signSessionToken, verifySessionToken } from "@/lib/security";

const COOKIE_NAME = "sl_session";
const SESSION_DAYS = 7;

/** Cria o cookie de login (some do navegador depois de 7 dias). */
export async function startSession(userId: string): Promise<void> {
  const maxAge = SESSION_DAYS * 24 * 60 * 60;
  const exp = Math.floor(Date.now() / 1000) + maxAge;
  const token = signSessionToken({ uid: userId, exp }, config.sessionSecret);

  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true, // o JavaScript da página não consegue ler este cookie
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  });
}

/** Apaga o cookie de login. */
export async function endSession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

/** Quem está logado agora? Devolve o usuário ou null. */
export async function getSession(): Promise<AuthUser | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;

  const payload = verifySessionToken(token, config.sessionSecret);
  if (!payload) return null;

  return getAuthAdapter().getUserById(payload.uid);
}
