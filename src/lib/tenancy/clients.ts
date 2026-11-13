import type { TenancyData } from "./logic";
import { authority } from "./team";
import type { Client } from "./types";

export const MAX_CLIENT_NAME = 80;

export type Res<T extends object = object> = ({ ok: true } & T) | { ok: false; error: string };

export function cleanClientName(input: unknown): Res<{ name: string }> {
  const name = typeof input === "string" ? input.replace(/\s+/g, " ").trim() : "";
  if (!name) return { ok: false, error: "Digite o nome do cliente." };
  if (name.length > MAX_CLIENT_NAME) return { ok: false, error: `O nome pode ter no máximo ${MAX_CLIENT_NAME} caracteres.` };
  return { ok: true, name };
}

const sameName = (a: string, b: string) => a.localeCompare(b, "pt-BR", { sensitivity: "base" }) === 0;

/** Só o administrador da agência cria clientes. */
export function createClient(data: TenancyData, actorId: string, input: unknown, now: Date, id: string): Res<{ client: Client }> {
  const isAdmin = data.memberships.some((m) => m.userId === actorId && m.role === "agency_admin");
  if (!isAdmin) return { ok: false, error: "Só o administrador da agência pode criar clientes." };
  const cleaned = cleanClientName(input);
  if (!cleaned.ok) return cleaned;
  if (data.clients.some((c) => sameName(c.name, cleaned.name))) return { ok: false, error: "Já existe um cliente com este nome." };
  return { ok: true, client: { id, name: cleaned.name, createdAt: now.toISOString() } };
}

/** Administrador da agência ou gestor do próprio cliente podem renomear. */
export function renameClient(data: TenancyData, actorId: string, clientId: string, input: unknown): Res<{ clients: Client[] }> {
  const role = authority(data.memberships, actorId, clientId);
  if (role !== "agency_admin" && role !== "client_manager") return { ok: false, error: "Você não pode renomear este cliente." };
  if (!data.clients.some((c) => c.id === clientId)) return { ok: false, error: "Cliente não encontrado." };
  const cleaned = cleanClientName(input);
  if (!cleaned.ok) return cleaned;
  if (data.clients.some((c) => c.id !== clientId && sameName(c.name, cleaned.name))) return { ok: false, error: "Já existe um cliente com este nome." };
  return { ok: true, clients: data.clients.map((c) => (c.id === clientId ? { ...c, name: cleaned.name } : c)) };
}

/** Cadastro aberto só quando a configuração permite ou quando a pessoa chegou por um convite. */
export function signupAllowed(allowOpenSignup: boolean, hasInvite: boolean): boolean {
  return allowOpenSignup || hasInvite;
}
