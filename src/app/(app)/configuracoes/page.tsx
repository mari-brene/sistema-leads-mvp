import type { Metadata } from "next";
import { KnowledgeForm } from "@/components/message-forms";
import { SettingsForm } from "@/components/settings-form";
import { getCampaignsRepository } from "@/lib/campaigns";
import { getInboxRepository } from "@/lib/inbox";
import { requireUser } from "@/lib/require-user";

export const metadata: Metadata = { title: "Configurações" };

export default async function SettingsPage() {
  const user = await requireUser();
  const [settings, inbox] = await Promise.all([
    getCampaignsRepository().getSettings(user.id),
    getInboxRepository().getSettings(user.id),
  ]);

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold text-slate-900">Configurações</h1>
      <p className="mt-1 text-slate-600">Limite diário, horário de envio e frase de saída das campanhas.</p>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
        <SettingsForm settings={settings} />
      </section>

      <h2 className="mt-10 text-xl font-semibold text-slate-900">Base de conhecimento (resposta automática)</h2>
      <p className="mt-1 text-slate-600">O que a IA pode responder quando um contato escrever.</p>
      <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
        <KnowledgeForm settings={inbox} />
      </section>
    </div>
  );
}
