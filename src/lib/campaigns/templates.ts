import { MAX_FOOTER, MAX_NAME, MAX_TEMPLATE_BODY } from "./types";

export const TEMPLATE_VARIABLES = ["nome", "empresa"] as const;

const VARIABLE = /\{\{\s*([^{}]*?)\s*\}\}/g;

/** Confere o nome e o texto de um modelo. Devolve o erro em português ou null se está tudo certo. */
export function validateTemplate(name: string, body: string): string | null {
  if (!name.trim()) return "Dê um nome ao modelo, por exemplo: Oferta de outubro.";
  if (name.trim().length > MAX_NAME) return `O nome pode ter no máximo ${MAX_NAME} caracteres.`;
  if (!body.trim()) return "Escreva o texto da mensagem.";
  if (body.trim().length > MAX_TEMPLATE_BODY) {
    return `O texto pode ter no máximo ${MAX_TEMPLATE_BODY} caracteres (o WhatsApp limita o tamanho).`;
  }
  for (const match of body.matchAll(VARIABLE)) {
    const variable = match[1].toLowerCase();
    if (!(TEMPLATE_VARIABLES as readonly string[]).includes(variable)) {
      return `Variável desconhecida: {{${match[1]}}}. Use só {{nome}} ou {{empresa}}.`;
    }
  }
  if (/[{}]/.test(body.replace(VARIABLE, ""))) {
    return "Há chaves { } soltas no texto. Use as chaves só nas variáveis, como {{nome}}.";
  }
  return null;
}

export function validateFooter(footer: string): string | null {
  const text = footer.trim();
  if (!text) return "A frase de saída é obrigatória: toda mensagem de marketing precisa dizer como parar de receber.";
  if (text.length > MAX_FOOTER) return `A frase de saída pode ter no máximo ${MAX_FOOTER} caracteres.`;
  if (!/\bsair\b/i.test(text)) return 'A frase de saída precisa conter a palavra "SAIR", que é o que o contato vai responder.';
  return null;
}

/** Troca {{nome}} pelo primeiro nome do contato e {{empresa}} pela empresa. */
export function renderTemplate(body: string, lead: { name: string; company: string }): string {
  const firstName = lead.name.trim().split(/\s+/)[0] || "tudo bem";
  const company = lead.company.trim() || "sua empresa";
  return body.trim().replace(VARIABLE, (_all, raw: string) => {
    const variable = String(raw).toLowerCase();
    if (variable === "nome") return firstName;
    if (variable === "empresa") return company;
    return "";
  });
}

/** Nome do modelo na Meta: minúsculas, números e "_" (ex.: oferta_outubro). Vazio é aceito (só a simulação funciona sem ele). */
export function validateMetaName(value: string): string | null {
  const name = value.trim();
  if (!name) return null;
  if (!/^[a-z0-9_]{1,200}$/.test(name)) {
    return 'O nome do modelo na Meta só pode ter letras minúsculas sem acento, números e "_" (ex.: oferta_outubro).';
  }
  return null;
}

/** Valor seguro para variável de modelo da Meta: uma linha só, sem excesso de espaços. */
function metaParam(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 60) || "-";
}

/**
 * Valores das variáveis, NA ORDEM em que aparecem no texto.
 * O modelo aprovado na Meta precisa ter o mesmo número de variáveis ({{1}}, {{2}}...) na mesma ordem.
 */
export function templateParams(body: string, lead: { name: string; company: string }): string[] {
  const firstName = lead.name.trim().split(/\s+/)[0] || "tudo bem";
  const company = lead.company.trim() || "sua empresa";
  const params: string[] = [];
  for (const match of body.matchAll(VARIABLE)) {
    const variable = String(match[1]).toLowerCase();
    params.push(metaParam(variable === "nome" ? firstName : variable === "empresa" ? company : ""));
  }
  return params;
}

/** Coloca a frase de saída no fim da mensagem. */
export function withFooter(text: string, footer: string): string {
  return `${text}\n\n${footer.trim()}`;
}
