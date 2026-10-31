-- Gesture Kombat — run this once in Supabase: Dashboard → SQL Editor → New query → paste → Run.

-- 1) Player profiles (username + cloud stats), one row per account.
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text unique check (username ~ '^[A-Za-z0-9_]{3,16}$'),
  stats jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create unique index if not exists profiles_username_lower on public.profiles (lower(username));

-- 2) Security: players can read and change only their own row.
alter table public.profiles enable row level security;
drop policy if exists "own profile read" on public.profiles;
drop policy if exists "own profile update" on public.profiles;
create policy "own profile read" on public.profiles for select using (auth.uid() = id);
create policy "own profile update" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

-- 3) Create the profile automatically when an account is created
--    (email sign-up uses the chosen username; Google sign-up gets one from the Google name).
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  wanted text := coalesce(new.raw_user_meta_data ->> 'username',
                          regexp_replace(coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)), '[^A-Za-z0-9_]', '', 'g'));
  base text;
  candidate text;
  n int := 0;
begin
  base := left(coalesce(nullif(wanted, ''), 'fighter'), 16);
  if length(base) < 3 then base := base || 'fighter'; end if;
  candidate := base;
  while exists (select 1 from public.profiles where lower(username) = lower(candidate)) loop
    n := n + 1;
    candidate := left(base, 12) || n::text;
  end loop;
  insert into public.profiles (id, username) values (new.id, candidate);
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- 4) Lets the sign-up form check if a username is free (reveals nothing else).
create or replace function public.username_available(name text) returns boolean
language sql security definer set search_path = public stable as $$
  select not exists (select 1 from public.profiles where lower(username) = lower(name));
$$;
grant execute on function public.username_available(text) to anon, authenticated;
