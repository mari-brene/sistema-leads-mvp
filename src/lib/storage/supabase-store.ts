/**
 * Guarda cada "coleção" como uma linha da tabela app_data no Supabase, falando direto com a
 * API REST (sem instalar nenhum pacote). Só o servidor usa isto, com a chave secreta.
 *
 * Proteção contra gravações simultâneas: cada linha tem um "version". Ao gravar, só
 * atualizamos se o version ainda for o que lemos; se outra operação gravou no meio,
 * em vez de apagar a alteração dela, damos erro (e você repete a ação).
 */

export class StorageConflictError extends Error {
  constructor() {
    super("Outra operação alterou os dados ao mesmo tempo. Repita a ação.");
    this.name = "StorageConflictError";
  }
}

export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string; signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

type Options = { url: string; secretKey: string; fetch?: FetchLike };

const TIMEOUT_MS = 15_000;
const TABLE = "app_data";

/** Chaves novas (sb_secret_...) vão só no cabeçalho apikey; as antigas (JWT, começam com eyJ) também no Authorization. */
export function keyHeaders(key: string): Record<string, string> {
  return key.startsWith("eyJ") ? { apikey: key, Authorization: `Bearer ${key}` } : { apikey: key };
}

export function createSupabaseStore(options: Options) {
  const doFetch: FetchLike = options.fetch ?? ((url, init) => fetch(url, init) as unknown as ReturnType<FetchLike>);
  // Versão lida por último, por coleção. Fica no globalThis porque o Next pode carregar este arquivo mais de uma vez.
  const holder = globalThis as typeof globalThis & { __storageVersions?: Map<string, number | null> };
  const versions = (holder.__storageVersions ??= new Map<string, number | null>());

  function ready(): void {
    if (!options.url || !options.secretKey) {
      throw new Error("Faltam SUPABASE_URL e SUPABASE_SECRET_KEY no arquivo .env.local (veja o passo a passo da etapa de contas reais).");
    }
  }

  async function call(method: string, query: string, body?: unknown, prefer?: string) {
    ready();
    let response;
    try {
      response = await doFetch(`${options.url}/rest/v1/${TABLE}${query}`, {
        method,
        headers: {
          ...keyHeaders(options.secretKey),
          "Content-Type": "application/json",
          ...(prefer ? { Prefer: prefer } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      throw new Error("Não foi possível falar com o Supabase (rede ou tempo esgotado).");
    }
    return response;
  }

  return {
    async read<T>(name: string, fallback: T): Promise<T> {
      const response = await call("GET", `?collection=eq.${encodeURIComponent(name)}&select=data,version`);
      // Nunca registramos o corpo da resposta (pode ter dados de clientes) nem a chave: só o código.
      if (!response.ok) throw new Error(`O Supabase respondeu com erro ${response.status} ao ler "${name}".`);
      const rows = (await response.json()) as Array<{ data: T; version: number }>;
      if (!Array.isArray(rows) || rows.length === 0) {
        versions.set(name, null);
        return fallback;
      }
      versions.set(name, Number(rows[0].version));
      return rows[0].data;
    },

    async write(name: string, data: unknown): Promise<void> {
      const known = versions.get(name);
      if (known === undefined) {
        // Ninguém leu antes (ex.: primeira gravação de um processo): descobre a versão atual.
        await this.read(name, null);
      }
      const current = versions.get(name) ?? null;

      if (current === null) {
        const response = await call("POST", "", { collection: name, data, version: 1 }, "return=minimal");
        if (response.status === 409) throw new StorageConflictError();
        if (!response.ok) throw new Error(`O Supabase respondeu com erro ${response.status} ao gravar "${name}".`);
        versions.set(name, 1);
        return;
      }

      const response = await call(
        "PATCH",
        `?collection=eq.${encodeURIComponent(name)}&version=eq.${current}`,
        { data, version: current + 1, updated_at: new Date().toISOString() },
        "return=representation",
      );
      if (!response.ok) throw new Error(`O Supabase respondeu com erro ${response.status} ao gravar "${name}".`);
      const updated = (await response.json()) as unknown[];
      if (!Array.isArray(updated) || updated.length === 0) {
        versions.delete(name);
        throw new StorageConflictError();
      }
      versions.set(name, current + 1);
    },
  };
}
