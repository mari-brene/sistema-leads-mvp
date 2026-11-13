import type { MessageCounts } from "@/lib/campaigns/types";
import { SOURCES, STAGES, type Lead, type SourceId, type StageId } from "@/lib/leads/types";

export type DashboardInput = {
  leads: Pick<Lead, "stage" | "source" | "optIn" | "optOut" | "createdAt">[];
  campaigns: { status: string; counts: MessageCounts }[];
  conversations: { mode: string; needsHuman: boolean }[];
  now: Date;
};

export type Dashboard = {
  totalLeads: number;
  newLast30Days: number;
  byStage: { id: StageId; label: string; count: number }[];
  bySource: { id: SourceId; label: string; count: number }[];
  optIn: number;
  optOut: number;
  messages: { sent: number; failed: number; skipped: number; queued: number };
  activeCampaigns: number;
  totalCampaigns: number;
  conversations: { total: number; needsHuman: number; withAi: number };
  /** % de leads que já responderam entre os que já foram contatados (0 quando ninguém foi contatado). */
  responseRate: number;
};

const REPLIED: StageId[] = ["respondeu", "reuniao", "fechado"];
const CONTACTED: StageId[] = ["contatado", ...REPLIED];

export function buildDashboard({ leads, campaigns, conversations, now }: DashboardInput): Dashboard {
  const since = now.getTime() - 30 * 86_400_000;
  const contacted = leads.filter((lead) => CONTACTED.includes(lead.stage)).length;
  const replied = leads.filter((lead) => REPLIED.includes(lead.stage)).length;

  const messages = { sent: 0, failed: 0, skipped: 0, queued: 0 };
  for (const campaign of campaigns) {
    messages.sent += campaign.counts.enviadas;
    messages.failed += campaign.counts.falhas;
    messages.skipped += campaign.counts.puladas;
    messages.queued += campaign.counts.naFila;
  }

  return {
    totalLeads: leads.length,
    newLast30Days: leads.filter((lead) => new Date(lead.createdAt).getTime() >= since).length,
    byStage: STAGES.map((stage) => ({ id: stage.id, label: stage.label, count: leads.filter((lead) => lead.stage === stage.id).length })),
    bySource: SOURCES.map((source) => ({ id: source.id, label: source.label, count: leads.filter((lead) => lead.source === source.id).length })).filter((item) => item.count > 0),
    optIn: leads.filter((lead) => lead.optIn && !lead.optOut).length,
    optOut: leads.filter((lead) => lead.optOut).length,
    messages,
    activeCampaigns: campaigns.filter((campaign) => campaign.status === "em_andamento").length,
    totalCampaigns: campaigns.length,
    conversations: {
      total: conversations.length,
      needsHuman: conversations.filter((item) => item.needsHuman).length,
      withAi: conversations.filter((item) => item.mode === "ia").length,
    },
    responseRate: contacted === 0 ? 0 : Math.round((replied / contacted) * 100),
  };
}
