import type { Metadata } from "next";
import Link from "next/link";
import { KanbanBoard } from "@/components/kanban-board";
import { buttonStyles } from "@/components/ui/button";
import { getLeadsRepository } from "@/lib/leads";
import { toKanbanLead } from "@/lib/leads/types";
import { requireUser } from "@/lib/require-user";

export const metadata: Metadata = { title: "Kanban" };

export default async function KanbanPage() {
  const user = await requireUser();
  const leads = await getLeadsRepository().list(user.id);

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Kanban</h1>
          <p className="mt-1 text-slate-600">
            Arraste os cartões entre as etapas. {leads.length === 1 ? "1 lead" : `${leads.length} leads`} no total.
          </p>
        </div>
        <Link href="/leads/novo" className={buttonStyles("primary")}>
          + Novo lead
        </Link>
      </div>

      {leads.length === 0 && (
        <p className="mt-6 rounded-xl border border-dashed border-slate-300 bg-white px-4 py-3 text-sm text-slate-600">
          Você ainda não tem leads. Clique em <strong>+ Novo lead</strong> para criar o primeiro.
        </p>
      )}

      <div className="mt-6">
        <KanbanBoard initialLeads={leads.map(toKanbanLead)} />
      </div>
    </div>
  );
}
