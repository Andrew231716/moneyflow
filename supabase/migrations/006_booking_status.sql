-- Booking status for Open Banking pending vs booked transactions

alter table public.transactions
  add column if not exists booking_status text not null default 'booked'
  check (booking_status in ('booked', 'pending'));

comment on column public.transactions.booking_status is
  'AIS booking state: pending = non contabilizzato (PDNG), booked = contabilizzato.';

create index if not exists transactions_pending_bank_idx
  on public.transactions(user_id, bank_account_id)
  where booking_status = 'pending' and source = 'bank';
