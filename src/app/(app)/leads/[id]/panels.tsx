"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";
import {
  addNoteAction,
  deleteLeadAction,
  moveLeadAction,
  registerOptInAction,
  registerOptOutAction,
  type SimpleState,
} from "@/app/(app)/leads/actions";
import { ConsentBadge } from "@/components/lead-badges";
import { Button } from "@/components/ui/button";
import { controlClass } from "@/components/ui/field";
import { formatDate } from "@/lib/format";
import { END_OF_COLUMN } from "@/lib/leads/ordering";
import { CONSENT_SOURCES, consentSourceLabel, isStageId, STAGES, type ConsentSourceId, type StageId } from "@/lib/leads/types";

/** Lista para mudar o lead de etapa pela página de detalhes. */
export function StageSelect({ id, stage }: { id: string; stage: StageId }) {
  const router = useRouter();
  const [current, setCurrent] = useState<StageId>(stage);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div>
      <label htmlFor="stage-select" className="mb-1 block text-xs font-medium text-slate-600">
        Etapa do funil
      </label>
      <select
        id="stage-select"
        value={current}
        disabled={pending}
        onChange={(event) => {
          const next = event.target.value;
          if (!isStageId(next)) return;
          const previous = current;
          setCurrent(next);
          setError(null);
          startTransition(async () => {
            const result = await moveLeadAction(id, next, END_OF_COLUMN);
            if (result.ok) {
              router.refresh();
            } else {
              setCurrent(previous);
              setError(result.error ?? "Não foi possível mudar a etapa.");
            }
          });
        }}
        className={controlClass}
      >
        {STAGES.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
      {error && (
        <p role="alert" className="mt-1 text-xs text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

/** Adicionar uma nota ao histórico do lead. */
export function NoteForm({ id }: { id: string }) {
  const [state, formAction, pending] = useActionState<SimpleState, FormData>(addNoteAction, undefined);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="id" value={id} />
      <label htmlFor="note-text" className="block text-sm font-medium text-slate-700">
        Nova nota
      </label>
      <textarea
        id="note-text"
        name="text"
        required
        rows={3}
        maxLength={2000}
        placeholder="Ex.: Liguei, pediu proposta até sexta."
        defaultValue={state?.error ? (state.text ?? "") : ""}
        className={controlClass}
      />
      {state?.error && (
        <p role="alert" className="text-sm text-red-700">
          {state.error}
        </p>
      )}
      <Button type="submit" variant="outline" disabled={pending}>
        {pending ? "Salvando…" : "Salvar nota"}
      </Button>
    </form>
  );
}

type ConsentPanelProps = {
  id: string;
  optIn: boolean;
  optOut: boolean;
  optInAt: string | null;
  optInSource: ConsentSourceId | null;
  optOutAt: string | null;
  hasPhone: boolean;
};

/** Registro de autorização (opt-in) e de saída (opt-out) para marketing. */
export function ConsentPanel({ id, optIn, optOut, optInAt, optInSource, optOutAt, hasPhone }: ConsentPanelProps) {
  const [inState, inAction, inPending] = useActionState<SimpleState, FormData>(registerOptInAction, undefined);
  const [outState, outAction, outPending] = useActionState<SimpleState, FormData>(registerOptOutAction, undefined);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <ConsentBadge lead={{ optIn, optOut }} />
      </div>

      {optOut ? (
        <p className="text-sm text-slate-600">
          Pediu para sair em {formatDate(optOutAt)}. Por regra do sistema, este contato <strong>nunca mais</strong>{" "}
          recebe marketing.
        </p>
      ) : optIn ? (
        <p className="text-sm text-slate-600">
          Autorizou em {formatDate(optInAt)} ({consentSourceLabel(optInSource)}).
        </p>
      ) : (
        <>
          <p className="text-sm text-slate-600">
            Sem autorização registrada: este contato fica <strong>bloqueado</strong> para campanhas de marketing.
          </p>
          {hasPhone ? (
            <form action={inAction} className="space-y-3">
              <input type="hidden" name="id" value={id} />
              <label htmlFor="optin-source" className="block text-sm font-medium text-slate-700">
                A pessoa autorizou. De onde veio?
              </label>
              <select id="optin-source" name="optInSource" required defaultValue="" className={controlClass}>
                <option value="" disabled>
                  Escolha…
                </option>
                {CONSENT_SOURCES.map((source) => (
                  <option key={source.id} value={source.id}>
                    {source.label}
                  </option>
                ))}
              </select>
              <p className="text-xs text-slate-500">
                Registre só se você tem a prova da autorização. A data fica guardada.
              </p>
              {inState?.error && (
                <p role="alert" className="text-sm text-red-700">
                  {inState.error}
                </p>
              )}
              <Button type="submit" variant="outline" disabled={inPending}>
                {inPending ? "Registrando…" : "Registrar autorização"}
              </Button>
            </form>
          ) : (
            <p className="text-xs text-slate-500">Cadastre um telefone para poder registrar a autorização.</p>
          )}
        </>
      )}

      {!optOut && (
        <form
          action={outAction}
          onSubmit={(event) => {
            if (!window.confirm("Registrar que este contato pediu para sair? Isso não pode ser desfeito.")) {
              event.preventDefault();
            }
          }}
          className="border-t border-slate-200 pt-4"
        >
          <input type="hidden" name="id" value={id} />
          {outState?.error && (
            <p role="alert" className="mb-2 text-sm text-red-700">
              {outState.error}
            </p>
          )}
          <Button type="submit" variant="danger" disabled={outPending}>
            {outPending ? "Registrando…" : "Registrar saída (opt-out)"}
          </Button>
          <p className="mt-2 text-xs text-slate-500">
            Use quando a pessoa pedir para parar de receber mensagens (SAIR, PARAR, CANCELAR).
          </p>
        </form>
      )}
    </div>
  );
}

/** Botão de excluir, com confirmação. */
export function DeleteLeadButton({ id, name }: { id: string; name: string }) {
  return (
    <form
      action={deleteLeadAction}
      onSubmit={(event) => {
        if (!window.confirm(`Excluir o lead "${name}"? Isso não pode ser desfeito.`)) event.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <Button type="submit" variant="danger">
        Excluir lead
      </Button>
    </form>
  );
}
