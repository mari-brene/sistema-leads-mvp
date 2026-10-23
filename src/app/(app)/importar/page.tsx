import type { Metadata } from "next";
import { CsvImport } from "@/components/csv-import";

export const metadata: Metadata = { title: "Importar CSV" };

const COLUMNS = [
  { name: "nome", required: true, help: "Nome do contato. É a única coluna obrigatória." },
  { name: "empresa", required: false, help: "Nome da empresa." },
  { name: "telefone", required: false, help: "Com DDD, do jeito que estiver: (47) 99999-1234, 47999991234…" },
  { name: "email", required: false, help: "E-mail do contato." },
  { name: "tags", required: false, help: "Separe por vírgula: vip, indicação." },
  { name: "observacoes", required: false, help: "Anotações livres." },
  { name: "opt_in", required: false, help: "Escreva sim se a pessoa autorizou receber marketing. Em branco = sem autorização." },
  {
    name: "origem_opt_in",
    required: false,
    help: "Obrigatória quando opt_in é sim: formulario, whatsapp, cliente, presencial ou outro.",
  },
];

export default function ImportPage() {
  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-2xl font-semibold text-slate-900">Importar CSV</h1>
      <p className="mt-1 text-slate-600">
        Traga seus contatos de uma planilha. Você vê uma prévia antes de importar, e nada é gravado até você confirmar.
      </p>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
        <h2 className="text-sm font-semibold text-slate-900">Como preparar a planilha</h2>
        <p className="mt-2 text-sm text-slate-600">
          A <strong>primeira linha</strong> precisa ter os títulos das colunas, escritos como na lista abaixo. A ordem das
          colunas não importa, e colunas que o sistema não conhece são ignoradas. No Excel ou no Google Planilhas, use{" "}
          <strong>Arquivo → Salvar como (ou Fazer download) → CSV</strong>. Até 1.000 linhas por importação.
        </p>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th scope="col" className="py-2 pr-4">Coluna</th>
                <th scope="col" className="py-2">O que vai nela</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {COLUMNS.map((column) => (
                <tr key={column.name}>
                  <td className="whitespace-nowrap py-2 pr-4 font-mono text-xs text-slate-900">
                    {column.name}
                    {column.required && <span className="ml-1 text-red-600">*</span>}
                  </td>
                  <td className="py-2 text-slate-600">{column.help}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-4 rounded-xl bg-amber-50 px-3.5 py-2.5 text-sm text-amber-900">
          <strong>Regra de autorização:</strong> todo contato importado entra <strong>sem autorização</strong> para
          marketing. Só entra com autorização quem tiver <code>opt_in = sim</code> <em>e</em> a origem preenchida. Os
          outros ficam bloqueados para campanhas até você registrar a autorização na página do lead.
        </p>
      </section>

      <CsvImport />
    </div>
  );
}
