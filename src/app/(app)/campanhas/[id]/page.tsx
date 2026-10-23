import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CampaignControls } from "@/components/campaign-controls";
import { CampaignStatusBadge, MessageStatusBadge } from "@/components/campaign-badges";
import { Badge } from "@/components/ui/badge";
import { getCampaignsRepository } from "@/lib/campaigns";
import { describeWindow } from "@/lib/campaigns/time";
import { formatDateTime } from "@/lib/format";
import { stageInfo } from "@/lib/leads/types";
import { formatPhone } from "@/lib/phone";
import { requireUser } from "@/lib/require-user";

export const metadata: Metadata = { title: "Campanha" };

type PageProps = { params: Promise<{ id: string }> };

const SHOWN = 100;

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <p className="text-2xl font-semibold text-slate-900">{value}</p>
      <p className="text-xs font-medium text-slate-500">{label}</p>
    </div>
  );
}

export default async function CampaignPage({ params }: PageProps) {
  const user = await requireUser();
  const { id } = await params;
  const repo = getCampaignsRepository();
  const [detail, usage, settings] = await Promise.all([
    repo.getCampaign(user.id, id),
    repo.usage(user.id),
    repo.getSettings(user.id),
  ]);
  if (!detail) notFound();

  const { campaign, messages, counts } = detail;
  const example = messages[0]?.text;

  return (
    <div className="mx-auto max-w-5xl">
      <Link href="/campanhas" className="text-sm font-medium text-brand-700 hover:underline">
        ← Voltar para Campanhas
      </Link>

      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold text-slate-900">{campaign.name}</h1>
        <CampaignStatusBadge status={campaign.status} />
      </div>
      <p className="mt-1 text-sm text-slate-600">
        Modelo: <strong>{campaign.templateName}</strong> · Etapas:{" "}
        {campaign.stages.map((stage) => stageInfo(stage).label).join(", ")}
        {campaign.tag && <> · Tag: {campaign.tag}</>} · Criada em {formatDateTime(campaign.createdAt)}
      </p>

      <section className="mt-6 grid gap-3 sm:grid-cols-5">
        <Stat label="Total" value={counts.total} />
        <Stat label="Na fila" value={counts.naFila} />
        <Stat label="Enviadas" value={counts.enviadas} />
        <Stat label="Falhas" value={counts.falhas} />
        <Stat label="Puladas" value={counts.puladas} />
      </section>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
        <h2 className="text-sm font-semibold text-slate-900">Controle</h2>
        <p className="mt-1 text-sm text-slate-600">
          Hoje: <strong>{usage.sent}</strong> de {usage.limit} envios · Horário: {describeWindow(settings)}{" "}
          {usage.window.open ? <Badge tone="green">Aberto agora</Badge> : <Badge tone="amber">Fechado agora</Badge>}
        </p>
        {!usage.window.open && <p className="mt-1 text-xs text-slate-500">{usage.window.reason}</p>}
        <div className="mt-4">
          <CampaignControls id={campaign.id} status={campaign.status} queued={counts.naFila} />
        </div>
      </section>

      {example && (
        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
          <h2 className="text-sm font-semibold text-slate-900">Exemplo da mensagem (para {messages[0].leadName})</h2>
          <p className="mt-3 whitespace-pre-wrap rounded-xl bg-emerald-50 px-4 py-3 text-sm text-slate-800">{example}</p>
        </section>
      )}

      <section className="mt-6">
        <h2 className="text-sm font-semibold text-slate-900">Fila e resultados</h2>
        <div className="mt-3 overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-soft">
          <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th scope="col" className="px-4 py-3">Contato</th>
                <th scope="col" className="px-4 py-3">Telefone</th>
                <th scope="col" className="px-4 py-3">Situação</th>
                <th scope="col" className="px-4 py-3">Enviada em</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {messages.slice(0, SHOWN).map((message) => (
                <tr key={message.id}>
                  <td className="px-4 py-3">
                    <Link href={`/leads/${message.leadId}`} className="font-medium text-slate-900 hover:underline">
                      {message.leadName}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatPhone(message.phone)}</td>
                  <td className="px-4 py-3">
                    <MessageStatusBadge status={message.status} />
                    {message.reason && <p className="mt-1 text-xs text-slate-500">{message.reason}</p>}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatDateTime(message.sentAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {messages.length > SHOWN && (
          <p className="mt-2 text-xs text-slate-500">Mostrando as primeiras {SHOWN} de {messages.length}.</p>
        )}
      </section>
    </div>
  );
}
