-- EcoPulse Supabase schema

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  avatar_id text not null,
  points integer not null default 0,
  level text not null default 'Eco Explorer',
  daily_goal integer not null default 10,
  rank integer not null default 1,
  streak integer not null default 0,
  dark_mode boolean not null default false,
  available_vehicles text[] not null default array['Car','Bike','Bus','Train','Walking'],
  created_at timestamptz not null default now()
);

create table if not exists trips (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  vehicle text not null,
  custom_vehicle_name text,
  distance numeric not null,
  date timestamptz not null,
  co2 numeric not null,
  vehicle_type text,
  fuel_type text,
  vehicle_condition text,
  driving_style text,
  odometer_km numeric,
  is_automatic boolean,
  confidence numeric,
  created_at timestamptz not null default now()
);

create index if not exists trips_user_id_idx on trips (user_id);

create table if not exists bills (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  month text not null,
  year integer not null,
  units numeric not null,
  co2 numeric not null,
  date timestamptz not null,
  is_anomalous boolean,
  confidence numeric,
  created_at timestamptz not null default now()
);

create index if not exists bills_user_id_idx on bills (user_id);

create table if not exists custom_vehicles (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  factor numeric not null,
  category text,
  vehicle_type text,
  fuel_type text,
  vehicle_condition text,
  driving_style text,
  odometer_km numeric,
  added_date timestamptz not null default now()
);

create index if not exists custom_vehicles_user_id_idx on custom_vehicles (user_id);

alter table custom_vehicles add constraint custom_vehicle_unique unique (user_id, name);

-- Schema updates for new vehicle metadata fields (safe to re-run)
alter table trips
  add column if not exists vehicle_type text,
  add column if not exists fuel_type text,
  add column if not exists vehicle_condition text,
  add column if not exists driving_style text,
  add column if not exists odometer_km numeric;

alter table custom_vehicles
  add column if not exists vehicle_type text,
  add column if not exists fuel_type text,
  add column if not exists vehicle_condition text,
  add column if not exists driving_style text,
  add column if not exists odometer_km numeric;

-- RLS
alter table profiles enable row level security;
alter table trips enable row level security;
alter table bills enable row level security;
alter table custom_vehicles enable row level security;

create policy "Profiles are viewable by authenticated users"
  on profiles for select
  to authenticated
  using (true);

create policy "Users can insert their own profile"
  on profiles for insert
  to authenticated
  with check (auth.uid() = id);

-- WITH CHECK is stated explicitly rather than relying on Postgres defaulting
-- it to the USING expression, so a later edit to USING cannot silently widen
-- what a user is allowed to write.
create policy "Users can update their own profile"
  on profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- `username` is the login identity: the auth email is derived from it. Letting
-- a client change it would leave the account unreachable under its displayed
-- name and free the old name for another user to claim. RLS cannot restrict
-- individual columns, so enforce immutability with a trigger.
create or replace function prevent_username_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.username is distinct from old.username then
    raise exception 'username cannot be changed';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_username_immutable on profiles;
create trigger profiles_username_immutable
  before update on profiles
  for each row
  execute function prevent_username_change();

-- Postgres grants EXECUTE to PUBLIC on new functions, which would expose this
-- trigger function at /rest/v1/rpc/prevent_username_change. Triggers fire as
-- the table owner regardless of these grants, so revoking costs nothing.
revoke execute on function public.prevent_username_change() from public, anon, authenticated;

-- `points` drives the leaderboard, so the client must not be able to write it
-- directly: RLS authorises the row, not the column or the value, so a user
-- could otherwise PATCH their own profile and set any score.
--
-- Postgres cannot express "only this column" through RLS, so restrict at the
-- privilege layer: drop blanket UPDATE and grant it back per column, omitting
-- points, username and id.
revoke update on public.profiles from authenticated;

grant update (avatar_id, level, daily_goal, rank, streak, dark_mode, available_vehicles)
  on public.profiles to authenticated;

-- Every award is tied to the row that earned it. The server decides the
-- amount, verifies the row belongs to the caller, and records it here; the
-- unique constraint makes a repeated call a no-op instead of a second payout,
-- which is what stops the RPC being called in a loop to farm score.
create table if not exists points_ledger (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  source_type text not null check (source_type in ('trip', 'bill', 'streak')),
  source_id text not null,
  points integer not null,
  awarded_at timestamptz not null default now(),
  unique (user_id, source_type, source_id)
);

create index if not exists points_ledger_user_idx on points_ledger (user_id);

alter table points_ledger enable row level security;

create policy "Users can read their own points ledger"
  on points_ledger for select
  to authenticated
  using (auth.uid() = user_id);

-- Only the definer function below writes to the ledger.
revoke insert, update, delete on points_ledger from authenticated, anon;

create or replace function public.award_points(
  p_source_type text,
  p_source_id text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  delta integer;
  new_total integer;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  delta := case p_source_type
             when 'trip'   then 10
             when 'bill'   then 20
             when 'streak' then 50
           end;
  if delta is null then
    raise exception 'unknown source_type: %', p_source_type;
  end if;

  if p_source_type = 'trip' then
    if not exists (select 1 from trips where id = p_source_id and user_id = uid) then
      raise exception 'trip not found for this user';
    end if;
  elsif p_source_type = 'bill' then
    if not exists (select 1 from bills where id = p_source_id and user_id = uid) then
      raise exception 'bill not found for this user';
    end if;
  else
    -- One streak award per calendar day, current day only, so past dates
    -- cannot be backfilled in bulk.
    if p_source_id <> to_char((now() at time zone 'utc')::date, 'YYYY-MM-DD') then
      raise exception 'streak award must be for the current UTC date';
    end if;
  end if;

  insert into points_ledger (user_id, source_type, source_id, points)
  values (uid, p_source_type, p_source_id, delta)
  on conflict (user_id, source_type, source_id) do nothing;

  -- Replay: leave the score alone and report the current total.
  if not found then
    select points into new_total from profiles where id = uid;
    return new_total;
  end if;

  update profiles set points = points + delta where id = uid
  returning points into new_total;

  return new_total;
end;
$$;

revoke all on function public.award_points(text, text) from public, anon;
grant execute on function public.award_points(text, text) to authenticated;

create policy "Users can access their trips"
  on trips for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can access their bills"
  on bills for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can access their custom vehicles"
  on custom_vehicles for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
