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

  /** Senha que protege as rotas /api/cron/* (só o agendador do GitHub conhece). */
  get cronSecret(): string {
    return (process.env.CRON_SECRET ?? "").trim();
  },

  // ---------- WhatsApp (fase 8) ----------

  /** "mock" (simulação, padrão) ou "cloud" (WhatsApp Cloud API oficial da Meta). */
  get whatsappProvider(): "mock" | "cloud" {
    return process.env.WHATSAPP_PROVIDER === "cloud" ? "cloud" : "mock";
  },
  /** true = as mensagens NÃO saem de verdade (aparece o aviso "Modo simulação"). */
  get simulatedWhatsApp(): boolean {
    return this.mockMode || this.whatsappProvider !== "cloud";
  },
  get whatsappToken(): string {
    return (process.env.WHATSAPP_TOKEN ?? "").trim();
  },
  get whatsappPhoneNumberId(): string {
    return (process.env.WHATSAPP_PHONE_NUMBER_ID ?? "").trim();
  },
  /** Versão da API da Meta (a Meta lança versões novas de tempos em tempos). */
  get whatsappApiVersion(): string {
    const value = (process.env.WHATSAPP_API_VERSION ?? "").trim();
    return /^v\d+\.\d+$/.test(value) ? value : "v23.0";
  },
  /** Idioma dos modelos aprovados na Meta (o modelo de teste "hello_world" é en_US). */
  get whatsappTemplateLanguage(): string {
    const value = (process.env.WHATSAPP_TEMPLATE_LANGUAGE ?? "").trim();
    return /^[a-z]{2}(_[A-Z]{2})?$/.test(value) ? value : "pt_BR";
  },
  /** Texto combinado com a Meta para confirmar o endereço do webhook. */
  get whatsappVerifyToken(): string {
    return (process.env.WHATSAPP_VERIFY_TOKEN ?? "").trim();
  },
  /** "App secret" do app da Meta: serve para conferir que as mensagens recebidas vieram mesmo da Meta. */
  get metaAppSecret(): string {
    return (process.env.META_APP_SECRET ?? "").trim();
  },
  /** Quem recebe os contatos novos que escrevem primeiro (o "UID" do seu usuário no Supabase). */
  get whatsappOwnerId(): string {
    return (process.env.WHATSAPP_OWNER_ID ?? "").trim();
  },
};
