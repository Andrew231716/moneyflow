# MoneyFlow

Web app / PWA per la gestione delle finanze personali. Stack gratuito: **Next.js 15**, **TypeScript**, **Tailwind**, **shadcn/ui**, **Supabase** (Auth + PostgreSQL), PWA via `@ducanh2912/next-pwa`.

Open Banking (GoCardless) è implementato in `src/features/open-banking/**` e `src/app/api/open-banking/**` (vedi anche `supabase/migrations/002_open_banking.sql`).

## Requisiti

- Node.js 20+
- Account [Supabase](https://supabase.com) (free tier)
- (Opzionale) Credenziali GoCardless Bank Account Data per Open Banking

## Setup

```bash
cp .env.example .env.local
# Compila NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY
npm install
```

## Database (obbligatorio in ordine)

Esegui entrambi gli script SQL nel SQL Editor di Supabase:

1. **`supabase/migrations/001_initial_schema.sql`** — profiles, accounts, categories, transactions (con campi enrichment OB nullable), budgets, goals, recurring, classification_rules, assistant_actions, audit_log, RLS, seed categorie/regole al signup.
2. **`supabase/migrations/002_open_banking.sql`** — `bank_connections`, `bank_accounts`, FK su `transactions.bank_account_id`, colonne `fingerprint`, `merchant`, `possible_transfer_match_id`, `manual_override_fields`, indici dedup, RLS.

Non invertire l’ordine: 002 dipende da 001.

## Open Banking

- UI: Conti → **Collega banca** (`/accounts/connect-bank`) + pannello connessioni
- API: `src/app/api/open-banking/**`
- Suggerimenti trasferimento interno: Movimenti → conferma via `POST /api/open-banking/confirm-transfer`
- Test: `npm run test:open-banking`

### Avvio

```bash
npm run dev
```

Apri [http://localhost:3000](http://localhost:3000), registrati e crea un account.

```bash
npm run build   # produzione
npm run lint
npm test                  # core: engine, rules, assistant
npm run test:open-banking # OB unit tests
```

## Funzionalità core (lista)

- Auth email/password, RLS su tutte le tabelle
- Dashboard, Conti, Movimenti (incl. trasferimenti esclusi dalle stats), Budget, Obiettivi, Ricorrenti
- Categorie + regole di classificazione (non sovrascrivono categorie manuali)
- Import CSV guidato (PapaParse)
- Motore finanziario deterministico + previsioni + insight
- Assistente locale (regex/intent, conferma obbligatoria, audit + undo)
- Statistiche 6/12 mesi, tema chiaro/scuro, PWA
- Link **Collega banca** → `/accounts/connect-bank`

## Variabili d'ambiente

Vedi `.env.example`:

| Variabile | Uso |
|-----------|-----|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon key (mai service_role nel frontend) |
| `NEXT_PUBLIC_ENABLE_DEMO_SEED` | Mostra seed demo |
| `GOCARDLESS_SECRET_ID` / `GOCARDLESS_SECRET_KEY` | Solo server, Open Banking |
| `OPEN_BANKING_REDIRECT_URL` | Callback OAuth banca |

## Deploy su Vercel (Hobby / free)

MoneyFlow è pensato per **Vercel Hobby**: Next.js App Router, middleware Supabase e API Open Banking (`/api/open-banking/*`) richiedono un host Node/serverless. **Non** usare `output: 'export'` / GitHub Pages per il full stack.

### Opzione A — CLI (consigliata)

```bash
# 1. Login (una volta)
npx vercel login

# 2. Collega il progetto (directory corrente)
npx vercel link

# 3. Imposta le env (Production + Preview). Non committare .env.local.
npx vercel env add NEXT_PUBLIC_SUPABASE_URL
npx vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY
npx vercel env add NEXT_PUBLIC_ENABLE_DEMO_SEED   # opzionale
npx vercel env add GOCARDLESS_SECRET_ID           # se usi Open Banking
npx vercel env add GOCARDLESS_SECRET_KEY
# Dopo il primo deploy, aggiorna il callback con l’URL reale:
npx vercel env add OPEN_BANKING_REDIRECT_URL
# valore: https://<tuo-progetto>.vercel.app/api/open-banking/callback

# 4. Deploy produzione
npx vercel --prod
```

### Opzione B — Dashboard + GitHub

1. Push del branch su GitHub.
2. [vercel.com/new](https://vercel.com/new) → Import repository → framework **Next.js**.
3. Aggiungi le env vars (tabella sotto) → Deploy.
4. Piano **Hobby** (gratis): nessun feature a pagamento richiesto.

### Env vars su Vercel

| Variabile | Ambiente | Note |
|-----------|----------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | Production, Preview | Obbligatoria |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Production, Preview | Obbligatoria (mai `service_role`) |
| `NEXT_PUBLIC_ENABLE_DEMO_SEED` | opzionale | `true` / `false` |
| `GOCARDLESS_SECRET_ID` | Production, Preview | Solo se Open Banking |
| `GOCARDLESS_SECRET_KEY` | Production, Preview | Solo se Open Banking |
| `OPEN_BANKING_REDIRECT_URL` | Production | `https://<deployment>/api/open-banking/callback` |

Dopo il deploy, in **Supabase → Authentication → URL Configuration**:

- **Site URL**: `https://<tuo-progetto>.vercel.app`
- **Redirect URLs**: aggiungi `https://<tuo-progetto>.vercel.app/**` (e l’eventuale dominio custom)

In **GoCardless** (se usato), imposta lo stesso callback usato in `OPEN_BANKING_REDIRECT_URL`.

### Verifica

```bash
curl -I https://<tuo-progetto>.vercel.app
# atteso: HTTP 200 (o redirect verso /login)
```

## Struttura

```
src/app/(app)/          # pagine protette
src/features/           # moduli dominio
src/lib/finance/        # motore + regole
src/lib/supabase/       # client/server/middleware
supabase/migrations/    # SQL + RLS
```
