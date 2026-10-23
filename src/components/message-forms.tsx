"use client";

import { useActionState } from "react";
import {
  saveKnowledgeAction,
  sendReplyAction,
  simulateInboundAction,
  type InboxFormState,
  type KnowledgeFormState,
} from "@/app/(app)/inbox/actions";
import { Button } from "@/components/ui/button";
import { Field, TextAreaField } from "@/components/ui/field";
import { MAX_BUSINESS_NAME, MAX_KNOWLEDGE, MAX_MESSAGE, type InboxSettings } from "@/lib/inbox/types";

function Feedback({ state }: { state: InboxFormState }) {
  if (state?.error) {
    return (
      <div role="alert" className="rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
        {state.error}
      </div>
    );
  }
  if (state?.ok) {
    return (
      <p role="status" className="rounded-xl bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-700">
        {state.ok}
      </p>
    );
  }
  return null;
}

export function ReplyForm({ leadId }: { leadId: string }) {
  const [state, action, pending] = useActionState<InboxFormState, FormData>(sendReplyAction, undefined);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="leadId" value={leadId} />
      <TextAreaField label="Sua resposta" name="message" rows={3} required maxLength={MAX_MESSAGE} />
      <Feedback state={state} />
      <Button type="submit" disabled={pending}>
        {pending ? "Enviando…" : "Enviar resposta"}
      </Button>
    </form>
  );
}

export function SimulateInboundForm({ leadId }: { leadId: string }) {
  const [state, action, pending] = useActionState<InboxFormState, FormData>(simulateInboundAction, undefined);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="leadId" value={leadId} />
      <TextAreaField
        label="O que o contato escreve"
        name="message"
        rows={2}
        required
        maxLength={MAX_MESSAGE}
        hint="Teste: uma pergunta que está na base, uma que não está, e a palavra SAIR."
      />
      <Feedback state={state} />
      <Button type="submit" variant="outline" disabled={pending}>
        {pending ? "Simulando…" : "Simular mensagem recebida"}
      </Button>
    </form>
  );
}

export function KnowledgeForm({ settings }: { settings: InboxSettings }) {
  const [state, action, pending] = useActionState<KnowledgeFormState, FormData>(saveKnowledgeAction, undefined);
  return (
    <form action={action} className="space-y-5">
      <label className="flex items-start gap-3 text-sm text-slate-700">
        <input
          type="checkbox"
          name="aiEnabled"
          defaultChecked={settings.aiEnabled}
          className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
        />
        <span>
          Responder automaticamente com IA
          <span className="block text-xs text-slate-500">Desligado: todas as conversas esperam por você.</span>
        </span>
      </label>
      <Field label="Nome da empresa" name="businessName" maxLength={MAX_BUSINESS_NAME} defaultValue={settings.businessName} />
      <TextAreaField
        label="Base de conhecimento"
        name="knowledge"
        rows={12}
        maxLength={MAX_KNOWLEDGE}
        defaultValue={settings.knowledge}
        hint={`A IA só responde com o que estiver aqui; o resto ela passa para você. Separe os assuntos com uma linha em branco. Até ${MAX_KNOWLEDGE} caracteres.`}
      />
      {state?.error && (
        <div role="alert" className="rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
          {state.error}
        </div>
      )}
      {state?.saved && (
        <p role="status" className="rounded-xl bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-700">
          Base salva.
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? "Salvando…" : "Salvar base"}
      </Button>
    </form>
  );
}
