-- Goal settlement: completed = target met; settled (saldato) = money spent / removed from available pool
alter table public.goals
  add column if not exists settled boolean not null default false,
  add column if not exists settled_at timestamptz;

comment on column public.goals.settled is 'True when earmarked funds were spent/used and no longer available';
comment on column public.goals.settled_at is 'When the goal was marked saldato';

create index if not exists goals_user_settled_idx on public.goals(user_id, settled);

-- Existing goals remain non-settled (earmarked but still available)
update public.goals set settled = false where settled is distinct from true;
