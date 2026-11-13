import type { SendRequest, SendResult, WhatsAppSender } from "@/lib/campaigns/sender";
import type { AccountsService } from "./accounts";
import { createCloudSender } from "./cloud-sender";

export type RoutingOptions = {
  accounts: AccountsService;
  apiVersion: string;
  templateLanguage: string;
  /** Número antigo, configurado só por variáveis de ambiente: vale apenas para este cliente. */
  legacy?: { clientId: string; token: string; phoneNumberId: string } | null;
  fetch?: Parameters<typeof createCloudSender>[0]["fetch"];
};

export const NOT_CONNECTED = "Este cliente ainda não conectou o número de WhatsApp. Vá em Configurações > WhatsApp.";

/** Envia sempre pelo número do cliente da mensagem. Nunca usa o número de outro cliente. */
export function createRoutingSender(options: RoutingOptions): WhatsAppSender {
  async function resolve(clientId: string | undefined): Promise<{ token: string; phoneNumberId: string } | null> {
    if (!clientId) return null;
    const own = await options.accounts.credentials(clientId);
    if (own) return own;
    const legacy = options.legacy;
    if (legacy && legacy.clientId === clientId && legacy.token && legacy.phoneNumberId) return legacy;
    return null;
  }

  return {
    id: "cloud",
    simulated: false,

    async canSend(clientId: string): Promise<string | null> {
      try {
        return (await resolve(clientId)) ? null : NOT_CONNECTED;
      } catch {
        return "Não foi possível abrir as credenciais de WhatsApp deste cliente. Conecte o número de novo em Configurações.";
      }
    },

    async send(request: SendRequest): Promise<SendResult> {
      let credentials: { token: string; phoneNumberId: string } | null;
      try {
        credentials = await resolve(request.clientId);
      } catch {
        return { ok: false, error: "Não foi possível abrir as credenciais de WhatsApp deste cliente. Conecte o número de novo em Configurações." };
      }
      if (!credentials) return { ok: false, error: NOT_CONNECTED };
      return createCloudSender({
        token: credentials.token,
        phoneNumberId: credentials.phoneNumberId,
        apiVersion: options.apiVersion,
        templateLanguage: options.templateLanguage,
        ...(options.fetch ? { fetch: options.fetch } : {}),
      }).send(request);
    },
  };
}
