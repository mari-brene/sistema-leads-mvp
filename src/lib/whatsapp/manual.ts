import type { Lead } from "@/lib/leads/types";

/**
 * Envio MANUAL pelo WhatsApp: o sistema só prepara a mensagem e abre a conversa (link wa.me).
 * Quem aperta "enviar" é a pessoa, no próprio WhatsApp. Não usa a API da Meta.
 */

export const MAX_MANUAL_TEXT = 1500;

/** Link que abre o WhatsApp com a conversa e a mensagem prontas. Null se o telefone não serve. */
export function whatsappLink(phone: string | null, text: string): string | null {
  if (!phone || !/^\+\d{8,15}$/.test(phone)) return null;
  const digits = phone.slice(1);
  const message = text.trim();
  return message ? `https://wa.me/${digits}?text=${encodeURIComponent(message)}` : `https://wa.me/${digits}`;
}

/** A mensagem diz como parar de receber? (precisa ter a palavra SAIR) */
export function hasOptOutPhrase(text: string): boolean {
  return /\bsair\b/i.test(text);
}

type LeadForManual = Pick<Lead, "optIn" | "optOut" | "stage" | "phone">;

/** Motivo para NÃO abrir uma abordagem manual para este lead, ou null se pode. Mesmas regras das campanhas. */
export function manualBlockReason(lead: LeadForManual): string | null {
  if (lead.optOut) return "O contato pediu para sair (opt-out).";
  if (!lead.optIn) return "O contato não tem autorização (opt-in) registrada.";
  if (lead.stage === "prospeccao") return "O lead está na etapa Prospecção, que não recebe mensagens de marketing.";
  if (!lead.phone) return "O lead não tem telefone.";
  return null;
}

/** Confere o pedido de "registrar envio" no servidor. Devolve o erro em português ou null. */
export function validateManualSend(lead: LeadForManual | null | undefined, text: string): string | null {
  if (!lead) return "Lead não encontrado.";
  const blocked = manualBlockReason(lead);
  if (blocked) return blocked;
  if (!text.trim()) return "Escreva a mensagem antes de registrar o envio.";
  if (text.length > MAX_MANUAL_TEXT) return `A mensagem pode ter no máximo ${MAX_MANUAL_TEXT} caracteres.`;
  return null;
}
