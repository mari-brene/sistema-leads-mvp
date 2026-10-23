import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StateBadge } from "@/components/inbox-badges";
import { ReplyForm, SimulateInboundForm } from "@/components/message-forms";
import { Button } from "@/components/ui/button";
import { config } from "@/lib/config";
import { formatShortDateTime } from "@/lib/format";
import { getInboxRepository } from "@/lib/inbox";
import { windowHoursLeft } from "@/lib/inbox/logic";
import { conversationState } from "@/lib/inbox/types";
import { formatPhone } from "@/lib/phone";
import { requireUser } from "@/lib/require-user";
import { handBackAction, takeOverAction } from "../actions";

export const metadata: Metadata = { title: "Conversa" };

type PageProps = { params: Promise<{ leadId: string }> };

const AUTHOR_LABEL = { contato: "Contato", ia: "IA", voce: "Você", sistema: "Sistema" } as const;

export default async function ThreadPage({ params }: PageProps) {
  const user = await requireUser();
  const { leadId } = await params;
  const thread = await getInboxRepository().getThread(user.id, leadId);
  if (!thread) notFound();

  const { lead, conversation, messages, canReply } = thread;
  const state = conversation ? conversationState(conversation, lead.optOut) : lead.optOut ? "saiu" : null;
  const hoursLeft = windowHoursLeft(conversation?.lastInboundAt ?? null, new Date());

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/inbox" className="text-sm font-medium text-brand-700 hover:underline">
        ← Voltar para a Caixa de entrada
      </Link>

      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold text-slate-900">{lead.name}</h1>
        {state && <StateBadge state={state} />}
      </div>
      <p className="mt-1 text-sm text-slate-600">
        {lead.company} · {formatPhone(lead.phone)} ·{" "}
        <Link href={`/leads/${lead.id}`} className="font-medium text-brand-700 hover:underline">
          ver lead
        </Link>
      </p>

      {conversation?.handoffReason && (
        <p className="mt-4 rounded-xl bg-amber-50 px-3.5 py-2.5 text-sm text-amber-800">
          <strong>Motivo:</strong> {conversation.handoffReason}
        </p>
      )}

      <section className="mt-6 space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-soft">
        {messages.length === 0 && <p className="text-sm text-slate-500">Nenhuma mensagem ainda.</p>}
        {messages.map((message) => {
          const mine = message.direction === "out";
          return (
            <div key={message.id} className={mine ? "flex justify-end" : "flex justify-start"}>
              <div className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm ${mine ? "bg-brand-50 text-slate-900" : "bg-slate-100 text-slate-900"}`}>
                <p className="whitespace-pre-wrap break-words">{message.text}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {AUTHOR_LABEL[message.author]} · {formatShortDateTime(message.at)}
                  {message.status === "falhou" && <span className="text-red-600"> · não enviada ({message.error})</span>}
                </p>
              </div>
            </div>
          );
        })}
      </section>

      {conversation && !lead.optOut && (
        <div className="mt-4 flex flex-wrap gap-3">
          {conversation.mode === "ia" ? (
            <form action={takeOverAction}>
              <input type="hidden" name="leadId" value={lead.id} />
              <Button type="submit" variant="outline">Assumir conversa</Button>
            </form>
          ) : (
            <form action={handBackAction}>
              <input type="hidden" name="leadId" value={lead.id} />
              <Button type="submit" variant="outline">Devolver à IA</Button>
            </form>
          )}
        </div>
      )}

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
        {lead.optOut ? (
          <p className="text-sm text-red-700">Este contato saiu da lista. Não é possível enviar mensagens.</p>
        ) : canReply ? (
          <>
            <p className="mb-3 text-xs text-slate-500">Você pode responder por mais {hoursLeft}h (janela de 24h do WhatsApp).</p>
            <ReplyForm leadId={lead.id} />
          </>
        ) : (
          <p className="text-sm text-slate-600">
            {conversation
              ? "Já se passaram mais de 24h desde a última mensagem do contato. Fora desse prazo só é possível enviar um modelo aprovado, por uma campanha."
              : "Você poderá responder quando o contato escrever."}
          </p>
        )}
      </section>

      {config.mockMode && (
        <section className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-white p-5">
          <h2 className="text-sm font-semibold text-slate-800">Simulação</h2>
          <p className="mb-3 text-xs text-slate-500">Só aparece no modo simulação: finge que o contato escreveu.</p>
          <SimulateInboundForm leadId={lead.id} />
        </section>
      )}
    </div>
  );
}
