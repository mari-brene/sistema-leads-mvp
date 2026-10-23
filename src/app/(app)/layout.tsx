import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { signOutAction } from "@/app/(auth)/actions";
import { Icon } from "@/components/icons";
import { Sidebar } from "@/components/sidebar";
import { Button } from "@/components/ui/button";
import { config } from "@/lib/config";
import { getSession } from "@/lib/session";

// Estas telas dependem de quem está logado, então nunca são pré-geradas.
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await getSession();
  if (!user) redirect("/login");

  return (
    <div className="flex min-h-screen">
      <Sidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-14 items-center justify-between gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur md:px-6">
          <div className="flex items-center gap-2">
            {config.mockMode && (
              <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800">
                Modo simulação
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium leading-tight text-slate-900">{user.name}</p>
              <p className="text-xs leading-tight text-slate-500">{user.email}</p>
            </div>
            <form action={signOutAction}>
              <Button type="submit" variant="ghost" className="px-3 py-2">
                <Icon name="log-out" className="h-4 w-4" />
                Sair
              </Button>
            </form>
          </div>
        </header>

        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
