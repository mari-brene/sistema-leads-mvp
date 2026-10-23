"use server";

import { revalidatePath } from "next/cache";
import { getLeadsRepository } from "@/lib/leads";
import {
  analyzeImport,
  countRows,
  MAX_IMPORT_BYTES,
  toView,
  type ImportCounts,
  type ImportRowView,
} from "@/lib/leads/import";
import { requireUser } from "@/lib/require-user";

export type PreviewResult =
  | { ok: false; error: string }
  | {
      ok: true;
      rows: ImportRowView[];
      counts: ImportCounts;
      recognized: string[];
      ignored: string[];
    };

export type RunResult =
  | { ok: false; error: string }
  | { ok: true; created: number; rows: ImportRowView[]; counts: ImportCounts };

function validText(text: unknown): text is string {
  return typeof text === "string" && Buffer.byteLength(text, "utf8") <= MAX_IMPORT_BYTES;
}

const TOO_BIG = `O arquivo é grande demais. O limite é ${Math.round(MAX_IMPORT_BYTES / 1024)} KB.`;

/** Passo 1: lê a planilha e mostra o que aconteceria. Não grava nada. */
export async function previewImportAction(text: string): Promise<PreviewResult> {
  const user = await requireUser();
  if (!validText(text)) return { ok: false, error: TOO_BIG };

  const existing = await getLeadsRepository().list(user.id);
  const analysis = analyzeImport(text, existing);
  if (!analysis.ok) return analysis;

  return {
    ok: true,
    rows: analysis.rows.map(toView),
    counts: analysis.counts,
    recognized: analysis.recognized,
    ignored: analysis.ignored,
  };
}

/** Passo 2: depois que a pessoa confirma, lê a planilha de novo e grava só as linhas novas. */
export async function runImportAction(text: string): Promise<RunResult> {
  const user = await requireUser();
  if (!validText(text)) return { ok: false, error: TOO_BIG };

  const repository = getLeadsRepository();
  const existing = await repository.list(user.id);
  const analysis = analyzeImport(text, existing);
  if (!analysis.ok) return analysis;

  const fresh = analysis.rows.filter((row) => row.status === "novo" && row.input);
  if (fresh.length === 0) {
    return { ok: false, error: "Não há nenhuma linha nova para importar." };
  }

  // O repositório confere os telefones de novo na hora de gravar (a base pode ter mudado nesse meio tempo).
  const result = await repository.importMany(
    user.id,
    fresh.map((row) => row.input!),
  );

  for (const skip of result.skipped) {
    const row = fresh[skip.index];
    if (!row) continue;
    row.status = skip.reason.startsWith("Já existe") ? "duplicado_base" : "invalido";
    row.message = skip.reason;
    row.input = null;
  }

  revalidatePath("/kanban");
  revalidatePath("/leads");

  return {
    ok: true,
    created: result.created,
    rows: analysis.rows.map(toView),
    counts: countRows(analysis.rows),
  };
}
