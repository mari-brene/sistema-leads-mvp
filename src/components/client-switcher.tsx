import { switchClientAction } from "@/app/(app)/actions";
import { Button } from "@/components/ui/button";

/** Mostra o cliente ativo. Se a pessoa tem acesso a mais de um, deixa trocar. */
export function ClientSwitcher({ clients, activeId, activeName }: { clients: { id: string; name: string }[]; activeId: string; activeName: string }) {
  if (clients.length <= 1) {
    return <span className="truncate text-sm font-medium text-slate-700">{activeName}</span>;
  }
  return (
    <form action={switchClientAction} className="flex items-center gap-2">
      <label htmlFor="clientId" className="sr-only">
        Cliente
      </label>
      <select id="clientId" name="clientId" defaultValue={activeId} className="max-w-56 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm">
        {clients.map((client) => (
          <option key={client.id} value={client.id}>
            {client.name}
          </option>
        ))}
      </select>
      <Button type="submit" variant="outline" className="px-3 py-1.5">
        Trocar
      </Button>
    </form>
  );
}
