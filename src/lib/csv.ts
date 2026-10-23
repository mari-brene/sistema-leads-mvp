/**
 * Leitura e escrita de arquivos CSV (planilhas salvas como "texto separado por vírgula/ponto e vírgula").
 * Funções puras, sem nada do Node, então servem no servidor e no navegador.
 */

export type Delimiter = "," | ";" | "\t";

/** O Excel em português costuma salvar com ";" e o Google Planilhas com ",". Descobre qual foi usado. */
export function detectDelimiter(text: string): Delimiter {
  const counts: Record<Delimiter, number> = { ",": 0, ";": 0, "\t": 0 };
  let inQuotes = false;

  for (const char of text) {
    if (char === '"') inQuotes = !inQuotes;
    else if (!inQuotes && (char === "\n" || char === "\r")) break; // só olha a primeira linha
    else if (!inQuotes && char in counts) counts[char as Delimiter] += 1;
  }

  const order: Delimiter[] = [";", ",", "\t"];
  let best: Delimiter = ",";
  let bestCount = 0;
  for (const delimiter of order) {
    if (counts[delimiter] > bestCount) {
      best = delimiter;
      bestCount = counts[delimiter];
    }
  }
  return best;
}

/**
 * Converte o texto do CSV em linhas de células.
 * Aceita aspas ("texto, com vírgula"), aspas duplas escapadas ("") e quebras de linha dentro de aspas.
 */
export function parseCsv(input: string): string[][] {
  const text = input.replace(/^﻿/, ""); // tira o "BOM" que o Excel coloca no começo
  const delimiter = detectDelimiter(text);

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"' && cell === "") {
      inQuotes = true;
    } else if (char === delimiter) {
      row.push(cell);
      cell = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  // última linha (quando o arquivo não termina com quebra de linha)
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}

/**
 * Evita "injeção de fórmula": se uma célula começa com = + - @, o Excel pode tentar executá-la como fórmula.
 * Colocar um apóstrofo na frente faz o Excel tratar como texto comum.
 */
export function safeCell(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

function quote(value: string, delimiter: Delimiter): string {
  if (value.includes('"') || value.includes("\n") || value.includes("\r") || value.includes(delimiter)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Monta o texto de um CSV para o Excel brasileiro abrir direito:
 * separado por ";" e com BOM (para os acentos aparecerem certos).
 */
export function toCsv(rows: string[][], delimiter: Delimiter = ";"): string {
  const body = rows.map((row) => row.map((cell) => quote(safeCell(cell), delimiter)).join(delimiter)).join("\r\n");
  return `﻿${body}\r\n`;
}
