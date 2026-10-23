"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import {
  createCampaignAction,
  previewAudienceAction,
  type AudiencePreview,
  type CampaignFormState,
} from "@/app/(app)/campanhas/actions";
import { Button, buttonStyles } from "@/components/ui/button";
import { Field, SelectField } from "@/components/ui/field";
import { CAMPAIGN_STAGES } from "@/lib/campaigns/audience";
import { stageInfo, type StageId } from "@/lib/leads/types";

type TemplateOption = { id: string; name: string; body: string };

export function CampaignForm({ templates, tags }: { templates: TemplateOption[]; tags: string[] }) {
  const [state, formAction, pending] = useActionState<CampaignFormState, FormData>(createCampaignAction, undefined);
  const [stages, setStages] = useState<string[]>(state?.values?.stages ?? ["novo"]);
  const [tag, setTag] = useState(state?.values?.tag ?? "");
  const [templateId, setTemplateId] = useState(state?.values?.templateId ?? templates[0]?.id ?? "");
  const [preview, setPreview] = useState<AudiencePreview | null>(null);
  const [loading, setLoading] = useState(false);

  // Atualiza a contagem do público sempre que as etapas ou a tag mudam (com uma pequena pausa enquanto digita).
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(() => {
      previewAudienceAction(stages, tag)
        .then((result) => {
          if (!cancelled) setPreview(result);
        })
        .catch(() => {
          if (!cancelled) setPreview(null);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [stages, tag]);

  function toggle(stage: string) {
    setStages((current) => (current.includes(stage) ? current.filter((item) => item !== stage) : [...current, stage]));
  }

  const chosenTemplate = templates.find((template) => template.id === templateId);
  const noAudience = !loading && preview !== null && preview.eligible === 0;

  return (
    <form action={formAction} className="space-y-6">
      <Field
        label="Nome da campanha *"
        name="name"
        type="text"
        required
        maxLength={80}
        autoComplete="off"
        placeholder="Ex.: Oferta de outubro"
        defaultValue={state?.values?.name ?? ""}
      />

      <div>
        <SelectField
          label="Modelo de mensagem *"
          name="templateId"
          value={templateId}
          onChange={(event) => setTemplateId(event.target.value)}
        >
          {templates.map((template) => (
            <option key={template.id} value={template.id}>
              {template.name}
            </option>
          ))}
        </SelectField>
        {chosenTemplate && (
          <p className="mt-2 whitespace-pre-wrap rounded-xl bg-slate-50 px-3.5 py-2.5 text-sm text-slate-600">
            {chosenTemplate.body}
          </p>
        )}
      </div>

      <fieldset>
        <legend className="text-sm font-medium text-slate-700">Quem recebe: etapas do Kanban *</legend>
        <p className="mt-1 text-xs text-slate-500">
          A etapa <strong>Prospecção</strong> não aparece porque nunca recebe campanhas. Dentro das etapas escolhidas,
          só recebe quem tem telefone e autorização (opt-in).
        </p>
        <div className="mt-3 flex flex-wrap gap-3">
          {CAMPAIGN_STAGES.map((stage: StageId) => (
            <label
              key={stage}
              className="flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
            >
              <input
                type="checkbox"
                name="stage"
                value={stage}
                checked={stages.includes(stage)}
                onChange={() => toggle(stage)}
                className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
              />
              {stageInfo(stage).label}
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <Field
          label="Só quem tem a tag (opcional)"
          name="tag"
          type="text"
          list="tags-existentes"
          maxLength={30}
          autoComplete="off"
          placeholder="Ex.: vip"
          value={tag}
          onChange={(event) => setTag(event.target.value)}
          hint={`Deixe vazio para enviar a todos os escolhidos. Uma campanha tem no máximo 200 contatos.`}
        />
        <datalist id="tags-existentes">
          {tags.map((item) => (
            <option key={item} value={item} />
          ))}
        </datalist>
      </div>

      <section
        aria-live="polite"
        className={`rounded-xl border px-4 py-3 text-sm ${
          noAudience ? "border-amber-200 bg-amber-50 text-amber-900" : "border-emerald-200 bg-emerald-50 text-emerald-900"
        }`}
      >
        {loading || !preview ? (
          <p>Conferindo quem pode receber…</p>
        ) : (
          <>
            <p className="font-medium">
              {preview.eligible === 0
                ? "Ninguém pode receber com estas escolhas."
                : `${preview.eligible} ${preview.eligible === 1 ? "contato recebe" : "contatos recebem"} esta campanha.`}
            </p>
            {preview.sample.length > 0 && <p className="mt-1">Por exemplo: {preview.sample.join(", ")}.</p>}
            {(preview.excluded.semOptIn > 0 || preview.excluded.optOut > 0 || preview.excluded.semTelefone > 0) && (
              <p className="mt-1">
                Ficam de fora: {preview.excluded.semOptIn} sem autorização (opt-in), {preview.excluded.optOut} que pediram
                para sair, {preview.excluded.semTelefone} sem telefone.
              </p>
            )}
          </>
        )}
      </section>

      {state?.error && (
        <div role="alert" className="rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
          {state.error}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending || noAudience}>
          {pending ? "Criando…" : "Criar campanha (rascunho)"}
        </Button>
        <Link href="/campanhas" className={buttonStyles("ghost")}>
          Cancelar
        </Link>
        <span className="text-xs text-slate-500">Nada é enviado agora. Você revisa e inicia na próxima tela.</span>
      </div>
    </form>
  );
}
