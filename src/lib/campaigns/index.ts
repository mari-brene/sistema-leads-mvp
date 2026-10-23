import { config } from "@/lib/config";
import { mockLeadsRepository } from "@/lib/leads/mock-repository";
import { createCampaignsRepository, type CampaignsRepository } from "./repository";
import { mockSender, type WhatsAppSender } from "./sender";

export type { CampaignsRepository } from "./repository";
export type { WhatsAppSender } from "./sender";

const mockCampaignsRepository = createCampaignsRepository({ leads: mockLeadsRepository });

const NEEDS_REAL = (what: string) =>
  `MOCK_MODE=false exige ${what}, que será adicionado na fase de WhatsApp real. ` +
  "Por enquanto deixe MOCK_MODE=true no arquivo .env.local.";

/** Campanhas: gravam em arquivo local ou no Supabase, conforme DATA_BACKEND. */
export function getCampaignsRepository(): CampaignsRepository {
  return mockCampaignsRepository;
}

/** Quem envia as mensagens: simulação agora, WhatsApp Cloud API oficial na fase 8. */
export function getSender(): WhatsAppSender {
  if (config.mockMode) return mockSender;
  throw new Error(NEEDS_REAL("o envio pela WhatsApp Cloud API"));
}
