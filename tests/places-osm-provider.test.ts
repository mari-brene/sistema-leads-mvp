import { afterEach, describe, expect, it } from "vitest";
import { createOsmProvider } from "@/lib/places/osm-provider";

type Call = { url: string; init: RequestInit };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const CITY = [{ osm_type: "relation", osm_id: 297, class: "boundary", display_name: "Joinville, Santa Catarina, Brasil" }];
const ELEMENTS = { elements: [{ type: "node", id: 1, tags: { name: "Padaria Sol", shop: "bakery", phone: "+55 47 3333-4444" } }] };

function fakeFetch(handler: (call: Call) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fn = (async (url: string | URL | Request, init?: RequestInit) => {
    const call = { url: String(url), init: init ?? {} };
    calls.push(call);
    return handler(call);
  }) as unknown as typeof fetch;
  return { fn, calls };
}

const savedContact = process.env.OSM_CONTACT;
afterEach(() => {
  if (savedContact === undefined) delete process.env.OSM_CONTACT;
  else process.env.OSM_CONTACT = savedContact;
});

describe("provedor OpenStreetMap", () => {
  it("acha a cidade e depois as empresas, identificando o app", async () => {
    process.env.OSM_CONTACT = "meu@email.com";
    const { fn, calls } = fakeFetch((call) => (call.url.includes("nominatim") ? jsonResponse(CITY) : jsonResponse(ELEMENTS)));

    const outcome = await createOsmProvider(fn).search({ term: "padaria", city: "Joinville, SC" });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.placeLabel).toBe("Joinville, Santa Catarina");
    expect(outcome.matchedBy).toBe("tipo");
    expect(outcome.results.map((r) => r.name)).toEqual(["Padaria Sol"]);

    expect(calls).toHaveLength(2);
    expect(calls[0].url).toContain("nominatim.openstreetmap.org/search");
    expect(calls[0].url).toContain("countrycodes=br");
    expect(calls[1].url).toContain("overpass");
    expect(calls[1].init.method).toBe("POST");
    expect(String(calls[1].init.body)).toContain("area%283600000297%29");
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers["User-Agent"]).toBe("SistemaLeadsMVP/0.4 (meu@email.com)");
  });

  it("diz que não achou a cidade e não consulta o Overpass", async () => {
    const { fn, calls } = fakeFetch(() => jsonResponse([]));
    const outcome = await createOsmProvider(fn).search({ term: "padaria", city: "Xyzzy" });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error).toContain('Não encontrei a cidade "Xyzzy"');
    expect(calls).toHaveLength(1);
  });

  it("tenta o servidor reserva quando o primeiro está ocupado", async () => {
    let overpassCalls = 0;
    const { fn, calls } = fakeFetch((call) => {
      if (call.url.includes("nominatim")) return jsonResponse(CITY);
      overpassCalls += 1;
      return overpassCalls === 1 ? new Response("busy", { status: 429 }) : jsonResponse(ELEMENTS);
    });
    const outcome = await createOsmProvider(fn).search({ term: "padaria", city: "Joinville" });
    expect(outcome.ok).toBe(true);
    expect(calls.map((c) => new URL(c.url).host)).toEqual([
      "nominatim.openstreetmap.org",
      "overpass-api.de",
      "overpass.kumi.systems",
    ]);
  });

  it("avisa com calma quando os dois servidores falham", async () => {
    const { fn } = fakeFetch((call) => (call.url.includes("nominatim") ? jsonResponse(CITY) : new Response("x", { status: 504 })));
    const outcome = await createOsmProvider(fn).search({ term: "padaria", city: "Joinville" });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.error).toContain("ocupado");
  });

  it("avisa quando a internet falha", async () => {
    const { fn } = fakeFetch(() => {
      throw new TypeError("fetch failed");
    });
    const outcome = await createOsmProvider(fn).search({ term: "padaria", city: "Joinville" });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.error).toContain("internet");
  });
});
