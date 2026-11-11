export type Role = "agency_admin" | "client_manager" | "agent";

export type Client = {
  id: string;
  name: string;
  createdAt: string;
};

export type Membership = {
  userId: string;
  clientId: string;
  role: Role;
};

/** Quem está logado, em qual cliente está trabalhando e com qual papel. */
export type Scope = {
  userId: string;
  clientId: string;
  role: Role;
};

export const ROLE_LABELS: Record<Role, string> = {
  agency_admin: "Administrador da agência",
  client_manager: "Gestor do cliente",
  agent: "Atendente",
};
