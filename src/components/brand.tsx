import { cn } from "@/lib/utils";

export const APP_NAME = "Sistema Leads MVP";

/** Quadradinho colorido com a letra L, usado como logo. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-violet-600 text-base font-bold text-white shadow-soft",
        className,
      )}
      aria-hidden="true"
    >
      L
    </span>
  );
}
