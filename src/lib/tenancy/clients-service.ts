import { randomUUID } from "node:crypto";
import * as clients from "./clients";
import { getTenancyStore } from "./index";
import type { TenancyStore } from "./store";
import type { Client } from "./types";

export type ClientRow = { client: Client; members: number };

export function createClientsService(deps: { tenancy: TenancyStore; now?: () => Date; newId?: () => string }) {
  const now = () => (deps.now ? deps.now() : new Date());
  const newId = deps.newId ?? (() => randomUUID());

  async function list(actorId: string): Promise<{ ok: true; rows: ClientRow[] } | { ok: false; error: string }> {
    const data = await deps.tenancy.load();
    if (!data.memberships.some((m) => m.userId === actorId && m.role === "agency_admin")) {
      return { ok: false, error: "Só o administrador da agência vê todos os clientes." };
    }
    const sorted = [...data.clients].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    return { ok: true, rows: sorted.map((client) => ({ client, members: data.memberships.filter((m) => m.clientId === client.id).length })) };
  }

  async function create(actorId: string, name: unknown) {
    const before = await deps.tenancy.load();
    const result = clients.createClient(before, actorId, name, now(), newId());
    if (!result.ok) return result;
    await deps.tenancy.save(before, { ...before, clients: [...before.clients, result.client] });
    return result;
  }

  async function rename(actorId: string, clientId: string, name: unknown) {
    const before = await deps.tenancy.load();
    const result = clients.renameClient(before, actorId, clientId, name);
    if (!result.ok) return result;
    await deps.tenancy.save(before, { ...before, clients: result.clients });
    return { ok: true } as const;
  }

  return { list, create, rename };
}

export const getClientsService = () => createClientsService({ tenancy: getTenancyStore() });
