import type { Settings } from "./types";

/** Datas e horas sempre no fuso de São Paulo, não importa onde o servidor esteja. */

const parts = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  weekday: "short",
  hourCycle: "h23",
});

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export type LocalTime = { day: string; hour: number; weekday: number };

/** Ex.: { day: "2026-10-16", hour: 15, weekday: 5 } (0 = domingo). */
export function localTime(date: Date): LocalTime {
  const map: Record<string, string> = {};
  for (const part of parts.formatToParts(date)) map[part.type] = part.value;
  return {
    day: `${map.year}-${map.month}-${map.day}`,
    hour: Number(map.hour) % 24,
    weekday: WEEKDAYS[map.weekday] ?? 0,
  };
}

const pad = (hour: number) => `${String(hour).padStart(2, "0")}:00`;

export function describeWindow(settings: Settings): string {
  const days = settings.weekdaysOnly ? "segunda a sexta" : "todos os dias";
  return `${pad(settings.windowStart)} às ${pad(settings.windowEnd === 24 ? 0 : settings.windowEnd)}, ${days}`;
}

/** Pode enviar agora? Se não, diz o motivo. */
export function checkWindow(settings: Settings, date: Date): { open: true } | { open: false; reason: string } {
  const now = localTime(date);
  if (settings.weekdaysOnly && (now.weekday === 0 || now.weekday === 6)) {
    return { open: false, reason: `Hoje é fim de semana. Os envios acontecem ${describeWindow(settings)}.` };
  }
  if (now.hour < settings.windowStart || now.hour >= settings.windowEnd) {
    return { open: false, reason: `Fora do horário de envio (${describeWindow(settings)}).` };
  }
  return { open: true };
}
