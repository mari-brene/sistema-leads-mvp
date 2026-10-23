"use server";

import { revalidatePath } from "next/cache";
import { getCampaignsRepository } from "@/lib/campaigns";
import { validateSettings } from "@/lib/campaigns/logic";
import { requireUser } from "@/lib/require-user";

export type SettingsFormState = { error?: string; saved?: boolean } | undefined;

export async function saveSettingsAction(_prev: SettingsFormState, formData: FormData): Promise<SettingsFormState> {
  const user = await requireUser();

  const parsed = validateSettings({
    dailyLimit: formData.get("dailyLimit"),
    windowStart: formData.get("windowStart"),
    windowEnd: formData.get("windowEnd"),
    weekdaysOnly: formData.get("weekdaysOnly") === "on",
    optOutFooter: formData.get("optOutFooter"),
  });
  if (!parsed.ok) return { error: parsed.error };

  await getCampaignsRepository().saveSettings(user.id, parsed.value);
  revalidatePath("/configuracoes");
  revalidatePath("/campanhas");
  return { saved: true };
}
