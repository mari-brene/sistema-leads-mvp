import { normalizeText } from "./optout";

/**
 * "Cérebro" da IA de SIMULAÇÃO: escolhe, na base de conhecimento, o parágrafo que mais combina
 * com a pergunta. Se nada combina o suficiente, devolve null (e a conversa passa para você).
 */

const STOPWORDS = new Set(
  (
    "a o as os um uma uns umas de do da dos das em no na nos nas por para pra com sem que qual quais como " +
    "onde quando quanto quanta quantos quantas voces vcs voce vc tem ter tenho temos sao ser esta estao " +
    "e ou mas se me te eu nos meu minha seu sua isso isto esse essa este esta aqui la mais muito muita ja " +
    "ao aos pelo pela vai vao fazer faz posso pode podem gostaria queria quero saber favor fica ficam ficar"
  ).split(" "),
);

const GREETINGS = new Set(["oi", "ola", "oie", "bom dia", "boa tarde", "boa noite", "e ai", "eai", "opa", "ola tudo bem", "oi tudo bem"]);

export function isGreeting(message: string): boolean {
  return GREETINGS.has(normalizeText(message));
}

/** Divide a base em trechos: separados por linha em branco (ou, se não houver, uma linha cada). */
export function splitKnowledge(text: string): string[] {
  const clean = text.replace(/\r\n?/g, "\n").trim();
  if (!clean) return [];
  let chunks = clean.split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean);
  if (chunks.length === 1 && chunks[0].includes("\n")) {
    chunks = chunks[0].split("\n").map((part) => part.trim()).filter(Boolean);
  }
  return chunks;
}

function stem(token: string): string {
  return token.length > 3 && token.endsWith("s") ? token.slice(0, -1) : token;
}

export function tokens(text: string): string[] {
  const out = new Set<string>();
  for (const raw of normalizeText(text).split(" ")) {
    if (!raw || STOPWORDS.has(raw)) continue;
    if (raw.length < 3 && !/^\d+$/.test(raw)) continue;
    out.add(stem(raw));
  }
  return [...out];
}

/** Iguais, ou palavras longas que começam igual (atendimento ≈ atendemos). */
function sameWord(a: string, b: string): boolean {
  return a === b || (a.length >= 5 && b.length >= 5 && a.slice(0, 5) === b.slice(0, 5));
}

export type Match = { chunk: string; score: number };

/** Melhor trecho da base para a pergunta, ou null se a base não cobre o assunto. */
export function findAnswer(knowledge: string, question: string): Match | null {
  const wanted = tokens(question);
  if (wanted.length === 0) return null;

  let best: Match | null = null;
  for (const chunk of splitKnowledge(knowledge)) {
    const have = tokens(chunk);
    const score = wanted.filter((token) => have.some((other) => sameWord(token, other))).length;
    if (score > (best?.score ?? 0)) best = { chunk, score };
  }
  if (!best) return null;

  const needed = Math.min(2, wanted.length);
  return best.score >= needed ? best : null;
}
