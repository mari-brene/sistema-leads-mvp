import { Badge, type BadgeTone } from "@/components/ui/badge";
import { consentStatus, type ConsentStatus } from "@/lib/leads/consent";
import { stageInfo, type Lead, type StageId } from "@/lib/leads/types";
import { cn } from "@/lib/utils";

/** Etapa do funil, com a mesma cor das colunas do Kanban. */
export function StageBadge({ stage }: { stage: StageId }) {
  const info = stageInfo(stage);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold",
        info.header,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", info.dot)} aria-hidden="true" />
      {info.label}
    </span>
  );
}

const CONSENT_VIEW: Record<
  ConsentStatus,
  { tone: BadgeTone; full: string; compact: string; title: string }
> = {
  autorizado: {
    tone: "green",
    full: "Autorizado (opt-in)",
    compact: "Opt-in",
    title: "Autorizou receber mensagens de marketing",
  },
  sem_autorizacao: {
    tone: "slate",
    full: "Sem autorização",
    compact: "Sem opt-in",
    title: "Sem autorização registrada: bloqueado para campanhas de marketing",
  },
  saiu: {
    tone: "red",
    full: "Saiu (opt-out)",
    compact: "Opt-out",
    title: "Pediu para sair: nunca mais recebe marketing",
  },
};

/** Selo de autorização para marketing (opt-in / opt-out). */
export function ConsentBadge({
  lead,
  compact = false,
}: {
  lead: Pick<Lead, "optIn" | "optOut">;
  compact?: boolean;
}) {
  const view = CONSENT_VIEW[consentStatus(lead)];
  return (
    <Badge tone={view.tone} title={view.title}>
      {compact ? view.compact : view.full}
    </Badge>
  );
}
