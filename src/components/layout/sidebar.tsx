"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Waves } from "lucide-react";
import { cn } from "@/lib/utils";
import { sidebarNav } from "./nav-config";

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden md:flex md:w-60 lg:w-64 shrink-0 flex-col border-r border-border/80 bg-sidebar/90 backdrop-blur-md">
      <div className="flex h-16 items-center gap-2.5 px-5 border-b border-border/80">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-soft">
          <Waves className="h-5 w-5" aria-hidden />
        </div>
        <div>
          <p className="font-semibold tracking-tight text-lg leading-none">MoneyFlow</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">Finanze personali</p>
        </div>
      </div>
      <nav className="flex-1 space-y-0.5 p-3 overflow-y-auto" aria-label="Navigazione principale">
        {sidebarNav.map((item) => {
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors min-h-touch",
                active
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
              aria-current={active ? "page" : undefined}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
