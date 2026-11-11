import { leadToRow, type LeadRow } from "@/lib/leads/table-mapping";
import type { Lead } from "@/lib/leads/types";
import type { Client, Membership } from "@/lib/tenancy/types";

export type ClientRow = { id: string; name: string; created_at: string };
export type MembershipRow = { user_id: string; client_id: string; role: string };

export type Existing = {
  leadIds: Set<string>;
  clientIds: Set<string>;
  membershipKeys: Set<string>;
};

export type Plan = {
  clients: ClientRow[];
  memberships: MembershipRow[];
  leads: LeadRow[];
  /** Leads que NÃO serão copiados porque o cliente dono deles não existe em lugar nenhum. */
  blockedNoClient: number;
  /** Linhas fora do formato esperado (sem id, por exemplo). Nunca são copiadas. */
  invalid: number;
  /** Quantos leads a coleção antiga tem no total. */
  sourceLeads: number;
  /** Quantos desses já estão na tabela nova. */
  alreadyCopied: number;
};

export const membershipKey = (userId: string, clientId: string) => `${userId}::${clientId}`;

/** Decide o que falta copiar da coleção antiga (app_data) para as tabelas novas. Não grava nada. */
export function planMigration(source: { leads: unknown; clients: Client[]; memberships: Membership[] }, existing: Existing): Plan {
  const sourceList = Array.isArray(source.leads) ? (source.leads as unknown[]) : [];
  const knownClients = new Set<string>([...existing.clientIds, ...source.clients.map((c) => c.id)]);

  const clients: ClientRow[] = source.clients
    .filter((c) => !existing.clientIds.has(c.id))
    .map((c) => ({ id: c.id, name: c.name, created_at: c.createdAt }));

  const memberships: MembershipRow[] = source.memberships
    .filter((m) => knownClients.has(m.clientId) && !existing.membershipKeys.has(membershipKey(m.userId, m.clientId)))
    .map((m) => ({ user_id: m.userId, client_id: m.clientId, role: m.role }));

  const leads: LeadRow[] = [];
  let blockedNoClient = 0;
  let invalid = 0;
  let alreadyCopied = 0;
  const seen = new Set<string>();

  for (const item of sourceList) {
    const lead = item as Partial<Lead> | null;
    if (!lead || typeof lead.id !== "string" || typeof lead.userId !== "string" || !lead.id || !lead.userId) {
      invalid++;
      continue;
    }
    if (existing.leadIds.has(lead.id)) {
      alreadyCopied++;
      continue;
    }
    if (seen.has(lead.id)) {
      invalid++;
      continue;
    }
    seen.add(lead.id);
    if (!knownClients.has(lead.userId)) {
      blockedNoClient++;
      continue;
    }
    leads.push(leadToRow(lead as Lead));
  }

  return { clients, memberships, leads, blockedNoClient, invalid, sourceLeads: sourceList.length, alreadyCopied };
}

/** Compara os ids da coleção antiga com os da tabela nova depois da cópia. */
export function verifyCopy(sourceIds: string[], tableIds: Set<string>): { missing: number; extra: number } {
  const sourceSet = new Set(sourceIds);
  return {
    missing: sourceIds.filter((id) => !tableIds.has(id)).length,
    extra: [...tableIds].filter((id) => !sourceSet.has(id)).length,
  };
}
