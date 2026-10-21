-- Control Finance · Esquema para Supabase
-- Ejecuta todo este archivo en: Supabase → SQL Editor → New query → Run.
-- Es idempotente: puedes volver a ejecutarlo sin borrar datos.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------
-- Perfiles
-- ---------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null default 'David',
  goal numeric not null default 2000000 check (goal >= 0),
  quick_token_hash text,
  created_at timestamptz not null default now()
);

create unique index if not exists profiles_quick_token_hash_key
  on public.profiles (quick_token_hash)
  where quick_token_hash is not null;

-- ---------------------------------------------------------------
-- Movimientos
-- ---------------------------------------------------------------
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  type text not null check (type in ('income', 'expense')),
  amount numeric not null check (amount > 0),
  category text not null default 'Otros',
  note text not null default '',
  date date not null default current_date,
  created_at timestamptz not null default now()
);

create index if not exists transactions_user_date_idx
  on public.transactions (user_id, date desc, created_at desc);

-- Necesario para que Realtime entregue borrados con user_id.
alter table public.transactions replica identity full;

-- ---------------------------------------------------------------
-- Perfil automático al registrarse
-- ---------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, goal)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'name', ''), split_part(new.email, '@', 1)),
    coalesce(nullif(new.raw_user_meta_data ->> 'goal', '')::numeric, 2000000)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------
-- Seguridad por fila (RLS)
-- ---------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.transactions enable row level security;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select to authenticated using (id = auth.uid());

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles
  for insert to authenticated with check (id = auth.uid());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists transactions_select_own on public.transactions;
create policy transactions_select_own on public.transactions
  for select to authenticated using (user_id = auth.uid());

drop policy if exists transactions_insert_own on public.transactions;
create policy transactions_insert_own on public.transactions
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists transactions_update_own on public.transactions;
create policy transactions_update_own on public.transactions
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists transactions_delete_own on public.transactions;
create policy transactions_delete_own on public.transactions
  for delete to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------
-- Permisos
-- ---------------------------------------------------------------
grant usage on schema public to anon, authenticated;
revoke all on public.profiles from anon;
revoke all on public.transactions from anon;
grant select, insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.transactions to authenticated;

-- ---------------------------------------------------------------
-- Token para el Atajo de iOS
-- ---------------------------------------------------------------
create or replace function public.cf_token_hash(p_token text)
returns text
language sql
immutable
set search_path = public, extensions
as $$
  select encode(digest(p_token, 'sha256'), 'hex');
$$;

revoke all on function public.cf_token_hash(text) from public, anon, authenticated;

-- Alta rápida desde el Atajo. Solo puede insertar; no puede leer datos.
create or replace function public.cf_quick_add(
  p_token text,
  p_amount numeric,
  p_type text default 'expense',
  p_category text default 'Otros',
  p_note text default null,
  p_date date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user uuid;
  v_id uuid;
begin
  if p_token is null or length(p_token) < 24 then
    raise exception 'Token inválido' using errcode = '28000';
  end if;

  select id into v_user
  from public.profiles
  where quick_token_hash = public.cf_token_hash(p_token)
  limit 1;

  if v_user is null then
    raise exception 'Token inválido' using errcode = '28000';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Monto inválido' using errcode = '22023';
  end if;

  if p_type not in ('income', 'expense') then
    raise exception 'Tipo inválido' using errcode = '22023';
  end if;

  insert into public.transactions (user_id, type, amount, category, note, date)
  values (
    v_user,
    p_type,
    p_amount,
    coalesce(nullif(trim(p_category), ''), 'Otros'),
    coalesce(nullif(trim(p_note), ''), coalesce(nullif(trim(p_category), ''), 'Movimiento')),
    coalesce(p_date, current_date)
  )
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

revoke all on function public.cf_quick_add(text, numeric, text, text, text, date) from public;
grant execute on function public.cf_quick_add(text, numeric, text, text, text, date) to anon, authenticated;

-- ---------------------------------------------------------------
-- Realtime para sincronización instantánea
-- ---------------------------------------------------------------
do $$
begin
  execute 'alter publication supabase_realtime add table public.transactions';
exception
  when duplicate_object then null;
  when undefined_object then null;
end;
$$;
