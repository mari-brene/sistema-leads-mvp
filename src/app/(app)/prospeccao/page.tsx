import type { Metadata } from "next";
import { ProspectSearch } from "@/components/prospect-search";
import { config } from "@/lib/config";
import { SUGGESTIONS } from "@/lib/places/categories";
import { searchesLeft } from "@/lib/places/service";
import { requireUser } from "@/lib/require-user";

export const metadata: Metadata = { title: "Prospecção" };

export default async function ProspectingPage() {
  const user = await requireUser();
  const { remaining, limit } = await searchesLeft(user.id);

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-2xl font-semibold text-slate-900">Prospecção</h1>
      <p className="mt-1 text-slate-600">
        Procure empresas por tipo de negócio e cidade e coloque as que interessam na coluna{" "}
        <strong>Prospecção</strong> do Kanban.
      </p>

      <p className="mt-4 rounded-xl bg-amber-50 px-3.5 py-2.5 text-sm text-amber-900">
        <strong>Importante:</strong> as empresas encontradas aqui entram <strong>sem autorização (opt-in)</strong>.
        Elas ficam bloqueadas para campanhas de WhatsApp. Só registre a autorização na página do lead depois que a
        pessoa aceitar receber mensagens.
      </p>

      <ProspectSearch
        suggestions={SUGGESTIONS}
        initialRemaining={remaining}
        limit={limit}
        provider={config.placesProvider}
      />
    </div>
  );
}
