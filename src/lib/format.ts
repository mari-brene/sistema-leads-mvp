/**
 * Datas sempre no fuso de São Paulo e com o mesmo resultado no servidor e no navegador
 * (isso evita avisos de "hydration" do React).
 */

const TIME_ZONE = "America/Sao_Paulo";

const fullFormat = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: TIME_ZONE,
});

const shortFormat = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: TIME_ZONE,
});

const dateOnlyFormat = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: TIME_ZONE,
});

function parse(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** 08/10/2026 14:32 */
export function formatDateTime(iso: string | null | undefined): string {
  const date = parse(iso);
  return date ? fullFormat.format(date).replace(",", "") : "—";
}

/** 08/10 14:32 */
export function formatShortDateTime(iso: string | null | undefined): string {
  const date = parse(iso);
  return date ? shortFormat.format(date).replace(",", "") : "—";
}

/** 08/10/2026 */
export function formatDate(iso: string | null | undefined): string {
  const date = parse(iso);
  return date ? dateOnlyFormat.format(date) : "—";
}
