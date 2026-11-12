import type { NavItem } from "@/lib/nav";
import type { Role } from "./types";

/**
 * O que cada papel pode fazer além do que todos fazem (ver e editar leads, importar, buscar empresas,
 * atender a caixa de entrada).
 *  campaigns = criar e disparar campanhas e modelos de mensagem
 *  settings  = configurações do cliente (limites, horários, IA, base de conhecimento)
 *  audit     = ver o registro de auditoria
 *  admin     = telas da agência (migração, clientes)
 */
export type Permission = "campaigns" | "settings" | "audit" | "admin";

const GRANTS: Record<Role, readonly Permission[]> = {
  agency_admin: ["campaigns", "settings", "audit", "admin"],
  client_manager: ["campaigns", "settings", "audit"],
  agent: [],
};

export function can(role: Role, permission: Permission): boolean {
  return GRANTS[role].includes(permission);
}

/** Qual permissão cada item do menu exige (item que não aparece aqui é liberado para todos). */
const NAV_PERMISSION: Record<string, Permission> = {
  campanhas: "campaigns",
  configuracoes: "settings",
  auditoria: "audit",
};

export function navForRole(items: NavItem[], role: Role): NavItem[] {
  return items.filter((item) => {
    const needed = NAV_PERMISSION[item.slug];
    return !needed || can(role, needed);
  });
}
