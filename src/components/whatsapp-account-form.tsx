"use client";

import { useActionState } from "react";
import { connectWhatsAppAction, disconnectWhatsAppAction, type WhatsAppFormState } from "@/app/(app)/configuracoes/actions";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { formatDateTime } from "@/lib/format";
import type { AccountStatus } from "@/lib/whatsapp/accounts";

export function WhatsAppAccountForm({ status, encryptionReady }: { status: AccountStatus; encryptionReady: boolean }) {
  const [state, formAction, pending] = useActionState<WhatsAppFormState, FormData>(connectWhatsAppAction, undefined);
  const [removal, removeAction, removing] = useActionState<WhatsAppFormState, FormData>(() => disconnectWhatsAppAction(), undefined);

  return (
    <div className="space-y-5">
      {status.connected ? (
        <p className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-800">
          Número conectado{status.displayPhone ? ` (${status.displayPhone})` : ""}, ID {status.phoneNumberId}. Atualizado em {formatDateTime(status.updatedAt)}. O token fica guardado em segredo e não aparece aqui.
        </p>
      ) : (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">Nenhum número conectado. Sem ele, este cliente não envia nem responde mensagens de verdade.</p>
      )}

      {!encryptionReady ? (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
          Falta a chave de criptografia no servidor (CREDENTIALS_ENCRYPTION_KEY). Peça para quem cuida do sistema cadastrá-la antes de conectar um número.
        </p>
      ) : (
        <form action={formAction} className="space-y-4">
          <Field label="ID do número de telefone (Phone number ID)" name="phoneNumberId" required inputMode="numeric" autoComplete="off" hint="Painel da Meta > WhatsApp > Configuração da API. É só números." />
          <Field label="Número para exibir (opcional)" name="displayPhone" autoComplete="off" hint="Só para você reconhecer, ex.: +55 47 99999-1234." />
          <Field label={status.connected ? "Novo token de acesso (substitui o atual)" : "Token de acesso"} name="token" type="password" required autoComplete="off" hint="Cole direto aqui. Nunca envie o token por chat nem em print." />
          {state?.error ? <p className="text-sm text-red-600">{state.error}</p> : null}
          {state?.saved ? <p className="text-sm text-green-700">Número conectado.</p> : null}
          <Button type="submit" disabled={pending}>
            {pending ? "Salvando..." : status.connected ? "Trocar número ou token" : "Conectar número"}
          </Button>
        </form>
      )}

      {status.connected ? (
        <form action={removeAction}>
          <Button type="submit" variant="secondary" disabled={removing}>
            {removing ? "Desconectando..." : "Desconectar este número"}
          </Button>
          {removal?.removed ? <p className="mt-2 text-sm text-slate-600">Número desconectado.</p> : null}
        </form>
      ) : null}
    </div>
  );
}
