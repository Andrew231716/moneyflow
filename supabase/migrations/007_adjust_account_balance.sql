-- Atomic account balance adjustment (avoids lost updates from concurrent clients).
create or replace function public.adjust_account_balance(
  p_account_id uuid,
  p_delta numeric
)
returns numeric
language plpgsql
security invoker
set search_path = public
as $$
declare
  new_balance numeric(14, 2);
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  update public.accounts
  set balance = balance + p_delta,
      updated_at = now()
  where id = p_account_id
    and user_id = auth.uid()
  returning balance into new_balance;

  if new_balance is null then
    raise exception 'Account not found or not owned by user';
  end if;

  return new_balance;
end;
$$;

revoke all on function public.adjust_account_balance(uuid, numeric) from public;
grant execute on function public.adjust_account_balance(uuid, numeric) to authenticated;
