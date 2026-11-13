"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/require-user";
import { getClientsService } from "@/lib/tenancy/clients-service";

export type ClientFormState = { error?: string; saved?: boolean } | undefined;

const text = (formData: FormData, name: string): string => {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
};

export async function createClientAction(_prev: ClientFormState, formData: FormData): Promise<ClientFormState> {
  const user = await requirePermission("admin");
  const result = await getClientsService().create(user.id, text(formData, "name"));
  if (!result.ok) return { error: result.error };
  revalidatePath("/administracao/clientes");
  return { saved: true };
}

export async function renameClientAction(formData: FormData): Promise<void> {
  const user = await requirePermission("admin");
  await getClientsService().rename(user.id, text(formData, "clientId"), text(formData, "name"));
  revalidatePath("/administracao/clientes");
}
