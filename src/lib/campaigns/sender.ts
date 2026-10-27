/**
 * Quem envia a mensagem de verdade. Agora só existe a SIMULAÇÃO.
 * Na fase 8 entra aqui o envio pela WhatsApp Cloud API oficial da Meta.
 */

/**
 * purpose:
 *  - "marketing": campanha. No WhatsApp real SÓ pode sair por modelo aprovado (template).
 *  - "service": resposta a quem escreveu para nós (vale por 24h depois da última mensagem do contato).
 * template: nome do modelo aprovado na Meta e os valores das variáveis, na ordem.
 */
export type SendRequest = {
  to: string;
  text: string;
  templateName: string;
  purpose: "marketing" | "service";
  template?: { name: string; params: string[] };
};

export type SendResult = { ok: true; providerId: string } | { ok: false; error: string };

export interface WhatsAppSender {
  readonly id: "mock" | "cloud";
  readonly simulated: boolean;
  send(request: SendRequest): Promise<SendResult>;
}

let counter = 0;

/**
 * Envio de SIMULAÇÃO: não manda nada para ninguém.
 * Para você testar uma falha, use um número que termine em 0000 (ex.: +55 47 99999-0000).
 */
export const mockSender: WhatsAppSender = {
  id: "mock",
  simulated: true,
  async send({ to }) {
    if (to.endsWith("0000")) {
      return { ok: false, error: "Número não encontrado no WhatsApp (simulação)." };
    }
    counter += 1;
    return { ok: true, providerId: `simulado-${Date.now().toString(36)}-${counter}` };
  },
};
