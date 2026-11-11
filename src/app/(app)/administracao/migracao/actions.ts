"use server";

import { redirect } from "next/navigation";
import { config } from "@/lib/config";
import { getMigration } from "@/lib/migration/run";
import { requireUser } from "@/lib/require-user";

/** Copia os leads da coleção antiga para a tabela nova. Só o administrador da agência pode. */
export async function runMigrationAction(): Promise<void> {
  const user = await requireUser();
  if (user.role !== "agency_admin") redirect("/kanban");
  if (config.dataBackend !== "supabase") redirect("/administracao/migracao");

  let query: string;
  try {
    const result = await getMigration().run();
    query = `?leads=${result.copied.leads}&faltando=${result.missing}`;
  } catch (error) {
    query = `?erro=${encodeURIComponent(error instanceof Error ? error.message : "Erro desconhecido.")}`;
  }
  redirect(`/administracao/migracao${query}`);
}
