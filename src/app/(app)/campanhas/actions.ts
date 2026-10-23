"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCampaignsRepository, getSender } from "@/lib/campaigns";
import { CAMPAIGN_STAGES } from "@/lib/campaigns/audience";
import { isStageId, type StageId } from "@/lib/leads/types";
import { requireUser } from "@/lib/require-user";

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

// ---------- Modelos de mensagem ----------

export type TemplateFormState = { error?: string; saved?: boolean; values?: { name: string; body: string } } | undefined;

export async function addTemplateAction(_prev: TemplateFormState, formData: FormData): Promise<TemplateFormState> {
  const user = await requireUser();
  const values = { name: text(formData, "name"), body: text(formData, "body") };

  const result = await getCampaignsRepository().addTemplate(user.id, values);
  if (!result.ok) return { error: result.error, values };

  revalidatePath("/campanhas/modelos");
  return { saved: true };
}

/** SIMULAÇÃO da aprovação da Meta. Só existe no modo simulação. */
export async function approveTemplateAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const repo = getCampaignsRepository(); // no modo real isto lança erro: a aprovação é da Meta
  await repo.approveTemplate(user.id, text(formData, "id"));
  revalidatePath("/campanhas/modelos");
}

export async function deleteTemplateAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  await getCampaignsRepository().removeTemplate(user.id, text(formData, "id"));
  revalidatePath("/campanhas/modelos");
}

// ---------- Nova campanha ----------

export type AudiencePreview = {
  considered: number;
  eligible: number;
  sample: string[];
  excluded: { semOptIn: number; optOut: number; semTelefone: number };
};

/** Mostra quantas pessoas receberiam a campanha com as etapas e a tag escolhidas (sem criar nada). */
export async function previewAudienceAction(stages: unknown, tag: unknown): Promise<AudiencePreview> {
  const user = await requireUser();
  const chosen = (Array.isArray(stages) ? stages : []).filter(
    (stage): stage is StageId => isStageId(stage) && CAMPAIGN_STAGES.includes(stage),
  );
  const report = await getCampaignsRepository().previewAudience(user.id, chosen, typeof tag === "string" ? tag : "");
  return {
    considered: report.considered,
    eligible: report.eligible.length,
    sample: report.eligible.slice(0, 5).map((lead) => lead.name),
    excluded: report.excluded,
  };
}

export type CampaignFormState = { error?: string; values?: { name: string; templateId: string; tag: string; stages: string[] } } | undefined;

export async function createCampaignAction(_prev: CampaignFormState, formData: FormData): Promise<CampaignFormState> {
  const user = await requireUser();
  const values = {
    name: text(formData, "name"),
    templateId: text(formData, "templateId"),
    tag: text(formData, "tag"),
    stages: formData.getAll("stage").filter((item): item is string => typeof item === "string"),
  };

  const result = await getCampaignsRepository().createCampaign(user.id, values);
  if (!result.ok) return { error: result.error, values };

  revalidatePath("/campanhas");
  redirect(`/campanhas/${result.campaign.id}`);
}

// ---------- Controle da campanha ----------

export type ControlResult = { ok: boolean; error?: string };

export async function controlCampaignAction(id: string, action: string): Promise<ControlResult> {
  const user = await requireUser();
  if (action !== "start" && action !== "pause" && action !== "cancel") return { ok: false, error: "Ação inválida." };

  const result = await getCampaignsRepository().changeCampaign(user.id, String(id), action);
  revalidatePath("/campanhas");
  revalidatePath(`/campanhas/${id}`);
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

export async function deleteCampaignAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  await getCampaignsRepository().removeCampaign(user.id, text(formData, "id"));
  revalidatePath("/campanhas");
  redirect("/campanhas");
}

export type BatchActionResult =
  | { ok: false; error: string }
  | { ok: true; sent: number; failed: number; skipped: number; remainingToday: number; queuedLeft: number; simulated: boolean };

/** Envia o próximo lote da fila (até 10 mensagens). Na fase 7 isto passa a ser feito sozinho por um agendador. */
export async function runBatchAction(): Promise<BatchActionResult> {
  const user = await requireUser();
  const result = await getCampaignsRepository().runBatch(user.id, getSender());

  revalidatePath("/campanhas");
  return result;
}
