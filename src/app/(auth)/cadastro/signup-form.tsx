"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signUpAction, type FormState } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";

export function SignUpForm({ mockMode }: { mockMode: boolean }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(signUpAction, undefined);

  return (
    <>
      <h1 className="text-xl font-semibold text-slate-900">Criar conta</h1>
      <p className="mt-1 text-sm text-slate-500">Leva menos de um minuto.</p>

      <form action={formAction} className="mt-6 space-y-4">
        <Field
          label="Nome"
          name="name"
          type="text"
          autoComplete="name"
          placeholder="Seu nome"
          defaultValue={state?.name ?? ""}
        />
        <Field
          label="E-mail"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="voce@exemplo.com"
          defaultValue={state?.email ?? ""}
        />
        <Field
          label="Senha (mínimo 8 caracteres)"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
        <Field
          label="Repita a senha"
          name="confirm"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />

        {state?.error && (
          <p role="alert" className="rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
            {state.error}
          </p>
        )}

        <Button type="submit" disabled={pending} className="w-full">
          {pending ? "Criando conta…" : "Criar conta"}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-500">
        Já tem conta?{" "}
        <Link href="/login" className="font-medium text-brand-600 hover:text-brand-700">
          Entrar
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
