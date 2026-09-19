import { Sidebar } from "./sidebar";
import { MobileBottomNav } from "./mobile-nav";
import { TopBar } from "./top-bar";

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
        <main className="flex-1 overflow-x-hidden px-4 py-5 pb-nav md:px-6 md:pb-8 animate-fade-in">
          <div className="mx-auto w-full max-w-6xl space-y-6">{children}</div>
        </main>
        <MobileBottomNav />
      </div>
    </div>
  );
}
