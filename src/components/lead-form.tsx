"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  createLeadAction,
  updateLeadAction,
  type LeadFormState,
} from "@/app/(app)/leads/actions";
import { Button, buttonStyles } from "@/components/ui/button";
import { Field, SelectField, TextAreaField } from "@/components/ui/field";
import { formatPhone } from "@/lib/phone";
import { CONSENT_SOURCES, SOURCES, STAGES, type Lead } from "@/lib/leads/types";

type LeadFormProps = { mode: "create" } | { mode: "edit"; lead: Lead };

/** Formulário usado para criar um lead novo e para editar os dados de um lead existente. */
export function LeadForm(props: LeadFormProps) {
  const lead = props.mode === "edit" ? props.lead : undefined;
  const [state, formAction, pending] = useActionState<LeadFormState, FormData>(
    props.mode === "create" ? createLeadAction : updateLeadAction,
    undefined,
  );

  // Se deu erro, mostra o que a pessoa tinha digitado; senão, os dados do lead (ou vazio).
  const value = (name: string, fallback = "") => state?.values?.[name] ?? fallback;

  return (
    <form action={formAction} className="space-y-5">
      {lead && <input type="hidden" name="id" value={lead.id} />}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Nome *"
          name="name"
          type="text"
          required
          maxLength={120}
          autoComplete="off"
          placeholder="Ex.: Maria Silva"
          defaultValue={value("name", lead?.name)}
        />
        <Field
          label="Empresa"
          name="company"
          type="text"
          maxLength={120}
          autoComplete="off"
          placeholder="Ex.: Padaria Sol"
          defaultValue={value("company", lead?.company)}
        />
        <Field
          label="Telefone (WhatsApp)"
          name="phone"
          type="tel"
          autoComplete="off"
          placeholder="(47) 99999-1234"
          hint={
            lead
              ? "Se você trocar o telefone, a autorização de marketing é removida e precisa ser registrada de novo."
              : "Com DDD. O sistema guarda no formato internacional e avisa se o número já existir."
          }
          defaultValue={value("phone", lead?.phone ? formatPhone(lead.phone) : "")}
        />
        <Field
          label="E-mail"
          name="email"
          type="email"
          autoComplete="off"
          placeholder="maria@exemplo.com"
          defaultValue={value("email", lead?.email)}
        />
        <SelectField
          label="Origem"
          name="source"
          hint="Leads de “Prospecção” entram sempre na etapa Prospecção e nunca recebem campanhas automáticas."
          defaultValue={value("source", lead?.source ?? "manual")}
        >
          {SOURCES.map((source) => (
            <option key={source.id} value={source.id}>
              {source.label}
            </option>
          ))}
        </SelectField>
        {props.mode === "create" && (
          <SelectField label="Etapa inicial" name="stage" defaultValue={value("stage", "novo")}>
            {STAGES.map((stage) => (
              <option key={stage.id} value={stage.id}>
                {stage.label}
              </option>
            ))}
          </SelectField>
        )}
      </div>

      <Field
        label="Tags"
        name="tags"
        type="text"
        autoComplete="off"
        placeholder="vip, indicação, quente"
        hint="Separe por vírgula. Até 10 tags."
        defaultValue={value("tags", lead?.tags.join(", "))}
      />

      <TextAreaField
        label="Observações"
        name="notes"
        rows={4}
        maxLength={2000}
        placeholder="Anotações gerais sobre este lead"
        defaultValue={value("notes", lead?.notes)}
      />

      {props.mode === "create" && (
        <fieldset className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <legend className="px-1 text-sm font-medium text-slate-700">Autorização para marketing (opt-in)</legend>
          <label className="flex items-start gap-3 text-sm text-slate-700">
            <input
              type="checkbox"
              name="optIn"
              defaultChecked={value("optIn") === "on"}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            />
            <span>
              Esta pessoa <strong>autorizou</strong> receber mensagens de marketing.
              <span className="block text-xs text-slate-500">
                Marque só se você tem esse registro. Sem autorização, o contato fica bloqueado para campanhas.
              </span>
            </span>
          </label>
          <SelectField
            label="De onde veio a autorização?"
            name="optInSource"
            defaultValue={value("optInSource", "")}
            hint="Obrigatório quando a caixa acima está marcada. A data é registrada automaticamente."
          >
            <option value="">Escolha…</option>
            {CONSENT_SOURCES.map((source) => (
              <option key={source.id} value={source.id}>
                {source.label}
              </option>
            ))}
          </SelectField>
        </fieldset>
      )}

      {state?.error && (
        <div role="alert" className="rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
          {state.error}
          {state.duplicateId && (
            <>
              {" "}
              <Link href={`/leads/${state.duplicateId}`} className="font-medium underline">
                Abrir o lead que já existe
              </Link>
            </>
          )}
        </div>
      )}

      {state?.saved && (
        <p role="status" className="rounded-xl bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-700">
          Alterações salvas.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Salvando…" : props.mode === "create" ? "Criar lead" : "Salvar alterações"}
        </Button>
        {props.mode === "create" && (
          <Link href="/kanban" className={buttonStyles("ghost")}>
            Cancelar
          </Link>
        )}
      </div>
    </form>
  );
}
