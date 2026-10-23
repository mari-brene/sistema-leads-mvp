import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mockAuthAdapter } from "@/lib/auth/mock-adapter";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "leads-test-"));
  process.env.DATA_DIR = dir;
});

afterEach(async () => {
  delete process.env.DATA_DIR;
  await rm(dir, { recursive: true, force: true });
});

const valid = { name: "Maria", email: "maria@exemplo.com", password: "senha-forte-123" };

describe("login de simulação", () => {
  it("cadastra e depois entra com a mesma senha", async () => {
    const created = await mockAuthAdapter.signUp(valid);
    expect(created.ok).toBe(true);

    const login = await mockAuthAdapter.signIn(valid.email, valid.password);
    expect(login.ok).toBe(true);
    if (login.ok) {
      expect(login.user.email).toBe("maria@exemplo.com");
      expect(login.user.name).toBe("Maria");
    }
  });

  it("trata o e-mail sem diferenciar maiúsculas e espaços", async () => {
    await mockAuthAdapter.signUp(valid);
    const login = await mockAuthAdapter.signIn("  MARIA@Exemplo.COM ", valid.password);
    expect(login.ok).toBe(true);
  });

  it("não deixa cadastrar o mesmo e-mail duas vezes", async () => {
    await mockAuthAdapter.signUp(valid);
    const again = await mockAuthAdapter.signUp({ ...valid, email: "MARIA@exemplo.com" });
    expect(again.ok).toBe(false);
  });

  it("recusa senha curta e e-mail inválido", async () => {
    const shortPassword = await mockAuthAdapter.signUp({ ...valid, password: "1234567" });
    expect(shortPassword.ok).toBe(false);

    const badEmail = await mockAuthAdapter.signUp({ ...valid, email: "isso-nao-e-email" });
    expect(badEmail.ok).toBe(false);
  });

  it("recusa senha errada e e-mail desconhecido com a mesma mensagem", async () => {
    await mockAuthAdapter.signUp(valid);

    const wrongPassword = await mockAuthAdapter.signIn(valid.email, "senha-errada-123");
    const unknownEmail = await mockAuthAdapter.signIn("ninguem@exemplo.com", valid.password);

    expect(wrongPassword.ok).toBe(false);
    expect(unknownEmail.ok).toBe(false);
    if (!wrongPassword.ok && !unknownEmail.ok) {
      expect(wrongPassword.error).toBe(unknownEmail.error);
    }
  });

  it("encontra o usuário pelo id e devolve null para id desconhecido", async () => {
    const created = await mockAuthAdapter.signUp(valid);
    if (!created.ok) throw new Error("cadastro deveria funcionar");

    expect(await mockAuthAdapter.getUserById(created.user.id)).toEqual(created.user);
    expect(await mockAuthAdapter.getUserById("nao-existe")).toBeNull();
  });

  it("usa a parte antes do @ como nome quando o nome vem vazio", async () => {
    const created = await mockAuthAdapter.signUp({ ...valid, name: "   " });
    expect(created.ok && created.user.name).toBe("maria");
  });
});
