"use client";

import { useActionState, useEffect, useRef } from "react";
import { createClientAction, type ClientFormState } from "@/app/(app)/administracao/clientes/actions";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";

export function ClientForm() {
  const [state, action, pending] = useActionState<ClientFormState, FormData>(createClientAction, undefined);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.saved) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={action} className="space-y-3">
      <Field label="Nome do novo cliente" name="name" type="text" required maxLength={80} autoComplete="off" placeholder="Ex.: Studio Bela" />
      {state?.error && (
        <div role="alert" className="rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
          {state.error}
        </div>
      )}
      {state?.saved && (
        <p role="status" className="rounded-xl bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-700">
          Cliente criado. Use o seletor no topo para trabalhar nele e convide pessoas em Equipe.
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? "Criando..." : "Criar cliente"}
      </Button>
    </form>
  );
}
