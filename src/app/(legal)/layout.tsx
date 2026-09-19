import Link from "next/link";

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <Link href="/login" className="text-xl font-semibold text-primary">
        MoneyFlow
      </Link>
      <article className="mt-8 space-y-5 leading-relaxed [&_h1]:text-3xl [&_h1]:font-bold [&_h2]:pt-4 [&_h2]:text-xl [&_h2]:font-semibold [&_a]:underline [&_ul]:text-sm sm:[&_ul]:text-base">
        {children}
      </article>
      <nav
        aria-label="Informazioni legali"
        className="mt-12 flex gap-6 border-t border-border pt-6 text-sm text-muted-foreground"
      >
        <Link href="/privacy" className="hover:text-foreground">
          Privacy
        </Link>
        <Link href="/terms" className="hover:text-foreground">
          Termini di utilizzo
        </Link>
      </nav>
    </main>
  );
}
