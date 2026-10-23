import { redirect } from "next/navigation";
import type { AuthUser } from "@/lib/auth";
import { getSession } from "@/lib/session";

/** Devolve quem está logado; se ninguém estiver, manda para a tela de login. */
export async function requireUser(): Promise<AuthUser> {
  const user = await getSession();
  if (!user) redirect("/login");
  return user;
}
