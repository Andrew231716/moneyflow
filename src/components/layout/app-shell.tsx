import { Sidebar } from "./sidebar";
import { MobileBottomNav } from "./mobile-nav";
import { TopBar } from "./top-bar";
import Link from "next/link";

export function AppShell({
  children,
  title,
}: {
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <div className="flex min-h-dvh">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar title={title} />
        <main className="flex-1 overflow-x-hidden px-4 py-5 pb-nav md:px-6 md:pb-8 animate-fade-in relative z-0">
          <div className="mx-auto w-full max-w-6xl space-y-6">{children}</div>
        </main>
        <MobileBottomNav />
        {title !== "Movimenti" && (
          <Link href="/transactions?new=expense"
            className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-4 z-20 rounded-full bg-primary px-5 py-3 font-semibold text-primary-foreground shadow-lg md:hidden">
            + Spesa
          </Link>
        )}
      </div>
    </div>
  );
}
