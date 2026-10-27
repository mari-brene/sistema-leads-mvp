import { createHmac } from "node:crypto";
import { safeEqual } from "@/lib/security";

/**
 * Regras puras do webhook do WhatsApp (Meta):
 * - conferir a assinatura de cada chamada (x-hub-signature-256);
 * - responder ao desafio de verificação (GET);
 * - ler as mensagens recebidas do JSON.
 */

export const MIN_VERIFY_TOKEN_LENGTH = 8;

/** Confere "sha256=<hmac>" do corpo BRUTO com o App Secret. Sem segredo ou sem cabeçalho: recusa. */
export function verifySignature(rawBody: string, header: string | null, appSecret: string): boolean {
  if (!appSecret || !header) return false;
  const prefix = "sha256=";
  if (!header.startsWith(prefix)) return false;
  const received = header.slice(prefix.length);
  const expected = createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
  return received.length > 0 && safeEqual(received, expected);
}

/** Desafio do GET: devolve o "hub.challenge" só se o token confere. Senão null. */
export function verifyChallenge(params: URLSearchParams, verifyToken: string): string | null {
  if (verifyToken.length < MIN_VERIFY_TOKEN_LENGTH) return null;
  if (params.get("hub.mode") !== "subscribe") return null;
  const token = params.get("hub.verify_token") ?? "";
  if (!token || !safeEqual(token, verifyToken)) return null;
  const challenge = params.get("hub.challenge");
  return challenge ? challenge : null;
}

export type InboundMessage = {
  /** Número de quem escreveu, só dígitos (ex.: 5547999991234). */
  from: string;
  /** Identificador da mensagem na Meta (wamid...). */
  id: string;
  /** Texto, ou null quando não é texto (foto, áudio, etc.). */
  text: string | null;
  type: string;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Lê as mensagens do JSON da Meta. Ignora o que não for do nosso número ou estiver malformado. */
export function parseInbound(payload: unknown, phoneNumberId: string): InboundMessage[] {
  const result: InboundMessage[] = [];
  if (!isObject(payload) || !Array.isArray(payload.entry)) return result;
  for (const entry of payload.entry) {
    if (!isObject(entry) || !Array.isArray(entry.changes)) continue;
    for (const change of entry.changes) {
      if (!isObject(change) || change.field !== "messages" || !isObject(change.value)) continue;
      const value = change.value;
      const metadata = isObject(value.metadata) ? value.metadata : null;
      if (!phoneNumberId || metadata?.phone_number_id !== phoneNumberId) continue;
      if (!Array.isArray(value.messages)) continue;
      for (const message of value.messages) {
        if (!isObject(message)) continue;
        const { from, id, type } = message;
        if (typeof from !== "string" || !/^\d{8,15}$/.test(from) || typeof id !== "string" || !id) continue;
        const kind = typeof type === "string" ? type : "desconhecido";
        const body = kind === "text" && isObject(message.text) && typeof message.text.body === "string" ? message.text.body : null;
        result.push({ from, id, type: kind, text: body && body.trim() ? body : null });
      }
    }
  }
  return result;
}
