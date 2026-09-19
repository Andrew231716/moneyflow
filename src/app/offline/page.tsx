export default function OfflinePage() {
  return (
    <div className="min-h-dvh flex items-center justify-center p-6 text-center">
      <div>
        <h1 className="text-xl font-semibold">Sei offline</h1>
        <p className="mt-2 text-muted-foreground text-sm">
          MoneyFlow riproverà quando torna la connessione.
        </p>
      </div>
    </div>
  );
}
