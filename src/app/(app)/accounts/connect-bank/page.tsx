import { Suspense } from "react";
import { AppShell } from "@/components/layout/app-shell";
import ConnectBankClient from "./connect-bank-client";

export default function ConnectBankPage() {
  return (
    <AppShell title="Collega banca">
      <Suspense
        fallback={
          <div className="text-sm text-muted-foreground">Caricamento…</div>
        }
      >
        <ConnectBankClient />
      </Suspense>
    </AppShell>
  );
}
