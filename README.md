# MoneyFlow

Web app / PWA per la gestione delle finanze personali. Stack gratuito: **Next.js 15**, **TypeScript**, **Tailwind**, **shadcn/ui**, **Supabase** (Auth + PostgreSQL). Installabile via manifest (service worker opzionale: il plugin `@ducanh2912/next-pwa` è disattivato in `next.config.mjs`).

Open Banking (Enable Banking / GoCardless) è in `src/features/open-banking/**` e `src/app/api/open-banking/**`.

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

Esegui gli script SQL nel SQL Editor di Supabase **in ordine**:

1. **`001_initial_schema.sql`** — profiles, accounts, categories, transactions, budgets, goals, recurring, classification_rules, assistant_actions, audit_log, RLS, seed.
2. **`002_open_banking.sql`** — `bank_connections`, `bank_accounts`, fingerprint/merchant/dedup, RLS.
3. **`003_goals_settled.sql`** — flag `settled` / `settled_at` sugli obiettivi.
4. **`004_debts.sql`** — tabella debiti manuali.
5. **`005_auto_category.sql`** — classificazione automatica movimenti banca.
6. **`006_booking_status.sql`** — `booking_status` (movimenti in sospeso / non contabilizzati).
7. **`007_adjust_account_balance.sql`** — RPC atomica `adjust_account_balance` per aggiornare i saldi senza race.

Non invertire l’ordine: ogni file dipende dai precedenti.

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
| `OPEN_BANKING_PROVIDER` | `enablebanking` (default) o `gocardless` |
| `ENABLEBANKING_APPLICATION_ID` | Solo server — Application ID Enable Banking |
| `ENABLEBANKING_PRIVATE_KEY` | Solo server — chiave privata PEM (mai in git) |
| `GOCARDLESS_SECRET_ID` / `GOCARDLESS_SECRET_KEY` | Legacy, solo se `OPEN_BANKING_PROVIDER=gocardless` |
| `OPEN_BANKING_REDIRECT_URL` | Callback AIS (whitelist nel Control Panel) |
| `SUPABASE_SERVICE_ROLE_KEY` | Solo server — sync cron (bypassa RLS) |
| `CRON_SECRET` | Bearer per `GET /api/cron/open-banking-sync` |

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
npx vercel env add OPEN_BANKING_PROVIDER          # enablebanking
npx vercel env add ENABLEBANKING_APPLICATION_ID
npx vercel env add ENABLEBANKING_PRIVATE_KEY      # PEM (newline o \n)
# Dopo il primo deploy, aggiorna il callback con l’URL reale:
npx vercel env add OPEN_BANKING_REDIRECT_URL
# valore: https://moneyflow-ecru.vercel.app/api/open-banking/callback
# Whitelist lo stesso URL in Enable Banking Control Panel → Redirect URLs

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
| `OPEN_BANKING_PROVIDER` | Production, Preview | `enablebanking` (consigliato) |
| `ENABLEBANKING_APPLICATION_ID` | Production, Preview | Da Enable Banking Control Panel |
| `ENABLEBANKING_PRIVATE_KEY` | Production, Preview | PEM RSA — non committare |
| `OPEN_BANKING_REDIRECT_URL` | Production | `https://moneyflow-ecru.vercel.app/api/open-banking/callback` |
| `SUPABASE_SERVICE_ROLE_KEY` | Production | Obbligatoria per il cron sync banca |
| `CRON_SECRET` | Production | Stesso secret usato da Vercel Cron (`Authorization: Bearer …`) |
| `GOCARDLESS_*` | opzionale | Solo se `OPEN_BANKING_PROVIDER=gocardless` |

Dopo il deploy, in **Supabase → Authentication → URL Configuration**:

- **Site URL**: `https://moneyflow-ecru.vercel.app`
- **Redirect URLs**: aggiungi `https://moneyflow-ecru.vercel.app/**` (e l’eventuale dominio custom)

In **Enable Banking Control Panel**, whitelist lo stesso callback di `OPEN_BANKING_REDIRECT_URL`
(`https://moneyflow-ecru.vercel.app/api/open-banking/callback`).

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
