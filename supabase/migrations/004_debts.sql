-- Debiti da saldare: liabilities tracked separately from disponibilità
create table if not exists public.debts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  amount numeric(14,2) not null check (amount >= 0),
  notes text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.debts is 'Manual debts to pay off (liabilities); not subtracted from disponibilità';
comment on column public.debts.paid_at is 'When marked paid/saldato; null means still open';

create index if not exists debts_user_id_idx on public.debts(user_id);
create index if not exists debts_user_open_idx on public.debts(user_id) where paid_at is null;

drop trigger if exists debts_updated_at on public.debts;
create trigger debts_updated_at before update on public.debts
  for each row execute function public.set_updated_at();

alter table public.debts enable row level security;

drop policy if exists "debts_all_own" on public.debts;
create policy "debts_all_own" on public.debts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
