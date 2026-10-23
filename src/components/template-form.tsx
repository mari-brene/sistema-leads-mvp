"use client";

import { useActionState, useEffect, useRef } from "react";
import { addTemplateAction, type TemplateFormState } from "@/app/(app)/campanhas/actions";
import { Button } from "@/components/ui/button";
import { Field, TextAreaField } from "@/components/ui/field";

/** Formulário para criar um modelo de mensagem. */
export function TemplateForm() {
  const [state, formAction, pending] = useActionState<TemplateFormState, FormData>(addTemplateAction, undefined);
  const formRef = useRef<HTMLFormElement>(null);

  // Depois de salvar, limpa os campos para o próximo modelo.
  useEffect(() => {
    if (state?.saved) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      <Field
        label="Nome do modelo *"
        name="name"
        type="text"
        required
        maxLength={80}
        autoComplete="off"
        placeholder="Ex.: Oferta de outubro"
        hint="Só para você se organizar. O contato não vê."
        defaultValue={state?.values?.name ?? ""}
      />
      <TextAreaField
        label="Texto da mensagem *"
        name="body"
        rows={5}
        required
        maxLength={900}
        placeholder="Oi {{nome}}, tudo bem? Temos uma novidade para a {{empresa}}..."
        hint="Use {{nome}} (primeiro nome do contato) e {{empresa}}. A frase para sair da lista é colocada sozinha no fim."
        defaultValue={state?.values?.body ?? ""}
      />

      {state?.error && (
        <div role="alert" className="rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
          {state.error}
        </div>
      )}
      {state?.saved && (
        <p role="status" className="rounded-xl bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-700">
          Modelo salvo. Agora ele aguarda aprovação.
        </p>
      )}

      <Button type="submit" disabled={pending}>
        {pending ? "Salvando…" : "Salvar modelo"}
      </Button>
    </form>
  );
}
