import { cookies } from "next/headers";
import { INVITE_COOKIE } from "@/lib/tenancy/invite-link";

/** Aviso mostrado em Entrar e Criar conta quando a pessoa chegou por um link de convite. */
export async function InviteNotice() {
  if (!(await cookies()).get(INVITE_COOKIE)?.value) return null;
  return (
    <p role="status" className="mb-4 rounded-xl bg-sky-50 px-3.5 py-2.5 text-sm text-sky-800">
      Você foi convidada(o) para um cliente. Entre ou crie a sua conta e o acesso é liberado automaticamente.
    </p>
  );
}
