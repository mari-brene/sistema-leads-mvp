/**
 * Limite diário de buscas (no lugar de um limite de custo: a busca é grátis, mas os servidores
 * públicos do OpenStreetMap pedem que ninguém abuse). O "dia" segue o horário de São Paulo.
 */

export type Usage = { day: string; count: number };

const dayFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** "2026-10-15" no horário de São Paulo. */
export function dayKey(date: Date): string {
  return dayFormat.format(date);
}

/** Quantas buscas já foram feitas hoje (se o registro é de outro dia, conta zero). */
export function usedToday(usage: Usage | undefined, today: string): number {
  return usage && usage.day === today ? usage.count : 0;
}

export function remainingToday(limit: number, usage: Usage | undefined, today: string): number {
  return Math.max(0, limit - usedToday(usage, today));
}
