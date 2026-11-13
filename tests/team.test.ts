import { describe, expect, it } from "vitest";
import { createCollectionInvitationsStore, createTableInvitationsStore } from "@/lib/tenancy/invitations-store";
import { createCollectionStore, createTableStore } from "@/lib/tenancy/store";
import { createTeamService, hashToken } from "@/lib/tenancy/team-service";
import { fakeTables } from "./helpers/fake-tables";

let clock = new Date("2026-11-13T12:00:00.000Z");
const clients = [
  { id: "c1", name: "Cliente 1", created_at: "2026-11-01T00:00:00Z" },
  { id: "c2", name: "Cliente 2", created_at: "2026-11-01T00:00:00Z" },
];
const memberships = [
  { user_id: "admin", client_id: "admin", role: "agency_admin" },
  { user_id: "m1", client_id: "c1", role: "client_manager" },
  { user_id: "a1", client_id: "c1", role: "agent" },
  { user_id: "m2", client_id: "c2", role: "client_manager" },
];

function setup() {
  const db = fakeTables({ clients: [...clients, { id: "admin", name: "Demo", created_at: "2026-11-01T00:00:00Z" }], memberships });
  const opts = { url: "https://x.supabase.co", secretKey: "sb_secret_teste", fetch: db.fetch };
  let n = 0;
  const service = createTeamService({
    tenancy: createTableStore(opts),
    invites: createTableInvitationsStore(opts),
    lookupUser: async (id) => ({ name: "Nome " + id, email: id + "@x.com" }),
    now: () => clock,
    newId: () => "inv" + ++n,
    newToken: () => "token" + n,
  });
  return { db, service };
}

describe("equipe e convites", () => {
  it("gestor convida para o próprio cliente; o link é guardado só como resumo", async () => {
    clock = new Date("2026-11-13T12:00:00.000Z");
    const { db, service } = setup();
    const r = await service.createInvite("m1", "c1", "agent");
    if (!r.ok) throw new Error(r.error);
    expect(r.token).toBe("token0");
    const row = db.tables.invitations[0];
    expect(row).toMatchObject({ client_id: "c1", role: "agent", token_hash: hashToken("token0") });
    expect(JSON.stringify(db.tables.invitations)).not.toContain("token0");
    expect(r.invitation.expiresAt).toBe("2026-11-20T12:00:00.000Z");
  });

  it("gestor não convida para outro cliente, atendente não convida, ninguém convida administrador", async () => {
    const { service } = setup();
    expect((await service.createInvite("m1", "c2", "agent")).ok).toBe(false);
    expect((await service.createInvite("a1", "c1", "agent")).ok).toBe(false);
    expect((await service.createInvite("m1", "c1", "agency_admin")).ok).toBe(false);
    expect((await service.createInvite("estranho", "c1", "agent")).ok).toBe(false);
    expect((await service.createInvite("admin", "c2", "agent")).ok).toBe(true);
  });

  it("aceitar: a pessoa entra no cliente com o papel do convite e o link não vale de novo", async () => {
    const { db, service } = setup();
    const r = await service.createInvite("m1", "c1", "agent");
    if (!r.ok) throw new Error(r.error);
    expect(await service.acceptInvite("novo", r.token)).toEqual({ ok: true, clientId: "c1", role: "agent" });
    expect(db.tables.memberships.find((m) => m.user_id === "novo")).toMatchObject({ client_id: "c1", role: "agent" });
    expect((await service.acceptInvite("outro", r.token)).ok).toBe(false);
    expect(db.tables.memberships.some((m) => m.user_id === "outro")).toBe(false);
  });

  it("duas pessoas usando o mesmo link ao mesmo tempo: só uma entra", async () => {
    const { db, service } = setup();
    const r = await service.createInvite("m1", "c1", "agent");
    if (!r.ok) throw new Error(r.error);
    const results = await Promise.all([service.acceptInvite("p1", r.token), service.acceptInvite("p2", r.token)]);
    expect(results.filter((x) => x.ok)).toHaveLength(1);
    expect(db.tables.memberships.filter((m) => ["p1", "p2"].includes(m.user_id as string))).toHaveLength(1);
  });

  it("link inventado, expirado ou cancelado é recusado com a mesma mensagem", async () => {
    const { service } = setup();
    const bad = await service.acceptInvite("novo", "inventado");
    const r = await service.createInvite("m1", "c1", "agent");
    if (!r.ok) throw new Error(r.error);
    const canceled = await service.createInvite("m1", "c1", "agent");
    if (!canceled.ok) throw new Error(canceled.error);
    expect((await service.revokeInvite("m1", "c1", canceled.invitation.id)).ok).toBe(true);
    const afterRevoke = await service.acceptInvite("novo", canceled.token);
    clock = new Date("2026-11-21T12:00:00.000Z");
    const expired = await service.acceptInvite("novo", r.token);
    clock = new Date("2026-11-13T12:00:00.000Z");
    for (const result of [bad, afterRevoke, expired]) expect(result).toEqual({ ok: false, error: "Convite inválido ou expirado. Peça um novo link." });
  });

  it("quem já faz parte do cliente não gasta o convite", async () => {
    const { service } = setup();
    const r = await service.createInvite("m1", "c1", "agent");
    if (!r.ok) throw new Error(r.error);
    expect((await service.acceptInvite("a1", r.token)).ok).toBe(false);
    expect((await service.acceptInvite("novo", r.token)).ok).toBe(true);
  });

  it("gestor cancela convite só do próprio cliente", async () => {
    const { service } = setup();
    const r = await service.createInvite("m2", "c2", "agent");
    if (!r.ok) throw new Error(r.error);
    expect((await service.revokeInvite("m1", "c2", r.invitation.id)).ok).toBe(false);
    expect((await service.revokeInvite("m2", "c2", r.invitation.id)).ok).toBe(true);
  });

  it("vê a equipe com nomes; atendente não vê; convites vencidos somem da lista", async () => {
    const { service } = setup();
    await service.createInvite("m1", "c1", "agent");
    const seen = await service.view("m1", "c1");
    if (!seen.ok) throw new Error(seen.error);
    expect(seen.members.map((m) => m.userId).sort()).toEqual(["a1", "m1"]);
    expect(seen.members[0].name).toContain("Nome");
    expect(seen.invitations).toHaveLength(1);
    expect((await service.view("a1", "c1")).ok).toBe(false);
    expect((await service.view("m1", "c2")).ok).toBe(false);
    clock = new Date("2026-11-30T12:00:00.000Z");
    const later = await service.view("admin", "c1");
    clock = new Date("2026-11-13T12:00:00.000Z");
    if (!later.ok) throw new Error(later.error);
    expect(later.invitations).toHaveLength(0);
  });

  it("trocar papel e remover: respeita permissões e mantém ao menos um gestor", async () => {
    const { db, service } = setup();
    expect((await service.changeRole("m1", "c1", "a1", "client_manager")).ok).toBe(true);
    expect(db.tables.memberships.find((m) => m.user_id === "a1")?.role).toBe("client_manager");
    expect((await service.changeRole("m1", "c1", "m1", "agent")).ok).toBe(false); // a si mesma
    expect((await service.changeRole("a1", "c1", "m1", "agent")).ok).toBe(true); // a1 agora é gestor
    expect((await service.changeRole("a1", "c1", "a1", "agent")).ok).toBe(false);
    expect((await service.removeMember("m2", "c1", "a1")).ok).toBe(false); // gestor de outro cliente
    expect((await service.removeMember("a1", "c1", "m1")).ok).toBe(true);
    expect(db.tables.memberships.some((m) => m.user_id === "m1")).toBe(false);
    expect((await service.removeMember("admin", "c1", "a1")).ok).toBe(false); // o último gestor
    expect((await service.changeRole("admin", "c1", "a1", "agent")).ok).toBe(false); // idem
    expect((await service.removeMember("admin", "c2", "admin")).ok).toBe(false);
  });

  it("administrador da agência não pode ser rebaixado nem removido por gestor", async () => {
    const { service } = setup();
    expect((await service.changeRole("m1", "c1", "admin", "agent")).ok).toBe(false);
    expect((await service.removeMember("m1", "c1", "admin")).ok).toBe(false);
  });
});

describe("mesmas regras no arquivo/coleção (modo local)", () => {
  it("o convite funciona de ponta a ponta com o store de arquivo", async () => {
    const { mkdtemp, rm } = await import("node:fs/promises");
    const os = await import("node:os");
    const path = await import("node:path");
    const dir = await mkdtemp(path.join(os.tmpdir(), "team-"));
    const previous = process.env.DATA_DIR;
    process.env.DATA_DIR = dir;
    try {
      const tenancy = createCollectionStore();
      await tenancy.save({ clients: [], memberships: [] }, { clients: [{ id: "c1", name: "C1", createdAt: "2026-11-01T00:00:00.000Z" }], memberships: [{ userId: "m1", clientId: "c1", role: "client_manager" }] });
      const service = createTeamService({ tenancy, invites: createCollectionInvitationsStore(), lookupUser: async () => null, now: () => clock });
      const r = await service.createInvite("m1", "c1", "agent");
      if (!r.ok) throw new Error(r.error);
      expect((await service.acceptInvite("novo", r.token)).ok).toBe(true);
      expect((await service.acceptInvite("outro", r.token)).ok).toBe(false);
      expect((await tenancy.load()).memberships.some((m) => m.userId === "novo" && m.role === "agent")).toBe(true);
    } finally {
      if (previous === undefined) delete process.env.DATA_DIR;
      else process.env.DATA_DIR = previous;
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("confere se o link ainda vale sem usar o convite (para liberar o cadastro)", async () => {
    const { mkdtemp, rm } = await import("node:fs/promises");
    const os = await import("node:os");
    const path = await import("node:path");
    const dir = await mkdtemp(path.join(os.tmpdir(), "team-peek-"));
    const previous = process.env.DATA_DIR;
    process.env.DATA_DIR = dir;
    let now = new Date("2026-11-13T12:00:00.000Z");
    try {
      const tenancy = createCollectionStore();
      await tenancy.save({ clients: [], memberships: [] }, { clients: [{ id: "c1", name: "C1", createdAt: "2026-11-01T00:00:00.000Z" }], memberships: [{ userId: "m1", clientId: "c1", role: "client_manager" }] });
      let n = 0;
      const service = createTeamService({ tenancy, invites: createCollectionInvitationsStore(), lookupUser: async () => null, now: () => now, newToken: () => "tok-" + ++n + "-abcdefghijklmnopqrstuvwxyz" });
      const r = await service.createInvite("m1", "c1", "agent");
      if (!r.ok) throw new Error(r.error);
      expect(await service.inviteIsUsable(r.token)).toBe(true);
      expect(await service.inviteIsUsable(r.token)).toBe(true);
      expect(await service.inviteIsUsable("token-que-nao-existe-123456")).toBe(false);
      expect((await service.acceptInvite("novo", r.token)).ok).toBe(true);
      expect(await service.inviteIsUsable(r.token)).toBe(false);
      const other = await service.createInvite("m1", "c1", "agent");
      if (!other.ok) throw new Error(other.error);
      now = new Date("2026-11-30T12:00:00.000Z");
      expect(await service.inviteIsUsable(other.token)).toBe(false);
    } finally {
      if (previous === undefined) delete process.env.DATA_DIR;
      else process.env.DATA_DIR = previous;
      await rm(dir, { recursive: true, force: true });
    }
  });
});
