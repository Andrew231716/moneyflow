"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { mobilePrimaryNav, mobileMoreNav, moreNavItem } from "./nav-config";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

export function MobileBottomNav() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  const moreActive = mobileMoreNav.some((item) =>
    item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)
  );

  return (
    <>
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-50 border-t border-border/80 bg-card/95 backdrop-blur-md shadow-lift pointer-events-auto"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
        aria-label="Navigazione mobile"
      >
        <ul className="grid grid-cols-5 gap-0.5 px-1 pt-1.5 pb-1">
          {mobilePrimaryNav.map((item) => {
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-[10px] font-medium",
                    "min-h-11 min-w-11 touch-manipulation",
                    active ? "text-primary" : "text-muted-foreground"
                  )}
                  aria-current={active ? "page" : undefined}
                >
                  <Icon className={cn("h-5 w-5", active && "stroke-[2.5]")} aria-hidden />
                  <span className="truncate max-w-full px-0.5">{item.label}</span>
                </Link>
              </li>
            );
          })}
          <li>
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              className={cn(
                "flex w-full flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-[10px] font-medium",
                "min-h-11 min-w-11 touch-manipulation",
                moreActive || moreOpen ? "text-primary" : "text-muted-foreground"
              )}
              aria-haspopup="dialog"
              aria-expanded={moreOpen}
            >
              <moreNavItem.icon className="h-5 w-5" aria-hidden />
              <span>{moreNavItem.label}</span>
            </button>
          </li>
        </ul>
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent
          side="bottom"
          className="rounded-t-3xl px-4 pb-6 max-h-[80dvh]"
          style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom, 0px))" }}
        >
          <SheetHeader className="text-left pb-3">
            <SheetTitle>Altro</SheetTitle>
          </SheetHeader>
          <nav className="grid gap-1" aria-label="Altre sezioni">
            {mobileMoreNav.map((item) => {
              const active = pathname.startsWith(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMoreOpen(false)}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-3 py-3 min-h-11 text-sm font-medium touch-manipulation",
                    active
                      ? "bg-primary/10 text-primary"
                      : "text-foreground hover:bg-muted"
                  )}
                >
                  <Icon className="h-5 w-5 text-muted-foreground" aria-hidden />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </SheetContent>
      </Sheet>
    </>
  );
}

/** Alias for existing imports */
export { MobileBottomNav as MobileNav };
