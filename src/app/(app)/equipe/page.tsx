import type { Metadata } from "next";
import { InviteForm } from "@/components/invite-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";
import { requirePermission } from "@/lib/require-user";
import { ROLE_LABELS } from "@/lib/tenancy";
import { getTeamService } from "@/lib/tenancy/team-service";
import { changeRoleAction, removeMemberAction, revokeInviteAction } from "./actions";

export const metadata: Metadata = { title: "Equipe" };

export default async function TeamPage() {
  const user = await requirePermission("team");
  const view = await getTeamService().view(user.id, user.clientId);
  if (!view.ok) throw new Error(view.error);

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-semibold text-slate-900">Equipe</h1>
      <p className="mt-1 text-slate-600">
        Pessoas com acesso a este cliente. Para adicionar alguém, gere um link e envie pelo WhatsApp: a pessoa abre o link, entra (ou cria a conta) e já cai aqui com o papel escolhido.
      </p>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
        <h2 className="text-sm font-semibold text-slate-800">Convidar uma pessoa</h2>
        <div className="mt-3">
          <InviteForm />
        </div>
      </section>

      <section className="mt-6">
        <h2 className="text-sm font-semibold text-slate-800">Pessoas ({view.members.length})</h2>
        <ul className="mt-2 divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white shadow-soft">
          {view.members.map((member) => {
            const isMe = member.userId === user.id;
            const editable = !isMe && member.role !== "agency_admin";
            return (
              <li key={member.userId} className="space-y-3 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-slate-900">
                      {member.name || "Sem nome"} {isMe && <span className="text-xs font-normal text-slate-500">(você)</span>}
                    </p>
                    <p className="text-xs text-slate-500">{member.email}</p>
                  </div>
                  <Badge tone={member.role === "agency_admin" ? "sky" : member.role === "client_manager" ? "green" : "slate"}>{ROLE_LABELS[member.role]}</Badge>
                </div>

                {editable && (
                  <div className="flex flex-wrap items-center gap-3">
                    <form action={changeRoleAction} className="flex items-center gap-2">
                      <input type="hidden" name="targetId" value={member.userId} />
                      <select
                        name="role"
                        defaultValue={member.role}
                        aria-label={`Papel de ${member.name || member.email}`}
                        className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                      >
                        <option value="agent">Atendente</option>
                        <option value="client_manager">Gestor do cliente</option>
                      </select>
                      <Button type="submit" variant="outline">
                        Salvar papel
                      </Button>
                    </form>

                    <details className="text-sm">
                      <summary className="cursor-pointer text-red-700">Remover do cliente</summary>
                      <form action={removeMemberAction} className="mt-2 space-y-2 rounded-xl border border-red-200 bg-red-50 p-3">
                        <input type="hidden" name="targetId" value={member.userId} />
                        <p className="text-xs text-red-800">A pessoa perde o acesso a este cliente na hora. Os dados do cliente não são apagados.</p>
                        <Button type="submit" variant="danger">
                          Confirmar remoção
                        </Button>
                      </form>
                    </details>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="mt-6">
        <h2 className="text-sm font-semibold text-slate-800">Convites em aberto ({view.invitations.length})</h2>
        {view.invitations.length === 0 ? (
          <p className="mt-2 rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">Nenhum convite esperando.</p>
        ) : (
          <ul className="mt-2 divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white shadow-soft">
            {view.invitations.map((invitation) => (
              <li key={invitation.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div>
                  <p className="text-sm text-slate-800">{ROLE_LABELS[invitation.role]}</p>
                  <p className="text-xs text-slate-500">Criado em {formatDateTime(invitation.createdAt)} · vale até {formatDateTime(invitation.expiresAt)}</p>
                </div>
                <form action={revokeInviteAction}>
                  <input type="hidden" name="inviteId" value={invitation.id} />
                  <Button type="submit" variant="danger">
                    Cancelar convite
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-slate-500">O link em si não é guardado, então não dá para vê-lo de novo. Se perdeu, cancele o convite e gere outro.</p>
      </section>
    </div>
  );
}
