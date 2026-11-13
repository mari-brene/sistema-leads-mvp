"use server";

import { redirect } from "next/navigation";
import { getAuthAdapter } from "@/lib/auth";
import { endSession, startSession } from "@/lib/session";
import { config } from "@/lib/config";
import { acceptPendingInvite, clearClientPreference, hasPendingInvite } from "@/lib/tenancy/active-client";
import { signupAllowed } from "@/lib/tenancy/clients";

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
  await acceptPendingInvite(result.user.id);
  redirect("/kanban");
}

export async function signUpAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const name = field(formData, "name");
  const email = field(formData, "email");
  const password = field(formData, "password");
  const confirm = field(formData, "confirm");

  if (!signupAllowed(config.allowOpenSignup, await hasPendingInvite())) {
    return { error: "O cadastro é só por convite. Peça um link a quem administra o sistema.", name, email };
  }
  if (!email.trim() || !password) {
    return { error: "Preencha e-mail e senha.", name, email };
  }
  if (password !== confirm) {
    return { error: "As senhas não são iguais.", name, email };
  }

  const result = await getAuthAdapter().signUp({ name, email, password });
  if (!result.ok) return { error: result.error, name, email };

  await startSession(result.user.id);
  await acceptPendingInvite(result.user.id);
  redirect("/kanban");
}

export async function signOutAction(): Promise<void> {
  await endSession();
  await clearClientPreference();
  redirect("/login");
}
