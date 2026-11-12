import type { LeadRow } from "@/lib/leads/table-mapping";
import type { FetchLike } from "@/lib/storage/supabase-store";

/** Banco de mentira que imita o jeito como o Supabase (PostgREST) responde, só o que o repositório usa. */
export function fakeSupabase(seed: LeadRow[] = []) {
  const rows: LeadRow[] = [...seed];
  const calls: { method: string; url: string }[] = [];
  let failWith: number | null = null;

  const fetchLike: FetchLike = async (url, init) => {
    calls.push({ method: init.method, url });
    if (failWith) return { ok: false, status: failWith, json: async () => ({ secret: "dados-do-cliente" }) };
    const u = new URL(url);
    const p = u.searchParams;
    const eq = (key: string) => (p.get(key)?.startsWith("eq.") ? p.get(key)!.slice(3) : null);
    const inList = (key: string) =>
      p.get(key)?.startsWith("in.(") ? p.get(key)!.slice(4, -1).split(",").map((s) => s.replace(/^"|"$/g, "")) : null;
    const matches = (row: LeadRow) =>
      (eq("client_id") === null || row.client_id === eq("client_id")) &&
      (eq("id") === null || row.id === eq("id")) &&
      (inList("id") === null || inList("id")!.includes(row.id)) &&
      (inList("phone") === null || inList("phone")!.includes(row.phone ?? "\u0000"));
    const ok = (body: unknown = []) => ({ ok: true, status: 200, json: async () => body });

    if (init.method === "GET") {
      const limit = Number(p.get("limit") ?? 1000);
      const offset = Number(p.get("offset") ?? 0);
      return ok(rows.filter(matches).sort((a, b) => a.id.localeCompare(b.id)).slice(offset, offset + limit));
    }
    if (init.method === "POST") {
      for (const row of JSON.parse(init.body!) as LeadRow[]) {
        if (rows.some((r) => r.id === row.id)) return { ok: false, status: 409, json: async () => ({}) };
        rows.push(row);
      }
      return ok();
    }
    if (init.method === "PATCH") {
      const patch = JSON.parse(init.body!) as LeadRow;
      rows.filter(matches).forEach((row) => Object.assign(row, patch));
      return ok();
    }
    if (init.method === "DELETE") {
      for (let i = rows.length - 1; i >= 0; i--) if (matches(rows[i])) rows.splice(i, 1);
      return ok();
    }
    return { ok: false, status: 405, json: async () => ({}) };
  };

  return { rows, calls, fetch: fetchLike, failWith: (status: number | null) => (failWith = status) };
}

