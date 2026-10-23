import { config } from "@/lib/config";
import { getSender } from "@/lib/campaigns";
import { mockLeadsRepository } from "@/lib/leads/mock-repository";
import { createGeminiProvider, createGroqProvider, mockAi, type AiProvider } from "./ai";
import { createInboxRepository, type InboxRepository } from "./repository";

export type { InboxRepository } from "./repository";
export type { AiProvider } from "./ai";

const mockInboxRepository = createInboxRepository({
  leads: mockLeadsRepository,
  sender: () => getSender(),
  ai: () => getAi(),
});

/** Conversas: gravam em arquivo local ou no Supabase, conforme DATA_BACKEND. */
export function getInboxRepository(): InboxRepository {
  return mockInboxRepository;
}

/** Quem escreve as respostas: simulação (padrão), Groq ou Gemini (gratuitos, sem cartão). */
export function getAi(): AiProvider {
  switch (config.aiProvider) {
    case "groq":
      return createGroqProvider({ apiKey: config.groqApiKey, model: config.groqModel });
    case "gemini":
      return createGeminiProvider({ apiKey: config.geminiApiKey, model: config.geminiModel });
    default:
      return mockAi;
  }
}
