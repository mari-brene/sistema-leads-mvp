import type { AuditSink } from "@/lib/audit";
import type { InboxRepository } from "@/lib/inbox";
import type { LeadsRepository } from "@/lib/leads";
import { processInbound, type InboundSummary } from "./inbound";
import type { InboundForNumber } from "./webhook";

type Deps = {
  leads: LeadsRepository;
  inbox: InboxRepository;
  audit: AuditSink;
  /** Descobre de qual cliente é o número que recebeu a mensagem (null = número desconhecido). */
  clientForNumber: (phoneNumberId: string) => Promise<string | null>;
};

/** Entrega cada mensagem ao cliente dono do número que a recebeu. Número desconhecido é ignorado. */
export async function routeInbound(deps: Deps, messages: InboundForNumber[]): Promise<InboundSummary & { ignored: number }> {
  const byNumber = new Map<string, InboundForNumber[]>();
  for (const message of messages) byNumber.set(message.phoneNumberId, [...(byNumber.get(message.phoneNumberId) ?? []), message]);

  const total: InboundSummary & { ignored: number } = { received: 0, replied: 0, toYou: 0, optedOut: 0, duplicates: 0, unknown: 0, errors: 0, ignored: 0 };
  for (const [numberId, group] of byNumber) {
    let clientId: string | null = null;
    try {
      clientId = await deps.clientForNumber(numberId);
    } catch {
      total.errors += group.length;
      continue;
    }
    if (!clientId) {
      total.ignored += group.length;
      continue;
    }
    const summary = await processInbound({ leads: deps.leads, inbox: deps.inbox, audit: deps.audit, ownerId: clientId }, group.map(({ phoneNumberId: _n, ...message }) => message));
    total.received += summary.received;
    total.replied += summary.replied;
    total.toYou += summary.toYou;
    total.optedOut += summary.optedOut;
    total.duplicates += summary.duplicates;
    total.unknown += summary.unknown;
    total.errors += summary.errors;
  }
  return total;
}
