import { Icon } from "@/components/icons";
import type { NavItem } from "@/lib/nav";

/** Tela provisória das seções que ainda serão construídas nas próximas fases. */
export function PlaceholderPage({ item }: { item: NavItem }) {
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold text-slate-900">{item.label}</h1>
      <p className="mt-1 text-slate-600">{item.description}</p>

      <div className="mt-8 rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center shadow-soft">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
          <Icon name={item.icon} className="h-6 w-6" />
        </span>
        <p className="mt-4 font-medium text-slate-900">Esta tela chega na fase {item.phase}</p>
        <p className="mt-1 text-sm text-slate-500">
          O menu e o login já funcionam. Cada fase do projeto liga mais uma parte do sistema.
        </p>
      </div>
    </div>
  );
}
