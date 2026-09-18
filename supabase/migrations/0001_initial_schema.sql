-- ─────────────────────────────────────────────
-- 0001_initial_schema.sql
-- Run via: supabase db push  OR  applied via Supabase MCP
-- ─────────────────────────────────────────────

-- Extensions
create extension if not exists "uuid-ossp";
create extension if not exists "pg_cron";
create extension if not exists "pg_net";
create extension if not exists "citext";

-- ── PROFILES ──────────────────────────────────────────────────────────────────
create table public.profiles (
  id                 uuid references auth.users on delete cascade primary key,
  display_name       text not null,
  photo_url          text,
  zip_code           text,
  qr_code            citext unique,
  taste_profile      jsonb default '{}'::jsonb,
  notif_interval     text not null default 'daily'
                       check (notif_interval in ('daily','every2days','weekly','custom')),
  notif_custom_hours int,
  expo_push_token    text,
  onboarding_done    boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name, photo_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email, 'User'),
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end; $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── FRIENDS ───────────────────────────────────────────────────────────────────
create table public.friends (
  id           uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  addressee_id uuid not null references public.profiles(id) on delete cascade,
  status       text not null default 'pending'
                 check (status in ('pending','accepted','declined')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint no_self_friend check (requester_id <> addressee_id),
  constraint unique_friendship unique (requester_id, addressee_id)
);

create trigger friends_updated_at
  before update on public.friends
  for each row execute function public.set_updated_at();

create index friends_requester_idx on public.friends(requester_id);
create index friends_addressee_idx on public.friends(addressee_id);

-- ── RECOMMENDATIONS ───────────────────────────────────────────────────────────
create table public.recommendations (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles(id) on delete cascade,
  tvdb_series_id text not null,
  show_title     text not null,
  overview       text,
  poster_url     text,
  zip_code       text,
  score          int not null default 0,
  recommended_at timestamptz not null default now(),
  seen           boolean not null default false
);

create index recommendations_user_idx on public.recommendations(user_id);
create index recommendations_zip_idx  on public.recommendations(zip_code);
create index recommendations_at_idx   on public.recommendations(recommended_at desc);

-- ── PROMOTIONS ────────────────────────────────────────────────────────────────
create table public.promotions (
  id             uuid primary key default gen_random_uuid(),
  from_user_id   uuid not null references public.profiles(id) on delete cascade,
  to_user_id     uuid not null references public.profiles(id) on delete cascade,
  tvdb_series_id text not null,
  show_title     text not null,
  sent_at        timestamptz not null default now(),
  acknowledged   boolean not null default false,
  constraint no_self_promote check (from_user_id <> to_user_id)
);

create index promotions_to_user_idx on public.promotions(to_user_id);

-- ── RPS MATCHES ───────────────────────────────────────────────────────────────
create table public.rps_matches (
  id                    uuid primary key default gen_random_uuid(),
  challenger_id         uuid not null references public.profiles(id) on delete cascade,
  challenged_id         uuid not null references public.profiles(id) on delete cascade,
  challenger_show_id    text not null,
  challenger_show_title text not null,
  challenged_show_id    text,
  challenged_show_title text,
  challenger_choice     text check (challenger_choice in ('rock','paper','scissors')),
  challenged_choice     text check (challenged_choice in ('rock','paper','scissors')),
  winner_id             uuid references public.profiles(id),
  status                text not null default 'pending'
                          check (status in ('pending','accepted','choosing','resolved','expired')),
  created_at            timestamptz not null default now(),
  expires_at            timestamptz not null,
  resolved_at           timestamptz,
  constraint no_self_rps check (challenger_id <> challenged_id)
);

create or replace function public.set_rps_expires_at()
returns trigger language plpgsql as $$
begin new.expires_at = new.created_at + interval '30 minutes'; return new; end; $$;

create trigger rps_set_expires_at
  before insert on public.rps_matches
  for each row execute function public.set_rps_expires_at();

create index rps_challenger_idx on public.rps_matches(challenger_id);
create index rps_challenged_idx on public.rps_matches(challenged_id);
create index rps_status_idx     on public.rps_matches(status);
create index rps_expires_idx    on public.rps_matches(expires_at) where status not in ('resolved','expired');

-- ── ROW LEVEL SECURITY ────────────────────────────────────────────────────────
alter table public.profiles        enable row level security;
alter table public.friends         enable row level security;
alter table public.recommendations enable row level security;
alter table public.promotions      enable row level security;
alter table public.rps_matches     enable row level security;

-- profiles
create policy "Users can view any profile"        on public.profiles for select using (true);
create policy "Users can update own profile"      on public.profiles for update using (auth.uid() = id);

-- friends
create policy "Users can view their own friendships" on public.friends for select
  using (auth.uid() = requester_id or auth.uid() = addressee_id);
create policy "Users can create friend requests"  on public.friends for insert
  with check (auth.uid() = requester_id);
create policy "Addressee can update status"       on public.friends for update
  using (auth.uid() = addressee_id);

-- recommendations
create policy "Users can view own recommendations" on public.recommendations for select
  using (auth.uid() = user_id);
create policy "Users can view friend recommendations" on public.recommendations for select
  using (exists (
    select 1 from public.friends
    where status = 'accepted'
      and ((requester_id = auth.uid() and addressee_id = user_id)
        or (addressee_id = auth.uid() and requester_id = user_id))
  ));
create policy "Map recommendations visible to all" on public.recommendations for select using (true);
create policy "Users can mark own recs as seen"   on public.recommendations for update
  using (auth.uid() = user_id);

-- promotions
create policy "Users can view their promotions"   on public.promotions for select
  using (auth.uid() = to_user_id or auth.uid() = from_user_id);
create policy "Users can create promotions"       on public.promotions for insert
  with check (auth.uid() = from_user_id);
create policy "Recipients can acknowledge"        on public.promotions for update
  using (auth.uid() = to_user_id);

-- rps_matches
create policy "Players can view their matches"    on public.rps_matches for select
  using (auth.uid() = challenger_id or auth.uid() = challenged_id);
create policy "Challenger can create a match"     on public.rps_matches for insert
  with check (auth.uid() = challenger_id);

-- ── REALTIME ──────────────────────────────────────────────────────────────────
alter publication supabase_realtime add table public.rps_matches;

-- ── PG_CRON JOBS ──────────────────────────────────────────────────────────────
-- Replace SUPABASE_PROJECT_URL with your actual project URL.
-- The service_role key is read at runtime from app.service_role_key GUC.

select cron.schedule(
  'expire-rps-matches',
  '*/5 * * * *',
  $$ select net.http_post(
       url     := 'https://hncdqdkyhfgummhkjiet.supabase.co/functions/v1/expire-rps-matches',
       headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || current_setting('app.service_role_key', true)),
       body    := '{}'::jsonb); $$
);

select cron.schedule(
  'generate-daily-recommendations',
  '0 9 * * *',
  $$ select net.http_post(
       url     := 'https://hncdqdkyhfgummhkjiet.supabase.co/functions/v1/generate-recommendation',
       headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || current_setting('app.service_role_key', true)),
       body    := '{}'::jsonb); $$
);
