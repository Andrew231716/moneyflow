# Open Banking (MoneyFlow)

Read-only Account Information (AIS). No payments / PISP / transfers out.

## Setup (Enable Banking — default)

GoCardless Bank Account Data is closed to new signups. MoneyFlow defaults to
[Enable Banking](https://enablebanking.com/).

1. Apply `supabase/migrations/002_open_banking.sql` after `001_initial_schema.sql`.
2. Create an Enable Banking application in the Control Panel.
3. Whitelist the redirect URL (must match `OPEN_BANKING_REDIRECT_URL`):
   - Local: `http://localhost:3000/api/open-banking/callback`
   - Production: `https://moneyflow-ecru.vercel.app/api/open-banking/callback`
4. Copy env vars from `.env.example`:

```bash
OPEN_BANKING_PROVIDER=enablebanking
ENABLEBANKING_APPLICATION_ID=   # Application ID from Control Panel
ENABLEBANKING_PRIVATE_KEY=      # RSA private key PEM (keep secrets out of git)
OPEN_BANKING_REDIRECT_URL=http://localhost:3000/api/open-banking/callback
```

For Vercel, set the same three variables (plus Supabase). Paste the PEM with
real newlines or `\n` escapes — never commit the private key.

Optional legacy GoCardless:

```bash
OPEN_BANKING_PROVIDER=gocardless
GOCARDLESS_SECRET_ID=
GOCARDLESS_SECRET_KEY=
```

Secrets are **server-only** — never prefix with `NEXT_PUBLIC_`.

## Architecture

- App code uses `OpenBankingProvider` only (`provider.ts`).
- Default provider id: `resolveDefaultProviderId()` (env `OPEN_BANKING_PROVIDER`,
  else Enable Banking if configured, else GoCardless if configured).
- Adapters: `enablebanking-provider.ts`, `gocardless-provider.ts`.
- Enable Banking API: `https://api.enablebanking.com` (RS256 JWT per request).
- Callback: Enable Banking returns `code` + `state` (our `reference`); GoCardless uses `ref`.

## Routes

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/open-banking/institutions?country=IT&q=` | List IT banks (Intesa first) |
| POST | `/api/open-banking/connect` | Start AIS auth → bank link |
| GET | `/api/open-banking/callback` | After bank auth → accounts + sync |
| POST | `/api/open-banking/sync` | Re-sync connection |
| GET | `/api/open-banking/accounts` | List connections |
| POST | `/api/open-banking/disconnect` | Disconnect |
| POST | `/api/open-banking/confirm-transfer` | Confirm suggested internal transfer |

UI: `/accounts/connect-bank` (under `(app)` route group)

## Sibling integration

On Conti / accounts page:

```tsx
import {
  BankConnectionsPanel,
  ConnectBankLink,
} from "@/features/open-banking/components/bank-connections-panel";

// Header action
<ConnectBankLink />

// Body
<BankConnectionsPanel />
```

Extend `Transaction` / `Account` types in `src/types/database.ts` with OB columns from migration 002 when ready (`bank_account_id`, `provider`, `provider_transaction_id`, `fingerprint`, `merchant`, `manual_override_fields`, `possible_transfer_match_id`).

## Intesa Sanpaolo

Institution IDs are **never hardcoded**. Institutions are fetched for `country=IT` and Intesa is prioritized by case-insensitive name normalization (`Intesa Sanpaolo` / `Intesa San Paolo` / `INTESA SANPAOLO`). If not found, the full list is shown.

Enable Banking ids are encoded as `COUNTRY::Name` (e.g. `IT::Intesa Sanpaolo`).

## Tests

```bash
npm run test:open-banking
```
