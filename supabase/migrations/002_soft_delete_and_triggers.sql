-- Chạy sau schema.sql trong Supabase SQL Editor
-- Bổ sung deleted_at + trigger version/updated_at

alter table public.app_settings add column if not exists deleted_at timestamptz;
alter table public.app_settings add column if not exists created_at timestamptz not null default now();

alter table public.goals add column if not exists deleted_at timestamptz;
alter table public.goals add column if not exists created_at timestamptz not null default now();

alter table public.transactions add column if not exists deleted_at timestamptz;
alter table public.transactions add column if not exists created_at timestamptz not null default now();

alter table public.annual_checklists add column if not exists deleted_at timestamptz;
alter table public.annual_checklists add column if not exists created_at timestamptz not null default now();

alter table public.monthly_snapshots add column if not exists deleted_at timestamptz;
alter table public.monthly_snapshots add column if not exists created_at timestamptz not null default now();

create index if not exists idx_settings_user_updated on public.app_settings (user_id, updated_at);
create index if not exists idx_goals_user_updated on public.goals (user_id, updated_at);
create index if not exists idx_tx_user_updated on public.transactions (user_id, updated_at);
create index if not exists idx_checklist_user_updated on public.annual_checklists (user_id, updated_at);
create index if not exists idx_snap_user_updated on public.monthly_snapshots (user_id, updated_at);

create or replace function public.bump_version_and_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  new.version := coalesce(old.version, 0) + 1;
  return new;
end;
$$;

drop trigger if exists trg_settings_bump on public.app_settings;
create trigger trg_settings_bump before update on public.app_settings
  for each row execute function public.bump_version_and_updated_at();

drop trigger if exists trg_goals_bump on public.goals;
create trigger trg_goals_bump before update on public.goals
  for each row execute function public.bump_version_and_updated_at();

drop trigger if exists trg_tx_bump on public.transactions;
create trigger trg_tx_bump before update on public.transactions
  for each row execute function public.bump_version_and_updated_at();

drop trigger if exists trg_checklist_bump on public.annual_checklists;
create trigger trg_checklist_bump before update on public.annual_checklists
  for each row execute function public.bump_version_and_updated_at();

drop trigger if exists trg_snap_bump on public.monthly_snapshots;
create trigger trg_snap_bump before update on public.monthly_snapshots
  for each row execute function public.bump_version_and_updated_at();
