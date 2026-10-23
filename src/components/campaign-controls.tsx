"use client";

import { useState, useTransition } from "react";
import {
  controlCampaignAction,
  deleteCampaignAction,
  runBatchAction,
  type BatchActionResult,
} from "@/app/(app)/campanhas/actions";
import { Button } from "@/components/ui/button";
import type { CampaignStatus } from "@/lib/campaigns/types";

/** Botões da campanha: iniciar, pausar, retomar, cancelar, excluir rascunho e enviar o próximo lote. */
export function CampaignControls({ id, status, queued }: { id: string; status: CampaignStatus; queued: number }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [batch, setBatch] = useState<Extract<BatchActionResult, { ok: true }> | null>(null);

  function control(action: "start" | "pause" | "cancel") {
    if (action === "cancel" && !window.confirm("Cancelar a campanha? As mensagens que ainda estão na fila não serão enviadas.")) {
      return;
    }
    setError(null);
    setBatch(null);
    startTransition(async () => {
      const result = await controlCampaignAction(id, action);
      if (!result.ok) setError(result.error ?? "Não foi possível fazer isso agora.");
    });
  }

  function sendBatch() {
    setError(null);
    setBatch(null);
    startTransition(async () => {
      try {
        const result = await runBatchAction();
        if (result.ok) setBatch(result);
        else setError(result.error);
      } catch {
        setError("Não foi possível enviar agora. Tente de novo.");
      }
    });
  }

  const finished = status === "concluida" || status === "cancelada";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        {status === "rascunho" && (
          <Button type="button" onClick={() => control("start")} disabled={pending}>
            Iniciar campanha
          </Button>
        )}
        {status === "pausada" && (
          <Button type="button" onClick={() => control("start")} disabled={pending}>
            Retomar campanha
          </Button>
        )}
        {status === "em_andamento" && (
          <>
            <Button type="button" onClick={sendBatch} disabled={pending || queued === 0}>
              {pending ? "Enviando…" : "Enviar próximo lote"}
            </Button>
            <Button type="button" variant="outline" onClick={() => control("pause")} disabled={pending}>
              Pausar
            </Button>
          </>
        )}
        {(status === "em_andamento" || status === "pausada") && (
          <Button type="button" variant="danger" onClick={() => control("cancel")} disabled={pending}>
            Cancelar campanha
          </Button>
        )}
        {status === "rascunho" && (
          <form
            action={deleteCampaignAction}
            onSubmit={(event) => {
              if (!window.confirm("Excluir este rascunho?")) event.preventDefault();
            }}
          >
            <input type="hidden" name="id" value={id} />
            <Button type="submit" variant="ghost" disabled={pending}>
              Excluir rascunho
            </Button>
          </form>
        )}
        {finished && <span className="text-sm text-slate-500">Esta campanha terminou. O registro fica guardado.</span>}
      </div>

      {status === "rascunho" && (
        <p className="text-xs text-slate-500">
          Ao iniciar, nada é enviado sozinho: você clica em <strong>Enviar próximo lote</strong> (até 10 mensagens por vez).
          Mais para frente isso passa a ser automático.
        </p>
      )}

      {error && (
        <div role="alert" className="rounded-xl bg-amber-50 px-3.5 py-2.5 text-sm text-amber-900">
          {error}
        </div>
      )}

      {batch && (
        <div role="status" className="rounded-xl bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-800">
          <p className="font-medium">
            Lote processado{batch.simulated ? " (simulação: nada foi enviado de verdade)" : ""}: {batch.sent}{" "}
            {batch.sent === 1 ? "enviada" : "enviadas"}, {batch.failed} {batch.failed === 1 ? "falha" : "falhas"},{" "}
            {batch.skipped} {batch.skipped === 1 ? "pulada" : "puladas"}.
          </p>
          <p className="mt-1">
            Restam {batch.queuedLeft} na fila e {batch.remainingToday} envios hoje.
          </p>
        </div>
      )}
    </div>
  );
}
