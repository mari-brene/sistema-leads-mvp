"use server";

import { revalidatePath } from "next/cache";
import { config } from "@/lib/config";
import { getInboxRepository } from "@/lib/inbox";
import { requireUser } from "@/lib/require-user";

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export type InboxFormState = { error?: string; ok?: string } | undefined;

function refresh(leadId: string) {
  revalidatePath("/inbox");
  revalidatePath(`/inbox/${leadId}`);
  revalidatePath("/kanban");
}

/** Você escreve para o contato (só dentro das 24h). */
export async function sendReplyAction(_prev: InboxFormState, formData: FormData): Promise<InboxFormState> {
  const user = await requireUser();
  const leadId = text(formData, "leadId");
  const result = await getInboxRepository().sendHuman(user.id, leadId, text(formData, "message"));
  refresh(leadId);
  return result.ok ? { ok: "Mensagem enviada." } : { error: result.error };
}

export async function takeOverAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const leadId = text(formData, "leadId");
  await getInboxRepository().takeOver(user.id, leadId);
  refresh(leadId);
}

export async function handBackAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const leadId = text(formData, "leadId");
  await getInboxRepository().handBack(user.id, leadId);
  refresh(leadId);
}

/** SIMULAÇÃO: finge que o contato mandou uma mensagem. Só existe no modo simulação. */
export async function simulateInboundAction(_prev: InboxFormState, formData: FormData): Promise<InboxFormState> {
  const user = await requireUser();
  if (!config.simulatedWhatsApp) return { error: "A simulação só funciona no modo simulação (o WhatsApp real recebe as mensagens pelo webhook)." };
  const leadId = text(formData, "leadId");
  const result = await getInboxRepository().receive(user.id, leadId, text(formData, "message"));
  refresh(leadId);
  if (!result.ok) return { error: result.error };
  const labels = {
    ia_respondeu: "A IA respondeu.",
    para_voce: "A conversa ficou para você responder.",
    saiu: "Pedido de saída registrado.",
    duplicada: "Mensagem repetida: ignorada.",
  } as const;
  return { ok: labels[result.outcome] };
}

export type KnowledgeFormState = { error?: string; saved?: boolean } | undefined;

export async function saveKnowledgeAction(_prev: KnowledgeFormState, formData: FormData): Promise<KnowledgeFormState> {
  const user = await requireUser();
  const result = await getInboxRepository().saveSettings(user.id, {
    aiEnabled: formData.get("aiEnabled") === "on",
    businessName: text(formData, "businessName"),
    knowledge: text(formData, "knowledge"),
  });
  if (!result.ok) return { error: result.error };
  revalidatePath("/configuracoes");
  return { saved: true };
}
