import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { LeadForm } from "@/components/lead-form";
import { ConsentBadge, StageBadge } from "@/components/lead-badges";
import { formatDateTime } from "@/lib/format";
import { getLeadsRepository } from "@/lib/leads";
import { sourceLabel, type LeadEventType } from "@/lib/leads/types";
import { formatPhone } from "@/lib/phone";
import { requireUser } from "@/lib/require-user";
import { cn } from "@/lib/utils";
import { ConsentPanel, DeleteLeadButton, NoteForm, StageSelect } from "./panels";

export const metadata: Metadata = { title: "Lead" };

const EVENT_STYLE: Record<LeadEventType, { label: string; dot: string }> = {
  criado: { label: "Criado", dot: "bg-brand-500" },
  etapa: { label: "Etapa", dot: "bg-violet-500" },
  nota: { label: "Nota", dot: "bg-amber-500" },
  consentimento: { label: "Autorização", dot: "bg-emerald-500" },
  editado: { label: "Edição", dot: "bg-slate-400" },
  mensagem: { label: "Mensagem", dot: "bg-sky-500" },
};

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
      <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;

  const lead = await getLeadsRepository().get(user.id, id);
  if (!lead) notFound();

  const history = [...lead.events].reverse();

  return (
    <div className="mx-auto max-w-6xl">
      <Link href="/leads" className="text-sm text-slate-500 hover:text-slate-800">
        ← Voltar para Leads
      </Link>

      <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{lead.name}</h1>
          <p className="mt-1 text-slate-600">
            {[lead.company, formatPhone(lead.phone) !== "—" ? formatPhone(lead.phone) : null, sourceLabel(lead.source)]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <StageBadge stage={lead.stage} />
            <ConsentBadge lead={lead} />
            <Link href={`/inbox/${lead.id}`} className="text-sm font-medium text-brand-700 hover:underline">
              Conversa
            </Link>
          </div>
        </div>
        <div className="w-full sm:w-56">
          <StageSelect id={lead.id} stage={lead.stage} />
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Dados do lead">
            <LeadForm mode="edit" lead={lead} />
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Autorização para marketing">
            <ConsentPanel
              id={lead.id}
              optIn={lead.optIn}
              optOut={lead.optOut}
              optInAt={lead.optInAt}
              optInSource={lead.optInSource}
              optOutAt={lead.optOutAt}
              hasPhone={Boolean(lead.phone)}
            />
          </Card>

          <Card title="Notas">
            <NoteForm id={lead.id} />
          </Card>

          <Card title="Histórico">
            <ol className="space-y-4">
              {history.map((event) => {
                const style = EVENT_STYLE[event.type];
                return (
                  <li key={event.id} className="flex gap-3">
                    <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", style.dot)} aria-hidden="true" />
                    <div className="min-w-0">
                      <p className="text-xs text-slate-400">
                        {style.label} · {formatDateTime(event.at)}
                      </p>
                      <p className="whitespace-pre-wrap break-words text-sm text-slate-700">{event.text}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </Card>

          <DeleteLeadButton id={lead.id} name={lead.name} />
        </div>
      </div>
    </div>
  );
}
