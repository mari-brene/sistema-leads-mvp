import { config } from "@/lib/config";
import { getSender } from "@/lib/campaigns";
import { currentLeadsRepository } from "@/lib/leads";
import { createGeminiProvider, createGroqProvider, mockAi, type AiProvider } from "./ai";
import { createInboxRepository, type InboxRepository } from "./repository";
import { createTableStore } from "./store";

export type { InboxRepository } from "./repository";
export type { AiProvider } from "./ai";

const deps = { leads: currentLeadsRepository, sender: () => getSender(), ai: () => getAi() };
const collectionRepository = createInboxRepository(deps);
const tableRepository = createInboxRepository({
  ...deps,
  store: createTableStore({ url: config.supabaseUrl, secretKey: config.supabaseSecretKey }),
});

/**
 * Conversas: coleção/arquivo (padrão) ou, com DATA_BACKEND=supabase e INBOX_STORE=table, tabelas próprias.
 * A escolha é feita a cada chamada.
 */
export function getInboxRepository(): InboxRepository {
  return config.dataBackend === "supabase" && config.inboxStore === "table" ? tableRepository : collectionRepository;
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
