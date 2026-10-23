import { parseCsv } from "@/lib/csv";
import { normalizePhone } from "@/lib/phone";
import { parseTags } from "./form";
import { CONSENT_SOURCES, type ConsentSourceId, type CreateLeadInput } from "./types";

/**
 * Importação de leads a partir de uma planilha CSV.
 * Tudo aqui é "puro" (não grava nada): só lê a planilha e diz o que daria certo e o que não.
 * Quem grava é o repositório, depois que a pessoa confirma.
 *
 * Regra de conformidade: todo contato importado entra SEM autorização para marketing,
 * a não ser que a planilha traga opt_in = sim E a origem da autorização.
 */

export const MAX_IMPORT_ROWS = 1000;
export const MAX_IMPORT_BYTES = 500 * 1024;

export type RowStatus = "novo" | "duplicado_arquivo" | "duplicado_base" | "invalido";

/** O que a tela precisa saber de cada linha (sem dados que ela não usa). */
export type ImportRowView = {
  /** Número da linha como o Excel mostra (a primeira linha, dos títulos, é a 1). */
  row: number;
  status: RowStatus;
  /** Por que a linha não vai ser importada. */
  message: string;
  /** Aviso: a linha é importada, mas com uma ressalva (ex.: opt-in ignorado). */
  warning: string;
  name: string;
  phone: string;
  /** Telefone que seria guardado (formato internacional) ou "". */
  phoneNormalized: string;
};

export type ImportRow = ImportRowView & { input: CreateLeadInput | null };

export type ImportCounts = {
  total: number;
  novos: number;
  duplicadosArquivo: number;
  duplicadosBase: number;
  invalidos: number;
  /** Linhas novas com aviso (importadas sem opt-in). */
  comAviso: number;
  /** Linhas novas que entram COM autorização registrada. */
  comOptIn: number;
};

export type ImportAnalysis =
  | { ok: false; error: string }
  | {
      ok: true;
      rows: ImportRow[];
      counts: ImportCounts;
      /** Títulos de coluna reconhecidos, ex.: ["nome", "telefone"]. */
      recognized: string[];
      /** Títulos que o sistema não conhece e vai ignorar. */
      ignored: string[];
    };

type Field = "name" | "company" | "phone" | "email" | "tags" | "notes" | "optIn" | "optInSource";

const ALIASES: Record<Field, string[]> = {
  name: ["nome", "name", "nome_completo", "contato", "cliente", "lead"],
  company: ["empresa", "company", "razao_social", "negocio"],
  phone: ["telefone", "celular", "whatsapp", "fone", "phone", "tel", "telefone_whatsapp", "numero"],
  email: ["email", "e_mail"],
  tags: ["tags", "tag", "etiquetas", "etiqueta"],
  notes: ["observacoes", "observacao", "obs", "notas", "nota", "notes", "anotacoes"],
  optIn: ["opt_in", "optin", "autorizou", "autorizacao", "aceita_marketing", "aceita_mensagens"],
  optInSource: [
    "origem_opt_in",
    "origem_optin",
    "origem_autorizacao",
    "origem_da_autorizacao",
    "fonte_opt_in",
    "origem_do_opt_in",
  ],
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const YES = new Set(["sim", "s", "1", "true", "yes", "y", "x", "verdadeiro"]);

/** Tira acento, deixa minúsculo e troca símbolos por "_": "Origem do Opt-in" vira "origem_do_opt_in". */
export function normalizeHeader(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function findField(header: string): Field | null {
  const key = normalizeHeader(header);
  if (!key) return null;
  for (const field of Object.keys(ALIASES) as Field[]) {
    if (ALIASES[field].includes(key)) return field;
  }
  return null;
}

/** Entende "formulario", "Preencheu formulário / site", "já é cliente"... Devolve o id ou null. */
export function parseConsentSource(value: string): ConsentSourceId | null {
  const key = normalizeHeader(value);
  if (!key) return null;
  for (const source of CONSENT_SOURCES) {
    if (key === normalizeHeader(source.id) || key === normalizeHeader(source.label)) return source.id;
  }
  if (key.includes("formulario") || key.includes("site")) return "formulario";
  if (key.includes("whatsapp")) return "whatsapp";
  if (key.includes("cliente")) return "cliente";
  if (key.includes("presencial") || key.includes("evento")) return "presencial";
  return null;
}

export const CONSENT_SOURCE_HELP = CONSENT_SOURCES.map((source) => source.id).join(", ");

function isBlankRow(cells: string[]): boolean {
  return cells.every((cell) => cell.trim() === "");
}

/**
 * Lê a planilha e classifica cada linha.
 * `existing` são os leads que a pessoa já tem (para achar telefones repetidos).
 */
export function analyzeImport(text: string, existing: Array<{ phone: string | null; name: string }>): ImportAnalysis {
  if (!text.trim()) return { ok: false, error: "O arquivo está vazio." };

  const table = parseCsv(text);
  if (table.length === 0) return { ok: false, error: "O arquivo está vazio." };

  // ---- títulos das colunas
  const fieldColumn = new Map<Field, number>();
  const recognized: string[] = [];
  const ignored: string[] = [];

  table[0].forEach((cell, index) => {
    const label = cell.trim();
    if (!label) return;
    const field = findField(label);
    if (field && !fieldColumn.has(field)) {
      fieldColumn.set(field, index);
      recognized.push(label);
    } else {
      ignored.push(label);
    }
  });

  if (!fieldColumn.has("name")) {
    return {
      ok: false,
      error:
        "Não encontrei a coluna do nome. A primeira linha da planilha precisa ter os títulos das colunas, " +
        'e uma delas deve se chamar "nome". Baixe o modelo de planilha para ver o formato.',
    };
  }

  const dataRows = table
    .slice(1)
    .map((cells, i) => ({ cells, row: i + 2 }))
    .filter((r) => !isBlankRow(r.cells));

  if (dataRows.length === 0) {
    return { ok: false, error: "A planilha tem os títulos, mas nenhuma linha de contatos." };
  }
  if (dataRows.length > MAX_IMPORT_ROWS) {
    return {
      ok: false,
      error: `A planilha tem ${dataRows.length} linhas. O limite é ${MAX_IMPORT_ROWS} por importação: divida em partes menores.`,
    };
  }

  const cellOf = (cells: string[], field: Field): string => {
    const index = fieldColumn.get(field);
    return index === undefined ? "" : (cells[index] ?? "").trim();
  };

  const basePhones = new Map<string, string>();
  for (const lead of existing) if (lead.phone) basePhones.set(lead.phone, lead.name);

  const filePhones = new Map<string, number>();
  const rows: ImportRow[] = [];

  for (const { cells, row } of dataRows) {
    const name = cellOf(cells, "name").slice(0, 120);
    const phoneRaw = cellOf(cells, "phone").slice(0, 40);
    const base: ImportRowView = {
      row,
      status: "invalido",
      message: "",
      warning: "",
      name,
      phone: phoneRaw,
      phoneNormalized: "",
    };
    const reject = (status: RowStatus, message: string): void => {
      rows.push({ ...base, status, message, input: null });
    };

    if (!name) {
      reject("invalido", "Falta o nome.");
      continue;
    }

    const phone = phoneRaw ? normalizePhone(phoneRaw) : null;
    if (phoneRaw && !phone) {
      reject("invalido", "Telefone inválido. Use DDD + número, por exemplo (47) 99999-1234.");
      continue;
    }
    base.phoneNormalized = phone ?? "";

    const email = cellOf(cells, "email").slice(0, 160);
    if (email && !EMAIL_PATTERN.test(email)) {
      reject("invalido", "E-mail inválido.");
      continue;
    }

    if (phone) {
      const baseName = basePhones.get(phone);
      if (baseName !== undefined) {
        reject("duplicado_base", `Já existe na sua base: ${baseName}.`);
        continue;
      }
      const firstRow = filePhones.get(phone);
      if (firstRow !== undefined) {
        reject("duplicado_arquivo", `Telefone repetido na planilha (já aparece na linha ${firstRow}).`);
        continue;
      }
      filePhones.set(phone, row);
    }

    // ---- autorização (opt-in): só vale com telefone E origem reconhecida
    let optIn = false;
    let optInSource: ConsentSourceId | null = null;
    let warning = "";

    if (YES.has(normalizeHeader(cellOf(cells, "optIn")))) {
      const source = parseConsentSource(cellOf(cells, "optInSource"));
      if (!phone) {
        warning = "Opt-in ignorado: sem telefone. Importado sem autorização.";
      } else if (!source) {
        warning = `Opt-in ignorado: faltou a origem da autorização (${CONSENT_SOURCE_HELP}). Importado sem autorização.`;
      } else {
        optIn = true;
        optInSource = source;
      }
    }

    const input: CreateLeadInput = {
      name,
      company: cellOf(cells, "company").slice(0, 120),
      phone,
      email,
      source: "csv",
      tags: parseTags(cellOf(cells, "tags").slice(0, 400)),
      notes: cellOf(cells, "notes").slice(0, 2000),
      stage: "novo",
      optIn,
      optInSource,
    };

    rows.push({ ...base, status: "novo", warning, input });
  }

  return { ok: true, rows, counts: countRows(rows), recognized, ignored };
}

export function countRows(rows: Array<Pick<ImportRow, "status" | "warning"> & { input?: CreateLeadInput | null }>): ImportCounts {
  const counts: ImportCounts = {
    total: 0,
    novos: 0,
    duplicadosArquivo: 0,
    duplicadosBase: 0,
    invalidos: 0,
    comAviso: 0,
    comOptIn: 0,
  };
  for (const row of rows) {
    counts.total += 1;
    if (row.status === "novo") {
      counts.novos += 1;
      if (row.warning) counts.comAviso += 1;
      if (row.input?.optIn) counts.comOptIn += 1;
    } else if (row.status === "duplicado_arquivo") counts.duplicadosArquivo += 1;
    else if (row.status === "duplicado_base") counts.duplicadosBase += 1;
    else counts.invalidos += 1;
  }
  return counts;
}

/** Versão leve da linha, para mandar ao navegador (sem o objeto completo do lead). */
export function toView(row: ImportRow): ImportRowView {
  return {
    row: row.row,
    status: row.status,
    message: row.message,
    warning: row.warning,
    name: row.name,
    phone: row.phone,
    phoneNormalized: row.phoneNormalized,
  };
}

export const STATUS_LABEL: Record<RowStatus, string> = {
  novo: "Será importado",
  duplicado_arquivo: "Repetido na planilha",
  duplicado_base: "Já existe na base",
  invalido: "Dados inválidos",
};
