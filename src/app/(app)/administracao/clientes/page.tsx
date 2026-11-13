import type { Metadata } from "next";
import { ClientForm } from "@/components/client-form";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";
import { requirePermission } from "@/lib/require-user";
import { getClientsService } from "@/lib/tenancy/clients-service";
import { renameClientAction } from "./actions";

export const metadata: Metadata = { title: "Clientes" };

export default async function ClientsPage() {
  const user = await requirePermission("admin");
  const result = await getClientsService().list(user.id);
  if (!result.ok) throw new Error(result.error);

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-semibold text-slate-900">Clientes</h1>
      <p className="mt-1 text-slate-600">Cada cliente tem os seus próprios leads, campanhas e conversas, isolados dos outros. Só você, administradora da agência, vê esta lista.</p>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
        <h2 className="text-sm font-semibold text-slate-800">Novo cliente</h2>
        <div className="mt-3">
          <ClientForm />
        </div>
      </section>

      <section className="mt-6">
        <h2 className="text-sm font-semibold text-slate-800">Todos os clientes ({result.rows.length})</h2>
        <ul className="mt-2 divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white shadow-soft">
          {result.rows.map(({ client, members }) => (
            <li key={client.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div>
                <p className="text-sm font-medium text-slate-900">
                  {client.name} {client.id === user.clientId && <span className="text-xs font-normal text-slate-500">(ativo agora)</span>}
                </p>
                <p className="text-xs text-slate-500">
                  {members} {members === 1 ? "pessoa" : "pessoas"} · criado em {formatDateTime(client.createdAt)}
                </p>
              </div>
              <form action={renameClientAction} className="flex items-center gap-2">
                <input type="hidden" name="clientId" value={client.id} />
                <input
                  name="name"
                  defaultValue={client.name}
                  maxLength={80}
                  required
                  aria-label={`Novo nome para ${client.name}`}
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                />
                <Button type="submit" variant="outline">
                  Renomear
                </Button>
              </form>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
