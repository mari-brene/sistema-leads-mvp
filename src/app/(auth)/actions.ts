"use server";

import { redirect } from "next/navigation";
import { getAuthAdapter } from "@/lib/auth";
import { endSession, startSession } from "@/lib/session";

/** Se deu erro, devolvemos também nome e e-mail para a tela não apagar o que a pessoa digitou. */
export type FormState = { error?: string; name?: string; email?: string } | undefined;

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export async function signInAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = field(formData, "email");
  const password = field(formData, "password");

  if (!email.trim() || !password) {
    return { error: "Preencha e-mail e senha.", email };
  }

  const result = await getAuthAdapter().signIn(email, password);
  if (!result.ok) return { error: result.error, email };

  await startSession(result.user.id);
  redirect("/kanban");
}

export async function signUpAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const name = field(formData, "name");
  const email = field(formData, "email");
  const password = field(formData, "password");
  const confirm = field(formData, "confirm");

  if (!email.trim() || !password) {
    return { error: "Preencha e-mail e senha.", name, email };
  }
  if (password !== confirm) {
    return { error: "As senhas não são iguais.", name, email };
  }

  const result = await getAuthAdapter().signUp({ name, email, password });
  if (!result.ok) return { error: result.error, name, email };

  await startSession(result.user.id);
  redirect("/kanban");
}

export async function signOutAction(): Promise<void> {
  await endSession();
  redirect("/login");
}
