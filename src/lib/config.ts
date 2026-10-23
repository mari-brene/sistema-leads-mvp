import path from "node:path";

/**
 * Configurações lidas das variáveis de ambiente.
 * São "getters": o valor é lido no momento do uso, o que facilita os testes.
 */

const DEV_SECRET = "segredo-somente-para-desenvolvimento-troque-em-producao";

export const config = {
  /** true = tudo em simulação, sem chaves externas. Só desliga com MOCK_MODE=false. */
  get mockMode(): boolean {
    return process.env.MOCK_MODE !== "false";
  },

  /** Segredo para assinar o cookie de login. */
  get sessionSecret(): string {
    const secret = process.env.SESSION_SECRET;
    if (secret && secret.length >= 16) return secret;

    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "SESSION_SECRET ausente ou curto demais. Defina uma variável SESSION_SECRET com 32+ caracteres.",
      );
    }
    return DEV_SECRET;
  },

  /** Pasta onde o modo simulação guarda os usuários de teste. */
  get dataDir(): string {
    return process.env.DATA_DIR || path.join(process.cwd(), ".data");
  },

  /** Quem responde às buscas de empresas: "mock" (dados de exemplo, padrão) ou "osm" (OpenStreetMap de verdade). */
  get placesProvider(): "mock" | "osm" {
    return process.env.PLACES_PROVIDER === "osm" ? "osm" : "mock";
  },

  /** Máximo de buscas de empresas por dia, por pessoa (protege o servidor gratuito do OpenStreetMap). */
  get searchDailyLimit(): number {
    const value = Number.parseInt(process.env.SEARCH_DAILY_LIMIT ?? "", 10);
    if (!Number.isFinite(value) || value < 1) return 20;
    return Math.min(value, 200);
  },

  /** Identificação enviada ao OpenStreetMap (a política deles pede um nome do app e um contato). */
  get osmUserAgent(): string {
    const contact = (process.env.OSM_CONTACT || "").trim().replace(/[^\w@.+\- ]/g, "").slice(0, 80);
    return contact ? `SistemaLeadsMVP/0.4 (${contact})` : "SistemaLeadsMVP/0.4";
  },

  /** Quem escreve as respostas automáticas: "mock" (simulação, padrão), "groq" ou "gemini" (planos gratuitos). */
  get aiProvider(): "mock" | "groq" | "gemini" {
    const value = process.env.AI_PROVIDER;
    return value === "groq" || value === "gemini" ? value : "mock";
  },

  get groqApiKey(): string {
    return process.env.GROQ_API_KEY ?? "";
  },
  get groqModel(): string {
    return process.env.GROQ_MODEL ?? "";
  },
  get geminiApiKey(): string {
    return process.env.GEMINI_API_KEY ?? "";
  },
  get geminiModel(): string {
    return process.env.GEMINI_MODEL ?? "";
  },

  /** Onde os dados ficam: "file" (arquivos no seu computador, padrão) ou "supabase" (banco de dados na internet). */
  get dataBackend(): "file" | "supabase" {
    return process.env.DATA_BACKEND === "supabase" ? "supabase" : "file";
  },

  /** Endereço do projeto no Supabase (ex.: https://abcd.supabase.co). */
  get supabaseUrl(): string {
    return (process.env.SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
  },
  /** Chave pública ("publishable"): usada só para conferir e-mail e senha no login. */
  get supabasePublishableKey(): string {
    return (process.env.SUPABASE_PUBLISHABLE_KEY ?? "").trim();
  },
  /** Chave secreta ("secret"): acessa o banco. NUNCA vai para o navegador nem para o GitHub. */
  get supabaseSecretKey(): string {
    return (process.env.SUPABASE_SECRET_KEY ?? "").trim();
  },
};
