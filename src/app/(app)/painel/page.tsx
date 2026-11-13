import type { Metadata } from "next";
import { getCampaignsRepository } from "@/lib/campaigns";
import { buildDashboard } from "@/lib/dashboard/logic";
import { getInboxRepository } from "@/lib/inbox";
import { currentLeadsRepository } from "@/lib/leads";
import { requireUser } from "@/lib/require-user";
import { can } from "@/lib/tenancy/permissions";

export const metadata: Metadata = { title: "Painel" };
export const dynamic = "force-dynamic";

function Card({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-soft">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-900">{value}</p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

export default async function DashboardPage() {
  const user = await requireUser();
  const [leads, campaigns, conversations] = await Promise.all([
    currentLeadsRepository.list(user.clientId),
    getCampaignsRepository().listCampaigns(user.clientId),
    getInboxRepository().listConversations(user.clientId),
  ]);
  const data = buildDashboard({
    leads,
    campaigns: campaigns.map((item) => ({ status: item.campaign.status, counts: item.counts })),
    conversations: conversations.map((item) => ({ mode: item.conversation.mode, needsHuman: item.conversation.needsHuman })),
    now: new Date(),
  });
  const max = Math.max(1, ...data.byStage.map((stage) => stage.count));

  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Painel</h1>
          <p className="mt-1 text-slate-600">Números de {user.clientName || "este cliente"}. Outros clientes não aparecem aqui.</p>
        </div>

      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card label="Leads" value={data.totalLeads} hint={`${data.newLast30Days} novos nos últimos 30 dias`} />
        <Card label="Mensagens enviadas" value={data.messages.sent} hint={`${data.messages.failed} falharam · ${data.messages.queued} na fila`} />
        <Card label="Taxa de resposta" value={`${data.responseRate}%`} hint="Leads que responderam entre os já contatados" />
        <Card label="Para você responder" value={data.conversations.needsHuman} hint={`${data.conversations.total} conversas no total`} />
      </div>

      <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
        <h2 className="text-sm font-semibold text-slate-800">Leads por etapa</h2>
        <ul className="mt-3 space-y-2">
          {data.byStage.map((stage) => (
            <li key={stage.id} className="flex items-center gap-3 text-sm">
              <span className="w-40 shrink-0 text-slate-700">{stage.label}</span>
              <span className="h-3 flex-1 rounded-full bg-slate-100">
                <span className="block h-3 rounded-full bg-brand-600" style={{ width: `${(stage.count / max) * 100}%` }} />
              </span>
              <span className="w-10 text-right font-medium text-slate-900">{stage.count}</span>
            </li>
          ))}
        </ul>
      </section>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
          <h2 className="text-sm font-semibold text-slate-800">De onde vêm os leads</h2>
          {data.bySource.length === 0 ? (
            <p className="mt-2 text-sm text-slate-600">Ainda não há leads.</p>
          ) : (
            <ul className="mt-2 space-y-1 text-sm text-slate-700">
              {data.bySource.map((source) => (
                <li key={source.id} className="flex justify-between">
                  <span>{source.label}</span>
                  <strong>{source.count}</strong>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
          <h2 className="text-sm font-semibold text-slate-800">Consentimento e campanhas</h2>
          <ul className="mt-2 space-y-1 text-sm text-slate-700">
            <li className="flex justify-between"><span>Podem receber marketing (opt-in)</span><strong>{data.optIn}</strong></li>
            <li className="flex justify-between"><span>Pediram para sair (opt-out)</span><strong>{data.optOut}</strong></li>
            <li className="flex justify-between"><span>Campanhas em andamento</span><strong>{data.activeCampaigns}</strong></li>
            <li className="flex justify-between"><span>Campanhas no total</span><strong>{data.totalCampaigns}</strong></li>
            <li className="flex justify-between"><span>Conversas com a IA</span><strong>{data.conversations.withAi}</strong></li>
          </ul>
        </section>
      </div>
    </div>
  );
}
