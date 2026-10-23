import type { Metadata } from "next";
import Link from "next/link";
import { StateBadge } from "@/components/inbox-badges";
import { formatShortDateTime } from "@/lib/format";
import { getInboxRepository } from "@/lib/inbox";
import { conversationState } from "@/lib/inbox/types";
import { formatPhone } from "@/lib/phone";
import { requireUser } from "@/lib/require-user";

export const metadata: Metadata = { title: "Caixa de entrada" };

export default async function InboxPage() {
  const user = await requireUser();
  const rows = await getInboxRepository().listConversations(user.id);

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-2xl font-semibold text-slate-900">Caixa de entrada</h1>
      <p className="mt-1 text-slate-600">
        Conversas com seus contatos. As que esperam por você aparecem primeiro. Para testar, abra um lead na lista de{" "}
        <Link href="/leads" className="font-medium text-brand-700 hover:underline">
          Leads
        </Link>{" "}
        e use “Conversa”.
      </p>

      {rows.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">
          Nenhuma conversa ainda. Elas aparecem aqui quando um contato escreve.
        </p>
      ) : (
        <ul className="mt-6 divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white shadow-soft">
          {rows.map(({ conversation, lead }) => (
            <li key={lead.id}>
              <Link href={`/inbox/${lead.id}`} className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-slate-50">
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-900">
                    {lead.name} <span className="font-normal text-slate-500">· {lead.company}</span>
                  </p>
                  <p className="truncate text-sm text-slate-600">{conversation.lastPreview || "—"}</p>
                  <p className="text-xs text-slate-400">
                    {formatPhone(lead.phone)} · {formatShortDateTime(conversation.lastMessageAt)}
                  </p>
                </div>
                <StateBadge state={conversationState(conversation, lead.optOut)} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
