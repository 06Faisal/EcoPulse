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
  added_date timestamptz not null default now()
);

create index if not exists custom_vehicles_user_id_idx on custom_vehicles (user_id);

alter table custom_vehicles add constraint custom_vehicle_unique unique (user_id, name);

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

create policy "Users can update their own profile"
  on profiles for update
  to authenticated
  using (auth.uid() = id);

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
