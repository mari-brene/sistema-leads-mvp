"use client";

import { useActionState, useEffect, useState } from "react";
import { createInviteAction, type InviteFormState } from "@/app/(app)/equipe/actions";
import { Button } from "@/components/ui/button";
import { SelectField } from "@/components/ui/field";

export function InviteForm() {
  const [state, action, pending] = useActionState<InviteFormState, FormData>(createInviteAction, undefined);
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => setOrigin(window.location.origin), []);
  useEffect(() => setCopied(false), [state?.path]);

  const link = state?.path ? `${origin}${state.path}` : "";

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="space-y-4">
      <form action={action} className="flex flex-wrap items-end gap-3">
        <SelectField label="Papel da pessoa" name="role" defaultValue="agent" wrapperClassName="min-w-52">
          <option value="agent">Atendente</option>
          <option value="client_manager">Gestor do cliente</option>
        </SelectField>
        <Button type="submit" disabled={pending}>
          {pending ? "Gerando..." : "Gerar link de convite"}
        </Button>
      </form>

      {state?.error && (
        <div role="alert" className="rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
          {state.error}
        </div>
      )}

      {link && (
        <div role="status" className="space-y-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-sm font-medium text-emerald-900">Link criado. Copie agora e mande para a pessoa:</p>
          <div className="flex flex-wrap gap-2">
            <input
              readOnly
              value={link}
              onFocus={(event) => event.currentTarget.select()}
              aria-label="Link do convite"
              className="min-w-0 flex-1 rounded-xl border border-emerald-300 bg-white px-3 py-2 text-sm text-slate-800"
            />
            <Button type="button" variant="outline" onClick={copy}>
              {copied ? "Copiado!" : "Copiar"}
            </Button>
          </div>
          <p className="text-xs text-emerald-900/80">
            Este link vale por 7 dias e para uma pessoa só. Por segurança, ele não será mostrado de novo depois que você sair desta tela.
          </p>
        </div>
      )}
    </div>
  );
}
