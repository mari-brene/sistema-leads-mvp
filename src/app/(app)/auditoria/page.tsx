import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { readAudit } from "@/lib/audit";
import { formatDateTime } from "@/lib/format";
import { requireUser } from "@/lib/require-user";

export const metadata: Metadata = { title: "Auditoria" };

export default async function AuditPage() {
  const user = await requireUser();
  const { entries, lastCron } = await readAudit(user.id);

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-semibold text-slate-900">Auditoria</h1>
      <p className="mt-1 text-slate-600">O que o agendador automático fez e os erros que aconteceram. Nunca mostra nomes, telefones nem mensagens.</p>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
        <h2 className="text-sm font-semibold text-slate-800">Última chamada do agendador</h2>
        {lastCron ? (
          <p className="mt-1 text-sm text-slate-700">
            <strong>{formatDateTime(lastCron.at)}</strong> · {lastCron.text}
          </p>
        ) : (
          <p className="mt-1 text-sm text-slate-600">
            Ainda não houve nenhuma chamada. O agendador roda a cada 10 minutos, de segunda a sexta, das 9h às 18h, depois de configurado no GitHub (veja o passo a passo da fase 7).
          </p>
        )}
      </section>

      <section className="mt-6">
        <h2 className="text-sm font-semibold text-slate-800">Registros</h2>
        {entries.length === 0 ? (
          <p className="mt-2 rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">
            Nada a registrar ainda. O agendador só anota quando envia mensagens ou quando acontece um erro.
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white shadow-soft">
            {entries.map((entry) => (
              <li key={entry.id} className="flex items-start justify-between gap-3 px-4 py-3">
                <div>
                  <p className="text-sm text-slate-800">{entry.text}</p>
                  <p className="text-xs text-slate-400">{formatDateTime(entry.at)}</p>
                </div>
                <Badge tone={entry.kind === "erro" ? "red" : "sky"}>{entry.kind === "erro" ? "Erro" : "Agendador"}</Badge>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
