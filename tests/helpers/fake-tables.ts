import type { FetchLike } from "@/lib/storage/supabase-store";

type Row = Record<string, unknown>;

/** Banco de mentira (PostgREST) com várias tabelas. Chave de cada tabela: "id", ou o que for informado em keys. */
export function fakeTables(seed: Record<string, Row[]> = {}, keys: Record<string, string> = { campaign_settings: "client_id" }) {
  const tables: Record<string, Row[]> = {};
  for (const [name, rows] of Object.entries(seed)) tables[name] = [...rows];
  const calls: { method: string; url: string; table: string }[] = [];
  let failWith: number | null = null;

  const fetchLike: FetchLike = async (url, init) => {
    const u = new URL(url);
    const table = u.pathname.split("/").pop()!;
    calls.push({ method: init.method, url, table });
    if (failWith) return { ok: false, status: failWith, json: async () => ({ secret: "dados-do-cliente" }) };
    const rows = (tables[table] ??= []);
    const key = keys[table] ?? "id";
    const p = u.searchParams;
    const filters: ((row: Row) => boolean)[] = [];
    for (const [name, value] of p.entries()) {
      if (["select", "order", "limit", "offset", "on_conflict"].includes(name)) continue;
      if (value.startsWith("eq.")) filters.push((row) => String(row[name] ?? "") === value.slice(3));
      else if (value.startsWith("in.(")) {
        const list = value.slice(4, -1).split(",").map((s) => s.replace(/^"|"$/g, ""));
        filters.push((row) => list.includes(String(row[name] ?? "")));
      }
    }
    const matches = (row: Row) => filters.every((f) => f(row));
    const ok = (body: unknown = []) => ({ ok: true, status: 200, json: async () => body });

    if (init.method === "GET") {
      const limit = Number(p.get("limit") ?? 1000);
      const offset = Number(p.get("offset") ?? 0);
      return ok(rows.filter(matches).sort((a, b) => String(a[key]).localeCompare(String(b[key]))).slice(offset, offset + limit));
    }
    if (init.method === "POST") {
      const upsert = (init.headers?.Prefer ?? "").includes("merge-duplicates");
      const incoming = JSON.parse(init.body!);
      for (const row of (Array.isArray(incoming) ? incoming : [incoming]) as Row[]) {
        const index = rows.findIndex((r) => r[key] === row[key]);
        if (index >= 0 && upsert) rows[index] = { ...rows[index], ...row };
        else if (index >= 0) return { ok: false, status: 409, json: async () => ({}) };
        else rows.push(row);
      }
      return ok();
    }
    if (init.method === "PATCH") {
      const patch = JSON.parse(init.body!) as Row;
      rows.filter(matches).forEach((row) => Object.assign(row, patch));
      return ok();
    }
    if (init.method === "DELETE") {
      for (let i = rows.length - 1; i >= 0; i--) if (matches(rows[i])) rows.splice(i, 1);
      return ok();
    }
    return { ok: false, status: 405, json: async () => ({}) };
  };

  return { tables, calls, fetch: fetchLike, failWith: (status: number | null) => (failWith = status) };
}
