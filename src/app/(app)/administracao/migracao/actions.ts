"use server";

import { redirect } from "next/navigation";
import { config } from "@/lib/config";
import { getCampaignsMigration } from "@/lib/migration/campaigns-run";
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

/** Copia modelos, campanhas, mensagens e limites da coleção antiga para as tabelas novas. Só o administrador da agência. */
export async function runCampaignsMigrationAction(): Promise<void> {
  const user = await requireUser();
  if (user.role !== "agency_admin") redirect("/kanban");
  if (config.dataBackend !== "supabase") redirect("/administracao/migracao");

  let query: string;
  try {
    const result = await getCampaignsMigration().run();
    const c = result.copied;
    query = `?camp=${c.settings + c.templates + c.campaigns + c.messages}&campfalta=${result.missing}`;
  } catch (error) {
    query = `?erro=${encodeURIComponent(error instanceof Error ? error.message : "Erro desconhecido.")}`;
  }
  redirect(`/administracao/migracao${query}`);
}
