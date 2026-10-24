import type { AuditSink, NewEntry } from "@/lib/audit";
import type { CampaignsRepository } from "@/lib/campaigns/repository";
import type { WhatsAppSender } from "@/lib/campaigns/sender";

export type JobSummary = {
  /** Quantas pessoas tinham campanha em andamento. */
  users: number;
  sent: number;
  failed: number;
  skipped: number;
  /** Quantas ficaram esperando (fora do horário, limite do dia atingido...). Isso é normal. */
  waiting: number;
  errors: number;
  simulated: boolean;
};

type Deps = {
  campaigns: Pick<CampaignsRepository, "listActiveUserIds" | "runBatch">;
  sender: WhatsAppSender;
  audit: AuditSink;
};

/** Só o NOME do erro vai para o registro (a mensagem poderia conter detalhes que não queremos guardar). */
function errorLabel(error: unknown): string {
  if (error instanceof Error && error.name === "StorageConflictError") {
    return "Outra operação gravou ao mesmo tempo; o agendador tenta de novo na próxima rodada.";
  }
  return `Erro inesperado no agendador (${error instanceof Error ? error.name : "desconhecido"}).`;
}

/**
 * Roda UM lote de cada pessoa que tem campanha em andamento.
 * As regras de segurança (horário, limite do dia, opt-in, opt-out) são as mesmas do botão
 * "Enviar próximo lote": quem decide é o runBatch, não o agendador.
 */
export async function runCampaignsJob({ campaigns, sender, audit }: Deps): Promise<JobSummary> {
  const summary: JobSummary = { users: 0, sent: 0, failed: 0, skipped: 0, waiting: 0, errors: 0, simulated: sender.simulated };
  const entries: NewEntry[] = [];

  let userIds: string[] = [];
  try {
    userIds = await campaigns.listActiveUserIds();
  } catch (error) {
    summary.errors += 1;
    entries.push({ userId: null, kind: "erro", text: errorLabel(error) });
  }
  summary.users = userIds.length;

  for (const userId of userIds) {
    try {
      const result = await campaigns.runBatch(userId, sender);
      if (!result.ok) {
        summary.waiting += 1;
        continue;
      }
      summary.sent += result.sent;
      summary.failed += result.failed;
      summary.skipped += result.skipped;
      if (result.sent + result.failed + result.skipped > 0) {
        entries.push({
          userId,
          kind: "agendador",
          text: `Lote automático: ${result.sent} enviada(s), ${result.failed} falha(s), ${result.skipped} pulada(s)${result.simulated ? " (simulação)" : ""}.`,
        });
      }
    } catch (error) {
      summary.errors += 1;
      entries.push({ userId, kind: "erro", text: errorLabel(error) });
    }
  }

  const text =
    `${summary.users} pessoa(s) com campanha, ${summary.sent} enviada(s), ${summary.failed} falha(s), ` +
    `${summary.waiting} aguardando${summary.errors ? `, ${summary.errors} erro(s)` : ""}.`;
  try {
    await audit.log(entries, text);
  } catch {
    summary.errors += 1;
  }
  return summary;
}
