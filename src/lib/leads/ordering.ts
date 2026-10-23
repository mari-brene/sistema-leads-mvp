import type { StageId } from "./types";

type Positioned = { id: string; stage: StageId; position: number };

/** Use como posição para "colocar no fim da coluna". */
export const END_OF_COLUMN = 1_000_000;

/** Leads de uma coluna, do topo para baixo. */
export function columnOf<T extends Positioned>(leads: T[], stage: StageId): T[] {
  return leads
    .filter((lead) => lead.stage === stage)
    .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
}

/**
 * Move um lead para uma coluna e uma posição (0 = topo).
 * `index` conta as posições da coluna de destino SEM o lead que está sendo movido
 * e é limitado ao tamanho da coluna (use um número grande para "no fim").
 * Devolve uma lista nova, com as posições de cada coluna renumeradas (0, 1, 2...),
 * ou null se o lead não existir.
 */
export function moveLead<T extends Positioned>(
  leads: T[],
  id: string,
  stage: StageId,
  index: number,
): T[] | null {
  const moving = leads.find((lead) => lead.id === id);
  if (!moving) return null;

  const sourceStage = moving.stage;
  const target = columnOf(
    leads.filter((lead) => lead.id !== id),
    stage,
  );

  const at = Math.max(0, Math.min(Number.isFinite(index) ? Math.trunc(index) : target.length, target.length));
  const newTarget = [...target.slice(0, at), { ...moving, stage }, ...target.slice(at)];

  const updates = new Map<string, T>();
  newTarget.forEach((lead, position) => updates.set(lead.id, { ...lead, position }));

  if (sourceStage !== stage) {
    columnOf(
      leads.filter((lead) => lead.id !== id),
      sourceStage,
    ).forEach((lead, position) => updates.set(lead.id, { ...lead, position }));
  }

  return leads.map((lead) => updates.get(lead.id) ?? lead);
}

/** Renumera as posições de uma coluna (0, 1, 2...) depois de remover um lead. */
export function renumberColumn<T extends Positioned>(leads: T[], stage: StageId): T[] {
  const updates = new Map<string, T>();
  columnOf(leads, stage).forEach((lead, position) => updates.set(lead.id, { ...lead, position }));
  return leads.map((lead) => updates.get(lead.id) ?? lead);
}
