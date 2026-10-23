import { promises as fs } from "node:fs";
import path from "node:path";
import { config } from "@/lib/config";

/** Guarda cada "coleção" em um arquivo local: .data/<nome>.json (modo no seu computador). */

export async function readFileJson<T>(name: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(path.join(config.dataDir, `${name}.json`), "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw error;
  }
}

export async function writeFileJson(name: string, data: unknown): Promise<void> {
  const target = path.join(config.dataDir, `${name}.json`);
  await fs.mkdir(path.dirname(target), { recursive: true });
  const tmp = `${target}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
  await fs.rename(tmp, target);
}
