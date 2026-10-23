import type { Lead } from "./types";

type ConsentFields = Pick<Lead, "optIn" | "optOut" | "phone">;

export type ConsentStatus = "autorizado" | "sem_autorizacao" | "saiu";

/** Situação do contato em relação a receber marketing. */
export function consentStatus(lead: Pick<Lead, "optIn" | "optOut">): ConsentStatus {
  if (lead.optOut) return "saiu";
  if (lead.optIn) return "autorizado";
  return "sem_autorizacao";
}

/**
 * Regra de conformidade central: só dá para enviar marketing se a pessoa autorizou (opt-in),
 * não pediu para sair (opt-out) e existe um telefone válido.
 */
export function canReceiveMarketing(lead: ConsentFields): boolean {
  return lead.optIn && !lead.optOut && Boolean(lead.phone);
}
