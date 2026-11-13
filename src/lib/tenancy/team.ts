import type { TenancyData } from "./logic";
import type { Membership, Role } from "./types";

/**
 * Regras puras da equipe de cada cliente: convites, troca de papel e remoção.
 * Quem pode o quê vem SEMPRE dos vínculos guardados (nunca de um papel informado pela tela).
 */

export type Invitation = {
  id: string;
  clientId: string;
  /** Só gestor ou atendente: o administrador da agência não é convidado por link. */
  role: Exclude<Role, "agency_admin">;
  /** Resumo (sha256) do link. O link em si nunca é guardado. */
  tokenHash: string;
  createdBy: string;
  createdAt: string;
  expiresAt: string;
  acceptedBy: string | null;
  acceptedAt: string | null;
  revokedAt: string | null;
};

export const INVITE_DAYS = 7;
export const MAX_PENDING_INVITES = 20;
export const INVITABLE_ROLES = ["client_manager", "agent"] as const;

export type Res<T extends object = object> = ({ ok: true } & T) | { ok: false; error: string };

/** O que a pessoa pode fazer neste cliente: admin da agência vale em todos; os outros, só no cliente onde têm vínculo. */
export function authority(memberships: Membership[], userId: string, clientId: string): Role | null {
  const mine = memberships.filter((m) => m.userId === userId);
  if (mine.some((m) => m.role === "agency_admin")) return "agency_admin";
  return mine.find((m) => m.clientId === clientId)?.role ?? null;
}

const canManage = (role: Role | null): boolean => role === "agency_admin" || role === "client_manager";
const isInvitable = (role: unknown): role is Invitation["role"] => (INVITABLE_ROLES as readonly unknown[]).includes(role);

export function isPending(invite: Invitation, now: Date): boolean {
  return !invite.acceptedAt && !invite.revokedAt && new Date(invite.expiresAt).getTime() > now.getTime();
}

export function createInvite(
  data: TenancyData & { invitations: Invitation[] },
  actorId: string,
  input: { clientId: string; role: unknown },
  now: Date,
  ids: { id: string; tokenHash: string },
): Res<{ invitation: Invitation }> {
  if (!data.clients.some((c) => c.id === input.clientId)) return { ok: false, error: "Cliente não encontrado." };
  if (!canManage(authority(data.memberships, actorId, input.clientId))) return { ok: false, error: "Você não pode convidar pessoas para este cliente." };
  if (!isInvitable(input.role)) return { ok: false, error: "Escolha o papel: gestor ou atendente." };
  const pending = data.invitations.filter((i) => i.clientId === input.clientId && isPending(i, now)).length;
  if (pending >= MAX_PENDING_INVITES) return { ok: false, error: "Há convites demais esperando. Cancele os que não serão usados." };

  const invitation: Invitation = {
    id: ids.id,
    clientId: input.clientId,
    role: input.role,
    tokenHash: ids.tokenHash,
    createdBy: actorId,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + INVITE_DAYS * 24 * 60 * 60 * 1000).toISOString(),
    acceptedBy: null,
    acceptedAt: null,
    revokedAt: null,
  };
  return { ok: true, invitation };
}

export function revokeInvite(
  data: TenancyData & { invitations: Invitation[] },
  actorId: string,
  inviteId: string,
  now: Date,
): Res<{ invitation: Invitation }> {
  const invite = data.invitations.find((i) => i.id === inviteId);
  if (!invite) return { ok: false, error: "Convite não encontrado." };
  if (!canManage(authority(data.memberships, actorId, invite.clientId))) return { ok: false, error: "Você não pode cancelar este convite." };
  if (!isPending(invite, now)) return { ok: false, error: "Este convite já foi usado ou expirou." };
  return { ok: true, invitation: { ...invite, revokedAt: now.toISOString() } };
}

/** Confere se o convite pode ser usado por esta pessoa (não grava nada). A mensagem é a mesma para qualquer motivo de recusa. */
export function checkInvite(invite: Invitation | undefined, memberships: Membership[], userId: string, now: Date): Res<{ invitation: Invitation }> {
  if (!invite || !isPending(invite, now)) return { ok: false, error: "Convite inválido ou expirado. Peça um novo link." };
  if (memberships.some((m) => m.userId === userId && m.clientId === invite.clientId)) {
    return { ok: false, error: "Você já faz parte deste cliente." };
  }
  return { ok: true, invitation: invite };
}

const withoutAdmin = (m: Membership) => m.role !== "agency_admin";

/** Cada cliente precisa continuar com pelo menos uma pessoa que possa gerenciar (gestor ou administrador). */
function keepsAManager(memberships: Membership[], clientId: string): boolean {
  return memberships.some((m) => m.clientId === clientId && (m.role === "client_manager" || m.role === "agency_admin"));
}

export function changeRole(
  memberships: Membership[],
  actorId: string,
  clientId: string,
  targetId: string,
  role: unknown,
): Res<{ memberships: Membership[] }> {
  if (!canManage(authority(memberships, actorId, clientId))) return { ok: false, error: "Você não pode alterar papéis neste cliente." };
  if (!isInvitable(role)) return { ok: false, error: "Escolha o papel: gestor ou atendente." };
  if (actorId === targetId) return { ok: false, error: "Você não pode alterar o seu próprio papel." };
  const target = memberships.find((m) => m.userId === targetId && m.clientId === clientId);
  if (!target) return { ok: false, error: "Pessoa não encontrada neste cliente." };
  if (!withoutAdmin(target)) return { ok: false, error: "O papel de administrador da agência não pode ser alterado aqui." };
  const next = memberships.map((m) => (m === target ? { ...m, role } : m));
  if (!keepsAManager(next, clientId)) return { ok: false, error: "O cliente precisa ter pelo menos um gestor." };
  return { ok: true, memberships: next };
}

export function removeMember(memberships: Membership[], actorId: string, clientId: string, targetId: string): Res<{ memberships: Membership[] }> {
  if (!canManage(authority(memberships, actorId, clientId))) return { ok: false, error: "Você não pode remover pessoas deste cliente." };
  if (actorId === targetId) return { ok: false, error: "Você não pode remover a si mesma." };
  const target = memberships.find((m) => m.userId === targetId && m.clientId === clientId);
  if (!target) return { ok: false, error: "Pessoa não encontrada neste cliente." };
  if (!withoutAdmin(target)) return { ok: false, error: "O administrador da agência não pode ser removido aqui." };
  const next = memberships.filter((m) => m !== target);
  if (!keepsAManager(next, clientId)) return { ok: false, error: "O cliente precisa ter pelo menos um gestor." };
  return { ok: true, memberships: next };
}
