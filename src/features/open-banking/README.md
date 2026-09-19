# Open Banking (MoneyFlow)

Read-only Account Information (AIS). No payments / PISP / transfers out.

## Setup

1. Apply `supabase/migrations/002_open_banking.sql` after `001_initial_schema.sql`.
2. Create a [GoCardless Bank Account Data](https://bankaccountdata.gocardless.com/) user secret.
3. Copy env vars from `.env.example`:

```bash
GOCARDLESS_SECRET_ID=
GOCARDLESS_SECRET_KEY=
OPEN_BANKING_REDIRECT_URL=http://localhost:3000/api/open-banking/callback
```

Secrets are **server-only** — never prefix with `NEXT_PUBLIC_`.

## Architecture

- App code uses `OpenBankingProvider` only (`src/features/open-banking/provider.ts`).
- GoCardless lives in `gocardless-provider.ts` (adapter). Tink / TrueLayer / Yapily / Salt Edge can be added via `factory.ts`.
- API base: `https://bankaccountdata.gocardless.com/api/v2`
- Token: `POST /token/new/` with secret id/key; cached server-side with refresh.

## Routes

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/open-banking/institutions?country=IT&q=` | List IT banks (Intesa first) |
| POST | `/api/open-banking/connect` | Create requisition → bank link |
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

## Tests

```bash
npm run test:open-banking
```
