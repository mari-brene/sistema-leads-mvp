import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const CONTROL =
  "block w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30";

function Wrapper({
  label,
  name,
  hint,
  className,
  children,
}: {
  label: string;
  name: string;
  hint?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={name} className="block text-sm font-medium text-slate-700">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

type FieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  name: string;
  hint?: string;
  wrapperClassName?: string;
};

/** Campo de formulário com o rótulo em cima. */
export function Field({ label, name, hint, wrapperClassName, ...props }: FieldProps) {
  return (
    <Wrapper label={label} name={name} hint={hint} className={wrapperClassName}>
      <input id={name} name={name} className={CONTROL} {...props} />
    </Wrapper>
  );
}

type SelectFieldProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  name: string;
  hint?: string;
  wrapperClassName?: string;
};

export function SelectField({ label, name, hint, wrapperClassName, children, ...props }: SelectFieldProps) {
  return (
    <Wrapper label={label} name={name} hint={hint} className={wrapperClassName}>
      <select id={name} name={name} className={CONTROL} {...props}>
        {children}
      </select>
    </Wrapper>
  );
}

type TextAreaFieldProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
  name: string;
  hint?: string;
  wrapperClassName?: string;
};

export function TextAreaField({ label, name, hint, wrapperClassName, ...props }: TextAreaFieldProps) {
  return (
    <Wrapper label={label} name={name} hint={hint} className={wrapperClassName}>
      <textarea id={name} name={name} className={CONTROL} {...props} />
    </Wrapper>
  );
}

/** Estilo de campo para usar em <select>/<input> soltos (fora de um formulário com rótulo). */
export const controlClass = CONTROL;
