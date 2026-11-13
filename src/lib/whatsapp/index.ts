import { config } from "@/lib/config";
import { createAccountsService, createCollectionStore, createTableStore, type AccountsService } from "./accounts";

export type { AccountsService } from "./accounts";

let service: AccountsService | null = null;

/** Número de WhatsApp de cada cliente. Tabela no Supabase (DATA_BACKEND=supabase) ou arquivo local. */
export function getWhatsAppAccounts(): AccountsService {
  service ??= createAccountsService({
    store:
      config.dataBackend === "supabase"
        ? createTableStore({ url: config.supabaseUrl, secretKey: config.supabaseSecretKey })
        : createCollectionStore(),
    encryptionKey: () => config.credentialsEncryptionKey,
  });
  return service;
}
