import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function EnvMissing() {
  return (
    <Card className="max-w-xl mx-auto">
      <CardHeader>
        <CardTitle>Configura Supabase</CardTitle>
        <CardDescription>
          MoneyFlow è pronto, ma mancano le variabili d&apos;ambiente.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm text-muted-foreground">
        <ol className="list-decimal pl-5 space-y-2">
          <li>
            Copia <code className="text-foreground">.env.example</code> in{" "}
            <code className="text-foreground">.env.local</code>
          </li>
          <li>Inserisci URL e anon key del tuo progetto Supabase</li>
          <li>
            Esegui lo SQL in{" "}
            <code className="text-foreground">supabase/migrations/001_initial_schema.sql</code>
          </li>
          <li>Riavvia <code className="text-foreground">npm run dev</code></li>
        </ol>
        <Button asChild variant="outline">
          <Link href="/login">Vai al login</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
