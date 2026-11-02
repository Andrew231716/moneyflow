"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
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
  const router = useRouter();
  const [moreOpen, setMoreOpen] = useState(false);
  const [, startTransition] = useTransition();

  const moreActive = mobileMoreNav.some((item) =>
    item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)
  );

  function go(href: string) {
    setMoreOpen(false);
    if (href === pathname) return;
    // startTransition keeps the nav responsive while the route loads
    startTransition(() => {
      router.push(href);
    });
  }

  return (
    <>
      <nav
        className={cn(
          "md:hidden fixed bottom-0 inset-x-0 z-[60] isolate",
          "border-t border-border bg-card",
          "shadow-[0_-4px_16px_hsl(170_20%_20%/0.06)]"
        )}
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
        aria-label="Navigazione mobile"
      >
        <ul className="grid h-14 grid-cols-5">
          {mobilePrimaryNav.map((item) => {
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <li key={item.href} className="min-w-0">
                <Link
                  href={item.href}
                  prefetch
                  onClick={(e) => {
                    // Avoid waiting on the default soft-nav path on flaky mobile WebViews.
                    e.preventDefault();
                    go(item.href);
                  }}
                  className={cn(
                    "flex h-full w-full flex-col items-center justify-center gap-0.5 px-1",
                    "text-[10px] font-medium touch-manipulation select-none",
                    "active:bg-muted/60",
                    active ? "text-primary" : "text-muted-foreground"
                  )}
                  aria-current={active ? "page" : undefined}
                >
                  <Icon
                    className={cn(
                      "h-5 w-5 pointer-events-none",
                      active && "stroke-[2.5]"
                    )}
                    aria-hidden
                  />
                  <span className="truncate max-w-full px-0.5 pointer-events-none">
                    {item.label}
                  </span>
                </Link>
              </li>
            );
          })}
          <li className="min-w-0">
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              className={cn(
                "flex h-full w-full flex-col items-center justify-center gap-0.5 px-1",
                "text-[10px] font-medium touch-manipulation select-none",
                "active:bg-muted/60",
                moreActive || moreOpen ? "text-primary" : "text-muted-foreground"
              )}
              aria-haspopup="dialog"
              aria-expanded={moreOpen}
            >
              <moreNavItem.icon
                className="h-5 w-5 pointer-events-none"
                aria-hidden
              />
              <span className="pointer-events-none">{moreNavItem.label}</span>
            </button>
          </li>
        </ul>
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent
          side="bottom"
          className="z-[70] rounded-t-3xl px-4 pb-6 max-h-[80dvh]"
          style={{
            paddingBottom: "max(1.5rem, env(safe-area-inset-bottom, 0px))",
          }}
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
                  prefetch
                  onClick={(e) => {
                    e.preventDefault();
                    go(item.href);
                  }}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-3 py-3 min-h-12 text-sm font-medium",
                    "touch-manipulation select-none active:bg-muted",
                    active
                      ? "bg-primary/10 text-primary"
                      : "text-foreground hover:bg-muted"
                  )}
                >
                  <Icon
                    className="h-5 w-5 text-muted-foreground pointer-events-none"
                    aria-hidden
                  />
                  <span className="pointer-events-none">{item.label}</span>
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
