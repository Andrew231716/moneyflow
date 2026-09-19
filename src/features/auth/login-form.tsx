"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Waves } from "lucide-react";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export function LoginForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!hasSupabaseEnv()) {
      toast.error("Configura .env.local con le chiavi Supabase");
      return;
    }
    setLoading(true);
    try {
      const supabase = createClient();
      if (mode === "register") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName } },
        });
        if (error) throw error;
        toast.success("Account creato. Controlla l'email se richiesto.");
        router.push("/");
        router.refresh();
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        router.push("/");
        router.refresh();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore autenticazione");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-dvh flex items-center justify-center p-4">
      <div className="mf-surface-lift w-full max-w-md p-6 sm:p-8">
        <div className="text-center space-y-3 mb-6">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-soft">
            <Waves className="h-6 w-6" aria-hidden />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">MoneyFlow</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {mode === "login"
                ? "Accedi al tuo account"
                : "Crea un account gratuito"}
            </p>
          </div>
        </div>
        <form onSubmit={onSubmit} className="space-y-4">
          {mode === "register" && (
            <div className="space-y-2">
              <Label htmlFor="name">Nome</Label>
              <Input
                id="name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Mario Rossi"
                className="min-h-touch"
              />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@email.com"
              className="min-h-touch"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              required
              minLength={6}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="min-h-touch"
            />
          </div>
          <Button type="submit" className="w-full min-h-touch" disabled={loading}>
            {loading
              ? "Attendere…"
              : mode === "login"
                ? "Accedi"
                : "Registrati"}
          </Button>
        </form>
        <p className="mt-5 text-center text-sm text-muted-foreground">
          {mode === "login" ? (
            <>
              Non hai un account?{" "}
              <Link href="/register" className="text-primary font-medium hover:underline">
                Registrati
              </Link>
            </>
          ) : (
            <>
              Hai già un account?{" "}
              <Link href="/login" className="text-primary font-medium hover:underline">
                Accedi
              </Link>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
