/**
 * Detecta pedido de saída (SAIR, PARAR, CANCELAR...) em uma mensagem recebida.
 *
 * - "exact": a mensagem INTEIRA é uma palavra de saída → registrar opt-out na hora.
 * - "mention": a mensagem só CONTÉM a palavra no meio de uma frase ("quero cancelar o pedido")
 *   → não dá para ter certeza; passa para você decidir, com um aviso.
 * - null: nada a ver com saída.
 */

export type OptOutSignal = "exact" | "mention" | null;

const EXACT = new Set([
  "sair",
  "parar",
  "pare",
  "cancelar",
  "cancele",
  "stop",
  "descadastrar",
  "descadastre",
  "remover",
  "remova",
]);

const MENTION = ["sair", "parar", "pare", "cancelar", "cancele", "stop", "descadastr", "remov", "nao quero mais receber", "nao quero receber"];

/** minúsculas, sem acentos, sem pontuação nem emojis nas pontas. */
export function normalizeText(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function detectOptOut(message: string): OptOutSignal {
  const text = normalizeText(message);
  if (!text) return null;
  if (EXACT.has(text)) return "exact";

  const padded = ` ${text} `;
  for (const word of MENTION) {
    // palavras terminadas em "r" ou frases: procura inteira; radicais (descadastr, remov) por prefixo.
    const isStem = word === "descadastr" || word === "remov";
    if (isStem ? padded.includes(` ${word}`) : padded.includes(` ${word} `)) return "mention";
  }
  return null;
}
