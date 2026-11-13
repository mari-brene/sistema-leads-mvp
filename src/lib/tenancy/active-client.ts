import { cookies } from "next/headers";
import { CLIENT_COOKIE, INVITE_COOKIE, failureOf, isTokenShape, type InviteFailure } from "./invite-link";
import { getTeamService } from "./team-service";

const base = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/" };

/** Cliente escolhido pela pessoa. É só uma preferência: quem decide se ela pode entrar é o vínculo (resolveScope confere). */
export async function readActiveClient(): Promise<string | undefined> {
  const value = (await cookies()).get(CLIENT_COOKIE)?.value;
  return value && value.length <= 200 ? value : undefined;
}

export async function setActiveClient(clientId: string): Promise<void> {
  (await cookies()).set(CLIENT_COOKIE, clientId, { ...base, maxAge: 60 * 60 * 24 * 30 });
}

/** Guarda o convite enquanto a pessoa entra ou cria a conta. */
export async function setPendingInvite(token: string): Promise<void> {
  (await cookies()).set(INVITE_COOKIE, token, { ...base, maxAge: 60 * 60 });
}

export async function hasPendingInvite(): Promise<boolean> {
  return Boolean((await cookies()).get(INVITE_COOKIE)?.value);
}

/** Ao sair, esquece o cliente escolhido e qualquer convite guardado. */
export async function clearClientPreference(): Promise<void> {
  const store = await cookies();
  store.delete(CLIENT_COOKIE);
  store.delete(INVITE_COOKIE);
}

/** Usa o convite guardado (se houver). Nunca atrapalha o login: devolve null se não havia convite. */
export async function acceptPendingInvite(userId: string): Promise<{ ok: true } | { ok: false; reason: InviteFailure } | null> {
  const store = await cookies();
  const token = store.get(INVITE_COOKIE)?.value;
  if (!token) return null;
  store.delete(INVITE_COOKIE);
  if (!isTokenShape(token)) return { ok: false, reason: "invalido" };
  try {
    const result = await getTeamService().acceptInvite(userId, token);
    if (!result.ok) return { ok: false, reason: failureOf(result.error) };
    await setActiveClient(result.clientId);
    return { ok: true };
  } catch {
    return { ok: false, reason: "erro" };
  }
}
