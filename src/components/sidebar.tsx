"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { BrandMark } from "@/components/brand";
import { Icon } from "@/components/icons";
import { NAV_ITEMS } from "@/lib/nav";
import { cn } from "@/lib/utils";

/**
 * Menu lateral recolhível.
 * No celular ele fica sempre estreito (só ícones); no computador você pode recolher ou expandir.
 */
export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  const labelClass = collapsed ? "hidden" : "hidden md:inline";

  return (
    <aside
      className={cn(
        "sticky top-0 flex h-screen shrink-0 flex-col border-r border-slate-200 bg-white transition-[width] duration-200",
        collapsed ? "w-16" : "w-16 md:w-60",
      )}
    >
      <div className="flex h-14 items-center gap-3 border-b border-slate-200 px-3.5">
        <BrandMark />
        <span className={cn("truncate text-sm font-semibold text-slate-900", labelClass)}>
          Sistema Leads
        </span>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-2" aria-label="Menu principal">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.slug}
              href={item.href}
              title={item.label}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition",
                active
                  ? "bg-brand-50 text-brand-700"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
              )}
            >
              <Icon name={item.icon} className="h-5 w-5 shrink-0" />
              <span className={cn("truncate", labelClass)}>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="hidden border-t border-slate-200 p-2 md:block">
        <button
          type="button"
          onClick={() => setCollapsed((value) => !value)}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-500 transition hover:bg-slate-100"
          aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
        >
          <Icon name={collapsed ? "chevrons-right" : "chevrons-left"} className="h-5 w-5 shrink-0" />
          {!collapsed && <span>Recolher menu</span>}
        </button>
      </div>
    </aside>
  );
}
