"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getLeadsRepository } from "@/lib/leads";
import { parseCreateForm, parseUpdateForm, rawValues } from "@/lib/leads/form";
import { isStageId } from "@/lib/leads/types";
import { requireUser } from "@/lib/require-user";

/** Resultado dos formulários de criar/editar lead. */
export type LeadFormState =
  | {
      error?: string;
      /** Quando o erro é "telefone já existe", o id do lead que já tem esse telefone. */
      duplicateId?: string;
      saved?: boolean;
      /** O que a pessoa digitou, para não perder os campos quando dá erro. */
      values?: Record<string, string>;
    }
  | undefined;

/** Resultado dos formulários pequenos (nota, autorização). */
export type SimpleState = { error?: string; text?: string } | undefined;

function id(formData: FormData): string {
  const value = formData.get("id");
  return typeof value === "string" ? value : "";
}

export async function createLeadAction(_prev: LeadFormState, formData: FormData): Promise<LeadFormState> {
  const user = await requireUser();

  const parsed = parseCreateForm(formData);
  if (!parsed.ok) return { error: parsed.error, values: rawValues(formData) };

  const result = await getLeadsRepository().create(user.id, parsed.value);
  if (!result.ok) {
    return { error: result.error, duplicateId: result.duplicateId, values: rawValues(formData) };
  }

  revalidatePath("/kanban");
  revalidatePath("/leads");
  redirect("/kanban");
}

export async function updateLeadAction(_prev: LeadFormState, formData: FormData): Promise<LeadFormState> {
  const user = await requireUser();
  const leadId = id(formData);

  const parsed = parseUpdateForm(formData);
  if (!parsed.ok) return { error: parsed.error, values: rawValues(formData) };

  const result = await getLeadsRepository().update(user.id, leadId, parsed.value);
  if (!result.ok) {
    return { error: result.error, duplicateId: result.duplicateId, values: rawValues(formData) };
  }

  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/leads");
  revalidatePath("/kanban");
  return { saved: true };
}

/**
 * Chamada direto pelo Kanban ao soltar um cartão.
 * Não usa revalidatePath de propósito: o quadro já mostra o resultado na hora,
 * e recarregar os dados no meio de vários arrastes faria os cartões "pularem".
 */
export async function moveLeadAction(
  leadId: string,
  stage: string,
  index: number,
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();

  if (typeof leadId !== "string" || !isStageId(stage) || typeof index !== "number" || Number.isNaN(index)) {
    return { ok: false, error: "Dados inválidos." };
  }

  const result = await getLeadsRepository().move(user.id, leadId, stage, index);
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

export async function addNoteAction(_prev: SimpleState, formData: FormData): Promise<SimpleState> {
  const user = await requireUser();
  const leadId = id(formData);
  const value = formData.get("text");
  const text = typeof value === "string" ? value : "";

  const result = await getLeadsRepository().addNote(user.id, leadId, text);
  if (!result.ok) return { error: result.error, text };

  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/leads");
  return undefined;
}

export async function registerOptInAction(_prev: SimpleState, formData: FormData): Promise<SimpleState> {
  const user = await requireUser();
  const leadId = id(formData);
  const source = formData.get("optInSource");

  const result = await getLeadsRepository().registerOptIn(
    user.id,
    leadId,
    typeof source === "string" ? source : "",
  );
  if (!result.ok) return { error: result.error };

  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/leads");
  revalidatePath("/kanban");
  return undefined;
}

export async function registerOptOutAction(_prev: SimpleState, formData: FormData): Promise<SimpleState> {
  const user = await requireUser();
  const leadId = id(formData);

  const result = await getLeadsRepository().registerOptOut(user.id, leadId);
  if (!result.ok) return { error: result.error };

  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/leads");
  revalidatePath("/kanban");
  return undefined;
}

export async function deleteLeadAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  await getLeadsRepository().remove(user.id, id(formData));

  revalidatePath("/leads");
  revalidatePath("/kanban");
  redirect("/leads");
}
