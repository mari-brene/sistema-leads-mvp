import { redirect } from "next/navigation";
import type { AuthUser } from "@/lib/auth";
import { getSession } from "@/lib/session";
import { resolveScope, type Role } from "@/lib/tenancy";

/** Quem está logado, mais o cliente em que está trabalhando e o papel nele. */
export type ScopedUser = AuthUser & { clientId: string; role: Role };

/**
 * Devolve quem está logado; se ninguém estiver, manda para a tela de login.
 * Os dados do sistema pertencem ao CLIENTE (clientId), não à pessoa: use sempre user.clientId para ler e gravar dados.
 */
export async function requireUser(): Promise<ScopedUser> {
  const user = await getSession();
  if (!user) redirect("/login");
  const scope = await resolveScope(user.id);
  return { ...user, clientId: scope.clientId, role: scope.role };
}
