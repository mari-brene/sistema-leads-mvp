import type { Metadata } from "next";
import { KnowledgeForm } from "@/components/message-forms";
import { SettingsForm } from "@/components/settings-form";
import { getCampaignsRepository } from "@/lib/campaigns";
import { getInboxRepository } from "@/lib/inbox";
import { config } from "@/lib/config";
import { requirePermission } from "@/lib/require-user";
import { getWhatsAppAccounts } from "@/lib/whatsapp";
import { WhatsAppAccountForm } from "@/components/whatsapp-account-form";

export const metadata: Metadata = { title: "Configurações" };

export default async function SettingsPage() {
  const user = await requirePermission("settings");
  const [whatsapp, settings, inbox] = await Promise.all([
    getWhatsAppAccounts().status(user.clientId),
    getCampaignsRepository().getSettings(user.clientId),
    getInboxRepository().getSettings(user.clientId),
  ]);

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold text-slate-900">Configurações</h1>
      <p className="mt-1 text-slate-600">Limite diário, horário de envio e frase de saída das campanhas.</p>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
        <SettingsForm settings={settings} />
      </section>

      <h2 className="mt-10 text-xl font-semibold text-slate-900">WhatsApp deste cliente</h2>
      <p className="mt-1 text-slate-600">Cada cliente usa o próprio número da API oficial da Meta. Os dados de um cliente nunca saem pelo número de outro.</p>
      <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
        <WhatsAppAccountForm status={whatsapp} encryptionReady={/^[0-9a-fA-F]{64}$/.test(config.credentialsEncryptionKey)} />
      </section>

      <h2 className="mt-10 text-xl font-semibold text-slate-900">Base de conhecimento (resposta automática)</h2>
      <p className="mt-1 text-slate-600">O que a IA pode responder quando um contato escrever.</p>
      <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
        <KnowledgeForm settings={inbox} />
      </section>
    </div>
  );
}
