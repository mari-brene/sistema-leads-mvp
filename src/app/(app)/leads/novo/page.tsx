import type { Metadata } from "next";
import Link from "next/link";
import { LeadForm } from "@/components/lead-form";

export const metadata: Metadata = { title: "Novo lead" };

export default function NewLeadPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/kanban" className="text-sm text-slate-500 hover:text-slate-800">
        ← Voltar ao Kanban
      </Link>
      <h1 className="mt-2 text-2xl font-semibold text-slate-900">Novo lead</h1>
      <p className="mt-1 text-slate-600">Só o nome é obrigatório. O resto você pode completar depois.</p>

      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-soft sm:p-6">
        <LeadForm mode="create" />
      </div>
    </div>
  );
}
