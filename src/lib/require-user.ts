import { redirect } from "next/navigation";
import type { AuthUser } from "@/lib/auth";
import { getSession } from "@/lib/session";
import { readActiveClient } from "@/lib/tenancy/active-client";
import { resolveAccess, type Role } from "@/lib/tenancy";
import { can, type Permission } from "@/lib/tenancy/permissions";

/** Quem está logado, mais o cliente em que está trabalhando e o papel nele. */
export type ScopedUser = AuthUser & {
  clientId: string;
  clientName: string;
  role: Role;
  /** Clientes em que a pessoa pode trabalhar (mais de um = ela pode trocar de cliente). */
  clients: { id: string; name: string }[];
};

/**
 * Devolve quem está logado; se ninguém estiver, manda para a tela de login.
 * Os dados do sistema pertencem ao CLIENTE (clientId), não à pessoa: use sempre user.clientId para ler e gravar dados.
 */
export async function requireUser(): Promise<ScopedUser> {
  const user = await getSession();
  if (!user) redirect("/login");
  const { scope, accessible } = await resolveAccess(user.id, await readActiveClient());
  const clients = accessible.map((a) => ({ id: a.client.id, name: a.client.name }));
  return { ...user, clientId: scope.clientId, clientName: clients.find((c) => c.id === scope.clientId)?.name ?? "", role: scope.role, clients };
}

/**
 * Igual ao requireUser, mas só deixa passar quem tem a permissão. Quem não tem volta para o Kanban.
 * Use em TODA tela e ação que a permissão protege: esconder o botão no menu não basta.
 */
export async function requirePermission(permission: Permission): Promise<ScopedUser> {
  const user = await requireUser();
  if (!can(user.role, permission)) redirect("/kanban");
  return user;
}
