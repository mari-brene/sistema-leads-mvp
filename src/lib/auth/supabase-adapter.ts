import { keyHeaders, type FetchLike } from "@/lib/storage/supabase-store";
import type { AuthAdapter, AuthUser } from "./types";

/**
 * Login pelo Supabase Auth (API REST, sem pacotes). O sistema é de uso pessoal:
 * as contas são criadas por você no painel do Supabase, e o cadastro pela tela fica desligado.
 */

type Options = { url: string; publishableKey: string; secretKey: string; fetch?: FetchLike };

const INVALID_LOGIN = "E-mail ou senha incorretos.";
const TIMEOUT_MS = 15_000;

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
    async signUp() {
      return {
        ok: false,
        error: "Cadastro desativado: este sistema é de uso pessoal. A conta é criada no painel do Supabase.",
      };
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
