import { readJson, writeJson } from "@/lib/storage";
import { createRest, type RestOptions } from "@/lib/storage/rest-table";
import { decryptSecret, encryptSecret } from "@/lib/secrets/crypto";

/**
 * Número de WhatsApp (API oficial da Meta) de cada cliente.
 * O token fica CRIPTOGRAFADO; a tela nunca o mostra de volta.
 */

export type WhatsAppAccount = {
  clientId: string;
  phoneNumberId: string;
  displayPhone: string;
  tokenEncrypted: string;
  updatedAt: string;
};

export type SaveResult = { ok: true } | { ok: false; reason: "em_uso" };

export interface AccountsStore {
  get(clientId: string): Promise<WhatsAppAccount | null>;
  findByPhoneNumberId(phoneNumberId: string): Promise<WhatsAppAccount | null>;
  save(account: WhatsAppAccount): Promise<SaveResult>;
  remove(clientId: string): Promise<void>;
}

export function createCollectionStore(): AccountsStore {
  const read = async () => (await readJson<WhatsAppAccount[] | null>("whatsapp_accounts", null)) ?? [];
  return {
    async get(clientId) {
      return (await read()).find((item) => item.clientId === clientId) ?? null;
    },
    async findByPhoneNumberId(phoneNumberId) {
      return (await read()).find((item) => item.phoneNumberId === phoneNumberId) ?? null;
    },
    async save(account) {
      const all = await read();
      if (all.some((item) => item.phoneNumberId === account.phoneNumberId && item.clientId !== account.clientId)) return { ok: false, reason: "em_uso" };
      await writeJson("whatsapp_accounts", [...all.filter((item) => item.clientId !== account.clientId), account]);
      return { ok: true };
    },
    async remove(clientId) {
      await writeJson("whatsapp_accounts", (await read()).filter((item) => item.clientId !== clientId));
    },
  };
}

type Row = { client_id: string; phone_number_id: string; display_phone: string; token_encrypted: string; updated_at: string };

const toAccount = (row: Row): WhatsAppAccount => ({
  clientId: row.client_id,
  phoneNumberId: row.phone_number_id,
  displayPhone: row.display_phone,
  tokenEncrypted: row.token_encrypted,
  updatedAt: new Date(row.updated_at).toISOString(),
});

export function createTableStore(options: RestOptions): AccountsStore {
  const rest = createRest(options);

  async function one(filter: string): Promise<WhatsAppAccount | null> {
    const rows = await rest.fetchAll<Row>("whatsapp_accounts", filter, "client_id");
    return rows[0] ? toAccount(rows[0]) : null;
  }

  return {
    get: (clientId) => one(`client_id=eq.${encodeURIComponent(clientId)}`),
    findByPhoneNumberId: (phoneNumberId) => one(`phone_number_id=eq.${encodeURIComponent(phoneNumberId)}`),

    async save(account) {
      const row: Row = {
        client_id: account.clientId,
        phone_number_id: account.phoneNumberId,
        display_phone: account.displayPhone,
        token_encrypted: account.tokenEncrypted,
        updated_at: account.updatedAt,
      };
      const response = await rest.call("whatsapp_accounts", "POST", "?on_conflict=client_id", row, "resolution=merge-duplicates,return=minimal");
      if (response.status === 409) return { ok: false, reason: "em_uso" };
      if (!response.ok) rest.fail(response.status, "gravar", "whatsapp_accounts");
      return { ok: true };
    },

    async remove(clientId) {
      const response = await rest.call("whatsapp_accounts", "DELETE", `?client_id=eq.${encodeURIComponent(clientId)}`, undefined, "return=minimal");
      if (!response.ok) rest.fail(response.status, "apagar", "whatsapp_accounts");
    },
  };
}

export type AccountStatus = { connected: false } | { connected: true; phoneNumberId: string; displayPhone: string; updatedAt: string };

export type Credentials = { token: string; phoneNumberId: string };

export type ConnectInput = { phoneNumberId: string; token: string; displayPhone: string };

export function validateConnect(input: ConnectInput): { ok: true; value: ConnectInput } | { ok: false; error: string } {
  const phoneNumberId = input.phoneNumberId.trim();
  const token = input.token.trim();
  const displayPhone = input.displayPhone.trim().slice(0, 30);
  if (!/^\d{5,25}$/.test(phoneNumberId)) return { ok: false, error: "O ID do número deve ter só números (de 5 a 25 dígitos). Ele aparece no painel da Meta." };
  if (token.length < 20 || /\s/.test(token)) return { ok: false, error: "O token parece incompleto ou tem espaços. Copie de novo, inteiro, do painel da Meta." };
  if (token.length > 1000) return { ok: false, error: "O token é grande demais." };
  return { ok: true, value: { phoneNumberId, token, displayPhone } };
}

export type AccountsService = ReturnType<typeof createAccountsService>;

export function createAccountsService(deps: { store: AccountsStore; encryptionKey: () => string; now?: () => Date }) {
  const now = deps.now ?? (() => new Date());
  return {
    async status(clientId: string): Promise<AccountStatus> {
      const account = await deps.store.get(clientId);
      return account ? { connected: true, phoneNumberId: account.phoneNumberId, displayPhone: account.displayPhone, updatedAt: account.updatedAt } : { connected: false };
    },

    async connect(clientId: string, input: ConnectInput): Promise<{ ok: true } | { ok: false; error: string }> {
      const parsed = validateConnect(input);
      if (!parsed.ok) return parsed;
      const tokenEncrypted = encryptSecret(parsed.value.token, deps.encryptionKey());
      const saved = await deps.store.save({
        clientId,
        phoneNumberId: parsed.value.phoneNumberId,
        displayPhone: parsed.value.displayPhone,
        tokenEncrypted,
        updatedAt: now().toISOString(),
      });
      if (!saved.ok) return { ok: false, error: "Este número já está conectado a outro cliente." };
      return { ok: true };
    },

    disconnect: (clientId: string) => deps.store.remove(clientId),

    async credentials(clientId: string): Promise<Credentials | null> {
      const account = await deps.store.get(clientId);
      if (!account) return null;
      return { token: decryptSecret(account.tokenEncrypted, deps.encryptionKey()), phoneNumberId: account.phoneNumberId };
    },

    /** Qual cliente é dono deste número (usado pelo webhook). */
    async clientForPhoneNumberId(phoneNumberId: string): Promise<string | null> {
      return (await deps.store.findByPhoneNumberId(phoneNumberId))?.clientId ?? null;
    },
  };
}
