import type { Metadata } from "next";
import Link from "next/link";
import { CampaignForm } from "@/components/campaign-form";
import { buttonStyles } from "@/components/ui/button";
import { getCampaignsRepository } from "@/lib/campaigns";
import { getLeadsRepository } from "@/lib/leads";
import { requireUser } from "@/lib/require-user";

export const metadata: Metadata = { title: "Nova campanha" };

export default async function NewCampaignPage() {
  const user = await requireUser();
  const [templates, leads] = await Promise.all([
    getCampaignsRepository().listTemplates(user.id),
    getLeadsRepository().list(user.id),
  ]);
  const approved = templates.filter((template) => template.status === "aprovado");
  const tags = [...new Set(leads.flatMap((lead) => lead.tags))].sort((a, b) => a.localeCompare(b, "pt-BR"));

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/campanhas" className="text-sm font-medium text-brand-700 hover:underline">
        ← Voltar para Campanhas
      </Link>
      <h1 className="mt-2 text-2xl font-semibold text-slate-900">Nova campanha</h1>
      <p className="mt-1 text-slate-600">
        Escolha o modelo e quem deve receber. A campanha é criada como <strong>rascunho</strong>: nada é enviado até você
        iniciar.
      </p>

      {approved.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center shadow-soft">
          <p className="font-medium text-slate-900">Você ainda não tem nenhum modelo aprovado</p>
          <p className="mt-1 text-sm text-slate-500">Crie um modelo e libere ele (na simulação, com o botão “Simular aprovação”).</p>
          <Link href="/campanhas/modelos" className={`${buttonStyles("primary")} mt-4`}>
            Ir para os modelos
          </Link>
        </div>
      ) : (
        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
          <CampaignForm
            templates={approved.map((template) => ({ id: template.id, name: template.name, body: template.body }))}
            tags={tags}
          />
        </section>
      )}
    </div>
  );
}
