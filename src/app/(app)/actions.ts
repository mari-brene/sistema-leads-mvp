"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/require-user";
import { setActiveClient } from "@/lib/tenancy/active-client";

/** Troca o cliente em que a pessoa está trabalhando. Só vale para clientes a que ela tem acesso. */
export async function switchClientAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const wanted = formData.get("clientId");
  if (typeof wanted === "string" && user.clients.some((c) => c.id === wanted)) {
    await setActiveClient(wanted);
  }
  revalidatePath("/", "layout");
  redirect("/kanban");
}
