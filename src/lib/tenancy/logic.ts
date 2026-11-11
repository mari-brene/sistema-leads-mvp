import type { Client, Membership, Role, Scope } from "./types";

export const DEFAULT_CLIENT_NAME = "Demonstração";

export type TenancyData = { clients: Client[]; memberships: Membership[] };

/**
 * Escolhe o cliente ativo da pessoa. Sem escolha explícita, vale o primeiro vínculo.
 * Devolve null se a pessoa não tem nenhum vínculo.
 */
export function pickScope(userId: string, memberships: Membership[], preferredClientId?: string): Scope | null {
  const mine = memberships.filter((m) => m.userId === userId);
  if (mine.length === 0) return null;
  const chosen = mine.find((m) => m.clientId === preferredClientId) ?? mine[0];
  return { userId, clientId: chosen.clientId, role: chosen.role };
}

/**
 * Garante que a pessoa tem pelo menos um cliente.
 * O cliente padrão usa o MESMO id do usuário: assim todos os dados que já existem
 * (gravados com o id do usuário) passam a pertencer a esse cliente sem precisar copiar nada.
 * A primeira pessoa do sistema vira administradora da agência; as demais, gestoras do próprio cliente.
 */
export function ensureDefaultClient(data: TenancyData, userId: string, now: Date): { data: TenancyData; changed: boolean } {
  if (data.memberships.some((m) => m.userId === userId)) return { data, changed: false };

  const role: Role = data.memberships.length === 0 ? "agency_admin" : "client_manager";
  const hasClient = data.clients.some((c) => c.id === userId);
  const clients = hasClient ? data.clients : [...data.clients, { id: userId, name: DEFAULT_CLIENT_NAME, createdAt: now.toISOString() }];
  return { data: { clients, memberships: [...data.memberships, { userId, clientId: userId, role }] }, changed: true };
}

/** Papéis que podem mudar configurações do cliente. */
export function canConfigure(role: Role): boolean {
  return role === "agency_admin" || role === "client_manager";
}
