import type { Metadata } from "next";
import Link from "next/link";
import { CampaignStatusBadge } from "@/components/campaign-badges";
import { Badge } from "@/components/ui/badge";
import { buttonStyles } from "@/components/ui/button";
import { getCampaignsRepository } from "@/lib/campaigns";
import { describeWindow } from "@/lib/campaigns/time";
import { formatDateTime } from "@/lib/format";
import { requireUser } from "@/lib/require-user";

export const metadata: Metadata = { title: "Campanhas" };

export default async function CampaignsPage() {
  const user = await requireUser();
  const repo = getCampaignsRepository();
  const [campaigns, usage, templates, settings] = await Promise.all([
    repo.listCampaigns(user.id),
    repo.usage(user.id),
    repo.listTemplates(user.id),
    repo.getSettings(user.id),
  ]);
  const approved = templates.filter((template) => template.status === "aprovado").length;

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Campanhas</h1>
          <p className="mt-1 text-slate-600">
            Mensagens de WhatsApp só para contatos que autorizaram (opt-in), com fila, limite diário e horário.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href="/campanhas/modelos" className={buttonStyles("outline")}>
            Modelos de mensagem
          </Link>
          <Link href="/campanhas/nova" className={buttonStyles("primary")}>
            + Nova campanha
          </Link>
        </div>
      </div>

      <p className="mt-4 rounded-xl bg-sky-50 px-3.5 py-2.5 text-sm text-sky-900">
        <strong>Modo simulação:</strong> nenhuma mensagem é enviada de verdade. O sistema só simula o envio para você testar
        o fluxo. O WhatsApp real chega na fase 8.
      </p>

      <section className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-soft">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Envios hoje</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">
            {usage.sent} <span className="text-base font-normal text-slate-500">de {usage.limit}</span>
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-soft sm:col-span-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Horário de envio</p>
          <p className="mt-1 text-sm text-slate-700">
            {describeWindow(settings)}{" "}
            {usage.window.open ? <Badge tone="green">Aberto agora</Badge> : <Badge tone="amber">Fechado agora</Badge>}
          </p>
          {!usage.window.open && <p className="mt-1 text-xs text-slate-500">{usage.window.reason}</p>}
          <Link href="/configuracoes" className="mt-2 inline-block text-xs font-medium text-brand-700 hover:underline">
            Mudar limite e horário
          </Link>
        </div>
      </section>

      {approved === 0 && (
        <p className="mt-6 rounded-xl border border-dashed border-slate-300 bg-white px-4 py-3 text-sm text-slate-600">
          Para criar uma campanha você precisa de um <strong>modelo de mensagem aprovado</strong>.{" "}
          <Link href="/campanhas/modelos" className="font-medium text-brand-700 hover:underline">
            Criar um modelo
          </Link>
        </p>
      )}

      <section className="mt-6">
        {campaigns.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-6 text-center text-sm text-slate-600">
            Você ainda não tem campanhas.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-soft">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" className="px-4 py-3">Campanha</th>
                  <th scope="col" className="px-4 py-3">Situação</th>
                  <th scope="col" className="px-4 py-3">Na fila</th>
                  <th scope="col" className="px-4 py-3">Enviadas</th>
                  <th scope="col" className="px-4 py-3">Falhas</th>
                  <th scope="col" className="px-4 py-3">Puladas</th>
                  <th scope="col" className="px-4 py-3">Criada em</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {campaigns.map(({ campaign, counts }) => (
                  <tr key={campaign.id}>
                    <td className="px-4 py-3">
                      <Link href={`/campanhas/${campaign.id}`} className="font-medium text-brand-700 hover:underline">
                        {campaign.name}
                      </Link>
                      <p className="text-xs text-slate-500">Modelo: {campaign.templateName}</p>
                    </td>
                    <td className="px-4 py-3">
                      <CampaignStatusBadge status={campaign.status} />
                    </td>
                    <td className="px-4 py-3 text-slate-700">{counts.naFila}</td>
                    <td className="px-4 py-3 text-slate-700">{counts.enviadas}</td>
                    <td className="px-4 py-3 text-slate-700">{counts.falhas}</td>
                    <td className="px-4 py-3 text-slate-700">{counts.puladas}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatDateTime(campaign.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
