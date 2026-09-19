-- MoneyFlow Open Banking schema (read-only AIS)
-- Depends on 001_initial_schema.sql (accounts, transactions)

-- Connection lifecycle
create type public.bank_connection_status as enum (
  'pending',
  'active',
  'expired',
  'rejected',
  'suspended',
  'error',
  'disconnected'
);

create table if not exists public.bank_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'gocardless',
  provider_connection_id text not null,
  institution_id text not null,
  institution_name text not null,
  institution_logo text,
  status public.bank_connection_status not null default 'pending',
  consent_expires_at timestamptz,
  last_synced_at timestamptz,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider, provider_connection_id)
);

create index if not exists bank_connections_user_idx
  on public.bank_connections(user_id);

create index if not exists bank_connections_status_idx
  on public.bank_connections(user_id, status);

-- Provider accounts linked to MoneyFlow accounts
create table if not exists public.bank_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  connection_id uuid not null references public.bank_connections(id) on delete cascade,
  account_id uuid references public.accounts(id) on delete set null,
  provider_account_id text not null,
  iban_masked text,
  name text,
  currency text not null default 'EUR',
  balance numeric(14,2),
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider_account_id, connection_id)
);

create index if not exists bank_accounts_user_idx
  on public.bank_accounts(user_id);

create index if not exists bank_accounts_connection_idx
  on public.bank_accounts(connection_id);

create index if not exists bank_accounts_account_idx
  on public.bank_accounts(account_id);

-- Extend transactions for bank sync / dedup / overrides
alter table public.transactions
  add column if not exists bank_account_id uuid
    references public.bank_accounts(id) on delete set null;

alter table public.transactions
  add column if not exists provider text;

alter table public.transactions
  add column if not exists provider_transaction_id text;

alter table public.transactions
  add column if not exists fingerprint text;

alter table public.transactions
  add column if not exists merchant text;

alter table public.transactions
  add column if not exists possible_transfer_match_id uuid
    references public.transactions(id) on delete set null;

alter table public.transactions
  add column if not exists manual_override_fields text[] not null default '{}';

create index if not exists transactions_bank_account_idx
  on public.transactions(bank_account_id);

create index if not exists transactions_fingerprint_idx
  on public.transactions(user_id, fingerprint)
  where fingerprint is not null;

-- Dedup key: provider transaction id when present
create unique index if not exists transactions_provider_txid_uidx
  on public.transactions(user_id, provider, provider_transaction_id)
  where provider_transaction_id is not null;

-- Soft uniqueness for fingerprint-based dedup (manual txs may share empty provider)
create unique index if not exists transactions_fingerprint_uidx
  on public.transactions(user_id, fingerprint)
  where fingerprint is not null and provider_transaction_id is null;

drop trigger if exists bank_connections_updated_at on public.bank_connections;
create trigger bank_connections_updated_at before update on public.bank_connections
  for each row execute function public.set_updated_at();

drop trigger if exists bank_accounts_updated_at on public.bank_accounts;
create trigger bank_accounts_updated_at before update on public.bank_accounts
  for each row execute function public.set_updated_at();

-- RLS
alter table public.bank_connections enable row level security;
alter table public.bank_accounts enable row level security;

create policy "bank_connections_all_own" on public.bank_connections
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "bank_accounts_all_own" on public.bank_accounts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
