import { readJson, writeJson } from "@/lib/storage";
import { createRest, type RestOptions } from "@/lib/storage/rest-table";
import type { Invitation } from "./team";

/** Onde ficam os convites: coleção/arquivo (padrão) ou tabela "invitations" (segue TENANCY_STORE). */
export interface InvitationsStore {
  byClient(clientId: string): Promise<Invitation[]>;
  byTokenHash(tokenHash: string): Promise<Invitation | undefined>;
  /** Grava só o que mudou nos convites deste cliente. */
  save(clientId: string, before: Invitation[], after: Invitation[]): Promise<void>;
  /**
   * Usa o convite de forma "atômica": só dá certo se ele ainda estiver aberto. Garante que um link vale para UMA pessoa,
   * mesmo que duas tentem ao mesmo tempo.
   */
  claim(invitationId: string, userId: string, now: Date): Promise<boolean>;
}

const globalWithLock = globalThis as typeof globalThis & { __invitesLock?: Promise<unknown> };
function withLock<T>(task: () => Promise<T>): Promise<T> {
  const previous = globalWithLock.__invitesLock ?? Promise.resolve();
  const run = previous.then(task, task);
  globalWithLock.__invitesLock = run.catch(() => undefined);
  return run;
}

export function createCollectionInvitationsStore(): InvitationsStore {
  const readAll = async () => {
    const data = await readJson<Invitation[]>("invitations", []);
    return Array.isArray(data) ? data : [];
  };
  return {
    byClient: async (clientId) => (await readAll()).filter((i) => i.clientId === clientId),
    byTokenHash: async (tokenHash) => (await readAll()).find((i) => i.tokenHash === tokenHash),
    save: (clientId, _before, after) =>
      withLock(async () => {
        const all = await readAll();
        await writeJson("invitations", [...all.filter((i) => i.clientId !== clientId), ...after]);
      }),
    claim: (invitationId, userId, now) =>
      withLock(async () => {
        const all = await readAll();
        const invite = all.find((i) => i.id === invitationId);
        if (!invite || invite.acceptedAt || invite.revokedAt || new Date(invite.expiresAt).getTime() <= now.getTime()) return false;
        await writeJson("invitations", all.map((i) => (i.id === invitationId ? { ...i, acceptedBy: userId, acceptedAt: now.toISOString() } : i)));
        return true;
      }),
  };
}

type Row = {
  id: string;
  client_id: string;
  role: string;
  token_hash: string;
  created_by: string;
  created_at: string;
  expires_at: string;
  accepted_by: string | null;
  accepted_at: string | null;
  revoked_at: string | null;
};

const iso = (value: string | null) => (value ? new Date(value).toISOString() : null);

const toRow = (i: Invitation): Row & Record<string, unknown> => ({
  id: i.id,
  client_id: i.clientId,
  role: i.role,
  token_hash: i.tokenHash,
  created_by: i.createdBy,
  created_at: i.createdAt,
  expires_at: i.expiresAt,
  accepted_by: i.acceptedBy,
  accepted_at: i.acceptedAt,
  revoked_at: i.revokedAt,
});

const fromRow = (r: Row): Invitation => ({
  id: r.id,
  clientId: r.client_id,
  role: r.role as Invitation["role"],
  tokenHash: r.token_hash,
  createdBy: r.created_by,
  createdAt: iso(r.created_at)!,
  expiresAt: iso(r.expires_at)!,
  acceptedBy: r.accepted_by,
  acceptedAt: iso(r.accepted_at),
  revokedAt: iso(r.revoked_at),
});

export function createTableInvitationsStore(options: RestOptions): InvitationsStore {
  const rest = createRest(options);
  const q = encodeURIComponent;
  return {
    async byClient(clientId) {
      return (await rest.fetchAll<Row>("invitations", `client_id=eq.${q(clientId)}`)).map(fromRow);
    },
    async byTokenHash(tokenHash) {
      const rows = await rest.fetchAll<Row>("invitations", `token_hash=eq.${q(tokenHash)}`);
      return rows[0] ? fromRow(rows[0]) : undefined;
    },
    save: (clientId, before, after) => rest.syncRows("invitations", clientId, before, after, toRow),
    async claim(invitationId, userId, now) {
      // Só atualiza se ainda estiver aberto; a resposta traz as linhas alteradas (0 = alguém chegou antes).
      const filter = `?id=eq.${q(invitationId)}&accepted_at=is.null&revoked_at=is.null&expires_at=gt.${q(now.toISOString())}`;
      const response = await rest.call("invitations", "PATCH", filter, { accepted_by: userId, accepted_at: now.toISOString() }, "return=representation");
      if (!response.ok) rest.fail(response.status, "gravar", "invitations");
      const rows = (await response.json()) as unknown[];
      return Array.isArray(rows) && rows.length === 1;
    },
  };
}
