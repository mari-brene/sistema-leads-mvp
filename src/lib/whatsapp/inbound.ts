import { phoneVariants } from "@/lib/phone";
import type { LeadsRepository } from "@/lib/leads";
import type { InboxRepository } from "@/lib/inbox";
import type { AuditSink } from "@/lib/audit";
import type { InboundMessage } from "./webhook";

export type InboundSummary = {
  received: number;
  replied: number;
  toYou: number;
  optedOut: number;
  duplicates: number;
  unknown: number;
  errors: number;
};

type Deps = {
  leads: LeadsRepository;
  inbox: InboxRepository;
  audit: AuditSink;
  /** Se informado, só leads deste usuário recebem mensagens. */
  ownerId: string;
};

/** Entrega cada mensagem recebida à caixa de entrada do lead certo. Registra só contagens. */
export async function processInbound(deps: Deps, messages: InboundMessage[]): Promise<InboundSummary> {
  const summary: InboundSummary = { received: messages.length, replied: 0, toYou: 0, optedOut: 0, duplicates: 0, unknown: 0, errors: 0 };

  for (const message of messages) {
    try {
      const variants = phoneVariants(`+${message.from}`);
      let matches = await deps.leads.findByPhone(variants);
      if (deps.ownerId) matches = matches.filter((lead) => lead.userId === deps.ownerId);
      // Sem dono definido e o número em mais de uma conta: não dá para saber de quem é. Não adivinha.
      const owners = new Set(matches.map((lead) => lead.userId));
      if (matches.length === 0 || owners.size > 1) {
        summary.unknown += 1;
        continue;
      }
      const lead = [...matches].sort((a, b) => b.lastInteractionAt.localeCompare(a.lastInteractionAt))[0]!;

      const text = message.text ?? `[mensagem sem texto: ${message.type}]`;
      const result = await deps.inbox.receive(lead.userId, lead.id, text, {
        externalId: message.id,
        ...(message.text === null ? { forceHumanReason: "O contato mandou algo que não é texto (foto, áudio, etc.)." } : {}),
      });
      if (!result.ok) {
        summary.errors += 1;
      } else if (result.outcome === "duplicada") {
        summary.duplicates += 1;
      } else if (result.outcome === "ia_respondeu") {
        summary.replied += 1;
      } else if (result.outcome === "saiu") {
        summary.optedOut += 1;
      } else {
        summary.toYou += 1;
      }
    } catch {
      summary.errors += 1;
    }
  }

  if (messages.length > 0) {
    const text =
      `Recebidas ${summary.received}: IA respondeu ${summary.replied}, para você ${summary.toYou}, saíram ${summary.optedOut}, ` +
      `repetidas ${summary.duplicates}, número desconhecido ${summary.unknown}, erros ${summary.errors}.`;
    try {
      await deps.audit.log([{ userId: deps.ownerId || null, kind: summary.errors > 0 ? "erro" : "whatsapp", text }], "");
    } catch {
      // Falha ao anotar na auditoria não pode derrubar o recebimento.
    }
  }
  return summary;
}
