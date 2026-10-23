import { config } from "@/lib/config";
import { readFileJson, writeFileJson } from "./file-store";
import { createSupabaseStore } from "./supabase-store";

export { StorageConflictError } from "./supabase-store";

/**
 * Porta única de leitura e gravação dos dados.
 * DATA_BACKEND=file (padrão): arquivos em .data/. DATA_BACKEND=supabase: banco de dados na internet.
 */

const backend = () => createSupabaseStore({ url: config.supabaseUrl, secretKey: config.supabaseSecretKey });

function guard(): void {
  if (config.dataBackend === "file" && process.env.VERCEL) {
    throw new Error("Na Vercel os dados precisam ficar no Supabase: defina DATA_BACKEND=supabase nas variáveis de ambiente.");
  }
}

export async function readJson<T>(name: string, fallback: T): Promise<T> {
  guard();
  return config.dataBackend === "supabase" ? backend().read(name, fallback) : readFileJson(name, fallback);
}

export async function writeJson(name: string, data: unknown): Promise<void> {
  guard();
  if (config.dataBackend === "supabase") return backend().write(name, data);
  return writeFileJson(name, data);
}
