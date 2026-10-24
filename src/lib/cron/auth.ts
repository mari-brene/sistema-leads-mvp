import { safeEqual } from "@/lib/security";

/** Tamanho mínimo do CRON_SECRET para a rota aceitar chamadas. */
export const MIN_SECRET_LENGTH = 24;

export type CronAuth = "ok" | "unauthorized" | "disabled";

/**
 * Confere o cabeçalho "Authorization: Bearer <senha>" da chamada do agendador.
 * - "disabled": a senha não está configurada (ou é curta demais): a rota fica DESLIGADA, nunca aberta.
 * - "unauthorized": cabeçalho ausente ou senha errada.
 * A comparação leva o mesmo tempo, esteja a senha certa ou errada.
 */
export function authorizeCron(authorizationHeader: string | null | undefined, secret: string): CronAuth {
  if (secret.length < MIN_SECRET_LENGTH) return "disabled";
  const header = authorizationHeader ?? "";
  const prefix = "Bearer ";
  const token = header.startsWith(prefix) ? header.slice(prefix.length) : "";
  return safeEqual(token, secret) && token.length > 0 ? "ok" : "unauthorized";
}
