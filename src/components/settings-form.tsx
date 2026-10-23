"use client";

import { useActionState } from "react";
import { saveSettingsAction, type SettingsFormState } from "@/app/(app)/configuracoes/actions";
import { Button } from "@/components/ui/button";
import { Field, SelectField, TextAreaField } from "@/components/ui/field";
import { MAX_DAILY_LIMIT, type Settings } from "@/lib/campaigns/types";

const START_HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const END_HOURS = Array.from({ length: 24 }, (_, index) => index + 1);
const pad = (hour: number) => `${String(hour % 24).padStart(2, "0")}:00`;

export function SettingsForm({ settings }: { settings: Settings }) {
  const [state, formAction, pending] = useActionState<SettingsFormState, FormData>(saveSettingsAction, undefined);

  return (
    <form action={formAction} className="space-y-5">
      <Field
        label="Limite de envios por dia"
        name="dailyLimit"
        type="number"
        min={1}
        max={MAX_DAILY_LIMIT}
        required
        defaultValue={settings.dailyLimit}
        hint={`Soma de todas as campanhas. De 1 a ${MAX_DAILY_LIMIT}. Comece baixo: contas novas do WhatsApp têm limites pequenos.`}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          label="Começar a enviar às"
          name="windowStart"
          defaultValue={String(settings.windowStart)}
        >
          {START_HOURS.map((hour) => (
            <option key={hour} value={hour}>
              {pad(hour)}
            </option>
          ))}
        </SelectField>
        <SelectField label="Parar de enviar às" name="windowEnd" defaultValue={String(settings.windowEnd)}>
          {END_HOURS.map((hour) => (
            <option key={hour} value={hour}>
              {hour === 24 ? "24:00 (fim do dia)" : pad(hour)}
            </option>
          ))}
        </SelectField>
      </div>

      <label className="flex items-start gap-3 text-sm text-slate-700">
        <input
          type="checkbox"
          name="weekdaysOnly"
          defaultChecked={settings.weekdaysOnly}
          className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
        />
        <span>
          Enviar só de segunda a sexta
          <span className="block text-xs text-slate-500">Os horários seguem o fuso de São Paulo.</span>
        </span>
      </label>

      <TextAreaField
        label="Frase para sair da lista (obrigatória)"
        name="optOutFooter"
        rows={2}
        required
        maxLength={120}
        defaultValue={settings.optOutFooter}
        hint='Vai no fim de toda mensagem de marketing. Precisa conter a palavra "SAIR". Quem responder SAIR nunca mais recebe.'
      />

      {state?.error && (
        <div role="alert" className="rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
          {state.error}
        </div>
      )}
      {state?.saved && (
        <p role="status" className="rounded-xl bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-700">
          Configurações salvas. Valem para as próximas mensagens (as que já estão na fila mantêm a frase antiga).
        </p>
      )}

      <Button type="submit" disabled={pending}>
        {pending ? "Salvando…" : "Salvar configurações"}
      </Button>
    </form>
  );
}
