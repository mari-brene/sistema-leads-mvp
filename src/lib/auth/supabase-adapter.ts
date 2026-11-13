import { keyHeaders, type FetchLike } from "@/lib/storage/supabase-store";
import type { AuthAdapter, AuthUser } from "./types";

/**
 * Login pelo Supabase Auth (API REST, sem pacotes).
 * Criar conta só acontece pela tela de cadastro, que a tela só libera com convite válido
 * (ou com ALLOW_OPEN_SIGNUP=true). Quem confere isso é a ação de cadastro, antes de chamar signUp.
 */

type Options = { url: string; publishableKey: string; secretKey: string; fetch?: FetchLike };

const INVALID_LOGIN = "E-mail ou senha incorretos.";
const TIMEOUT_MS = 15_000;
const MIN_PASSWORD_LENGTH = 8;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type SupabaseUser = { id?: unknown; email?: unknown; user_metadata?: { name?: unknown } | null };

function toUser(raw: SupabaseUser | undefined | null): AuthUser | null {
  if (!raw || typeof raw.id !== "string" || typeof raw.email !== "string") return null;
  const metaName = raw.user_metadata?.name;
  const name = typeof metaName === "string" && metaName.trim() ? metaName.trim().slice(0, 80) : raw.email.split("@")[0];
  return { id: raw.id, email: raw.email, name };
}

export function createSupabaseAuth(options: Options): AuthAdapter {
  const doFetch: FetchLike = options.fetch ?? ((url, init) => fetch(url, init) as unknown as ReturnType<FetchLike>);

  function ready(): void {
    if (!options.url || !options.publishableKey || !options.secretKey) {
      throw new Error("Faltam SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY e SUPABASE_SECRET_KEY no arquivo .env.local.");
    }
  }

  return {
    async signUp({ name, email, password }) {
      ready();
      const cleanEmail = email.trim().toLowerCase();
      const cleanName = name.trim().slice(0, 80);
      if (!EMAIL_PATTERN.test(cleanEmail)) return { ok: false, error: "Digite um e-mail válido." };
      if (password.length < MIN_PASSWORD_LENGTH) return { ok: false, error: `A senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.` };
      try {
        const response = await doFetch(`${options.url}/auth/v1/admin/users`, {
          method: "POST",
          headers: { ...keyHeaders(options.secretKey), "Content-Type": "application/json" },
          body: JSON.stringify({ email: cleanEmail, password, email_confirm: true, user_metadata: cleanName ? { name: cleanName } : {} }),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (response.status === 409 || response.status === 422) {
          return { ok: false, error: "Não foi possível criar a conta com esse e-mail. Se você já tem conta, volte e entre." };
        }
        if (!response.ok) return { ok: false, error: "Não foi possível criar a conta agora. Tente de novo em instantes." };
        const user = toUser((await response.json()) as SupabaseUser);
        return user ? { ok: true, user } : { ok: false, error: "Não foi possível criar a conta agora. Tente de novo em instantes." };
      } catch {
        return { ok: false, error: "Não foi possível falar com o serviço de login. Tente de novo." };
      }
    },

    async signIn(email, password) {
      ready();
      try {
        const response = await doFetch(`${options.url}/auth/v1/token?grant_type=password`, {
          method: "POST",
          headers: { ...keyHeaders(options.publishableKey), "Content-Type": "application/json" },
          body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (response.status === 400 || response.status === 401 || response.status === 422) {
          return { ok: false, error: INVALID_LOGIN };
        }
        if (!response.ok) return { ok: false, error: "Não foi possível entrar agora. Tente de novo em instantes." };
        const data = (await response.json()) as { user?: SupabaseUser };
        const user = toUser(data.user);
        return user ? { ok: true, user } : { ok: false, error: INVALID_LOGIN };
      } catch {
        return { ok: false, error: "Não foi possível falar com o serviço de login. Tente de novo." };
      }
    },

    async getUserById(id) {
      ready();
      // O id vem de um cookie assinado, mas conferimos o formato antes de montar a URL.
      if (!/^[0-9a-fA-F-]{36}$/.test(id)) return null;
      try {
        const response = await doFetch(`${options.url}/auth/v1/admin/users/${id}`, {
          method: "GET",
          headers: keyHeaders(options.secretKey),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (!response.ok) return null;
        return toUser((await response.json()) as SupabaseUser);
      } catch {
        return null;
      }
    },
  };
}
