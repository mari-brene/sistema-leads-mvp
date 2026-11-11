"use client";

import { useActionState, useState } from "react";
import { recordManualSendAction, type ManualSendState } from "@/app/(app)/leads/actions";
import { Button, buttonStyles } from "@/components/ui/button";
import { controlClass } from "@/components/ui/field";
import { renderTemplate, withFooter } from "@/lib/campaigns/templates";
import { hasOptOutPhrase, MAX_MANUAL_TEXT, whatsappLink } from "@/lib/whatsapp/manual";

type Props = {
  leadId: string;
  leadName: string;
  company: string;
  phone: string | null;
  /** Se não for null, o envio está bloqueado e este é o motivo. */
  blockReason: string | null;
  templates: { id: string; name: string; body: string }[];
  footer: string;
};

/** Prepara a mensagem, abre o WhatsApp e, depois que a pessoa enviou, registra no histórico. */
export function ManualWhatsApp({ leadId, leadName, company, phone, blockReason, templates, footer }: Props) {
  const lead = { name: leadName, company };
  const build = (body: string) => withFooter(renderTemplate(body, lead), footer);

  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [text, setText] = useState(templates[0] ? build(templates[0].body) : "");
  const [state, formAction, pending] = useActionState<ManualSendState, FormData>(recordManualSendAction, undefined);

  if (blockReason) {
    return (
      <p className="text-sm text-slate-600">
        Envio bloqueado: {blockReason} Por regra do sistema, só se manda mensagem de marketing para quem autorizou.
      </p>
    );
  }

  const link = whatsappLink(phone, text);

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">
        O sistema prepara a mensagem e abre a conversa no seu WhatsApp. Quem aperta <strong>enviar</strong> é você.
        Funciona sem a API da Meta.
      </p>

      <div>
        <label htmlFor="manual-template" className="mb-1 block text-sm font-medium text-slate-700">
          Modelo
        </label>
        <select
          id="manual-template"
          value={templateId}
          onChange={(event) => {
            const next = event.target.value;
            setTemplateId(next);
            const found = templates.find((item) => item.id === next);
            setText(found ? build(found.body) : "");
          }}
          className={controlClass}
        >
          {templates.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
          <option value="">Escrever do zero</option>
        </select>
        {templates.length === 0 && (
          <p className="mt-1 text-xs text-slate-500">Você ainda não tem modelos. Crie em Campanhas → Modelos, ou escreva abaixo.</p>
        )}
      </div>

      <div>
        <label htmlFor="manual-text" className="mb-1 block text-sm font-medium text-slate-700">
          Mensagem (você pode editar)
        </label>
        <textarea
          id="manual-text"
          rows={6}
          maxLength={MAX_MANUAL_TEXT}
          value={text}
          onChange={(event) => setText(event.target.value)}
          className={controlClass}
        />
        {text.trim() && !hasOptOutPhrase(text) && (
          <p role="alert" className="mt-1 text-xs text-amber-700">
            Falta a frase de saída. Toda mensagem de marketing precisa dizer como parar de receber (a palavra SAIR).
          </p>
        )}
      </div>

      {link && text.trim() ? (
        <a href={link} target="_blank" rel="noopener noreferrer" className={buttonStyles("primary", "w-full")}>
          Abrir no WhatsApp
        </a>
      ) : (
        <p className="text-xs text-slate-500">Escreva a mensagem para liberar o botão.</p>
      )}

      <form action={formAction} className="space-y-2 border-t border-slate-200 pt-3">
        <input type="hidden" name="id" value={leadId} />
        <input type="hidden" name="text" value={text} />
        <p className="text-xs text-slate-500">
          Depois de enviar no WhatsApp, registre aqui para o histórico e o funil ficarem certos.
        </p>
        {state?.error && (
          <p role="alert" className="text-sm text-red-700">
            {state.error}
          </p>
        )}
        {state?.done && <p className="text-sm text-emerald-700">Envio registrado no histórico.</p>}
        <Button type="submit" variant="outline" disabled={pending || !text.trim()}>
          {pending ? "Registrando…" : "Registrar que enviei"}
        </Button>
      </form>

      <p className="text-xs text-slate-500">
        O limite diário e o horário das campanhas não valem para o envio manual. Vá com calma: muitas mensagens iguais
        em sequência podem fazer o WhatsApp bloquear o seu número.
      </p>
    </div>
  );
}
