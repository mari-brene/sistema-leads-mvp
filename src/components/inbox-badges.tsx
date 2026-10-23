import { Badge, type BadgeTone } from "@/components/ui/badge";
import { STATE_LABEL, type ConversationState } from "@/lib/inbox/types";

const TONE: Record<ConversationState, BadgeTone> = { ia: "sky", aguardando: "amber", humano: "green", saiu: "red" };

export function StateBadge({ state }: { state: ConversationState }) {
  return <Badge tone={TONE[state]}>{STATE_LABEL[state]}</Badge>;
}
