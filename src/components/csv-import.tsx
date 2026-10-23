"use client";

import Link from "next/link";
import { useState, useTransition, type ChangeEvent } from "react";
import {
  previewImportAction,
  runImportAction,
  type PreviewResult,
  type RunResult,
} from "@/app/(app)/importar/actions";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button, buttonStyles } from "@/components/ui/button";
import { toCsv } from "@/lib/csv";
import { MAX_IMPORT_BYTES, STATUS_LABEL, type ImportCounts, type ImportRowView, type RowStatus } from "@/lib/leads/import";
import { formatPhone } from "@/lib/phone";

type Preview = Extract<PreviewResult, { ok: true }>;

const TEMPLATE = toCsv([
  ["nome", "empresa", "telefone", "email", "tags", "observacoes", "opt_in", "origem_opt_in"],
  ["Maria Silva", "Padaria Sol", "(47) 99999-1234", "maria@exemplo.com", "vip, indicação", "Pediu orçamento", "sim", "formulario"],
  ["João Souza", "Oficina Central", "(11) 98888-5678", "", "quente", "", "", ""],
]);

const TONE: Record<RowStatus, BadgeTone> = {
  novo: "green",
  duplicado_arquivo: "amber",
  duplicado_base: "amber",
  invalido: "red",
};

function download(fileName: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** Planilhas do Excel em português costumam vir em Windows-1252; as do Google, em UTF-8. */
async function readFileText(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder("windows-1252").decode(buffer);
  }
}

function phoneLabel(row: ImportRowView): string {
  return row.phoneNormalized ? formatPhone(row.phoneNormalized) : row.phone || "—";
}

function problemReport(rows: ImportRowView[]): string {
  const lines = rows.filter((row) => row.status !== "novo" || row.warning);
  return toCsv([
    ["linha", "nome", "telefone", "situacao", "motivo"],
    ...lines.map((row) => [
      String(row.row),
      row.name,
      row.phone,
      STATUS_LABEL[row.status],
      row.message || row.warning,
    ]),
  ]);
}

function CountCard({ label, value, tone }: { label: string; value: number; tone: "green" | "amber" | "red" | "slate" }) {
  const styles = {
    green: "border-emerald-200 bg-emerald-50 text-emerald-800",
    amber: "border-amber-200 bg-amber-50 text-amber-800",
    red: "border-red-200 bg-red-50 text-red-800",
    slate: "border-slate-200 bg-white text-slate-800",
  }[tone];
  return (
    <div className={`rounded-xl border px-4 py-3 ${styles}`}>
      <p className="text-2xl font-semibold">{value}</p>
      <p className="text-xs font-medium">{label}</p>
    </div>
  );
}

function Summary({ counts }: { counts: ImportCounts }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <CountCard label="Linhas lidas" value={counts.total} tone="slate" />
      <CountCard label="Novas" value={counts.novos} tone="green" />
      <CountCard label="Repetidas" value={counts.duplicadosArquivo + counts.duplicadosBase} tone="amber" />
      <CountCard label="Com erro" value={counts.invalidos} tone="red" />
    </div>
  );
}

function RowsTable({ rows, limit }: { rows: ImportRowView[]; limit: number }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
        <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <tr>
            <th scope="col" className="px-3 py-2">Linha</th>
            <th scope="col" className="px-3 py-2">Nome</th>
            <th scope="col" className="px-3 py-2">Telefone</th>
            <th scope="col" className="px-3 py-2">Situação</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.slice(0, limit).map((row) => (
            <tr key={row.row}>
              <td className="px-3 py-2 text-slate-500">{row.row}</td>
              <td className="px-3 py-2 text-slate-900">{row.name || "—"}</td>
              <td className="whitespace-nowrap px-3 py-2 text-slate-600">{phoneLabel(row)}</td>
              <td className="px-3 py-2">
                <Badge tone={TONE[row.status]}>{STATUS_LABEL[row.status]}</Badge>
                {(row.message || row.warning) && (
                  <p className="mt-1 text-xs text-slate-500">{row.message || row.warning}</p>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function CsvImport() {
  const [inputKey, setInputKey] = useState(0);
  const [fileName, setFileName] = useState("");
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [result, setResult] = useState<Extract<RunResult, { ok: true }> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function reset() {
    setInputKey((key) => key + 1);
    setFileName("");
    setText("");
    setPreview(null);
    setResult(null);
    setError(null);
  }

  function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setPreview(null);
    setResult(null);
    setError(null);
    if (!file) return;

    if (file.size > MAX_IMPORT_BYTES) {
      setError(`O arquivo tem ${Math.round(file.size / 1024)} KB. O limite é ${Math.round(MAX_IMPORT_BYTES / 1024)} KB.`);
      return;
    }

    setFileName(file.name);
    startTransition(async () => {
      try {
        const content = await readFileText(file);
        setText(content);
        const response = await previewImportAction(content);
        if (response.ok) setPreview(response);
        else setError(response.error);
      } catch {
        setError("Não consegui ler esse arquivo. Confira se é um CSV e tente de novo.");
      }
    });
  }

  function onImport() {
    setError(null);
    startTransition(async () => {
      try {
        const response = await runImportAction(text);
        if (response.ok) {
          setResult(response);
          setPreview(null);
        } else {
          setError(response.error);
        }
      } catch {
        setError("Não foi possível importar agora. Tente de novo.");
      }
    });
  }

  const problems = (rows: ImportRowView[]) => rows.filter((row) => row.status !== "novo" || row.warning);

  return (
    <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="text-sm font-semibold text-slate-900">Importar uma planilha</h2>
        <Button type="button" variant="outline" onClick={() => download("modelo-leads.csv", TEMPLATE)}>
          Baixar modelo de planilha
        </Button>
      </div>

      {!result && (
        <div className="mt-4">
          <label htmlFor="csv-file" className="block text-sm font-medium text-slate-700">
            1. Escolha o arquivo .csv
          </label>
          <input
            key={inputKey}
            id="csv-file"
            type="file"
            accept=".csv,text/csv"
            onChange={onFile}
            disabled={pending}
            className="mt-2 block w-full text-sm text-slate-700 file:mr-3 file:rounded-xl file:border-0 file:bg-brand-50 file:px-4 file:py-2.5 file:text-sm file:font-medium file:text-brand-700 hover:file:bg-brand-100"
          />
          {fileName && <p className="mt-1 text-xs text-slate-500">Arquivo: {fileName}</p>}
          {pending && !preview && <p className="mt-3 text-sm text-slate-500">Lendo a planilha…</p>}
        </div>
      )}

      {error && (
        <div role="alert" className="mt-4 rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
          {error}
        </div>
      )}

      {preview && !result && (
        <div className="mt-6 space-y-4">
          <p className="text-sm font-medium text-slate-700">2. Confira a prévia</p>
          <Summary counts={preview.counts} />

          <p className="text-xs text-slate-500">
            Colunas reconhecidas: <strong>{preview.recognized.join(", ")}</strong>
            {preview.ignored.length > 0 && <> · Ignoradas: {preview.ignored.join(", ")}</>}
          </p>

          {preview.counts.comOptIn > 0 && (
            <p className="rounded-xl bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-800">
              {preview.counts.comOptIn} {preview.counts.comOptIn === 1 ? "contato entra" : "contatos entram"} com
              autorização (opt-in) registrada. Todos os outros entram sem autorização.
            </p>
          )}

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Primeiras linhas {preview.rows.length > 10 ? `(10 de ${preview.rows.length})` : ""}
            </p>
            <RowsTable rows={preview.rows} limit={10} />
          </div>

          {problems(preview.rows).length > 0 && (
            <div>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Linhas com problema ({problems(preview.rows).length})
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  className="px-3 py-1.5"
                  onClick={() => download("problemas-importacao.csv", problemReport(preview.rows))}
                >
                  Baixar lista de problemas
                </Button>
              </div>
              <RowsTable rows={problems(preview.rows)} limit={20} />
              {problems(preview.rows).length > 20 && (
                <p className="mt-1 text-xs text-slate-500">Mostrando 20. A lista completa está no arquivo para baixar.</p>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3 border-t border-slate-200 pt-4">
            <Button type="button" onClick={onImport} disabled={pending || preview.counts.novos === 0}>
              {pending
                ? "Importando…"
                : `3. Importar ${preview.counts.novos} ${preview.counts.novos === 1 ? "lead" : "leads"}`}
            </Button>
            <Button type="button" variant="ghost" onClick={reset} disabled={pending}>
              Cancelar
            </Button>
            {preview.counts.novos === 0 && (
              <span className="text-sm text-slate-500">Não há nenhuma linha nova para importar.</span>
            )}
          </div>
        </div>
      )}

      {result && (
        <div className="mt-6 space-y-4">
          <p role="status" className="rounded-xl bg-emerald-50 px-3.5 py-3 text-sm font-medium text-emerald-800">
            Importação concluída: {result.created} {result.created === 1 ? "lead criado" : "leads criados"} na etapa
            Novo.
          </p>
          <Summary counts={result.counts} />

          {problems(result.rows).length > 0 && (
            <div>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Relatório: linhas que não entraram ou tiveram aviso ({problems(result.rows).length})
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  className="px-3 py-1.5"
                  onClick={() => download("problemas-importacao.csv", problemReport(result.rows))}
                >
                  Baixar relatório
                </Button>
              </div>
              <RowsTable rows={problems(result.rows)} limit={20} />
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3 border-t border-slate-200 pt-4">
            <Link href="/kanban" className={buttonStyles("primary")}>
              Ver no Kanban
            </Link>
            <Link href="/leads" className={buttonStyles("outline")}>
              Ver a lista de leads
            </Link>
            <Button type="button" variant="ghost" onClick={reset}>
              Importar outro arquivo
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
