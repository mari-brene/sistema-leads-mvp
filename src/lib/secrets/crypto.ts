import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Criptografia dos segredos de cada cliente (ex.: token do WhatsApp) com AES-256-GCM.
 * A chave mora só nas variáveis de ambiente (CREDENTIALS_ENCRYPTION_KEY, 64 caracteres hexadecimais) e nunca vai para o banco.
 * Formato guardado: v1.<iv>.<tag>.<texto cifrado>, tudo em base64url.
 */

const VERSION = "v1";

export class SecretsError extends Error {}

export function parseKey(hex: string): Buffer {
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new SecretsError("A chave de criptografia (CREDENTIALS_ENCRYPTION_KEY) precisa ter exatamente 64 caracteres de 0-9 e a-f.");
  }
  return Buffer.from(hex, "hex");
}

export function encryptSecret(plain: string, hexKey: string): string {
  const key = parseKey(hexKey);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64url"), tag.toString("base64url"), body.toString("base64url")].join(".");
}

export function decryptSecret(stored: string, hexKey: string): string {
  const key = parseKey(hexKey);
  const [version, iv, tag, body] = stored.split(".");
  if (version !== VERSION || !iv || !tag || !body) throw new SecretsError("Segredo guardado em formato desconhecido.");
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    throw new SecretsError("Não foi possível abrir o segredo guardado (chave trocada ou dado alterado).");
  }
}
