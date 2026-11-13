import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { config } from "@/lib/config";
import { getCampaignsMigration, type CampaignsReport } from "@/lib/migration/campaigns-run";
import { getInboxMigration, type InboxReport } from "@/lib/migration/inbox-run";
import { getMigration, type MigrationReport } from "@/lib/migration/run";
import { requireUser } from "@/lib/require-user";
import { runCampaignsMigrationAction, runInboxMigrationAction, runMigrationAction } from "./actions";

export const metadata: Metadata = { title: "Migração dos leads" };
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ leads?: string; faltando?: string; camp?: string; campfalta?: string; caixa?: string; caixafalta?: string; erro?: string }> };

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

  let campaigns: CampaignsReport | null = null;
  let campaignsError = "";
  if (config.dataBackend === "supabase" && !error) {
    try {
      campaigns = await getCampaignsMigration().preview();
    } catch (e) {
      campaignsError = e instanceof Error ? e.message : "Erro desconhecido.";
    }
  }
  let inbox: InboxReport | null = null;
  let inboxError = "";
  if (config.dataBackend === "supabase" && !error) {
    try {
      inbox = await getInboxMigration().preview();
    } catch (e) {
      inboxError = e instanceof Error ? e.message : "Erro desconhecido.";
    }
  }
  const inboxRows: [string, "settings" | "conversations" | "messages" | "usage"][] = [
    ["Configurações da IA", "settings"],
    ["Conversas", "conversations"],
    ["Mensagens", "messages"],
    ["Uso diário da IA", "usage"],
  ];
  const rows: [string, "settings" | "templates" | "campaigns" | "messages"][] = [
    ["Limites e horários", "settings"],
    ["Modelos de mensagem", "templates"],
    ["Campanhas", "campaigns"],
    ["Mensagens das campanhas", "messages"],
  ];

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

      <h2 className="mt-10 text-xl font-semibold text-slate-900">Migração das campanhas</h2>
      <p className="mt-1 text-slate-600">
        Copia modelos, campanhas, mensagens e limites do lugar antigo para as tabelas novas. Copie os leads primeiro. Nada é apagado nem alterado no lugar antigo.
      </p>

      {params.camp !== undefined && !error && (
        <p className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          Cópia feita: {params.camp} item(ns) copiados. Conferência: {params.campfalta === "0" ? "tudo o que foi copiado está nas tabelas novas." : `${params.campfalta} item(ns) não foram encontrados nas tabelas novas.`}
        </p>
      )}
      {campaignsError && <p className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{campaignsError}</p>}

      {campaigns && (
        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
          <h3 className="text-sm font-semibold text-slate-800">Situação agora</h3>
          <table className="mt-3 w-full text-sm text-slate-700">
            <thead>
              <tr className="text-left text-xs text-slate-500">
                <th className="font-medium">O quê</th>
                <th className="font-medium">No lugar antigo</th>
                <th className="font-medium">Já copiados</th>
                <th className="font-medium">Faltam</th>
                <th className="font-medium">Bloqueados</th>
                <th className="font-medium">Inválidos</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([label, key]) => {
                const c = campaigns.plan.counts[key];
                return (
                  <tr key={key} className="border-t border-slate-100">
                    <td className="py-1.5">{label}</td>
                    <td>{c.source}</td>
                    <td>{c.alreadyCopied}</td>
                    <td className="font-semibold">{c.toCopy}</td>
                    <td>{c.blocked}</td>
                    <td>{c.invalid}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-slate-500">Bloqueado = o cliente dono ainda não está na tabela de clientes (ou a campanha da mensagem não existe).</p>

          <form action={runCampaignsMigrationAction} className="mt-5">
            <Button type="submit" disabled={rows.every(([, key]) => campaigns.plan.counts[key].toCopy === 0)}>
              Copiar campanhas agora
            </Button>
          </form>
        </section>
      )}

      <h2 className="mt-10 text-xl font-semibold text-slate-900">Migração da caixa de entrada</h2>
      <p className="mt-1 text-slate-600">
        Copia conversas, mensagens e configurações da IA do lugar antigo para as tabelas novas. Copie os leads primeiro. Nada é apagado nem alterado no lugar antigo.
      </p>

      {params.caixa !== undefined && !error && (
        <p className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          Cópia feita: {params.caixa} item(ns) copiados. Conferência: {params.caixafalta === "0" ? "tudo o que foi copiado está nas tabelas novas." : `${params.caixafalta} item(ns) não foram encontrados nas tabelas novas.`}
        </p>
      )}
      {inboxError && <p className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{inboxError}</p>}

      {inbox && (
        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
          <h3 className="text-sm font-semibold text-slate-800">Situação agora</h3>
          <table className="mt-3 w-full text-sm text-slate-700">
            <thead>
              <tr className="text-left text-xs text-slate-500">
                <th className="font-medium">O quê</th>
                <th className="font-medium">No lugar antigo</th>
                <th className="font-medium">Já copiados</th>
                <th className="font-medium">Faltam</th>
                <th className="font-medium">Bloqueados</th>
                <th className="font-medium">Inválidos</th>
              </tr>
            </thead>
            <tbody>
              {inboxRows.map(([label, key]) => {
                const c = inbox.plan.counts[key];
                return (
                  <tr key={key} className="border-t border-slate-100">
                    <td className="py-1.5">{label}</td>
                    <td>{c.source}</td>
                    <td>{c.alreadyCopied}</td>
                    <td className="font-semibold">{c.toCopy}</td>
                    <td>{c.blocked}</td>
                    <td>{c.invalid}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-slate-500">Bloqueado = o cliente dono ainda não está na tabela de clientes.</p>

          <form action={runInboxMigrationAction} className="mt-5">
            <Button type="submit" disabled={inboxRows.every(([, key]) => inbox.plan.counts[key].toCopy === 0)}>
              Copiar caixa de entrada agora
            </Button>
          </form>
        </section>
      )}
    </div>
  );
}
