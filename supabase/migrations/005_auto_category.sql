-- Add "Auto" expense category for new and existing users

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
    (new.id, 'Auto', 'expense', 'car-front', '#ea580c', true),
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
    ('Starbucks', 'Ristoranti', 8),
    ('Autostrade', 'Auto', 8),
    ('Telepass', 'Auto', 9),
    ('Assicurazione auto', 'Auto', 9)
  ) as r(pattern, cat_name, priority)
  join public.categories c on c.user_id = new.id and c.name = r.cat_name and c.type = 'expense';

  return new;
end;
$$;

-- Backfill Auto for existing users who do not have it yet
insert into public.categories (user_id, name, type, icon, color, is_system)
select p.id, 'Auto', 'expense', 'car-front', '#ea580c', true
from public.profiles p
where not exists (
  select 1
  from public.categories c
  where c.user_id = p.id
    and c.type = 'expense'
    and lower(c.name) = 'auto'
);
