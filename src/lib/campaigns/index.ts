import { config } from "@/lib/config";
import { currentLeadsRepository } from "@/lib/leads";
import { createCampaignsRepository, type CampaignsRepository } from "./repository";
import { createTableStore } from "./store";
import { createCloudSender } from "@/lib/whatsapp/cloud-sender";
import { mockSender, type WhatsAppSender } from "./sender";

export type { CampaignsRepository } from "./repository";
export type { WhatsAppSender } from "./sender";

const collectionRepository = createCampaignsRepository({ leads: currentLeadsRepository });
const tableRepository = createCampaignsRepository({
  leads: currentLeadsRepository,
  store: createTableStore({ url: config.supabaseUrl, secretKey: config.supabaseSecretKey }),
});

/**
 * Campanhas: coleção/arquivo (padrão) ou, com DATA_BACKEND=supabase e CAMPAIGNS_STORE=table, tabelas próprias.
 * A escolha é feita a cada chamada, como nos leads.
 */
export function getCampaignsRepository(): CampaignsRepository {
  return config.dataBackend === "supabase" && config.campaignsStore === "table" ? tableRepository : collectionRepository;
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
