import type { ReactNode } from "react";
import { APP_NAME, BrandMark } from "@/components/brand";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-50 via-slate-50 to-violet-50 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-3">
          <BrandMark className="h-11 w-11 text-lg" />
          <span className="text-lg font-semibold text-slate-900">{APP_NAME}</span>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-soft sm:p-8">
          {children}
        </div>
      </div>
    </main>
  );
}
