import { Badge, type BadgeTone } from "@/components/ui/badge";
import {
  CAMPAIGN_STATUS_LABEL,
  MESSAGE_STATUS_LABEL,
  TEMPLATE_STATUS_LABEL,
  type CampaignStatus,
  type MessageStatus,
  type TemplateStatus,
} from "@/lib/campaigns/types";

const CAMPAIGN_TONE: Record<CampaignStatus, BadgeTone> = {
  rascunho: "slate",
  em_andamento: "sky",
  pausada: "amber",
  concluida: "green",
  cancelada: "red",
};

const TEMPLATE_TONE: Record<TemplateStatus, BadgeTone> = { pendente: "amber", aprovado: "green", rejeitado: "red" };

const MESSAGE_TONE: Record<MessageStatus, BadgeTone> = { na_fila: "slate", enviada: "green", falhou: "red", pulada: "amber" };

export function CampaignStatusBadge({ status }: { status: CampaignStatus }) {
  return <Badge tone={CAMPAIGN_TONE[status]}>{CAMPAIGN_STATUS_LABEL[status]}</Badge>;
}

export function TemplateStatusBadge({ status }: { status: TemplateStatus }) {
  return <Badge tone={TEMPLATE_TONE[status]}>{TEMPLATE_STATUS_LABEL[status]}</Badge>;
}

export function MessageStatusBadge({ status }: { status: MessageStatus }) {
  return <Badge tone={MESSAGE_TONE[status]}>{MESSAGE_STATUS_LABEL[status]}</Badge>;
}
