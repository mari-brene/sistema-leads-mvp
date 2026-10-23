import { normalizePhone } from "@/lib/phone";
import {
  isConsentSourceId,
  isSourceId,
  isStageId,
  type CreateLeadInput,
  type UpdateLeadInput,
} from "./types";

/** Lê e valida o que veio dos formulários de lead. */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_TAGS = 10;
const MAX_TAG_LENGTH = 30;

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

function text(formData: FormData, name: string, max: number): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

/** "VIP, indicação; quente" vira ["VIP", "indicação", "quente"] (sem repetidas, no máximo 10). */
export function parseTags(input: string): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];

  for (const piece of input.split(/[,;\n]/)) {
    const tag = piece.trim().slice(0, MAX_TAG_LENGTH);
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
    if (tags.length >= MAX_TAGS) break;
  }
  return tags;
}

export function parseUpdateForm(formData: FormData): Parsed<UpdateLeadInput> {
  const name = text(formData, "name", 120);
  if (!name) return { ok: false, error: "Digite o nome do lead." };

  const email = text(formData, "email", 160);
  if (email && !EMAIL_PATTERN.test(email)) {
    return { ok: false, error: "Digite um e-mail válido (ou deixe em branco)." };
  }

  const phoneRaw = text(formData, "phone", 40);
  const phone = phoneRaw ? normalizePhone(phoneRaw) : null;
  if (phoneRaw && !phone) {
    return {
      ok: false,
      error: "Telefone inválido. Use DDD + número, por exemplo (47) 99999-1234.",
    };
  }

  const sourceRaw = formData.get("source");
  const source = isSourceId(sourceRaw) ? sourceRaw : "manual";

  return {
    ok: true,
    value: {
      name,
      company: text(formData, "company", 120),
      phone,
      email,
      source,
      tags: parseTags(text(formData, "tags", 400)),
      notes: text(formData, "notes", 2000),
    },
  };
}

export function parseCreateForm(formData: FormData): Parsed<CreateLeadInput> {
  const base = parseUpdateForm(formData);
  if (!base.ok) return base;

  const stageRaw = formData.get("stage");
  const stage = isStageId(stageRaw) ? stageRaw : "novo";

  const optIn = formData.get("optIn") === "on";
  const consentRaw = formData.get("optInSource");
  const optInSource = isConsentSourceId(consentRaw) ? consentRaw : null;

  if (optIn && !optInSource) {
    return { ok: false, error: "Escolha de onde veio a autorização (opt-in)." };
  }

  return { ok: true, value: { ...base.value, stage, optIn, optInSource: optIn ? optInSource : null } };
}

const FIELD_NAMES = [
  "name",
  "company",
  "phone",
  "email",
  "source",
  "stage",
  "tags",
  "notes",
  "optIn",
  "optInSource",
];

/**
 * Devolve o que a pessoa digitou, para o formulário não ficar em branco quando dá erro
 * (o React limpa os campos depois de enviar o formulário).
 */
export function rawValues(formData: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  for (const name of FIELD_NAMES) {
    const value = formData.get(name);
    if (typeof value === "string") values[name] = value;
  }
  return values;
}
