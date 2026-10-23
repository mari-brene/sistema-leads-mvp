import type { Metadata } from "next";
import Link from "next/link";
import { TemplateStatusBadge } from "@/components/campaign-badges";
import { TemplateForm } from "@/components/template-form";
import { Button, buttonStyles } from "@/components/ui/button";
import { getCampaignsRepository } from "@/lib/campaigns";
import { formatDateTime } from "@/lib/format";
import { config } from "@/lib/config";
import { requireUser } from "@/lib/require-user";
import { approveTemplateAction, deleteTemplateAction } from "../actions";

export const metadata: Metadata = { title: "Modelos de mensagem" };

export default async function TemplatesPage() {
  const user = await requireUser();
  const templates = (await getCampaignsRepository().listTemplates(user.id)).sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/campanhas" className="text-sm font-medium text-brand-700 hover:underline">
        ← Voltar para Campanhas
      </Link>
      <h1 className="mt-2 text-2xl font-semibold text-slate-900">Modelos de mensagem</h1>
      <p className="mt-1 text-slate-600">
        Na API oficial do WhatsApp, mensagens de marketing só saem por <strong>modelos aprovados pela Meta</strong>. Aqui você
        escreve o modelo e acompanha a aprovação.
      </p>

      {config.mockMode && (
        <p className="mt-4 rounded-xl bg-sky-50 px-3.5 py-2.5 text-sm text-sky-900">
          <strong>Modo simulação:</strong> como ainda não há conexão com a Meta, use o botão{" "}
          <strong>Simular aprovação</strong> para liberar o modelo. No WhatsApp real, quem aprova é a Meta (leva de minutos a
          1 dia).
        </p>
      )}

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
        <h2 className="text-sm font-semibold text-slate-900">Novo modelo</h2>
        <div className="mt-4">
          <TemplateForm />
        </div>
      </section>

      <section className="mt-6 space-y-3">
        <h2 className="text-sm font-semibold text-slate-900">Seus modelos ({templates.length})</h2>
        {templates.length === 0 && (
          <p className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-6 text-center text-sm text-slate-600">
            Você ainda não tem modelos.
          </p>
        )}
        {templates.map((template) => (
          <article key={template.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-medium text-slate-900">{template.name}</h3>
              <TemplateStatusBadge status={template.status} />
            </div>
            <p className="mt-2 whitespace-pre-wrap rounded-xl bg-slate-50 px-3.5 py-2.5 text-sm text-slate-700">
              {template.body}
            </p>
            <p className="mt-2 text-xs text-slate-500">Criado em {formatDateTime(template.createdAt)}</p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              {config.mockMode && template.status === "pendente" && (
                <form action={approveTemplateAction}>
                  <input type="hidden" name="id" value={template.id} />
                  <Button type="submit" variant="outline">
                    Simular aprovação
                  </Button>
                </form>
              )}
              {template.status === "aprovado" && (
                <Link href="/campanhas/nova" className={buttonStyles("outline")}>
                  Usar em uma campanha
                </Link>
              )}
              <form action={deleteTemplateAction}>
                <input type="hidden" name="id" value={template.id} />
                <Button type="submit" variant="ghost">
                  Excluir
                </Button>
              </form>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
