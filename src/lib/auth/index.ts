import { config } from "@/lib/config";
import { mockAuthAdapter } from "./mock-adapter";
import { createSupabaseAuth } from "./supabase-adapter";
import type { AuthAdapter } from "./types";

export type { AuthResult, AuthUser } from "./types";

/** Escolhe o sistema de login: simulação agora, Supabase na fase de contas reais. */
export function getAuthAdapter(): AuthAdapter {
  if (config.dataBackend === "supabase") {
    return createSupabaseAuth({
      url: config.supabaseUrl,
      publishableKey: config.supabasePublishableKey,
      secretKey: config.supabaseSecretKey,
    });
  }
  return mockAuthAdapter;
}
