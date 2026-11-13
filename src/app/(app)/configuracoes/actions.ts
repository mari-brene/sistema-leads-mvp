"use server";

import { revalidatePath } from "next/cache";
import { getCampaignsRepository } from "@/lib/campaigns";
import { validateSettings } from "@/lib/campaigns/logic";
import { requirePermission } from "@/lib/require-user";
import { SecretsError } from "@/lib/secrets/crypto";
import { getWhatsAppAccounts } from "@/lib/whatsapp";

export type SettingsFormState = { error?: string; saved?: boolean } | undefined;

export async function saveSettingsAction(_prev: SettingsFormState, formData: FormData): Promise<SettingsFormState> {
  const user = await requirePermission("settings");

  const parsed = validateSettings({
    dailyLimit: formData.get("dailyLimit"),
    windowStart: formData.get("windowStart"),
    windowEnd: formData.get("windowEnd"),
    weekdaysOnly: formData.get("weekdaysOnly") === "on",
    optOutFooter: formData.get("optOutFooter"),
  });
  if (!parsed.ok) return { error: parsed.error };

  await getCampaignsRepository().saveSettings(user.clientId, parsed.value);
  revalidatePath("/configuracoes");
  revalidatePath("/campanhas");
  return { saved: true };
}

export type WhatsAppFormState = { error?: string; saved?: boolean; removed?: boolean } | undefined;

export async function connectWhatsAppAction(_prev: WhatsAppFormState, formData: FormData): Promise<WhatsAppFormState> {
  const user = await requirePermission("settings");
  let result;
  try {
    result = await getWhatsAppAccounts().connect(user.clientId, {
      phoneNumberId: String(formData.get("phoneNumberId") ?? ""),
      token: String(formData.get("token") ?? ""),
      displayPhone: String(formData.get("displayPhone") ?? ""),
    });
  } catch (error) {
    return { error: error instanceof SecretsError ? error.message : "Não foi possível salvar agora. Tente de novo." };
  }
  if (!result.ok) return { error: result.error };
  revalidatePath("/configuracoes");
  return { saved: true };
}

export async function disconnectWhatsAppAction(): Promise<WhatsAppFormState> {
  const user = await requirePermission("settings");
  await getWhatsAppAccounts().disconnect(user.clientId);
  revalidatePath("/configuracoes");
  return { removed: true };
}
