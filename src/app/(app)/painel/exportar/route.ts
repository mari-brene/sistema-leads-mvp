import { createAuditSink } from "@/lib/audit";
import { currentLeadsRepository } from "@/lib/leads";
import { leadsToCsv } from "@/lib/leads/export";
import { getSession } from "@/lib/session";
import { readActiveClient } from "@/lib/tenancy/active-client";
import { resolveAccess } from "@/lib/tenancy";
import { can } from "@/lib/tenancy/permissions";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

/** Baixa os leads do cliente ativo em CSV. Só quem tem a permissão "export"; cada download fica na auditoria. */
export async function GET() {
  const user = await getSession();
  if (!user) return new Response("Faça login para continuar.", { status: 401, headers: NO_STORE });
  const { scope } = await resolveAccess(user.id, await readActiveClient());
  if (!can(scope.role, "export")) return new Response("Você não tem permissão para exportar.", { status: 403, headers: NO_STORE });

  const leads = await currentLeadsRepository.list(scope.clientId);
  try {
    await createAuditSink().log([{ userId: scope.clientId, kind: "exportacao", text: `Exportação de leads em CSV: ${leads.length} lead(s).` }], "");
  } catch {
    return new Response("Não foi possível registrar a exportação na auditoria. Tente de novo.", { status: 500, headers: NO_STORE });
  }

  const day = new Date().toISOString().slice(0, 10);
  return new Response(leadsToCsv(leads), {
    status: 200,
    headers: { ...NO_STORE, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="leads-${day}.csv"` },
  });
}
