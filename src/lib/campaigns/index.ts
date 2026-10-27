import { config } from "@/lib/config";
import { mockLeadsRepository } from "@/lib/leads/mock-repository";
import { createCampaignsRepository, type CampaignsRepository } from "./repository";
import { createCloudSender } from "@/lib/whatsapp/cloud-sender";
import { mockSender, type WhatsAppSender } from "./sender";

export type { CampaignsRepository } from "./repository";
export type { WhatsAppSender } from "./sender";

const mockCampaignsRepository = createCampaignsRepository({ leads: mockLeadsRepository });

/** Campanhas: gravam em arquivo local ou no Supabase, conforme DATA_BACKEND. */
export function getCampaignsRepository(): CampaignsRepository {
  return mockCampaignsRepository;
}

/**
 * Quem envia as mensagens: simulação (padrão) ou WhatsApp Cloud API oficial da Meta.
 * O envio real exige DOIS avisos ligados de propósito: WHATSAPP_PROVIDER=cloud e MOCK_MODE=false.
 */
export function getSender(): WhatsAppSender {
  if (config.whatsappProvider !== "cloud") return mockSender;
  if (config.mockMode) {
    throw new Error("WHATSAPP_PROVIDER=cloud exige MOCK_MODE=false (senão o sistema mostraria 'simulação' enquanto envia de verdade).");
  }
  return createCloudSender({
    token: config.whatsappToken,
    phoneNumberId: config.whatsappPhoneNumberId,
    apiVersion: config.whatsappApiVersion,
    templateLanguage: config.whatsappTemplateLanguage,
  });
}
