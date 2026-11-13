import { keyHeaders, type FetchLike } from "./supabase-store";

/**
 * Acesso simples às tabelas do Supabase (PostgREST) com a chave secreta, só pelo servidor.
 * Nunca registramos o corpo das respostas (pode ter dados de clientes) nem a chave: só o código de erro.
 */

export type RestOptions = { url: string; secretKey: string; fetch?: FetchLike };

const TIMEOUT_MS = 15_000;
const PAGE = 1000;
const PARALLEL = 10;

export function createRest(options: RestOptions) {
  const doFetch: FetchLike = options.fetch ?? ((url, init) => fetch(url, init) as unknown as ReturnType<FetchLike>);

  async function call(table: string, method: string, query: string, body?: unknown, prefer?: string) {
    if (!options.url || !options.secretKey) {
      throw new Error("Faltam SUPABASE_URL e SUPABASE_SECRET_KEY no arquivo .env.local.");
    }
    try {
      return await doFetch(`${options.url}/rest/v1/${table}${query}`, {
        method,
        headers: { ...keyHeaders(options.secretKey), "Content-Type": "application/json", ...(prefer ? { Prefer: prefer } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      throw new Error("Não foi possível falar com o Supabase (rede ou tempo esgotado).");
    }
  }

  function fail(status: number, action: string, table: string): never {
    throw new Error(`O Supabase respondeu com erro ${status} ao ${action} (${table}).`);
  }

  async function fetchAll<T>(table: string, filter: string, orderBy = "id"): Promise<T[]> {
    const rows: T[] = [];
    for (let offset = 0; ; offset += PAGE) {
      const response = await call(table, "GET", `?${filter}&select=*&order=${orderBy}.asc&limit=${PAGE}&offset=${offset}`);
      if (!response.ok) fail(response.status, "ler", table);
      const page = (await response.json()) as T[];
      if (!Array.isArray(page)) fail(500, "ler", table);
      rows.push(...page);
      if (page.length < PAGE) return rows;
    }
  }

  async function inBatches<T>(items: T[], task: (item: T) => Promise<void>): Promise<void> {
    for (let i = 0; i < items.length; i += PARALLEL) await Promise.all(items.slice(i, i + PARALLEL).map(task));
  }

  /**
   * Grava a diferença entre "antes" e "depois" de uma tabela que tem id e client_id:
   * novas (insert), alteradas (update, sempre com o filtro do cliente) e removidas (delete, idem).
   */
  async function syncRows<T>(
    table: string,
    clientId: string,
    before: T[],
    after: T[],
    toRow: (item: T) => { client_id: string } & Record<string, unknown>,
    /** Coluna que identifica a linha dentro do cliente (padrão: "id"). */
    keyColumn = "id",
  ): Promise<void> {
    const keyOf = (item: T) => String(toRow(item)[keyColumn]);
    const ofClient = `client_id=eq.${encodeURIComponent(clientId)}`;
    const beforeById = new Map(before.map((item) => [keyOf(item), JSON.stringify(toRow(item))]));
    const afterIds = new Set(after.map(keyOf));

    const created = after.filter((item) => !beforeById.has(keyOf(item)));
    const changed = after.filter((item) => beforeById.has(keyOf(item)) && beforeById.get(keyOf(item)) !== JSON.stringify(toRow(item)));
    const removed = before.filter((item) => !afterIds.has(keyOf(item)));

    for (const item of [...created, ...changed]) {
      if (toRow(item).client_id !== clientId) throw new Error("Registro de outro cliente: gravação bloqueada.");
    }

    for (let i = 0; i < created.length; i += 500) {
      const response = await call(table, "POST", "", created.slice(i, i + 500).map(toRow), "return=minimal");
      if (!response.ok) fail(response.status, "gravar", table);
    }
    await inBatches(changed, async (item) => {
      const response = await call(table, "PATCH", `?${keyColumn}=eq.${encodeURIComponent(keyOf(item))}&${ofClient}`, toRow(item), "return=minimal");
      if (!response.ok) fail(response.status, "gravar", table);
    });
    for (let i = 0; i < removed.length; i += 50) {
      const ids = removed.slice(i, i + 50).map((item) => `"${keyOf(item)}"`).join(",");
      const response = await call(table, "DELETE", `?${ofClient}&${keyColumn}=in.(${encodeURIComponent(ids)})`, undefined, "return=minimal");
      if (!response.ok) fail(response.status, "apagar", table);
    }
  }

  return { call, fail, fetchAll, syncRows };
}

export type Rest = ReturnType<typeof createRest>;
