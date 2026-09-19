"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { MoneyFlowMark } from "@/components/brand/moneyflow-mark";
import { Button } from "@/components/ui/button";

export function TopBar({ title }: { title?: string }) {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border/80 bg-background/80 px-4 backdrop-blur-md md:h-16 md:px-6 safe-top">
      <div className="flex flex-1 min-w-0 items-center gap-2.5">
        <MoneyFlowMark size="sm" className="md:hidden" />
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground md:hidden">MoneyFlow</p>
          <h1 className="truncate text-lg font-semibold tracking-tight leading-tight">
            {title ?? "MoneyFlow"}
          </h1>
        </div>
      </div>

      <Button
        variant="ghost"
        size="icon"
        className="min-h-touch min-w-touch relative"
        onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
        aria-label="Cambia tema"
      >
        <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
        <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
      </Button>
    </header>
  );
}
