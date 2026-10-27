import type { SendRequest, SendResult, WhatsAppSender } from "@/lib/campaigns/sender";

/**
 * Envio pela WhatsApp Cloud API OFICIAL da Meta (https://graph.facebook.com).
 * Nada de WhatsApp Web, Baileys ou automação de navegador.
 */

type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

type Options = {
  token: string;
  phoneNumberId: string;
  apiVersion: string;
  /** Idioma do modelo aprovado na Meta, ex.: pt_BR. */
  templateLanguage: string;
  fetch?: FetchLike;
};

const TIMEOUT_MS = 15_000;

/** Erros mais comuns da Meta, explicados em português. */
const KNOWN_ERRORS: Record<number, string> = {
  190: "O token de acesso da Meta é inválido ou expirou. Gere um novo e atualize WHATSAPP_TOKEN.",
  131030: "Este número não está na lista de destinatários permitidos (modo de teste da Meta). Adicione-o no painel da Meta.",
  131026: "A mensagem não pôde ser entregue: o número provavelmente não tem WhatsApp.",
  131047: "Passaram mais de 24h desde a última mensagem do contato: só é possível enviar um modelo aprovado.",
  132001: "O modelo não existe na Meta com esse nome e idioma, ou ainda não foi aprovado.",
  132000: "A quantidade de variáveis enviada não bate com a do modelo aprovado na Meta.",
  132012: "O formato das variáveis não bate com o modelo aprovado na Meta.",
  131056: "Muitas mensagens para o mesmo número em pouco tempo. Tente de novo mais tarde.",
  130429: "Limite de mensagens por segundo atingido. Tente de novo em instantes.",
  131048: "A Meta bloqueou o envio por spam ou baixa qualidade. Confira a qualidade do seu número no painel da Meta.",
};

/** Só o número do WhatsApp (sem "+", espaços ou traços). */
export function toWhatsAppNumber(e164: string): string {
  return e164.replace(/\D/g, "");
}

export function createCloudSender(options: Options): WhatsAppSender {
  const doFetch: FetchLike = options.fetch ?? ((url, init) => fetch(url, init) as unknown as ReturnType<FetchLike>);

  return {
    id: "cloud",
    simulated: false,

    async send(request: SendRequest): Promise<SendResult> {
      if (!options.token || !options.phoneNumberId) {
        return { ok: false, error: "Faltam WHATSAPP_TOKEN e WHATSAPP_PHONE_NUMBER_ID nas variáveis de ambiente." };
      }
      const to = toWhatsAppNumber(request.to);
      if (!to) return { ok: false, error: "Telefone inválido." };

      let body: Record<string, unknown>;
      if (request.template) {
        const params = request.template.params;
        body = {
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to,
          type: "template",
          template: {
            name: request.template.name,
            language: { code: options.templateLanguage },
            ...(params.length > 0
              ? { components: [{ type: "body", parameters: params.map((text) => ({ type: "text", text })) }] }
              : {}),
          },
        };
      } else if (request.purpose === "marketing") {
        // Trava de conformidade: marketing NUNCA sai como texto livre.
        return {
          ok: false,
          error: "Mensagem de marketing só pode ser enviada por modelo aprovado. Informe o nome do modelo na Meta no cadastro do modelo.",
        };
      } else {
        body = {
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to,
          type: "text",
          text: { preview_url: false, body: request.text },
        };
      }

      try {
        const response = await doFetch(
          `https://graph.facebook.com/${options.apiVersion}/${encodeURIComponent(options.phoneNumberId)}/messages`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${options.token}` },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(TIMEOUT_MS),
          },
        );
        const data = (await response.json().catch(() => ({}))) as {
          messages?: Array<{ id?: unknown }>;
          error?: { code?: unknown; message?: unknown };
        };
        if (!response.ok) {
          const code = typeof data.error?.code === "number" ? data.error.code : null;
          if (code !== null && KNOWN_ERRORS[code]) return { ok: false, error: KNOWN_ERRORS[code] };
          // Nunca repetimos o corpo inteiro da resposta (pode conter dados do contato) nem o token.
          return { ok: false, error: `A Meta recusou o envio (erro ${code ?? response.status}).` };
        }
        const id = data.messages?.[0]?.id;
        if (typeof id !== "string" || !id) return { ok: false, error: "Resposta inesperada da Meta." };
        return { ok: true, providerId: id };
      } catch {
        return { ok: false, error: "Não foi possível falar com a Meta (rede ou tempo esgotado)." };
      }
    },
  };
}
