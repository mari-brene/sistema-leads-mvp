import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { config } from "@/lib/config";
import { getMigration, type MigrationReport } from "@/lib/migration/run";
import { requireUser } from "@/lib/require-user";
import { runMigrationAction } from "./actions";

export const metadata: Metadata = { title: "Migração dos leads" };
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ leads?: string; faltando?: string; erro?: string }> };

export default async function MigrationPage({ searchParams }: Props) {
  const user = await requireUser();
  if (user.role !== "agency_admin") redirect("/kanban");
  const params = await searchParams;

  let report: MigrationReport | null = null;
  let error = params.erro ?? "";
  if (config.dataBackend === "supabase" && !error) {
    try {
      report = await getMigration().preview();
    } catch (e) {
      error = e instanceof Error ? e.message : "Erro desconhecido.";
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold text-slate-900">Migração dos leads</h1>
      <p className="mt-1 text-slate-600">
        Copia os leads do lugar antigo (tabela app_data) para a tabela nova. Nada é apagado nem alterado no lugar antigo, e quem já foi copiado não é copiado de novo.
      </p>

      {config.dataBackend !== "supabase" && (
        <p className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Esta tela só funciona no site de verdade (com DATA_BACKEND=supabase). No seu computador, em modo de teste, não há nada para copiar.
        </p>
      )}

      {error && <p className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</p>}

      {params.leads !== undefined && !error && (
        <p className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          Cópia feita: {params.leads} lead(s) copiados. Conferência: {params.faltando === "0" ? "todos os leads do lugar antigo estão na tabela nova." : `${params.faltando} lead(s) ainda não estão na tabela nova (veja os bloqueados abaixo).`}
        </p>
      )}

      {report && (
        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
          <h2 className="text-sm font-semibold text-slate-800">Situação agora</h2>
          <dl className="mt-3 grid grid-cols-[1fr_auto] gap-y-2 text-sm text-slate-700">
            <dt>Leads no lugar antigo</dt>
            <dd className="font-semibold">{report.plan.sourceLeads}</dd>
            <dt>Já estão na tabela nova</dt>
            <dd className="font-semibold">{report.plan.alreadyCopied}</dd>
            <dt>Faltam copiar</dt>
            <dd className="font-semibold">{report.plan.leads.length}</dd>
            <dt>Bloqueados (cliente dono não existe)</dt>
            <dd className="font-semibold">{report.plan.blockedNoClient}</dd>
            <dt>Linhas inválidas (puladas)</dt>
            <dd className="font-semibold">{report.plan.invalid}</dd>
            <dt>Clientes e vínculos a copiar</dt>
            <dd className="font-semibold">
              {report.plan.clients.length} e {report.plan.memberships.length}
            </dd>
          </dl>

          <form action={runMigrationAction} className="mt-5">
            <Button type="submit" disabled={report.plan.leads.length + report.plan.clients.length + report.plan.memberships.length === 0}>
              Copiar agora
            </Button>
          </form>
        </section>
      )}
    </div>
  );
}
