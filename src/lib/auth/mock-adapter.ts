import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { config } from "@/lib/config";
import { hashPassword, verifyPassword } from "@/lib/security";
import type { AuthAdapter, AuthResult, AuthUser, SignUpInput } from "./types";

/**
 * Adaptador de SIMULAÇÃO: guarda os usuários num arquivo JSON local (.data/users.json).
 * Serve só para testar o sistema no seu computador, sem criar conta em nenhum serviço.
 * As senhas nunca são guardadas em texto: só o hash (scrypt).
 */

type StoredUser = AuthUser & {
  passwordHash: string;
  createdAt: string;
};

const MIN_PASSWORD_LENGTH = 8;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const INVALID_LOGIN = "E-mail ou senha incorretos.";

// Hash de mentira, usado para o tempo de resposta ser parecido
// quando o e-mail não existe (evita descobrir quais e-mails têm conta).
let dummyHash: string | null = null;
function getDummyHash(): string {
  if (!dummyHash) dummyHash = hashPassword("senha-de-mentira-para-igualar-o-tempo");
  return dummyHash;
}

function usersFile(): string {
  return path.join(config.dataDir, "users.json");
}

async function readUsers(): Promise<StoredUser[]> {
  try {
    const raw = await fs.readFile(usersFile(), "utf8");
    const data: unknown = JSON.parse(raw);
    return Array.isArray(data) ? (data as StoredUser[]) : [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function writeUsers(users: StoredUser[]): Promise<void> {
  const file = usersFile();
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(users, null, 2), "utf8");
  await fs.rename(tmp, file);
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function toPublicUser(user: StoredUser): AuthUser {
  return { id: user.id, email: user.email, name: user.name };
}

export const mockAuthAdapter: AuthAdapter = {
  async signUp({ name, email, password }: SignUpInput): Promise<AuthResult> {
    const cleanEmail = normalizeEmail(email);
    const cleanName = name.trim().slice(0, 80);

    if (!EMAIL_PATTERN.test(cleanEmail)) {
      return { ok: false, error: "Digite um e-mail válido." };
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      return { ok: false, error: `A senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.` };
    }

    const users = await readUsers();
    if (users.some((u) => u.email === cleanEmail)) {
      return { ok: false, error: "Já existe uma conta com esse e-mail." };
    }

    const user: StoredUser = {
      id: randomUUID(),
      email: cleanEmail,
      name: cleanName || cleanEmail.split("@")[0],
      passwordHash: hashPassword(password),
      createdAt: new Date().toISOString(),
    };

    await writeUsers([...users, user]);
    return { ok: true, user: toPublicUser(user) };
  },

  async signIn(email: string, password: string): Promise<AuthResult> {
    const users = await readUsers();
    const user = users.find((u) => u.email === normalizeEmail(email));

    if (!user) {
      verifyPassword(password, getDummyHash());
      return { ok: false, error: INVALID_LOGIN };
    }
    if (!verifyPassword(password, user.passwordHash)) {
      return { ok: false, error: INVALID_LOGIN };
    }
    return { ok: true, user: toPublicUser(user) };
  },

  async getUserById(id: string): Promise<AuthUser | null> {
    const users = await readUsers();
    const user = users.find((u) => u.id === id);
    return user ? toPublicUser(user) : null;
  },
};
