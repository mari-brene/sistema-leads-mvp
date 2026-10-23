import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type BadgeTone = "slate" | "green" | "red" | "amber" | "sky";

const TONES: Record<BadgeTone, string> = {
  slate: "bg-slate-100 text-slate-600 ring-slate-200",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  red: "bg-red-50 text-red-700 ring-red-200",
  amber: "bg-amber-50 text-amber-800 ring-amber-200",
  sky: "bg-sky-50 text-sky-700 ring-sky-200",
};

export function Badge({
  tone = "slate",
  title,
  className,
  children,
}: {
  tone?: BadgeTone;
  title?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
