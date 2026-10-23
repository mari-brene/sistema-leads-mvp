"use client";

import Link from "next/link";
import { useState, useTransition, type FormEvent } from "react";
import {
  addProspectsAction,
  searchPlacesAction,
  type AddActionResult,
  type FoundPlace,
  type SearchActionResult,
} from "@/app/(app)/prospeccao/actions";
import { Badge } from "@/components/ui/badge";
import { Button, buttonStyles } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { formatPhone, normalizePhone } from "@/lib/phone";

type Found = Extract<SearchActionResult, { ok: true }>;
type Added = Extract<AddActionResult, { ok: true }>;

function phoneLabel(phones: string[]): string {
  if (phones.length === 0) return "";
  const normalized = normalizePhone(phones[0]);
  return normalized ? formatPhone(normalized) : phones[0];
}

export function ProspectSearch({
  suggestions,
  initialRemaining,
  limit,
  provider,
}: {
  suggestions: string[];
  initialRemaining: number;
  limit: number;
  provider: "mock" | "osm";
}) {
  const [term, setTerm] = useState("");
  const [city, setCity] = useState("");
  const [remaining, setRemaining] = useState(initialRemaining);
  const [found, setFound] = useState<Found | null>(null);
  const [searched, setSearched] = useState({ term: "", city: "" });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [addResult, setAddResult] = useState<Added | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const isAvailable = (place: FoundPlace) => !place.inBase && !added.has(place.externalId);
  const available = found ? found.results.filter(isAvailable) : [];

  function onSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setAddResult(null);
    startTransition(async () => {
      try {
        const response = await searchPlacesAction(term, city);
        setRemaining(response.remaining);
        if (!response.ok) {
          setError(response.error);
          return;
        }
        setFound(response);
        setSearched({ term: term.trim(), city: city.trim() });
        setSelected(new Set());
        setAdded(new Set());
      } catch {
        setError("Não foi possível buscar agora. Tente de novo.");
      }
    });
  }

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(selected.size === available.length ? new Set() : new Set(available.map((place) => place.externalId)));
  }

  function onAdd() {
    if (!found) return;
    setError(null);
    const chosen = found.results.filter((place) => selected.has(place.externalId) && isAvailable(place));
    startTransition(async () => {
      try {
        const response = await addProspectsAction(chosen, { term: searched.term, placeLabel: found.placeLabel });
        if (!response.ok) {
          setError(response.error);
          return;
        }
        setAddResult(response);
        setAdded((current) => new Set([...current, ...response.addedIds]));
        setSelected(new Set());
      } catch {
        setError("Não foi possível adicionar agora. Tente de novo.");
      }
    });
  }

  const noQuota = remaining <= 0;

  return (
    <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
      {provider === "mock" && (
        <p className="mb-4 rounded-xl bg-sky-50 px-3.5 py-2.5 text-sm text-sky-900">
          <strong>Modo simulação:</strong> as empresas abaixo são <strong>de exemplo</strong>, inventadas pelo sistema para
          você testar a tela. Para buscar empresas de verdade, veja a seção &quot;Busca real&quot; no README.
        </p>
      )}

      <form onSubmit={onSearch} className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <Field
          label="O que procurar"
          name="term"
          list="tipos-de-negocio"
          placeholder="Ex.: padaria, dentista, academia"
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          maxLength={60}
          required
          autoComplete="off"
        />
        <Field
          label="Cidade"
          name="city"
          placeholder="Ex.: Joinville, SC"
          value={city}
          onChange={(event) => setCity(event.target.value)}
          maxLength={80}
          required
          autoComplete="off"
        />
        <Button type="submit" disabled={pending || noQuota}>
          {pending && !found ? "Buscando…" : "Buscar empresas"}
        </Button>
        <datalist id="tipos-de-negocio">
          {suggestions.map((label) => (
            <option key={label} value={label} />
          ))}
        </datalist>
      </form>

      <p className="mt-3 text-xs text-slate-500">
        Buscas restantes hoje: <strong>{remaining}</strong> de {limit}. A mesma busca repetida no mesmo dia não gasta o
        limite.
      </p>

      {error && (
        <div role="alert" className="mt-4 rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
          {error}
        </div>
      )}

      {found && (
        <div className="mt-6 space-y-4">
          <div>
            <p className="text-sm font-medium text-slate-800">
              {found.results.length === 0
                ? "Nenhuma empresa encontrada"
                : `${found.results.length} ${found.results.length === 1 ? "empresa encontrada" : "empresas encontradas"}`}{" "}
              em <strong>{found.placeLabel}</strong>
              {found.fromCache && <span className="text-slate-500"> (resultado de uma busca recente)</span>}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {found.matchedBy === "tipo"
                ? `Procurei pelo tipo de negócio "${searched.term}".`
                : `"${searched.term}" não é um tipo de negócio conhecido, então procurei esse texto no nome das empresas.`}
              {found.truncated && " Mostrando só as primeiras; use um termo mais específico para refinar."}
            </p>
            {found.results.length === 0 && (
              <p className="mt-2 text-sm text-slate-600">
                Tente outro termo (por exemplo, o tipo de negócio) ou uma cidade maior. O mapa nem sempre tem todas as
                empresas cadastradas.
              </p>
            )}
          </div>

          {found.results.length > 0 && (
            <>
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                  <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th scope="col" className="w-10 px-3 py-2">
                        <input
                          type="checkbox"
                          aria-label="Marcar todas as empresas novas"
                          checked={available.length > 0 && selected.size === available.length}
                          onChange={toggleAll}
                          disabled={available.length === 0 || pending}
                        />
                      </th>
                      <th scope="col" className="px-3 py-2">Empresa</th>
                      <th scope="col" className="px-3 py-2">Telefone</th>
                      <th scope="col" className="px-3 py-2">Endereço</th>
                      <th scope="col" className="px-3 py-2">Situação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {found.results.map((place) => {
                      const done = added.has(place.externalId);
                      const canPick = isAvailable(place);
                      return (
                        <tr key={place.externalId}>
                          <td className="px-3 py-2 align-top">
                            <input
                              type="checkbox"
                              aria-label={`Marcar ${place.name}`}
                              checked={selected.has(place.externalId)}
                              onChange={() => toggle(place.externalId)}
                              disabled={!canPick || pending}
                            />
                          </td>
                          <td className="px-3 py-2 align-top">
                            <p className="font-medium text-slate-900">{place.name}</p>
                            {place.category && <p className="text-xs text-slate-500">{place.category}</p>}
                            {place.website && (
                              <a
                                href={place.website}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-brand-700 hover:underline"
                              >
                                site
                              </a>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 align-top text-slate-700">
                            {phoneLabel(place.phones) || <span className="text-slate-400">sem telefone</span>}
                          </td>
                          <td className="px-3 py-2 align-top text-slate-600">{place.address || "—"}</td>
                          <td className="px-3 py-2 align-top">
                            {done ? (
                              <Badge tone="green">Adicionada</Badge>
                            ) : place.inBase ? (
                              <Badge tone="amber" title={`Já está na base: ${place.inBase}`}>Já está na base</Badge>
                            ) : (
                              <Badge tone="slate">Nova</Badge>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Button type="button" onClick={onAdd} disabled={pending || selected.size === 0}>
                  {pending
                    ? "Adicionando…"
                    : selected.size === 0
                      ? "Adicionar à Prospecção"
                      : `Adicionar ${selected.size} ${selected.size === 1 ? "empresa" : "empresas"} à Prospecção`}
                </Button>
                <span className="text-xs text-slate-500">
                  Entram na coluna Prospecção, sem autorização para campanhas.
                </span>
              </div>
            </>
          )}

          {addResult && (
            <div role="status" className="rounded-xl bg-emerald-50 px-3.5 py-3 text-sm text-emerald-800">
              <p className="font-medium">
                {addResult.created} {addResult.created === 1 ? "empresa adicionada" : "empresas adicionadas"} à
                Prospecção.
                {addResult.skipped > 0 && ` ${addResult.skipped} já estavam na base e foram puladas.`}
              </p>
              <div className="mt-2 flex flex-wrap gap-3">
                <Link href="/kanban" className={buttonStyles("primary")}>
                  Ver no Kanban
                </Link>
                <Link href="/leads" className={buttonStyles("outline")}>
                  Ver a lista de leads
                </Link>
              </div>
            </div>
          )}

          {provider === "osm" && (
            <p className="text-xs text-slate-500">
              Dados do mapa:{" "}
              <a
                href="https://www.openstreetmap.org/copyright"
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-700 hover:underline"
              >
                © Contribuidores do OpenStreetMap
              </a>{" "}
              (licença ODbL).
            </p>
          )}
        </div>
      )}
    </section>
  );
}
