alter table public.debts add column if not exists due_date date;

create or replace function public.create_expense_split(
  p_account uuid, p_date date, p_description text, p_parts jsonb
) returns void
language plpgsql security invoker set search_path = public
as $$
declare
  owner_id uuid := auth.uid();
  total numeric;
begin
  if owner_id is null or jsonb_typeof(p_parts) is distinct from 'array' then
    raise exception 'Richiesta non valida';
  end if;
  if jsonb_array_length(p_parts) < 2 or jsonb_array_length(p_parts) > 20 then
    raise exception 'Inserisci da 2 a 20 quote';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_parts) as part(amount numeric, category_id uuid)
    where part.amount is null or part.amount <= 0 or part.amount <> round(part.amount, 2)
      or not exists (select 1 from categories c where c.id = part.category_id
        and c.user_id = owner_id and c.type = 'expense')
  ) then
    raise exception 'Controlla importi e categorie';
  end if;
  select sum(amount) into total from jsonb_to_recordset(p_parts) as part(amount numeric);
  perform adjust_account_balance(p_account, -total);
  insert into transactions (user_id, account_id, category_id, type, amount, description, date, source, category_source, manual_category_override)
  select owner_id, p_account, category_id, 'expense', amount, p_description, p_date, 'manual', 'manual', true
  from jsonb_to_recordset(p_parts) as part(amount numeric, category_id uuid);
end;
$$;
revoke all on function public.create_expense_split(uuid,date,text,jsonb) from public;
grant execute on function public.create_expense_split(uuid,date,text,jsonb) to authenticated;
