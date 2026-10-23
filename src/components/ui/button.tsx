import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export type ButtonVariant = "primary" | "ghost" | "outline" | "danger";

/** Classes de botão, para usar também em links (<Link>) que devem parecer botão. */
export function buttonStyles(variant: ButtonVariant = "primary", className?: string): string {
  return cn(
    "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition",
    "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2",
    "disabled:cursor-not-allowed disabled:opacity-60",
    variant === "primary" && "bg-brand-600 text-white shadow-soft hover:bg-brand-700",
    variant === "ghost" && "text-slate-600 hover:bg-slate-100",
    variant === "outline" && "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
    variant === "danger" && "border border-red-200 bg-white text-red-700 hover:bg-red-50",
    className,
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
};

export function Button({ variant = "primary", className, ...props }: ButtonProps) {
  return <button className={buttonStyles(variant, className)} {...props} />;
}
