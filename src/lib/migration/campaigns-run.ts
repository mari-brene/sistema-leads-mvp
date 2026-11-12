import { config } from "@/lib/config";
import { readJson } from "@/lib/storage";
import { createRest, type RestOptions } from "@/lib/storage/rest-table";
import { planCampaignsMigration, type CampaignsPlan, type CampaignsSource } from "./campaigns-plan";

export type CampaignsReport = { plan: CampaignsPlan };

export type CampaignsRunResult = {
  copied: { settings: number; templates: number; campaigns: number; messages: number };
  /** Itens do lugar antigo que ainda não estão na tabela nova depois da cópia. */
  missing: number;
  plan: CampaignsPlan;
};


export function createCampaignsMigration(options: RestOptions) {
  const rest = createRest(options);

  const ids = async (table: string, key = "id") => new Set((await rest.fetchAll<Record<string, string>>(table, "", key)).map((row) => row[key]));

  async function readExisting() {
    const [clientIds, settingsClientIds, templateIds, campaignIds, messageIds] = await Promise.all([
      ids("clients"),
      ids("campaign_settings", "client_id"),
      ids("message_templates"),
      ids("campaigns"),
      ids("campaign_messages"),
    ]);
    return { clientIds, settingsClientIds, templateIds, campaignIds, messageIds };
  }

  async function readSource(): Promise<CampaignsSource> {
    const data = await readJson<Partial<Record<keyof CampaignsSource, unknown>> | null>("campaigns", null);
    return { settings: data?.settings ?? {}, templates: data?.templates ?? [], campaigns: data?.campaigns ?? [], messages: data?.messages ?? [] };
  }

  async function insert(table: string, rows: unknown[]): Promise<void> {
    for (let i = 0; i < rows.length; i += 500) {
      // ignore-duplicates: linha que já existe é pulada. Nunca sobrescreve nada.
      const response = await rest.call(table, "POST", "", rows.slice(i, i + 500), "resolution=ignore-duplicates,return=minimal");
      if (!response.ok) rest.fail(response.status, "copiar", table);
    }
  }

  /** Só olha: mostra o que seria copiado. Não grava nada. */
  async function preview(): Promise<CampaignsReport> {
    const [source, existing] = await Promise.all([readSource(), readExisting()]);
    return { plan: planCampaignsMigration(source, existing) };
  }

  /** Copia o que falta e confere o resultado. Não altera nem apaga o lugar antigo. */
  async function run(): Promise<CampaignsRunResult> {
    const source = await readSource();
    const plan = planCampaignsMigration(source, await readExisting());

    await insert("campaign_settings", plan.settings);
    await insert("message_templates", plan.templates);
    await insert("campaigns", plan.campaigns);
    await insert("campaign_messages", plan.messages);

    // Conferência: tudo o que o plano mandou copiar precisa estar lá agora.
    const after = await readExisting();
    const missing =
      plan.settings.filter((row) => !after.settingsClientIds.has(row.client_id)).length +
      plan.templates.filter((row) => !after.templateIds.has(row.id)).length +
      plan.campaigns.filter((row) => !after.campaignIds.has(row.id)).length +
      plan.messages.filter((row) => !after.messageIds.has(row.id)).length;
    return {
      copied: { settings: plan.settings.length, templates: plan.templates.length, campaigns: plan.campaigns.length, messages: plan.messages.length },
      missing,
      plan,
    };
  }

  return { preview, run };
}

export function getCampaignsMigration() {
  return createCampaignsMigration({ url: config.supabaseUrl, secretKey: config.supabaseSecretKey });
}

