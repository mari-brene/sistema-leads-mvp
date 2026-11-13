import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { InviteNotice } from "@/components/invite-notice";
import { config } from "@/lib/config";
import { getSession } from "@/lib/session";
import { hasPendingInvite } from "@/lib/tenancy/active-client";
import { signupAllowed } from "@/lib/tenancy/clients";
import { SignUpForm } from "./signup-form";

export const metadata: Metadata = { title: "Criar conta" };

export default async function SignUpPage() {
  if (await getSession()) redirect("/kanban");

  if (!signupAllowed(config.allowOpenSignup, await hasPendingInvite())) {
    return (
      <div className="space-y-3 text-center">
        <h1 className="text-lg font-semibold text-slate-900">Cadastro só por convite</h1>
        <p className="text-sm text-slate-600">Peça um link de convite a quem administra o sistema. Se você já tem conta, volte e entre.</p>
        <Link href="/login" className="text-sm font-medium text-brand-700 hover:underline">
          Ir para Entrar
        </Link>
      </div>
    );
  }

  return (
    <>
      <InviteNotice />
      <SignUpForm mockMode={config.mockMode && config.dataBackend === "file"} />
    </>
  );
}
