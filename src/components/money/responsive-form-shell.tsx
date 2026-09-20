"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

function useIsMobile(breakpoint = 768) {
  // Mobile-first: assume phone until measured so forms open as Sheet on iOS.
  const [mobile, setMobile] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const update = () => setMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [breakpoint]);
  return mobile;
}

/** Extra bottom inset so fixed sheets sit above the iOS keyboard + autofill bar. */
function useKeyboardInset(enabled: boolean) {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    const vv = window.visualViewport;
    if (!vv) return;

    const update = () => {
      // Layout viewport bottom often sits behind the software keyboard on iOS Safari.
      const covered = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      setInset(covered);
    };

    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    window.addEventListener("focusin", update);
    window.addEventListener("focusout", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      window.removeEventListener("focusin", update);
      window.removeEventListener("focusout", update);
    };
  }, [enabled]);

  return inset;
}

/** Dialog on desktop, bottom Sheet on mobile — amount-first forms. */
export function ResponsiveFormShell({
  open,
  onOpenChange,
  title,
  children,
  footer,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}) {
  const isMobile = useIsMobile();
  const keyboardInset = useKeyboardInset(isMobile && open);

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="bottom"
          style={{
            bottom: keyboardInset > 0 ? keyboardInset : undefined,
            maxHeight:
              keyboardInset > 0
                ? `calc(100dvh - ${keyboardInset}px - 0.5rem)`
                : undefined,
            paddingBottom:
              keyboardInset > 0
                ? "max(0.75rem, env(safe-area-inset-bottom, 0px))"
                : undefined,
          }}
          className={cn(
            "flex flex-col gap-0 rounded-t-3xl max-h-[92dvh] p-0 safe-bottom",
            className
          )}
        >
          <SheetHeader className="shrink-0 text-left px-5 pt-6 pb-2">
            <SheetTitle>{title}</SheetTitle>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-3 space-y-4">
            {children}
          </div>
          {footer ? (
            <div className="shrink-0 border-t border-border/60 bg-background px-5 pt-3 pb-5 safe-bottom">
              <div className="flex flex-col gap-2">{footer}</div>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn("sm:max-w-md", className)}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">{children}</div>
        {footer ? <DialogFooter className="gap-2 sm:gap-0">{footer}</DialogFooter> : null}
      </DialogContent>
    </Dialog>
  );
}
