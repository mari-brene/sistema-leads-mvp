import { createHash, randomBytes, randomUUID } from "node:crypto";
import { getAuthAdapter } from "@/lib/auth";
import { config } from "@/lib/config";
import { getTenancyStore } from "./index";
import { createCollectionInvitationsStore, createTableInvitationsStore, type InvitationsStore } from "./invitations-store";
import type { TenancyStore } from "./store";
import * as team from "./team";
import type { Role } from "./types";

export type TeamMember = { userId: string; name: string; email: string; role: Role };
export type TeamView = { members: TeamMember[]; invitations: team.Invitation[] };

export type TeamDeps = {
  tenancy: TenancyStore;
  invites: InvitationsStore;
  lookupUser: (id: string) => Promise<{ name: string; email: string } | null>;
  now?: () => Date;
  newId?: () => string;
  newToken?: () => string;
};

/** O link contém o token; no banco guardamos só o resumo dele. */
export const hashToken = (token: string): string => createHash("sha256").update(token).digest("hex");

type Fail = { ok: false; error: string };

export function createTeamService(deps: TeamDeps) {
  const now = () => (deps.now ? deps.now() : new Date());
  const newId = deps.newId ?? (() => randomUUID());
  const newToken = deps.newToken ?? (() => randomBytes(32).toString("base64url"));

  async function createInvite(actorId: string, clientId: string, role: unknown): Promise<{ ok: true; token: string; invitation: team.Invitation } | Fail> {
    const tenancy = await deps.tenancy.load();
    const before = await deps.invites.byClient(clientId);
    const token = newToken();
    const result = team.createInvite({ ...tenancy, invitations: before }, actorId, { clientId, role }, now(), { id: newId(), tokenHash: hashToken(token) });
    if (!result.ok) return result;
    await deps.invites.save(clientId, before, [...before, result.invitation]);
    return { ok: true, token, invitation: result.invitation };
  }

  async function revokeInvite(actorId: string, clientId: string, inviteId: string): Promise<{ ok: true } | Fail> {
    const tenancy = await deps.tenancy.load();
    const before = await deps.invites.byClient(clientId);
    const result = team.revokeInvite({ ...tenancy, invitations: before }, actorId, inviteId, now());
    if (!result.ok) return result;
    await deps.invites.save(clientId, before, before.map((i) => (i.id === inviteId ? result.invitation : i)));
    return { ok: true };
  }

  /** Quem pode gerenciar vê a equipe e os convites em aberto deste cliente. */
  async function view(actorId: string, clientId: string): Promise<({ ok: true } & TeamView) | Fail> {
    const tenancy = await deps.tenancy.load();
    const role = team.authority(tenancy.memberships, actorId, clientId);
    if (role !== "agency_admin" && role !== "client_manager") return { ok: false, error: "Você não pode ver a equipe deste cliente." };
    const mine = tenancy.memberships.filter((m) => m.clientId === clientId);
    const members = await Promise.all(
      mine.map(async (m) => {
        const user = await deps.lookupUser(m.userId);
        return { userId: m.userId, name: user?.name ?? "", email: user?.email ?? "", role: m.role };
      }),
    );
    const current = now();
    const invitations = (await deps.invites.byClient(clientId)).filter((i) => team.isPending(i, current));
    return { ok: true, members, invitations };
  }

  async function changeRole(actorId: string, clientId: string, targetId: string, role: unknown): Promise<{ ok: true } | Fail> {
    const before = await deps.tenancy.load();
    const result = team.changeRole(before.memberships, actorId, clientId, targetId, role);
    if (!result.ok) return result;
    await deps.tenancy.save(before, { ...before, memberships: result.memberships });
    return { ok: true };
  }

  async function removeMember(actorId: string, clientId: string, targetId: string): Promise<{ ok: true } | Fail> {
    const before = await deps.tenancy.load();
    const result = team.removeMember(before.memberships, actorId, clientId, targetId);
    if (!result.ok) return result;
    await deps.tenancy.save(before, { ...before, memberships: result.memberships });
    return { ok: true };
  }

  /** A pessoa abriu o link: se for válido, entra no cliente com o papel do convite. */
  async function acceptInvite(userId: string, token: string): Promise<{ ok: true; clientId: string; role: Role } | Fail> {
    const invite = await deps.invites.byTokenHash(hashToken(token));
    const before = await deps.tenancy.load();
    const checked = team.checkInvite(invite, before.memberships, userId, now());
    if (!checked.ok) return checked;
    const { invitation } = checked;
    // "claim" garante que o link vale para UMA pessoa, mesmo com duas tentando ao mesmo tempo.
    if (!(await deps.invites.claim(invitation.id, userId, now()))) return { ok: false, error: "Convite inválido ou expirado. Peça um novo link." };
    await deps.tenancy.save(before, { ...before, memberships: [...before.memberships, { userId, clientId: invitation.clientId, role: invitation.role }] });
    return { ok: true, clientId: invitation.clientId, role: invitation.role };
  }

  /** Só confere se o link ainda vale (não usa o convite). Serve para liberar o cadastro apenas a quem tem convite de verdade. */
  async function inviteIsUsable(token: string): Promise<boolean> {
    const invite = await deps.invites.byTokenHash(hashToken(token));
    const before = await deps.tenancy.load();
    return team.checkInvite(invite, before.memberships, "", now()).ok;
  }

  return { createInvite, revokeInvite, view, changeRole, removeMember, acceptInvite, inviteIsUsable };
}

export function getInvitationsStore(): InvitationsStore {
  return config.dataBackend === "supabase" && config.tenancyStore === "table"
    ? createTableInvitationsStore({ url: config.supabaseUrl, secretKey: config.supabaseSecretKey })
    : createCollectionInvitationsStore();
}

export function getTeamService() {
  return createTeamService({
    tenancy: getTenancyStore(),
    invites: getInvitationsStore(),
    lookupUser: async (id) => {
      const user = await getAuthAdapter().getUserById(id);
      return user ? { name: user.name, email: user.email } : null;
    },
  });
}
