import type { Metadata } from "next";
import Link from "next/link";
import { ConsentBadge, StageBadge } from "@/components/lead-badges";
import { Button, buttonStyles } from "@/components/ui/button";
import { controlClass } from "@/components/ui/field";
import { formatShortDateTime } from "@/lib/format";
import { getLeadsRepository } from "@/lib/leads";
import { consentStatus } from "@/lib/leads/consent";
import { isStageId, sourceLabel, STAGES, type Lead } from "@/lib/leads/types";
import { formatPhone } from "@/lib/phone";
import { requireUser } from "@/lib/require-user";

export const metadata: Metadata = { title: "Leads" };

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

function matchesQuery(lead: Lead, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;

  const digits = q.replace(/\D/g, "");
  const text = [lead.name, lead.company, lead.email, ...lead.tags].join(" ").toLowerCase();
  if (text.includes(q)) return true;
  return digits.length >= 3 && (lead.phone ?? "").includes(digits);
}

export default async function LeadsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser();
  const params = await searchParams;

  const q = first(params.q);
  const stageParam = first(params.etapa);
  const marketing = first(params.marketing);
  const stage = isStageId(stageParam) ? stageParam : "";

  const all = await getLeadsRepository().list(user.id);
  const leads = all
    .filter((lead) => matchesQuery(lead, q))
    .filter((lead) => !stage || lead.stage === stage)
    .filter((lead) => !marketing || consentStatus(lead) === marketing)
    .sort((a, b) => b.lastInteractionAt.localeCompare(a.lastInteractionAt));

  const filtered = Boolean(q || stage || marketing);

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Leads</h1>
          <p className="mt-1 text-slate-600">
            {filtered ? `${leads.length} de ${all.length} leads` : `${all.length} ${all.length === 1 ? "lead" : "leads"}`}
          </p>
        </div>
        <Link href="/leads/novo" className={buttonStyles("primary")}>
          + Novo lead
        </Link>
      </div>

      <form method="get" className="mt-6 flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-soft">
        <div className="min-w-48 flex-1">
          <label htmlFor="q" className="mb-1 block text-xs font-medium text-slate-600">
            Buscar
          </label>
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={q}
            placeholder="Nome, empresa, telefone, e-mail ou tag"
            className={controlClass}
          />
        </div>
        <div>
          <label htmlFor="etapa" className="mb-1 block text-xs font-medium text-slate-600">
            Etapa
          </label>
          <select id="etapa" name="etapa" defaultValue={stage} className={controlClass}>
            <option value="">Todas</option>
            {STAGES.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="marketing" className="mb-1 block text-xs font-medium text-slate-600">
            Marketing
          </label>
          <select id="marketing" name="marketing" defaultValue={marketing} className={controlClass}>
            <option value="">Todos</option>
            <option value="autorizado">Autorizado (opt-in)</option>
            <option value="sem_autorizacao">Sem autorização</option>
            <option value="saiu">Saiu (opt-out)</option>
          </select>
        </div>
        <Button type="submit">Filtrar</Button>
        {filtered && (
          <Link href="/leads" className={buttonStyles("ghost")}>
            Limpar
          </Link>
        )}
      </form>

      <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-soft">
        {leads.length === 0 ? (
          <p className="px-6 py-10 text-center text-sm text-slate-500">
            {all.length === 0 ? (
              <>
                Nenhum lead ainda.{" "}
                <Link href="/leads/novo" className="font-medium text-brand-600 hover:text-brand-700">
                  Criar o primeiro
                </Link>
              </>
            ) : (
              "Nenhum lead encontrado com esses filtros."
            )}
          </p>
        ) : (
          <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th scope="col" className="px-4 py-3">Lead</th>
                <th scope="col" className="px-4 py-3">Telefone</th>
                <th scope="col" className="px-4 py-3">Origem</th>
                <th scope="col" className="px-4 py-3">Etapa</th>
                <th scope="col" className="px-4 py-3">Marketing</th>
                <th scope="col" className="px-4 py-3">Última interação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {leads.map((lead) => (
                <tr key={lead.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link href={`/leads/${lead.id}`} className="font-medium text-slate-900 hover:text-brand-700">
                      {lead.name}
                    </Link>
                    {lead.company && <p className="text-xs text-slate-500">{lead.company}</p>}
                    {lead.tags.length > 0 && (
                      <p className="mt-0.5 text-xs text-slate-400">{lead.tags.join(" · ")}</p>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatPhone(lead.phone)}</td>
                  <td className="px-4 py-3 text-slate-600">{sourceLabel(lead.source)}</td>
                  <td className="px-4 py-3">
                    <StageBadge stage={lead.stage} />
                  </td>
                  <td className="px-4 py-3">
                    <ConsentBadge lead={lead} />
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-500">
                    {formatShortDateTime(lead.lastInteractionAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
