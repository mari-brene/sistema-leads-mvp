import { readJson, writeJson } from "@/lib/storage";
import type { SearchFound } from "./types";
import { usedToday, type Usage } from "./usage";

/**
 * Guarda, em um arquivo local (.data/places.json), (1) quantas buscas cada pessoa fez hoje e
 * (2) as respostas recentes, para a mesma busca não ir ao OpenStreetMap duas vezes.
 * Na fase de contas reais isto passa para o Supabase, com a mesma forma.
 */

export const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_CACHE_ENTRIES = 50;

export interface SearchStore {
  getCached(key: string, nowMs: number): Promise<SearchFound | null>;
  putCached(key: string, value: SearchFound, nowMs: number): Promise<void>;
  /** Separa uma busca do limite do dia. Se o limite já foi atingido, não conta e devolve ok: false. */
  reserve(userId: string, today: string, limit: number): Promise<{ ok: boolean; used: number }>;
  used(userId: string, today: string): Promise<number>;
}

type CacheEntry = { at: number; value: SearchFound };
type Data = { usage: Record<string, Usage>; cache: Record<string, CacheEntry> };

async function read(): Promise<Data> {
  const data = (await readJson<Partial<Data> | null>("places", null)) ?? {};
  return { usage: data.usage ?? {}, cache: data.cache ?? {} };
}

async function write(data: Data): Promise<void> {
  await writeJson("places", data);
}

const globalWithLock = globalThis as typeof globalThis & { __placesLock?: Promise<unknown> };

function withLock<T>(task: () => Promise<T>): Promise<T> {
  const previous = globalWithLock.__placesLock ?? Promise.resolve();
  const run = previous.then(task, task);
  globalWithLock.__placesLock = run.catch(() => undefined);
  return run;
}

export const fileSearchStore: SearchStore = {
  async getCached(key, nowMs) {
    const data = await read();
    const entry = data.cache[key];
    if (!entry || nowMs - entry.at > CACHE_TTL_MS) return null;
    return entry.value;
  },

  putCached: (key, value, nowMs) =>
    withLock(async () => {
      const data = await read();
      data.cache[key] = { at: nowMs, value };
      const keys = Object.keys(data.cache).sort((a, b) => data.cache[b].at - data.cache[a].at);
      for (const old of keys.slice(MAX_CACHE_ENTRIES)) delete data.cache[old];
      await write(data);
    }),

  reserve: (userId, today, limit) =>
    withLock(async () => {
      const data = await read();
      const used = usedToday(data.usage[userId], today);
      if (used >= limit) return { ok: false, used };
      data.usage[userId] = { day: today, count: used + 1 };
      await write(data);
      return { ok: true, used: used + 1 };
    }),

  async used(userId, today) {
    const data = await read();
    return usedToday(data.usage[userId], today);
  },
};
