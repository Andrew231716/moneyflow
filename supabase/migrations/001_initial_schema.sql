-- MoneyFlow initial schema
-- Run in Supabase SQL Editor or via supabase db push

create extension if not exists "pgcrypto";

-- Profiles
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  currency text not null default 'EUR',
  locale text not null default 'it-IT',
  theme text not null default 'system',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Accounts
create type public.account_type as enum ('bank', 'card', 'cash', 'savings');

create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  type public.account_type not null default 'bank',
  balance numeric(14,2) not null default 0,
  currency text not null default 'EUR',
  color text not null default '#0d9488',
  icon text not null default 'wallet',
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists accounts_user_id_idx on public.accounts(user_id);

-- Categories
create type public.category_type as enum ('income', 'expense');

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  type public.category_type not null,
  icon text not null default 'tag',
  color text not null default '#64748b',
  parent_id uuid references public.categories(id) on delete set null,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, name, type)
);

create index if not exists categories_user_id_idx on public.categories(user_id);

-- Transactions
create type public.transaction_type as enum ('income', 'expense', 'transfer');
create type public.transaction_source as enum ('manual', 'csv', 'bank', 'assistant');
create type public.category_source as enum ('manual', 'rule', 'csv', 'bank', 'assistant', 'system');

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  category_id uuid references public.categories(id) on delete set null,
  type public.transaction_type not null,
  amount numeric(14,2) not null check (amount > 0),
  description text not null default '',
  notes text,
  date date not null default current_date,
  source public.transaction_source not null default 'manual',
  transfer_pair_id uuid,
  transfer_account_id uuid references public.accounts(id) on delete set null,
  excluded_from_budget boolean not null default false,
  -- Open Banking / enrichment fields (bank_account_id FK added in 002_open_banking.sql)
  original_description text,
  original_merchant text,
  category_source public.category_source not null default 'manual',
  provider text,
  provider_transaction_id text,
  bank_account_id uuid,
  raw_data jsonb,
  manual_description_override boolean not null default false,
  manual_category_override boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists transactions_user_id_idx on public.transactions(user_id);
create index if not exists transactions_date_idx on public.transactions(user_id, date desc);
create index if not exists transactions_account_idx on public.transactions(account_id);
create index if not exists transactions_category_idx on public.transactions(category_id);
-- provider/fingerprint unique indexes + bank_account_id FK are in 002_open_banking.sql

-- Budgets (monthly per category)
create table if not exists public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  amount numeric(14,2) not null check (amount >= 0),
  month date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, category_id, month)
);

create index if not exists budgets_user_month_idx on public.budgets(user_id, month);

-- Goals
create type public.goal_status as enum ('active', 'completed', 'cancelled');

create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  target_amount numeric(14,2) not null check (target_amount > 0),
  current_amount numeric(14,2) not null default 0 check (current_amount >= 0),
  deadline date,
  account_id uuid references public.accounts(id) on delete set null,
  color text not null default '#0d9488',
  icon text not null default 'target',
  status public.goal_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists goals_user_id_idx on public.goals(user_id);

-- Recurring transactions
create type public.recurring_frequency as enum (
  'weekly', 'monthly', 'quarterly', 'semiannual', 'yearly'
);

create table if not exists public.recurring_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  category_id uuid references public.categories(id) on delete set null,
  type public.transaction_type not null check (type in ('income', 'expense')),
  amount numeric(14,2) not null check (amount > 0),
  description text not null default '',
  frequency public.recurring_frequency not null default 'monthly',
  next_due_date date not null,
  end_date date,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists recurring_user_id_idx on public.recurring_transactions(user_id);

-- Classification rules
create table if not exists public.classification_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  pattern text not null,
  match_type text not null default 'contains' check (match_type in ('contains', 'starts_with', 'exact', 'regex')),
  category_id uuid not null references public.categories(id) on delete cascade,
  priority int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists classification_rules_user_idx on public.classification_rules(user_id, priority desc);

-- Assistant actions (for undo)
create table if not exists public.assistant_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  action_type text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'undone', 'cancelled')),
  created_at timestamptz not null default now(),
  undone_at timestamptz
);

create index if not exists assistant_actions_user_idx on public.assistant_actions(user_id, created_at desc);

-- Audit log
create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entity_type text not null,
  entity_id uuid,
  action text not null,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_log_user_idx on public.audit_log(user_id, created_at desc);

-- updated_at trigger
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists accounts_updated_at on public.accounts;
create trigger accounts_updated_at before update on public.accounts
  for each row execute function public.set_updated_at();

drop trigger if exists transactions_updated_at on public.transactions;
create trigger transactions_updated_at before update on public.transactions
  for each row execute function public.set_updated_at();

drop trigger if exists budgets_updated_at on public.budgets;
create trigger budgets_updated_at before update on public.budgets
  for each row execute function public.set_updated_at();

drop trigger if exists goals_updated_at on public.goals;
create trigger goals_updated_at before update on public.goals
  for each row execute function public.set_updated_at();

drop trigger if exists recurring_updated_at on public.recurring_transactions;
create trigger recurring_updated_at before update on public.recurring_transactions
  for each row execute function public.set_updated_at();

-- Auto-create profile + default categories on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1))
  );

  insert into public.categories (user_id, name, type, icon, color, is_system) values
    (new.id, 'Stipendio', 'income', 'briefcase', '#16a34a', true),
    (new.id, 'Freelance', 'income', 'laptop', '#22c55e', true),
    (new.id, 'Investimenti', 'income', 'trending-up', '#84cc16', true),
    (new.id, 'Regali', 'income', 'gift', '#a3e635', true),
    (new.id, 'Altro entrata', 'income', 'plus-circle', '#4ade80', true),
    (new.id, 'Alimentari', 'expense', 'shopping-cart', '#ef4444', true),
    (new.id, 'Trasporti', 'expense', 'car', '#f97316', true),
    (new.id, 'Casa', 'expense', 'home', '#eab308', true),
    (new.id, 'Bollette', 'expense', 'zap', '#f59e0b', true),
    (new.id, 'Salute', 'expense', 'heart', '#ec4899', true),
    (new.id, 'Svago', 'expense', 'film', '#a855f7', true),
    (new.id, 'Ristoranti', 'expense', 'utensils', '#d946ef', true),
    (new.id, 'Abbigliamento', 'expense', 'shirt', '#8b5cf6', true),
    (new.id, 'Istruzione', 'expense', 'book', '#6366f1', true),
    (new.id, 'Abbonamenti', 'expense', 'repeat', '#3b82f6', true),
    (new.id, 'Viaggi', 'expense', 'plane', '#06b6d4', true),
    (new.id, 'Altro uscita', 'expense', 'minus-circle', '#64748b', true);

  insert into public.classification_rules (user_id, pattern, match_type, category_id, priority)
  select new.id, r.pattern, 'contains', c.id, r.priority
  from (values
    ('Esselunga', 'Alimentari', 10),
    ('Coop', 'Alimentari', 10),
    ('Conad', 'Alimentari', 10),
    ('Lidl', 'Alimentari', 10),
    ('Eni', 'Trasporti', 9),
    ('Q8', 'Trasporti', 9),
    ('ATM', 'Trasporti', 8),
    ('Trenitalia', 'Trasporti', 8),
    ('Netflix', 'Abbonamenti', 10),
    ('Spotify', 'Abbonamenti', 10),
    ('Amazon Prime', 'Abbonamenti', 9),
    ('ENEL', 'Bollette', 10),
    ('TIM', 'Bollette', 9),
    ('Vodafone', 'Bollette', 9),
    ('McDonald', 'Ristoranti', 8),
    ('Starbucks', 'Ristoranti', 8)
  ) as r(pattern, cat_name, priority)
  join public.categories c on c.user_id = new.id and c.name = r.cat_name and c.type = 'expense';

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- RLS
alter table public.profiles enable row level security;
alter table public.accounts enable row level security;
alter table public.categories enable row level security;
alter table public.transactions enable row level security;
alter table public.budgets enable row level security;
alter table public.goals enable row level security;
alter table public.recurring_transactions enable row level security;
alter table public.classification_rules enable row level security;
alter table public.assistant_actions enable row level security;
alter table public.audit_log enable row level security;

-- Profiles policies
create policy "profiles_select_own" on public.profiles for select using (auth.uid() = id);
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id);
create policy "profiles_insert_own" on public.profiles for insert with check (auth.uid() = id);

-- Generic user_id policies helper pattern
create policy "accounts_all_own" on public.accounts for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "categories_all_own" on public.categories for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "transactions_all_own" on public.transactions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "budgets_all_own" on public.budgets for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "goals_all_own" on public.goals for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "recurring_all_own" on public.recurring_transactions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "rules_all_own" on public.classification_rules for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "assistant_all_own" on public.assistant_actions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "audit_select_own" on public.audit_log for select using (auth.uid() = user_id);
create policy "audit_insert_own" on public.audit_log for insert with check (auth.uid() = user_id);
