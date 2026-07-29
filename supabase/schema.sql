-- Chạy trong Supabase SQL Editor (một lần)
-- Project: gylultvdyakhgjtyatbz

-- Profiles (tùy chọn)
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);
create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = id);

-- Settings (1 row / user)
create table if not exists public.app_settings (
  id text not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  version int not null default 1,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
alter table public.app_settings enable row level security;
create policy "settings_all_own" on public.app_settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Goals
create table if not exists public.goals (
  id text not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  data jsonb not null,
  version int not null default 1,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
alter table public.goals enable row level security;
create policy "goals_all_own" on public.goals
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Transactions
create table if not exists public.transactions (
  id text not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  data jsonb not null,
  version int not null default 1,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
alter table public.transactions enable row level security;
create policy "tx_all_own" on public.transactions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Annual checklists
create table if not exists public.annual_checklists (
  id text not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  data jsonb not null,
  version int not null default 1,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
alter table public.annual_checklists enable row level security;
create policy "checklist_all_own" on public.annual_checklists
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Monthly snapshots
create table if not exists public.monthly_snapshots (
  id text not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  data jsonb not null,
  version int not null default 1,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
alter table public.monthly_snapshots enable row level security;
create policy "snap_all_own" on public.monthly_snapshots
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Auto profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
