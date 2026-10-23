"use client";

import Link from "next/link";
import { useMemo, useState, useTransition, type DragEvent } from "react";
import { moveLeadAction } from "@/app/(app)/leads/actions";
import { ConsentBadge } from "@/components/lead-badges";
import { controlClass } from "@/components/ui/field";
import { formatShortDateTime } from "@/lib/format";
import { columnOf, END_OF_COLUMN, moveLead } from "@/lib/leads/ordering";
import { isStageId, sourceLabel, STAGES, type KanbanLead, type StageId } from "@/lib/leads/types";
import { formatPhone } from "@/lib/phone";
import { cn } from "@/lib/utils";

/**
 * Quadro Kanban. Arrastar e soltar usa o recurso nativo do navegador (sem biblioteca extra).
 * No celular, onde arrastar é difícil, cada cartão tem uma lista "Mover para…".
 */
export function KanbanBoard({ initialLeads }: { initialLeads: KanbanLead[] }) {
  const [leads, setLeads] = useState<KanbanLead[]>(initialLeads);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<StageId | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const columns = useMemo(
    () => STAGES.map((stage) => ({ stage, items: columnOf(leads, stage.id) })),
    [leads],
  );

  /** Move na tela na hora e grava no servidor; se falhar, volta como estava. */
  function commitMove(id: string, stage: StageId, index: number) {
    const current = leads.find((lead) => lead.id === id);
    if (!current) return;

    const others = columnOf(
      leads.filter((lead) => lead.id !== id),
      stage,
    );
    const target = Math.max(0, Math.min(index, others.length));

    // Soltou no mesmo lugar: nada a fazer.
    const currentIndex = columnOf(leads, stage).findIndex((lead) => lead.id === id);
    if (current.stage === stage && currentIndex === target) return;

    const moved = moveLead(leads, id, stage, target);
    if (!moved) return;

    const now = new Date().toISOString();
    const next =
      current.stage === stage
        ? moved
        : moved.map((lead) => (lead.id === id ? { ...lead, lastInteractionAt: now } : lead));

    const previous = leads;
    setLeads(next);
    setMessage(null);

    startTransition(async () => {
      const result = await moveLeadAction(id, stage, target);
      if (!result.ok) {
        setLeads(previous);
        setMessage(result.error ?? "Não foi possível mover o lead. Tente de novo.");
      }
    });
  }

  function endDrag() {
    setDraggingId(null);
    setOverStage(null);
  }

  function onCardDragStart(event: DragEvent<HTMLElement>, id: string) {
    event.dataTransfer.setData("text/plain", id);
    event.dataTransfer.effectAllowed = "move";
    setDraggingId(id);
  }

  function onColumnDragOver(event: DragEvent<HTMLElement>, stage: StageId) {
    if (!draggingId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    if (overStage !== stage) setOverStage(stage);
  }

  function onColumnDrop(event: DragEvent<HTMLElement>, stage: StageId) {
    event.preventDefault();
    const id = draggingId;
    endDrag();
    if (id) commitMove(id, stage, END_OF_COLUMN);
  }

  /** Soltou em cima de um cartão: entra antes dele (metade de cima) ou depois (metade de baixo). */
  function onCardDrop(event: DragEvent<HTMLElement>, target: KanbanLead) {
    event.preventDefault();
    event.stopPropagation();
    const id = draggingId;
    endDrag();
    if (!id || id === target.id) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const after = event.clientY > rect.top + rect.height / 2;
    const column = columnOf(
      leads.filter((lead) => lead.id !== id),
      target.stage,
    );
    const at = column.findIndex((lead) => lead.id === target.id);
    commitMove(id, target.stage, at + (after ? 1 : 0));
  }

  return (
    <div>
      {message && (
        <div
          role="alert"
          className="mb-4 flex items-start justify-between gap-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          <span>{message}</span>
          <button
            type="button"
            onClick={() => setMessage(null)}
            className="shrink-0 font-medium underline"
          >
            Fechar
          </button>
        </div>
      )}

      <div className="flex gap-4 overflow-x-auto pb-4">
        {columns.map(({ stage, items }) => {
          const highlighted = draggingId !== null && overStage === stage.id;
          return (
            <section
              key={stage.id}
              aria-label={stage.label}
              onDragOver={(event) => onColumnDragOver(event, stage.id)}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOverStage(null);
              }}
              onDrop={(event) => onColumnDrop(event, stage.id)}
              className={cn(
                "flex w-72 shrink-0 flex-col rounded-2xl border bg-slate-100/60 p-2 transition",
                highlighted ? "border-brand-500 bg-brand-50/70 ring-2 ring-brand-500/30" : "border-slate-200",
              )}
            >
              <header
                className={cn("flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold", stage.header)}
              >
                <span className={cn("h-2 w-2 rounded-full", stage.dot)} aria-hidden="true" />
                {stage.label}
                <span className="ml-auto text-xs font-medium opacity-70">{items.length}</span>
              </header>

              <ul className="mt-2 flex min-h-24 flex-1 flex-col gap-2">
                {items.map((lead) => (
                  <li key={lead.id}>
                    <article
                      draggable
                      onDragStart={(event) => onCardDragStart(event, lead.id)}
                      onDragEnd={endDrag}
                      onDrop={(event) => onCardDrop(event, lead)}
                      className={cn(
                        "cursor-grab rounded-xl border border-slate-200 bg-white p-3 shadow-soft active:cursor-grabbing",
                        draggingId === lead.id && "opacity-40",
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <Link
                          href={`/leads/${lead.id}`}
                          draggable={false}
                          className="min-w-0 truncate text-sm font-semibold text-slate-900 hover:text-brand-700"
                        >
                          {lead.name}
                        </Link>
                        <ConsentBadge lead={lead} compact />
                      </div>

                      {lead.company && <p className="mt-0.5 truncate text-xs text-slate-500">{lead.company}</p>}

                      <p className="mt-2 text-xs text-slate-600">{formatPhone(lead.phone)}</p>
                      <p className="mt-0.5 truncate text-xs text-slate-400">{sourceLabel(lead.source)}</p>

                      {lead.tags.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {lead.tags.slice(0, 3).map((tag) => (
                            <span key={tag} className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">
                              {tag}
                            </span>
                          ))}
                          {lead.tags.length > 3 && (
                            <span className="text-[11px] text-slate-400">+{lead.tags.length - 3}</span>
                          )}
                        </div>
                      )}

                      <p className="mt-2 text-[11px] text-slate-400">
                        Última interação: {formatShortDateTime(lead.lastInteractionAt)}
                      </p>

                      <select
                        aria-label={`Mover ${lead.name} para outra etapa`}
                        value={lead.stage}
                        onChange={(event) => {
                          const next = event.target.value;
                          if (isStageId(next)) commitMove(lead.id, next, END_OF_COLUMN);
                        }}
                        className={cn(controlClass, "mt-2 px-2 py-1.5 text-xs")}
                      >
                        {STAGES.map((option) => (
                          <option key={option.id} value={option.id}>
                            Mover para: {option.label}
                          </option>
                        ))}
                      </select>
                    </article>
                  </li>
                ))}

                {items.length === 0 && (
                  <li className="rounded-xl border border-dashed border-slate-300 px-3 py-8 text-center text-xs text-slate-400">
                    {draggingId ? "Solte aqui" : "Nenhum lead"}
                  </li>
                )}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
