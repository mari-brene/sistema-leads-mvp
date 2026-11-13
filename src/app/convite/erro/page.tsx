import type { Metadata } from "next";
import Link from "next/link";
import { buttonStyles } from "@/components/ui/button";
import { INVITE_FAILURE_TEXT, isInviteFailure } from "@/lib/tenancy/invite-link";

export const metadata: Metadata = { title: "Convite" };

export default async function InviteErrorPage({ searchParams }: { searchParams: Promise<{ motivo?: string }> }) {
  const { motivo } = await searchParams;
  const text = INVITE_FAILURE_TEXT[isInviteFailure(motivo) ? motivo : "invalido"];

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-soft">
        <h1 className="text-lg font-semibold text-slate-900">Convite</h1>
        <p className="mt-2 text-sm text-slate-600">{text}</p>
        <Link href="/kanban" className={buttonStyles("primary", "mt-5")}>
          Ir para o sistema
        </Link>
      </div>
    </main>
  );
}
