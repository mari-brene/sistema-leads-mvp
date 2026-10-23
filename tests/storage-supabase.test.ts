import { beforeEach, describe, expect, it } from "vitest";
import { createSupabaseAuth } from "@/lib/auth/supabase-adapter";
import { createSupabaseStore, keyHeaders, StorageConflictError, type FetchLike } from "@/lib/storage/supabase-store";

type Row = { collection: string; data: unknown; version: number };

/** PostgREST de mentira, na memória: entende só o que o nosso código usa. */
function fakeDb() {
  const rows: Row[] = [];
  const calls: Array<{ url: string; method: string; headers: Record<string, string>; body?: string }> = [];
  const fetchFn: FetchLike = async (url, init) => {
    calls.push({ url, method: init.method, headers: init.headers, body: init.body });
    const q = new URL(url).searchParams;
    const name = (q.get("collection") ?? "").replace(/^eq\./, "");
    const respond = (status: number, body: unknown) => ({ ok: status < 300, status, json: async () => body });
    if (init.method === "GET") return respond(200, rows.filter((r) => r.collection === name));
    if (init.method === "POST") {
      const row = JSON.parse(init.body as string) as Row;
      if (rows.some((r) => r.collection === row.collection)) return respond(409, {});
      rows.push(row);
      return respond(201, []);
    }
    if (init.method === "PATCH") {
      const version = Number((q.get("version") ?? "").replace(/^eq\./, ""));
      const row = rows.find((r) => r.collection === name && r.version === version);
      if (!row) return respond(200, []);
      const patch = JSON.parse(init.body as string) as { data: unknown; version: number };
      row.data = patch.data;
      row.version = patch.version;
      return respond(200, [row]);
    }
    return respond(500, {});
  };
  return { rows, calls, fetchFn };
}

const URL_BASE = "https://abc.supabase.co";

beforeEach(() => {
  (globalThis as { __storageVersions?: unknown }).__storageVersions = undefined;
});

describe("armazenamento no Supabase (com banco de mentira)", () => {
  it("lê o valor padrão quando não existe, cria na primeira gravação e atualiza nas seguintes", async () => {
    const db = fakeDb();
    const store = createSupabaseStore({ url: URL_BASE, secretKey: "sb_secret_x", fetch: db.fetchFn });
    expect(await store.read("leads", [])).toEqual([]);
    await store.write("leads", [{ id: 1 }]);
    expect(db.rows).toHaveLength(1);
    expect(db.rows[0].version).toBe(1);
    expect(await store.read("leads", [])).toEqual([{ id: 1 }]);
    await store.write("leads", [{ id: 1 }, { id: 2 }]);
    expect(db.rows[0].version).toBe(2);
    expect(db.rows[0].data).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it("não apaga alteração de outra operação: dá erro de conflito", async () => {
    const db = fakeDb();
    const store = createSupabaseStore({ url: URL_BASE, secretKey: "sb_secret_x", fetch: db.fetchFn });
    await store.write("leads", ["a"]);
    await store.read("leads", []); // lemos a versão 1
    db.rows[0].version = 2; // outra instância gravou no meio
    db.rows[0].data = ["a", "b"];
    let error: unknown;
    try {
      await store.write("leads", ["a", "c"]);
    } catch (e) {
      error = e;
    }
    expect(error instanceof StorageConflictError).toBe(true);
    expect(db.rows[0].data).toEqual(["a", "b"]);
  });

  it("criação simultânea da mesma coleção também dá conflito", async () => {
    const db = fakeDb();
    const store = createSupabaseStore({ url: URL_BASE, secretKey: "sb_secret_x", fetch: db.fetchFn });
    await store.read("x", []); // versão desconhecida (linha não existe)
    db.rows.push({ collection: "x", data: [], version: 1 }); // outra instância criou
    let error: unknown;
    try {
      await store.write("x", [1]);
    } catch (e) {
      error = e;
    }
    expect(error instanceof StorageConflictError).toBe(true);
  });

  it("a chave nova vai só em apikey; a antiga (JWT) também em Authorization", () => {
    expect(keyHeaders("sb_secret_abc")).toEqual({ apikey: "sb_secret_abc" });
    expect(keyHeaders("eyJhbGciOi")).toEqual({ apikey: "eyJhbGciOi", Authorization: "Bearer eyJhbGciOi" });
  });

  it("a chave não aparece na URL e erros não vazam a chave", async () => {
    const db = fakeDb();
    const store = createSupabaseStore({ url: URL_BASE, secretKey: "sb_secret_SEGREDO", fetch: db.fetchFn });
    await store.read("leads", []);
    expect(db.calls[0].url).not.toContain("SEGREDO");

    const failing = createSupabaseStore({
      url: URL_BASE,
      secretKey: "sb_secret_SEGREDO",
      fetch: async () => {
        throw new Error("falha com sb_secret_SEGREDO");
      },
    });
    let message = "";
    try {
      await failing.read("leads", []);
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toContain("Supabase");
    expect(message).not.toContain("SEGREDO");
  });

  it("sem URL ou chave dá erro claro", async () => {
    const store = createSupabaseStore({ url: "", secretKey: "", fetch: fakeDb().fetchFn });
    let message = "";
    try {
      await store.read("leads", []);
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toContain("SUPABASE_URL");
  });
});

describe("login pelo Supabase (com respostas de mentira)", () => {
  const id = "123e4567-e89b-12d3-a456-426614174000";
  function auth(status: number, body: unknown) {
    const calls: Array<{ url: string; headers: Record<string, string>; body?: string }> = [];
    const adapter = createSupabaseAuth({
      url: URL_BASE,
      publishableKey: "sb_publishable_p",
      secretKey: "sb_secret_s",
      fetch: async (url, init) => {
        calls.push({ url, headers: init.headers, body: init.body });
        return { ok: status < 300, status, json: async () => body };
      },
    });
    return { adapter, calls };
  }

  it("entra com e-mail e senha corretos", async () => {
    const { adapter, calls } = auth(200, { user: { id, email: "ana@x.com", user_metadata: { name: "Ana" } } });
    expect(await adapter.signIn(" Ana@X.com ", "senha12345")).toEqual({ ok: true, user: { id, email: "ana@x.com", name: "Ana" } });
    expect(calls[0].url).toBe("https://abc.supabase.co/auth/v1/token?grant_type=password");
    expect(calls[0].headers.apikey).toBe("sb_publishable_p");
    expect(JSON.parse(calls[0].body as string).email).toBe("ana@x.com");
  });
  it("senha errada dá a mensagem genérica", async () => {
    const { adapter } = auth(400, { error: "invalid_grant" });
    expect(await adapter.signIn("a@x.com", "errada")).toEqual({ ok: false, error: "E-mail ou senha incorretos." });
  });
  it("cadastro pela tela fica desligado", async () => {
    const { adapter, calls } = auth(200, {});
    const r = await adapter.signUp({ name: "x", email: "a@x.com", password: "12345678" });
    expect(r.ok).toBe(false);
    expect(calls).toHaveLength(0);
  });
  it("busca usuário pelo id usando a chave secreta, e recusa ids estranhos sem chamar a rede", async () => {
    const { adapter, calls } = auth(200, { id, email: "ana@x.com" });
    expect(await adapter.getUserById(id)).toEqual({ id, email: "ana@x.com", name: "ana" });
    expect(calls[0].headers.apikey).toBe("sb_secret_s");
    expect(await adapter.getUserById("../../x")).toBeNull();
    expect(calls).toHaveLength(1);
  });
  it("usuário inexistente devolve null", async () => {
    const { adapter } = auth(404, {});
    expect(await adapter.getUserById(id)).toBeNull();
  });
});
