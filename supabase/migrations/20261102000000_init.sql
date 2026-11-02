-- Marató Ruba 2027 · esquema inicial
-- Lectura pública (enllaç de només lectura) · escriptura només per al propietari.

-- ---------- Propietari ----------
create table public.owners (
  user_id uuid primary key references auth.users on delete cascade
);
alter table public.owners enable row level security;

create or replace function public.is_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.owners where user_id = auth.uid());
$$;
grant execute on function public.is_owner() to anon, authenticated;

-- ---------- Dades del pla ----------
create table public.settings (
  id int primary key default 1 check (id = 1),
  race_date date not null default '2027-04-25',
  goal_pace int not null default 300 check (goal_pace between 200 and 480),
  adapt boolean not null default true,
  updated_at timestamptz not null default now()
);
insert into public.settings default values;

create table public.logs (
  session_id text primary key,
  done boolean not null default false,
  km numeric check (km >= 0 and km < 100),
  min numeric check (min >= 0 and min < 1000),
  rpe int check (rpe between 1 and 10),
  note text check (char_length(note) <= 500),
  updated_at timestamptz not null default now()
);

create table public.moves (
  session_id text primary key,
  date date not null
);

create table public.weeks (
  week int primary key check (week between 1 and 25),
  padel_sat boolean not null default false
);

create table public.tests (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  dist numeric not null check (dist > 0),
  secs int not null check (secs > 0),
  label text check (char_length(label) <= 80),
  created_at timestamptz not null default now()
);

-- Activitats de Strava (només curses a peu). Les escriu la Edge Function amb service role.
create table public.activities (
  id bigint primary key,
  name text,
  sport_type text,
  start_date timestamptz,
  start_date_local text,          -- hora local tal com la dona Strava (YYYY-MM-DDTHH:MM:SSZ)
  distance numeric,               -- metres
  moving_time int,                -- segons
  elapsed_time int,
  avg_hr numeric,
  max_hr numeric,
  elevation numeric,
  polyline text,
  splits jsonb,                   -- splits_metric de Strava
  session_id text,                -- null = automàtic · 'none' = dia extra · id = assignació manual
  ignored boolean not null default false,
  updated_at timestamptz not null default now()
);
create index activities_start_idx on public.activities (start_date_local);

-- ---------- Privat (només service role) ----------
create table public.strava_tokens (
  id int primary key default 1 check (id = 1),
  athlete_id bigint,
  access_token text,
  refresh_token text,
  expires_at bigint,
  last_sync timestamptz,
  updated_at timestamptz not null default now()
);

create table public.push_subscriptions (
  endpoint text primary key,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

-- ---------- RLS ----------
do $$
declare t text;
begin
  foreach t in array array['settings','logs','moves','weeks','tests','activities'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "lectura publica" on public.%I for select to anon, authenticated using (true)', t);
    execute format('create policy "propietari insereix" on public.%I for insert to authenticated with check (public.is_owner())', t);
    execute format('create policy "propietari modifica" on public.%I for update to authenticated using (public.is_owner()) with check (public.is_owner())', t);
    execute format('create policy "propietari esborra" on public.%I for delete to authenticated using (public.is_owner())', t);
  end loop;
end $$;

alter table public.strava_tokens enable row level security;      -- sense polítiques: només service role
alter table public.push_subscriptions enable row level security;
create policy "propietari subscripcions" on public.push_subscriptions for all to authenticated
  using (public.is_owner()) with check (public.is_owner());

-- Estat de Strava visible per a tothom, sense exposar tokens.
create or replace function public.strava_status() returns json
language sql stable security definer set search_path = public as $$
  select json_build_object('connected', coalesce(bool_or(refresh_token is not null), false), 'last_sync', max(last_sync))
  from public.strava_tokens;
$$;
grant execute on function public.strava_status() to anon, authenticated;
