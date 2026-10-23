"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signInAction, type FormState } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";

export function LoginForm({ mockMode }: { mockMode: boolean }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(signInAction, undefined);

  return (
    <>
      <h1 className="text-xl font-semibold text-slate-900">Entrar</h1>
      <p className="mt-1 text-sm text-slate-500">Use o e-mail e a senha da sua conta.</p>

      <form action={formAction} className="mt-6 space-y-4">
        <Field
          label="E-mail"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="voce@exemplo.com"
          defaultValue={state?.email ?? ""}
        />
        <Field label="Senha" name="password" type="password" autoComplete="current-password" required />

        {state?.error && (
          <p role="alert" className="rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
            {state.error}
          </p>
        )}

        <Button type="submit" disabled={pending} className="w-full">
          {pending ? "Entrando…" : "Entrar"}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-500">
        Ainda não tem conta?{" "}
        <Link href="/cadastro" className="font-medium text-brand-600 hover:text-brand-700">
          Criar conta
        </Link>
      </p>

      {mockMode && (
        <p className="mt-4 rounded-xl bg-amber-50 px-3.5 py-2.5 text-xs text-amber-800">
          Modo simulação: as contas ficam guardadas só neste computador, em um arquivo local.
        </p>
      )}
    </>
  );
}
