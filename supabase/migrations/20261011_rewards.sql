-- =====================================================================================
--  QOZOB PRICE-UPDATER REWARDS  (₦10,000 per LGA every month + national annual prize)
--  Run ONCE in Supabase → SQL Editor → New query → paste everything → Run.
--  • Safe to re-run.  • Requires 20261008_security_hardening.sql.
--  • BEFORE RUNNING: Supabase → Database → Extensions → switch ON "postgis" (schema: extensions).
--    (pgcrypto and Vault are already on in every Supabase project.)
--
--  What this adds
--   1. LGA map boundaries (all 774, imported from the admin panel) and automatic LGA for stations.
--   2. price_reports: every community price update is checked on the server and earns coins:
--        - reporter must be within ~1 km of the station (GPS)        - 6-hour cooldown per station
--        - daily cap                                                  - impossible-travel check
--        - prices far from the local average are HELD for admin review (no coins until approved)
--        - Qozob admins, station managers/owners, staff (@qozob.com) and listed reps get no coins
--   3. Participants: legal name, date of birth (18+), ID type + last 4 digits (the full ID number is
--      only kept as a one-way keyed hash to stop duplicate accounts), phone verification, KYC review.
--   4. Payout bank accounts: account number ENCRYPTED (key kept in Supabase Vault), one account per
--      person, admin "reveal" is written to an audit log.
--   5. Monthly / annual closing: winners computed by fixed rules (no luck involved), WHT, paid status.
-- =====================================================================================

begin;

-- -------------------------------------------------------------------------------------
-- 0. PRE-FLIGHT
-- -------------------------------------------------------------------------------------
do $$
declare
  v_schema text;
begin
  if to_regprocedure('public.is_admin()') is null then
    raise exception 'public.is_admin() not found. Run 20261008_security_hardening.sql first. Nothing was changed.';
  end if;
  select n.nspname into v_schema from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname = 'postgis';
  if v_schema is not null and v_schema <> 'extensions' then
    raise exception 'PostGIS is installed in schema "%" but this script expects "extensions". Please send this message to your developer. Nothing was changed.', v_schema;
  end if;
  if to_regclass('vault.decrypted_secrets') is null then
    raise exception 'Supabase Vault is not enabled. Supabase → Database → Extensions → enable "supabase_vault", then run again. Nothing was changed.';
  end if;
end $$;

create extension if not exists postgis with schema extensions;
create extension if not exists pgcrypto with schema extensions;

-- Secret key for encrypting bank account numbers and hashing ID numbers.
-- NEVER delete or change it: encrypted account numbers could no longer be read.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'qozob_rewards_key') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'qozob_rewards_key',
      'Qozob rewards: encrypts payout account numbers and hashes ID numbers. Do not delete or change.');
  end if;
end $$;

create or replace function public._rewards_key()
returns text language plpgsql stable security definer set search_path = '' as $$
declare k text;
begin
  select s.decrypted_secret into k from vault.decrypted_secrets s where s.name = 'qozob_rewards_key' limit 1;
  if k is null then raise exception 'Rewards key missing from Vault.'; end if;
  return k;
end $$;

-- -------------------------------------------------------------------------------------
-- 1. SETTINGS (one row, admin-editable; everyone can read them because they are the rules)
-- -------------------------------------------------------------------------------------
create table if not exists public.reward_settings (
  id                     boolean primary key default true check (id),
  program_active         boolean not null default true,
  monthly_prize_ngn      integer not null default 10000 check (monthly_prize_ngn >= 0),
  annual_prize_ngn       integer check (annual_prize_ngn is null or annual_prize_ngn >= 0),  -- null = not announced yet
  wht_percent            numeric(5,2) not null default 0 check (wht_percent between 0 and 50),
  min_active_days        integer not null default 8  check (min_active_days between 1 and 31),
  annual_min_active_days integer not null default 60 check (annual_min_active_days between 1 and 366),
  max_distance_m         integer not null default 1000 check (max_distance_m between 50 and 20000),
  cooldown_hours         integer not null default 6  check (cooldown_hours between 0 and 168),
  daily_cap              integer not null default 20 check (daily_cap between 1 and 500),
  coins_per_update       integer not null default 10 check (coins_per_update between 0 and 1000),
  coins_fresh_bonus      integer not null default 5  check (coins_fresh_bonus between 0 and 1000),
  outlier_percent        integer not null default 25 check (outlier_percent between 5 and 200),
  price_min              numeric not null default 300  check (price_min > 0),
  price_max              numeric not null default 3000 check (price_max > price_min),
  max_speed_kmh          integer not null default 150 check (max_speed_kmh between 20 and 1000),
  terms_version          text not null default '2026-10',
  updated_at             timestamptz not null default now(),
  updated_by             uuid
);
insert into public.reward_settings (id) values (true) on conflict (id) do nothing;

alter table public.reward_settings enable row level security;
drop policy if exists "qozob_reward_settings_read" on public.reward_settings;
create policy "qozob_reward_settings_read" on public.reward_settings for select to anon, authenticated using (true);
drop policy if exists "qozob_reward_settings_admin" on public.reward_settings;
create policy "qozob_reward_settings_admin" on public.reward_settings for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create or replace function public.reward_settings_touch()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := now(); new.updated_by := auth.uid(); new.id := true; return new; end $$;
drop trigger if exists reward_settings_touch on public.reward_settings;
create trigger reward_settings_touch before update on public.reward_settings for each row execute function public.reward_settings_touch();

-- -------------------------------------------------------------------------------------
-- 2. LGAs (boundaries) + automatic station LGA
-- -------------------------------------------------------------------------------------
create table if not exists public.lgas (
  id          serial primary key,
  shape_id    text unique,
  name        text not null,
  state       text not null,
  geom        extensions.geometry(MultiPolygon, 4326) not null,
  created_at  timestamptz not null default now()
);
create index if not exists lgas_geom_idx on public.lgas using gist (geom);
create index if not exists lgas_state_idx on public.lgas (state, name);

alter table public.lgas enable row level security;
drop policy if exists "qozob_lgas_read" on public.lgas;
create policy "qozob_lgas_read" on public.lgas for select to anon, authenticated using (true);

alter table public.stations add column if not exists lga_id integer references public.lgas (id) on delete set null;
create index if not exists stations_lga_idx on public.stations (lga_id);

-- Which LGA is this point in?
create or replace function public.lga_at(p_lat double precision, p_lng double precision)
returns table (id integer, name text, state text)
language sql stable security definer set search_path = '' as $$
  select l.id, l.name, l.state from public.lgas l
   where extensions.st_intersects(l.geom, extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326))
   limit 1;
$$;

-- Simplified outlines for the map (only the LGAs inside the visible area)
create or replace function public.lga_shapes(p_min_lng double precision, p_min_lat double precision,
                                             p_max_lng double precision, p_max_lat double precision,
                                             p_tolerance double precision default 0.002)
returns table (id integer, name text, state text, geojson text)
language sql stable security definer set search_path = '' as $$
  select l.id, l.name, l.state,
         extensions.st_asgeojson(extensions.st_simplifypreservetopology(l.geom, greatest(least(p_tolerance, 0.05), 0.0002)), 5)
    from public.lgas l
   where extensions.st_intersects(l.geom, extensions.st_makeenvelope(p_min_lng, p_min_lat, p_max_lng, p_max_lat, 4326))
   limit 150;
$$;

-- Fill stations.lga_id automatically (fires after stations_guard: triggers run in name order)
create or replace function public.stations_set_lga()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.lat is null or new.lng is null then
    new.lga_id := null;
  elsif tg_op = 'INSERT' or new.lat is distinct from old.lat or new.lng is distinct from old.lng
        or new.lga_id is distinct from old.lga_id or new.lga_id is null then
    new.lga_id := (select l.id from public.lgas l
                    where extensions.st_intersects(l.geom, extensions.st_setsrid(extensions.st_makepoint(new.lng, new.lat), 4326))
                    limit 1);
  end if;
  return new;
end $$;
drop trigger if exists stations_set_lga on public.stations;
create trigger stations_set_lga before insert or update on public.stations
  for each row execute function public.stations_set_lga();

-- Admin: import boundaries in batches (the admin panel sends the GeoJSON file in pieces)
create or replace function public.admin_import_lgas(p_rows jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  r jsonb;
  n integer := 0;
  g extensions.geometry;
begin
  if not public.is_admin() then raise exception 'Not authorised: admin access required.' using errcode = '42501'; end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    g := extensions.st_multi(extensions.st_collectionextract(extensions.st_makevalid(
           extensions.st_setsrid(extensions.st_geomfromgeojson((r -> 'geometry')::text), 4326)), 3));
    insert into public.lgas (shape_id, name, state, geom)
    values (r ->> 'shape_id', trim(r ->> 'name'), trim(r ->> 'state'), g)
    on conflict (shape_id) do update set name = excluded.name, state = excluded.state, geom = excluded.geom;
    n := n + 1;
  end loop;
  return n;
end $$;

-- Admin: give every existing station its LGA (run after importing)
create or replace function public.admin_assign_station_lgas()
returns integer language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  if not public.is_admin() then raise exception 'Not authorised: admin access required.' using errcode = '42501'; end if;
  update public.stations s
     set lga_id = (select l.id from public.lgas l
                    where extensions.st_intersects(l.geom, extensions.st_setsrid(extensions.st_makepoint(s.lng, s.lat), 4326))
                    limit 1)
   where s.lat is not null and s.lng is not null;
  get diagnostics n = row_count;
  return n;
end $$;

-- -------------------------------------------------------------------------------------
-- 3. PARTICIPANTS, EXCLUSIONS, BANK ACCOUNTS, AUDIT LOG
-- -------------------------------------------------------------------------------------
create table if not exists public.reward_participants (
  user_id                    uuid primary key references auth.users (id) on delete cascade,
  legal_name                 text check (legal_name is null or char_length(legal_name) between 3 and 120),
  dob                        date,
  id_type                    text check (id_type is null or id_type in ('nin', 'voters_card', 'drivers_licence', 'passport')),
  id_last4                   text check (id_last4 is null or id_last4 ~ '^[A-Za-z0-9]{2,4}$'),
  id_number_hash             text unique,          -- keyed one-way hash: blocks the same ID on two accounts
  id_doc_path                text,                 -- private file, deleted after review
  status                     text not null default 'incomplete'
                             check (status in ('incomplete', 'pending_review', 'verified', 'rejected', 'suspended')),
  review_note                text,
  reviewed_by                uuid,
  reviewed_at                timestamptz,
  phone_verified_manually_at timestamptz,          -- admin fallback if SMS is unavailable
  strikes                    integer not null default 0,
  terms_version              text,
  terms_accepted_at          timestamptz,
  submitted_at               timestamptz,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now()
);
alter table public.reward_participants enable row level security;
drop policy if exists "qozob_reward_participants_own" on public.reward_participants;
create policy "qozob_reward_participants_own" on public.reward_participants for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
-- (no insert/update policies: changes go through the functions below)

create table if not exists public.reward_exclusions (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  reason      text not null default 'Qozob staff / representative',
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now()
);
alter table public.reward_exclusions enable row level security;
drop policy if exists "qozob_reward_exclusions_admin" on public.reward_exclusions;
create policy "qozob_reward_exclusions_admin" on public.reward_exclusions for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create table if not exists public.payout_accounts (
  user_id             uuid primary key references auth.users (id) on delete cascade,
  bank_name           text not null check (char_length(bank_name) between 2 and 80),
  account_name        text not null check (char_length(account_name) between 3 and 120),
  account_number_enc  bytea not null,
  account_last4       text not null,
  account_hash        text not null unique,      -- one bank account per person
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
alter table public.payout_accounts enable row level security;
-- (no policies at all: only the functions below can read or write it)

create table if not exists public.reward_audit_log (
  id           bigint generated always as identity primary key,
  actor        uuid default auth.uid(),
  action       text not null,
  target_user  uuid,
  details      jsonb,
  created_at   timestamptz not null default now()
);
alter table public.reward_audit_log enable row level security;
drop policy if exists "qozob_reward_audit_admin" on public.reward_audit_log;
create policy "qozob_reward_audit_admin" on public.reward_audit_log for select to authenticated using (public.is_admin());

-- Private KYC bucket (ID documents). People upload into their own folder; only admins can open files.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('reward_kyc', 'reward_kyc', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "qozob_reward_kyc_upload_own" on storage.objects;
create policy "qozob_reward_kyc_upload_own" on storage.objects for insert to authenticated
  with check (bucket_id = 'reward_kyc' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "qozob_reward_kyc_delete_own" on storage.objects;
create policy "qozob_reward_kyc_delete_own" on storage.objects for delete to authenticated
  using (bucket_id = 'reward_kyc' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "qozob_reward_kyc_admin_read" on storage.objects;
create policy "qozob_reward_kyc_admin_read" on storage.objects for select to authenticated
  using (bucket_id = 'reward_kyc' and public.is_admin());
drop policy if exists "qozob_reward_kyc_admin_delete" on storage.objects;
create policy "qozob_reward_kyc_admin_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'reward_kyc' and public.is_admin());

-- -------------------------------------------------------------------------------------
-- 4. HELPERS
-- -------------------------------------------------------------------------------------
create or replace function public._lagos_today()
returns date language sql stable set search_path = '' as $$ select (now() at time zone 'Africa/Lagos')::date; $$;

create or replace function public._haversine_m(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns double precision language sql immutable set search_path = '' as $$
  select 2 * 6371000 * asin(least(1, sqrt(
           power(sin(radians(lat2 - lat1) / 2), 2) +
           cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2))));
$$;

-- Staff, admins, managers, station owners, listed reps and suspended people earn no rewards
create or replace function public.reward_is_excluded(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select lower(coalesce(u.raw_app_meta_data ->> 'role', '')) in ('admin', 'manager')
                          or lower(coalesce(u.email, '')) like '%@qozob.com'
                     from auth.users u where u.id = p_user), true)
      or exists (select 1 from public.reward_exclusions e where e.user_id = p_user)
      or exists (select 1 from public.stations s where s.manager_id = p_user)
      or exists (select 1 from public.reward_participants p where p.user_id = p_user and p.status = 'suspended');
$$;

create or replace function public._reward_phone_ok(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select u.phone_confirmed_at is not null and coalesce(u.phone, '') <> '' from auth.users u where u.id = p_user), false)
      or exists (select 1 from public.reward_participants p where p.user_id = p_user and p.phone_verified_manually_at is not null);
$$;

-- Fully verified = ID approved + phone verified + bank account on file + not excluded
create or replace function public._reward_verified(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.reward_participants p where p.user_id = p_user and p.status = 'verified')
     and public._reward_phone_ok(p_user)
     and exists (select 1 from public.payout_accounts a where a.user_id = p_user)
     and not public.reward_is_excluded(p_user);
$$;

-- "Chinedu O." — first name + last initial only (public leaderboard)
create or replace function public._reward_display_name(p_user uuid)
returns text language sql stable security definer set search_path = '' as $$
  select coalesce((
    select coalesce(nullif(initcap(split_part(trim(coalesce(m ->> 'first_name', m ->> 'full_name', m ->> 'name', '')), ' ', 1)), ''), 'Qozob member')
           || coalesce(' ' || upper(left(nullif(trim(coalesce(m ->> 'last_name',
                  split_part(trim(coalesce(m ->> 'full_name', m ->> 'name', '')), ' ', 2))), ''), 1)) || '.', '')
      from (select u.raw_user_meta_data as m from auth.users u where u.id = p_user) x), 'Qozob member');
$$;

-- -------------------------------------------------------------------------------------
-- 5. PRICE REPORTS
-- -------------------------------------------------------------------------------------
-- Private record of "this signed-in person just saved a price for this station" (written by the
-- database itself, so nobody can fake it). record_price_report() must match one of these.
create table if not exists public.pending_price_submissions (
  id           bigint generated always as identity primary key,
  station_id   text not null,
  user_id      uuid not null,
  price        numeric not null,
  created_at   timestamptz not null default now(),
  consumed_at  timestamptz
);
create index if not exists pending_price_sub_idx on public.pending_price_submissions (user_id, station_id, created_at desc);
alter table public.pending_price_submissions enable row level security;   -- no policies: private

create or replace function public.stations_log_submission()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or new.price_pms is null then return null; end if;
  if tg_op = 'UPDATE' and new.price_pms is not distinct from old.price_pms
     and new.queue_status is not distinct from old.queue_status
     and new.last_updated is not distinct from old.last_updated then
    return null;   -- not a price submission (e.g. a pump rating)
  end if;
  insert into public.pending_price_submissions (station_id, user_id, price)
  values (new.station_id::text, auth.uid(), new.price_pms);
  return null;
end $$;
drop trigger if exists stations_log_submission on public.stations;
create trigger stations_log_submission after insert or update on public.stations
  for each row execute function public.stations_log_submission();

create table if not exists public.price_reports (
  id              bigint generated always as identity primary key,
  user_id         uuid not null references auth.users (id) on delete cascade,
  station_id      text not null,
  lga_id          integer references public.lgas (id) on delete set null,
  fuel            text not null default 'pms',
  price           numeric not null,
  reporter_lat    double precision,
  reporter_lng    double precision,
  gps_accuracy_m  double precision,
  distance_m      integer,
  status          text not null check (status in ('accepted', 'held', 'rejected', 'no_reward')),
  coins           integer not null default 0,
  reasons         text[] not null default '{}',
  lagos_day       date not null default ((now() at time zone 'Africa/Lagos')::date),
  created_at      timestamptz not null default now(),
  reviewed_by     uuid,
  reviewed_at     timestamptz,
  review_note     text
);
create index if not exists price_reports_user_idx    on public.price_reports (user_id, created_at desc);
create index if not exists price_reports_lga_day_idx on public.price_reports (lga_id, lagos_day);
create index if not exists price_reports_day_idx     on public.price_reports (lagos_day, status);
create index if not exists price_reports_station_idx on public.price_reports (station_id, created_at desc);
create index if not exists price_reports_held_idx    on public.price_reports (created_at) where status = 'held';

alter table public.price_reports enable row level security;
drop policy if exists "qozob_price_reports_read" on public.price_reports;
create policy "qozob_price_reports_read" on public.price_reports for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- Called by the app straight after a price is saved, with the person's GPS position.
create or replace function public.record_price_report(p_station_id text, p_lat double precision default null,
                                                      p_lng double precision default null, p_accuracy double precision default null)
returns json language plpgsql security definer set search_path = '' as $$
declare
  v_uid      uuid := auth.uid();
  cfg        public.reward_settings%rowtype;
  sub        record;
  st         record;
  prev       record;
  v_today    date := public._lagos_today();
  v_reasons  text[] := '{}';
  v_reject   boolean := false;
  v_noreward boolean := false;
  v_hold     boolean := false;
  v_dist     double precision;
  v_median   double precision;
  v_n        integer;
  v_coins    integer := 0;
  v_status   text;
  v_id       bigint;
  v_hours    double precision;
  v_d2       double precision;
  v_lga      text;
begin
  if v_uid is null then raise exception 'Please sign in to earn coins.' using errcode = '42501'; end if;
  select * into cfg from public.reward_settings where id;

  select * into sub from public.pending_price_submissions
   where user_id = v_uid and station_id = p_station_id and consumed_at is null
     and created_at > now() - interval '5 minutes'
   order by created_at desc limit 1
   for update skip locked;
  if not found then
    raise exception 'We could not find your price update for this station. Please submit the price again.';
  end if;
  update public.pending_price_submissions set consumed_at = now() where id = sub.id;
  delete from public.pending_price_submissions where created_at < now() - interval '2 days';

  select s.lat, s.lng, s.lga_id into st from public.stations s where s.station_id::text = p_station_id limit 1;
  if not found then raise exception 'Station not found.'; end if;

  -- Who is reporting?
  if public.reward_is_excluded(v_uid) then v_noreward := true; v_reasons := array_append(v_reasons, 'not_eligible'); end if;
  if not cfg.program_active then v_noreward := true; v_reasons := array_append(v_reasons, 'programme_paused'); end if;

  -- Is the price believable at all?
  if sub.price < cfg.price_min or sub.price > cfg.price_max then
    v_reject := true; v_reasons := array_append(v_reasons, 'price_out_of_range');
  end if;

  -- Were they at the station?
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    v_noreward := true; v_reasons := array_append(v_reasons, 'no_location');
    p_lat := null; p_lng := null;
  elsif st.lat is not null then
    v_dist := public._haversine_m(p_lat, p_lng, st.lat, st.lng);
    if v_dist > cfg.max_distance_m then v_noreward := true; v_reasons := array_append(v_reasons, 'too_far'); end if;
    if p_accuracy is not null and p_accuracy > cfg.max_distance_m then
      v_noreward := true; v_reasons := array_append(v_reasons, 'weak_gps');
    end if;
    -- Impossible travel since their previous report (fake GPS)
    select r.reporter_lat, r.reporter_lng, r.created_at into prev from public.price_reports r
     where r.user_id = v_uid and r.reporter_lat is not null and r.created_at > now() - interval '3 hours'
     order by r.created_at desc limit 1;
    if found then
      v_d2 := public._haversine_m(p_lat, p_lng, prev.reporter_lat, prev.reporter_lng);
      v_hours := greatest(extract(epoch from (now() - prev.created_at)) / 3600.0, 1.0 / 3600);
      if v_d2 > 2000 and (v_d2 / 1000.0) / v_hours > cfg.max_speed_kmh then
        v_hold := true; v_reasons := array_append(v_reasons, 'impossible_travel');
      end if;
    end if;
  else
    v_noreward := true; v_reasons := array_append(v_reasons, 'station_location_unknown');
  end if;

  -- Spamming?
  if exists (select 1 from public.price_reports r
              where r.user_id = v_uid and r.station_id = p_station_id and r.status in ('accepted', 'held')
                and r.created_at > now() - make_interval(hours => cfg.cooldown_hours)) then
    v_noreward := true; v_reasons := array_append(v_reasons, 'cooldown');
  end if;
  if (select count(*) from public.price_reports r
       where r.user_id = v_uid and r.lagos_day = v_today and r.status in ('accepted', 'held')) >= cfg.daily_cap then
    v_noreward := true; v_reasons := array_append(v_reasons, 'daily_cap');
  end if;

  -- Far from the local average? Hold for review.
  if not v_reject then
    v_n := 0;
    if st.lga_id is not null then
      select percentile_cont(0.5) within group (order by r.price), count(*) into v_median, v_n
        from public.price_reports r
       where r.lga_id = st.lga_id and r.status = 'accepted' and r.user_id <> v_uid
         and r.created_at > now() - interval '7 days';
    end if;
    if coalesce(v_n, 0) < 5 and st.lat is not null then
      select percentile_cont(0.5) within group (order by s.price_pms), count(*) into v_median, v_n
        from public.stations s
       where s.station_id::text <> p_station_id
         and s.lat between st.lat - 0.09 and st.lat + 0.09
         and s.lng between st.lng - 0.09 and st.lng + 0.09
         and s.price_pms between cfg.price_min and cfg.price_max;
    end if;
    if coalesce(v_n, 0) >= 3 and v_median > 0
       and abs(sub.price - v_median) / v_median * 100 > cfg.outlier_percent then
      v_hold := true; v_reasons := array_append(v_reasons, 'price_outlier');
    end if;
  end if;

  if v_reject then
    v_status := 'rejected';
  elsif v_noreward then
    v_status := 'no_reward';
  else
    v_coins := cfg.coins_per_update;
    if not exists (select 1 from public.price_reports r
                    where r.station_id = p_station_id and r.status in ('accepted', 'held')
                      and r.created_at > now() - interval '24 hours') then
      v_coins := v_coins + cfg.coins_fresh_bonus;
      v_reasons := array_append(v_reasons, 'fresh_bonus');
    end if;
    v_status := case when v_hold then 'held' else 'accepted' end;
  end if;

  insert into public.price_reports (user_id, station_id, lga_id, price, reporter_lat, reporter_lng, gps_accuracy_m,
                                    distance_m, status, coins, reasons, lagos_day)
  values (v_uid, p_station_id, st.lga_id, sub.price, p_lat, p_lng, p_accuracy,
          case when v_dist is null then null else round(v_dist)::integer end, v_status, v_coins, v_reasons, v_today)
  returning id into v_id;

  select l.name || ', ' || l.state into v_lga from public.lgas l where l.id = st.lga_id;
  return json_build_object('id', v_id, 'status', v_status, 'coins', v_coins, 'reasons', v_reasons,
                           'distance_m', case when v_dist is null then null else round(v_dist) end, 'lga', v_lga);
end $$;

-- -------------------------------------------------------------------------------------
-- 6. SCORES, LEADERBOARD, "MY REWARDS"
-- -------------------------------------------------------------------------------------
create or replace function public._reward_scores(p_start date, p_end date)
returns table (user_id uuid, lga_id integer, coins bigint, stations bigint, reports bigint, last_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select r.user_id, r.lga_id, sum(r.coins)::bigint, count(distinct r.station_id)::bigint, count(*)::bigint, max(r.created_at)
    from public.price_reports r
   where r.status = 'accepted' and r.lagos_day between p_start and p_end
   group by r.user_id, r.lga_id;
$$;

create or replace function public._reward_active_days(p_start date, p_end date)
returns table (user_id uuid, active_days bigint)
language sql stable security definer set search_path = '' as $$
  select r.user_id, count(distinct r.lagos_day)::bigint
    from public.price_reports r
   where r.status = 'accepted' and r.lagos_day between p_start and p_end
   group by r.user_id;
$$;

-- Public leaderboard (names masked). p_lga_id = null → national.
-- Ties: more different stations first, then whoever reached the score earlier.
create or replace function public.reward_leaderboard(p_start date, p_end date, p_lga_id integer default null, p_limit integer default 20)
returns table (rank bigint, display_name text, coins bigint, active_days bigint, stations bigint, verified boolean, is_me boolean)
language sql stable security definer set search_path = '' as $$
  with s as (
    select sc.user_id, sum(sc.coins)::bigint as coins, sum(sc.stations)::bigint as stations, max(sc.last_at) as last_at
      from public._reward_scores(p_start, least(p_end, p_start + 366)) sc
     where (p_lga_id is null or sc.lga_id = p_lga_id)
       and not public.reward_is_excluded(sc.user_id)
     group by sc.user_id
  )
  select row_number() over (order by s.coins desc, s.stations desc, s.last_at asc, s.user_id)::bigint,
         public._reward_display_name(s.user_id),
         s.coins,
         coalesce(a.active_days, 0)::bigint,
         s.stations,
         public._reward_verified(s.user_id),
         s.user_id = auth.uid()
    from s
    left join public._reward_active_days(p_start, least(p_end, p_start + 366)) a on a.user_id = s.user_id
   order by 1
   limit least(greatest(coalesce(p_limit, 20), 1), 100);
$$;

create or replace function public.my_reward_summary()
returns json language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_today date := public._lagos_today();
  v_ms date := date_trunc('month', v_today)::date;
  v_me date := (date_trunc('month', v_today) + interval '1 month - 1 day')::date;
  v_ys date := date_trunc('year', v_today)::date;
  v_ye date := (date_trunc('year', v_today) + interval '1 year - 1 day')::date;
begin
  if v_uid is null then return null; end if;
  return json_build_object(
    'month_start', v_ms, 'month_end', v_me, 'year_start', v_ys, 'year_end', v_ye,
    'coins_month', (select coalesce(sum(r.coins), 0) from public.price_reports r where r.user_id = v_uid and r.status = 'accepted' and r.lagos_day between v_ms and v_me),
    'coins_year',  (select coalesce(sum(r.coins), 0) from public.price_reports r where r.user_id = v_uid and r.status = 'accepted' and r.lagos_day between v_ys and v_ye),
    'coins_held',  (select coalesce(sum(r.coins), 0) from public.price_reports r where r.user_id = v_uid and r.status = 'held'),
    'coins_total', (select coalesce(sum(r.coins), 0) from public.price_reports r where r.user_id = v_uid and r.status = 'accepted'),
    'active_days_month', (select count(distinct r.lagos_day) from public.price_reports r where r.user_id = v_uid and r.status = 'accepted' and r.lagos_day between v_ms and v_me),
    'active_days_year',  (select count(distinct r.lagos_day) from public.price_reports r where r.user_id = v_uid and r.status = 'accepted' and r.lagos_day between v_ys and v_ye),
    'reports_month', (select count(*) from public.price_reports r where r.user_id = v_uid and r.lagos_day between v_ms and v_me),
    'lgas', (
      select coalesce(json_agg(json_build_object('lga_id', x.lga_id, 'name', l.name, 'state', l.state, 'coins', x.coins, 'rank', x.rnk) order by x.coins desc), '[]'::json)
        from (select sc.user_id, sc.lga_id, sc.coins,
                     row_number() over (partition by sc.lga_id order by sc.coins desc, sc.stations desc, sc.last_at asc, sc.user_id) as rnk
                from public._reward_scores(v_ms, v_me) sc
               where not public.reward_is_excluded(sc.user_id)) x
        left join public.lgas l on l.id = x.lga_id
       where x.user_id = v_uid),
    'excluded', public.reward_is_excluded(v_uid),
    'participant', (select json_build_object('status', p.status, 'legal_name', p.legal_name, 'id_type', p.id_type, 'id_last4', p.id_last4,
                                             'review_note', p.review_note, 'strikes', p.strikes, 'submitted_at', p.submitted_at,
                                             'terms_accepted_at', p.terms_accepted_at, 'terms_version', p.terms_version)
                      from public.reward_participants p where p.user_id = v_uid),
    'phone_verified', public._reward_phone_ok(v_uid),
    'phone', (select u.phone from auth.users u where u.id = v_uid),
    'bank', (select json_build_object('bank_name', a.bank_name, 'account_name', a.account_name, 'last4', a.account_last4)
               from public.payout_accounts a where a.user_id = v_uid),
    'verified', public._reward_verified(v_uid),
    'wins', (select coalesce(json_agg(json_build_object('kind', p.kind, 'period_start', p.period_start, 'lga', w.lga_name, 'state', w.state,
                                                        'gross_ngn', w.gross_ngn, 'net_ngn', w.net_ngn, 'status', w.status, 'paid_at', w.paid_at)
                                      order by p.period_start desc), '[]'::json)
               from public.reward_winners w join public.reward_periods p on p.id = w.period_id
              where w.user_id = v_uid and w.status <> 'forfeited')
  );
end $$;

-- -------------------------------------------------------------------------------------
-- 7. PARTICIPANT SELF-SERVICE (ID details, bank account)
-- -------------------------------------------------------------------------------------
create or replace function public.submit_reward_kyc(p_legal_name text, p_dob date, p_id_type text, p_id_number text,
                                                    p_doc_path text, p_accept_terms boolean)
returns json language plpgsql security definer set search_path = '' as $$
declare
  v_uid  uuid := auth.uid();
  v_num  text := upper(regexp_replace(coalesce(p_id_number, ''), '[^A-Za-z0-9]', '', 'g'));
  v_hash text;
  v_cur  public.reward_participants%rowtype;
  v_ver  text;
begin
  if v_uid is null then raise exception 'Please sign in.' using errcode = '42501'; end if;
  if public.reward_is_excluded(v_uid) then
    raise exception 'Qozob staff, admins, representatives and station owners/managers cannot join the rewards programme.';
  end if;
  if p_accept_terms is not true then raise exception 'Please accept the Rewards Official Rules.'; end if;
  if char_length(trim(coalesce(p_legal_name, ''))) < 3 then raise exception 'Enter your full name exactly as it appears on your ID.'; end if;
  if p_dob is null or p_dob > (public._lagos_today() - interval '18 years')::date then
    raise exception 'You must be 18 or older to take part in rewards.';
  end if;
  if p_dob < date '1900-01-01' then raise exception 'Please check your date of birth.'; end if;
  if p_id_type not in ('nin', 'voters_card', 'drivers_licence', 'passport') then raise exception 'Choose an ID type.'; end if;
  if p_id_type = 'nin' and v_num !~ '^[0-9]{11}$' then raise exception 'A NIN has exactly 11 digits.'; end if;
  if char_length(v_num) not between 6 and 25 then raise exception 'Please check your ID number.'; end if;
  if p_doc_path is null or split_part(p_doc_path, '/', 1) <> v_uid::text then raise exception 'Please upload a photo of your ID.'; end if;

  select * into v_cur from public.reward_participants where user_id = v_uid;
  if found and v_cur.status in ('verified', 'suspended') then
    raise exception 'Your details have already been reviewed. Contact support to change them.';
  end if;

  v_hash := encode(extensions.hmac(p_id_type || ':' || v_num, public._rewards_key(), 'sha256'), 'hex');
  if exists (select 1 from public.reward_participants p where p.id_number_hash = v_hash and p.user_id <> v_uid) then
    raise exception 'This ID is already registered to another Qozob account. Each person may join once.';
  end if;
  select s.terms_version into v_ver from public.reward_settings s where s.id;

  insert into public.reward_participants as p (user_id, legal_name, dob, id_type, id_last4, id_number_hash, id_doc_path,
                                               status, review_note, terms_version, terms_accepted_at, submitted_at, updated_at)
  values (v_uid, trim(p_legal_name), p_dob, p_id_type, right(v_num, 4), v_hash, p_doc_path,
          'pending_review', null, v_ver, now(), now(), now())
  on conflict (user_id) do update
     set legal_name = excluded.legal_name, dob = excluded.dob, id_type = excluded.id_type, id_last4 = excluded.id_last4,
         id_number_hash = excluded.id_number_hash, id_doc_path = excluded.id_doc_path, status = 'pending_review',
         review_note = null, terms_version = excluded.terms_version, terms_accepted_at = excluded.terms_accepted_at,
         submitted_at = now(), updated_at = now();

  insert into public.reward_audit_log (action, target_user, details) values ('kyc_submitted', v_uid, json_build_object('id_type', p_id_type)::jsonb);
  return json_build_object('status', 'pending_review');
end $$;

create or replace function public.save_payout_account(p_bank_name text, p_account_number text, p_account_name text)
returns json language plpgsql security definer set search_path = '' as $$
declare
  v_uid  uuid := auth.uid();
  v_num  text := regexp_replace(coalesce(p_account_number, ''), '\D', '', 'g');
  v_hash text;
  v_key  text;
begin
  if v_uid is null then raise exception 'Please sign in.' using errcode = '42501'; end if;
  if public.reward_is_excluded(v_uid) then raise exception 'This account is not eligible for rewards.'; end if;
  if v_num !~ '^[0-9]{10}$' then raise exception 'Nigerian bank account numbers (NUBAN) have exactly 10 digits.'; end if;
  if char_length(trim(coalesce(p_bank_name, ''))) < 2 then raise exception 'Choose your bank.'; end if;
  if char_length(trim(coalesce(p_account_name, ''))) < 3 then raise exception 'Enter the account name exactly as your bank shows it.'; end if;
  if exists (select 1 from public.reward_winners w where w.user_id = v_uid and w.status in ('pending', 'approved')) then
    raise exception 'You have a prize being processed. To protect your payment, contact support to change bank details.';
  end if;

  v_key  := public._rewards_key();
  v_hash := encode(extensions.hmac(v_num, v_key, 'sha256'), 'hex');
  if exists (select 1 from public.payout_accounts a where a.account_hash = v_hash and a.user_id <> v_uid) then
    raise exception 'This bank account is already linked to another Qozob account. Each person may use one account.';
  end if;

  insert into public.payout_accounts as a (user_id, bank_name, account_name, account_number_enc, account_last4, account_hash, updated_at)
  values (v_uid, trim(p_bank_name), trim(p_account_name), extensions.pgp_sym_encrypt(v_num, v_key), right(v_num, 4), v_hash, now())
  on conflict (user_id) do update
     set bank_name = excluded.bank_name, account_name = excluded.account_name, account_number_enc = excluded.account_number_enc,
         account_last4 = excluded.account_last4, account_hash = excluded.account_hash, updated_at = now();

  insert into public.reward_audit_log (action, target_user, details) values ('bank_saved', v_uid, json_build_object('last4', right(v_num, 4))::jsonb);
  return json_build_object('ok', true, 'last4', right(v_num, 4));
end $$;

-- People can delete their bank details (unless a prize is being paid)
create or replace function public.delete_payout_account()
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Please sign in.' using errcode = '42501'; end if;
  if exists (select 1 from public.reward_winners w where w.user_id = auth.uid() and w.status in ('pending', 'approved')) then
    raise exception 'You have a prize being processed. Contact support.';
  end if;
  delete from public.payout_accounts where user_id = auth.uid();
  insert into public.reward_audit_log (action, target_user) values ('bank_deleted', auth.uid());
end $$;

-- -------------------------------------------------------------------------------------
-- 8. PERIODS & WINNERS
-- -------------------------------------------------------------------------------------
create table if not exists public.reward_periods (
  id            bigint generated always as identity primary key,
  kind          text not null check (kind in ('monthly', 'annual')),
  period_start  date not null,
  period_end    date not null,
  prize_ngn     integer not null,
  wht_percent   numeric(5,2) not null default 0,
  pay_by        date not null,
  closed_at     timestamptz not null default now(),
  closed_by     uuid default auth.uid(),
  unique (kind, period_start)
);
alter table public.reward_periods enable row level security;
drop policy if exists "qozob_reward_periods_admin" on public.reward_periods;
create policy "qozob_reward_periods_admin" on public.reward_periods for select to authenticated using (public.is_admin());

create table if not exists public.reward_winners (
  id                 bigint generated always as identity primary key,
  period_id          bigint not null references public.reward_periods (id) on delete cascade,
  lga_id             integer references public.lgas (id) on delete set null,
  lga_name           text,
  state              text,
  user_id            uuid references auth.users (id) on delete set null,
  coins              integer not null,
  active_days        integer not null,
  stations           integer not null,
  gross_ngn          integer not null,
  wht_ngn            integer not null default 0,
  net_ngn            integer not null,
  status             text not null default 'pending' check (status in ('pending', 'approved', 'paid', 'forfeited')),
  payment_reference  text,
  paid_at            timestamptz,
  note               text,
  created_at         timestamptz not null default now()
);
create unique index if not exists reward_winners_one_per_lga on public.reward_winners (period_id, lga_id) where status <> 'forfeited' and lga_id is not null;
create unique index if not exists reward_winners_one_per_user on public.reward_winners (period_id, user_id) where status <> 'forfeited';
alter table public.reward_winners enable row level security;
drop policy if exists "qozob_reward_winners_read" on public.reward_winners;
create policy "qozob_reward_winners_read" on public.reward_winners for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- Ranked, qualified candidates for a period (internal)
create or replace function public._reward_candidates(p_kind text, p_start date, p_end date)
returns table (user_id uuid, lga_id integer, coins bigint, stations bigint, active_days bigint, last_at timestamptz)
language sql stable security definer set search_path = '' as $$
  with cfg as (select * from public.reward_settings where id),
  ad as (select * from public._reward_active_days(p_start, p_end)),
  sc as (
    select s.user_id, case when p_kind = 'monthly' then s.lga_id end as lga_id,
           sum(s.coins)::bigint as coins, sum(s.stations)::bigint as stations, max(s.last_at) as last_at
      from public._reward_scores(p_start, p_end) s
     where p_kind = 'annual' or s.lga_id is not null
     group by 1, 2
  )
  select sc.user_id, sc.lga_id, sc.coins, sc.stations, ad.active_days, sc.last_at
    from sc join ad on ad.user_id = sc.user_id, cfg
   where sc.coins > 0
     and ad.active_days >= case when p_kind = 'monthly' then cfg.min_active_days else cfg.annual_min_active_days end
     and public._reward_verified(sc.user_id)
   order by sc.coins desc, sc.stations desc, sc.last_at asc, sc.user_id;
$$;

create or replace function public.admin_close_period(p_kind text, p_start date)
returns json language plpgsql security definer set search_path = '' as $$
declare
  cfg        public.reward_settings%rowtype;
  v_start    date;
  v_end      date;
  v_pay_by   date;
  v_prize    integer;
  v_period   bigint;
  v_lgas     integer[] := '{}';
  v_users    uuid[] := '{}';
  c          record;
  v_count    integer := 0;
  v_wht      integer;
begin
  if not public.is_admin() then raise exception 'Not authorised: admin access required.' using errcode = '42501'; end if;
  select * into cfg from public.reward_settings where id;

  if p_kind = 'monthly' then
    v_start := date_trunc('month', p_start)::date;
    v_end := (v_start + interval '1 month - 1 day')::date;
    v_pay_by := (v_start + interval '1 month')::date + 6;          -- 7th of the following month
    v_prize := cfg.monthly_prize_ngn;
  elsif p_kind = 'annual' then
    v_start := date_trunc('year', p_start)::date;
    v_end := (v_start + interval '1 year - 1 day')::date;
    v_pay_by := (v_start + interval '1 year')::date + 30;          -- 31 January of the following year
    v_prize := cfg.annual_prize_ngn;
    if coalesce(v_prize, 0) <= 0 then raise exception 'Set the annual grand prize amount in Rewards → Settings first.'; end if;
  else
    raise exception 'Unknown period type.';
  end if;
  if v_end >= public._lagos_today() then raise exception 'This period has not ended yet (it ends %).', v_end; end if;
  if exists (select 1 from public.reward_periods p where p.kind = p_kind and p.period_start = v_start) then
    raise exception 'This period has already been closed.';
  end if;

  insert into public.reward_periods (kind, period_start, period_end, prize_ngn, wht_percent, pay_by)
  values (p_kind, v_start, v_end, v_prize, cfg.wht_percent, v_pay_by) returning id into v_period;
  v_wht := round(v_prize * cfg.wht_percent / 100.0);

  for c in select * from public._reward_candidates(p_kind, v_start, v_end) loop
    if p_kind = 'annual' then
      if v_count >= 1 then exit; end if;
    else
      if c.lga_id = any (v_lgas) or c.user_id = any (v_users) then continue; end if;
    end if;
    insert into public.reward_winners (period_id, lga_id, lga_name, state, user_id, coins, active_days, stations, gross_ngn, wht_ngn, net_ngn)
    select v_period, c.lga_id, l.name, l.state, c.user_id, c.coins, c.active_days, c.stations, v_prize, v_wht, v_prize - v_wht
      from (select 1) one left join public.lgas l on l.id = c.lga_id;
    v_lgas := v_lgas || c.lga_id;
    v_users := v_users || c.user_id;
    v_count := v_count + 1;
  end loop;

  -- Data minimisation: drop exact GPS positions older than 13 months
  update public.price_reports set reporter_lat = null, reporter_lng = null
   where reporter_lat is not null and created_at < now() - interval '13 months';

  insert into public.reward_audit_log (action, details)
  values ('period_closed', json_build_object('kind', p_kind, 'start', v_start, 'winners', v_count)::jsonb);
  return json_build_object('period_id', v_period, 'winners', v_count, 'pay_by', v_pay_by);
end $$;

-- Forfeit a winner (e.g. failed checks) and award the next qualified person in that LGA
create or replace function public.admin_replace_winner(p_winner_id bigint, p_note text)
returns json language plpgsql security definer set search_path = '' as $$
declare
  w   public.reward_winners%rowtype;
  p   public.reward_periods%rowtype;
  c   record;
  v_new bigint;
begin
  if not public.is_admin() then raise exception 'Not authorised: admin access required.' using errcode = '42501'; end if;
  select * into w from public.reward_winners where id = p_winner_id for update;
  if not found then raise exception 'Winner not found.'; end if;
  if w.status = 'paid' then raise exception 'This prize has already been paid.'; end if;
  select * into p from public.reward_periods where id = w.period_id;

  update public.reward_winners set status = 'forfeited', note = coalesce(p_note, note) where id = w.id;

  select * into c from public._reward_candidates(p.kind, p.period_start, p.period_end) x
   where (p.kind = 'annual' or x.lga_id = w.lga_id)
     and not exists (select 1 from public.reward_winners o where o.period_id = p.id and o.user_id = x.user_id)
   limit 1;
  if found then
    insert into public.reward_winners (period_id, lga_id, lga_name, state, user_id, coins, active_days, stations, gross_ngn, wht_ngn, net_ngn)
    values (p.id, w.lga_id, w.lga_name, w.state, c.user_id, c.coins, c.active_days, c.stations, w.gross_ngn, w.wht_ngn, w.net_ngn)
    returning id into v_new;
  end if;
  insert into public.reward_audit_log (action, target_user, details)
  values ('winner_forfeited', w.user_id, json_build_object('winner_id', w.id, 'replacement_id', v_new, 'note', p_note)::jsonb);
  return json_build_object('replacement_id', v_new);
end $$;

create or replace function public.admin_update_winner(p_winner_id bigint, p_status text, p_reference text default null, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Not authorised: admin access required.' using errcode = '42501'; end if;
  if p_status not in ('pending', 'approved', 'paid') then raise exception 'Use "replace" to forfeit a winner.'; end if;
  if p_status = 'paid' and coalesce(trim(p_reference), '') = '' then raise exception 'Enter the bank transfer reference.'; end if;
  update public.reward_winners
     set status = p_status,
         payment_reference = case when p_status = 'paid' then trim(p_reference) else payment_reference end,
         paid_at = case when p_status = 'paid' then now() else null end,
         note = coalesce(p_note, note)
   where id = p_winner_id and status <> 'forfeited';
  insert into public.reward_audit_log (action, details)
  values ('winner_' || p_status, json_build_object('winner_id', p_winner_id, 'reference', p_reference)::jsonb);
end $$;

-- -------------------------------------------------------------------------------------
-- 9. ADMIN REVIEW TOOLS
-- -------------------------------------------------------------------------------------
create or replace function public.admin_review_report(p_id bigint, p_approve boolean, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.price_reports%rowtype;
begin
  if not public.is_admin() then raise exception 'Not authorised: admin access required.' using errcode = '42501'; end if;
  select * into r from public.price_reports where id = p_id for update;
  if not found or r.status <> 'held' then raise exception 'This report is not waiting for review.'; end if;
  update public.price_reports
     set status = case when p_approve then 'accepted' else 'rejected' end,
         coins = case when p_approve then coins else 0 end,
         reviewed_by = auth.uid(), reviewed_at = now(), review_note = p_note
   where id = p_id;
  if not p_approve then
    insert into public.reward_participants as p (user_id, strikes) values (r.user_id, 1)
    on conflict (user_id) do update set strikes = p.strikes + 1, updated_at = now();
    update public.reward_participants set status = 'suspended', review_note = 'Suspended after 3 rejected price reports.'
     where user_id = r.user_id and strikes >= 3 and status <> 'suspended';
  end if;
  insert into public.reward_audit_log (action, target_user, details)
  values (case when p_approve then 'report_approved' else 'report_rejected' end, r.user_id, json_build_object('report_id', p_id, 'note', p_note)::jsonb);
end $$;

-- Returns the ID document path so the admin panel can delete the file afterwards
create or replace function public.admin_review_kyc(p_user uuid, p_approve boolean, p_note text default null)
returns text language plpgsql security definer set search_path = '' as $$
declare v_path text;
begin
  if not public.is_admin() then raise exception 'Not authorised: admin access required.' using errcode = '42501'; end if;
  select id_doc_path into v_path from public.reward_participants where user_id = p_user and status = 'pending_review' for update;
  if not found then raise exception 'Nothing to review for this person.'; end if;
  update public.reward_participants
     set status = case when p_approve then 'verified' else 'rejected' end,
         review_note = p_note, reviewed_by = auth.uid(), reviewed_at = now(), id_doc_path = null, updated_at = now()
   where user_id = p_user;
  insert into public.reward_audit_log (action, target_user, details)
  values (case when p_approve then 'kyc_approved' else 'kyc_rejected' end, p_user, json_build_object('note', p_note)::jsonb);
  return v_path;
end $$;

create or replace function public.admin_set_participant(p_user uuid, p_action text, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Not authorised: admin access required.' using errcode = '42501'; end if;
  insert into public.reward_participants (user_id) values (p_user) on conflict (user_id) do nothing;
  if p_action = 'suspend' then
    update public.reward_participants set status = 'suspended', review_note = coalesce(p_note, 'Suspended by Qozob.'), updated_at = now() where user_id = p_user;
  elsif p_action = 'unsuspend' then
    update public.reward_participants set status = case when id_number_hash is null then 'incomplete' else 'pending_review' end,
           strikes = 0, review_note = p_note, updated_at = now() where user_id = p_user;
  elsif p_action = 'phone_verified' then
    update public.reward_participants set phone_verified_manually_at = now(), updated_at = now() where user_id = p_user;
  elsif p_action = 'phone_unverified' then
    update public.reward_participants set phone_verified_manually_at = null, updated_at = now() where user_id = p_user;
  else
    raise exception 'Unknown action.';
  end if;
  insert into public.reward_audit_log (action, target_user, details) values ('participant_' || p_action, p_user, json_build_object('note', p_note)::jsonb);
end $$;

-- Full account number for paying a winner. Every reveal is logged.
create or replace function public.admin_reveal_payout(p_user uuid)
returns json language plpgsql security definer set search_path = '' as $$
declare a public.payout_accounts%rowtype;
begin
  if not public.is_admin() then raise exception 'Not authorised: admin access required.' using errcode = '42501'; end if;
  select * into a from public.payout_accounts where user_id = p_user;
  if not found then raise exception 'No bank account on file.'; end if;
  insert into public.reward_audit_log (action, target_user) values ('bank_revealed', p_user);
  return json_build_object('bank_name', a.bank_name, 'account_name', a.account_name,
                           'account_number', extensions.pgp_sym_decrypt(a.account_number_enc, public._rewards_key()));
end $$;

-- People list for the admin panel
create or replace function public.admin_reward_people()
returns table (user_id uuid, email text, display_name text, legal_name text, status text, id_type text, id_last4 text,
               dob date, id_doc_path text, phone text, phone_ok boolean, bank_name text, account_name text, account_last4 text,
               strikes integer, excluded boolean, coins_month bigint, submitted_at timestamptz, review_note text)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare v_ms date := date_trunc('month', public._lagos_today())::date;
begin
  if not public.is_admin() then raise exception 'Not authorised: admin access required.' using errcode = '42501'; end if;
  return query
  with ids as (
    select p.user_id as uid from public.reward_participants p
    union select a.user_id from public.payout_accounts a
    union select distinct r.user_id from public.price_reports r where r.lagos_day >= v_ms and r.status = 'accepted'
  )
  select ids.uid, u.email::text, public._reward_display_name(ids.uid), p.legal_name, coalesce(p.status, 'incomplete'), p.id_type, p.id_last4,
         p.dob, p.id_doc_path, u.phone::text, public._reward_phone_ok(ids.uid), a.bank_name, a.account_name, a.account_last4,
         coalesce(p.strikes, 0), public.reward_is_excluded(ids.uid),
         (select coalesce(sum(r.coins), 0)::bigint from public.price_reports r where r.user_id = ids.uid and r.status = 'accepted' and r.lagos_day >= v_ms),
         p.submitted_at, p.review_note
    from ids
    join auth.users u on u.id = ids.uid
    left join public.reward_participants p on p.user_id = ids.uid
    left join public.payout_accounts a on a.user_id = ids.uid
   order by (coalesce(p.status, '') = 'pending_review') desc, 17 desc;
end $$;

-- Winners with emails for the payout screen
create or replace function public.admin_reward_winners()
returns table (id bigint, period_id bigint, kind text, period_start date, pay_by date, lga_name text, state text, user_id uuid,
               email text, display_name text, legal_name text, coins integer, active_days integer, stations integer,
               gross_ngn integer, wht_ngn integer, net_ngn integer, status text, payment_reference text, paid_at timestamptz,
               note text, bank_name text, account_name text, account_last4 text)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if not public.is_admin() then raise exception 'Not authorised: admin access required.' using errcode = '42501'; end if;
  return query
  select w.id, w.period_id, p.kind, p.period_start, p.pay_by, w.lga_name, w.state, w.user_id, u.email::text,
         public._reward_display_name(w.user_id), rp.legal_name, w.coins, w.active_days, w.stations,
         w.gross_ngn, w.wht_ngn, w.net_ngn, w.status, w.payment_reference, w.paid_at, w.note,
         a.bank_name, a.account_name, a.account_last4
    from public.reward_winners w
    join public.reward_periods p on p.id = w.period_id
    left join auth.users u on u.id = w.user_id
    left join public.reward_participants rp on rp.user_id = w.user_id
    left join public.payout_accounts a on a.user_id = w.user_id
   order by p.period_start desc, p.kind, w.state, w.lga_name;
end $$;

-- Dashboard numbers for the admin Rewards tab
create or replace function public.admin_reward_stats(p_days integer default 30)
returns json language plpgsql stable security definer set search_path = '' as $$
declare
  v_today date := public._lagos_today();
  v_ms date := date_trunc('month', v_today)::date;
  v_from date := v_today - least(greatest(coalesce(p_days, 30), 7), 120) + 1;
begin
  if not public.is_admin() then raise exception 'Not authorised: admin access required.' using errcode = '42501'; end if;
  return json_build_object(
    'daily', (select coalesce(json_agg(json_build_object('day', d.day::date, 'accepted', coalesce(x.accepted, 0), 'held', coalesce(x.held, 0),
                                                         'no_reward', coalesce(x.no_reward, 0), 'rejected', coalesce(x.rejected, 0)) order by d.day), '[]'::json)
                from generate_series(v_from, v_today, interval '1 day') as d(day)
                left join (select r.lagos_day,
                                  count(*) filter (where r.status = 'accepted') as accepted,
                                  count(*) filter (where r.status = 'held') as held,
                                  count(*) filter (where r.status = 'no_reward') as no_reward,
                                  count(*) filter (where r.status = 'rejected') as rejected
                             from public.price_reports r where r.lagos_day >= v_from group by r.lagos_day) x on x.lagos_day = d.day::date),
    'reports_month', (select count(*) from public.price_reports r where r.lagos_day >= v_ms),
    'coins_month', (select coalesce(sum(r.coins), 0) from public.price_reports r where r.lagos_day >= v_ms and r.status = 'accepted'),
    'contributors_month', (select count(distinct r.user_id) from public.price_reports r where r.lagos_day >= v_ms and r.status = 'accepted'),
    'lgas_active_month', (select count(distinct r.lga_id) from public.price_reports r where r.lagos_day >= v_ms and r.status = 'accepted'),
    'held_pending', (select count(*) from public.price_reports r where r.status = 'held'),
    'kyc_pending', (select count(*) from public.reward_participants p where p.status = 'pending_review'),
    'verified_people', (select count(*) from public.reward_participants p where p.status = 'verified'),
    'lgas_loaded', (select count(*) from public.lgas),
    'stations_with_lga', (select count(*) from public.stations s where s.lga_id is not null),
    'stations_total', (select count(*) from public.stations),
    'top_lgas', (select coalesce(json_agg(t), '[]'::json) from (
                   select l.name, l.state, sum(r.coins)::bigint as coins, count(distinct r.user_id) as contributors
                     from public.price_reports r join public.lgas l on l.id = r.lga_id
                    where r.lagos_day >= v_ms and r.status = 'accepted'
                    group by l.name, l.state order by 3 desc limit 10) t),
    'reasons', (select coalesce(json_agg(t), '[]'::json) from (
                  select x.reason, count(*) as n
                    from public.price_reports r, unnest(r.reasons) as x(reason)
                   where r.lagos_day >= v_from and x.reason <> 'fresh_bonus'
                   group by x.reason order by 2 desc) t)
  );
end $$;

-- Exclude / re-include Qozob staff and representatives by email
create or replace function public.admin_exclude_user(p_email text, p_exclude boolean, p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid;
begin
  if not public.is_admin() then raise exception 'Not authorised: admin access required.' using errcode = '42501'; end if;
  select u.id into v_uid from auth.users u where lower(u.email) = lower(trim(p_email)) limit 1;
  if v_uid is null then raise exception 'No Qozob account uses that email.'; end if;
  if p_exclude then
    insert into public.reward_exclusions (user_id, reason) values (v_uid, coalesce(nullif(trim(p_reason), ''), 'Qozob staff / representative'))
    on conflict (user_id) do update set reason = excluded.reason;
  else
    delete from public.reward_exclusions where user_id = v_uid;
  end if;
  insert into public.reward_audit_log (action, target_user, details)
  values (case when p_exclude then 'excluded' else 'unexcluded' end, v_uid, json_build_object('reason', p_reason)::jsonb);
end $$;

create or replace function public.admin_reward_exclusions()
returns table (user_id uuid, email text, reason text, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if not public.is_admin() then raise exception 'Not authorised: admin access required.' using errcode = '42501'; end if;
  return query select e.user_id, u.email::text, e.reason, e.created_at
                 from public.reward_exclusions e left join auth.users u on u.id = e.user_id
                order by e.created_at desc;
end $$;

-- -------------------------------------------------------------------------------------
-- 10. PERMISSIONS  (Supabase lets everyone run new functions by default, so be explicit)
-- -------------------------------------------------------------------------------------
do $$
declare f text;
begin
  -- internal helpers: nobody calls these directly
  foreach f in array array[
    'public._rewards_key()',
    'public._reward_phone_ok(uuid)', 'public._reward_verified(uuid)', 'public._reward_display_name(uuid)',
    'public._reward_scores(date, date)', 'public._reward_active_days(date, date)',
    'public._reward_candidates(text, date, date)', 'public.reward_is_excluded(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;

  -- public (signed-out visitors too)
  foreach f in array array[
    'public.reward_leaderboard(date, date, integer, integer)', 'public.lga_at(double precision, double precision)',
    'public.lga_shapes(double precision, double precision, double precision, double precision, double precision)'
  ] loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to anon, authenticated', f);
  end loop;

  -- signed-in people (each function also checks admin rights where needed)
  foreach f in array array[
    'public.record_price_report(text, double precision, double precision, double precision)',
    'public.my_reward_summary()', 'public.submit_reward_kyc(text, date, text, text, text, boolean)',
    'public.save_payout_account(text, text, text)', 'public.delete_payout_account()',
    'public.admin_import_lgas(jsonb)', 'public.admin_assign_station_lgas()',
    'public.admin_close_period(text, date)', 'public.admin_replace_winner(bigint, text)',
    'public.admin_update_winner(bigint, text, text, text)', 'public.admin_review_report(bigint, boolean, text)',
    'public.admin_review_kyc(uuid, boolean, text)', 'public.admin_set_participant(uuid, text, text)',
    'public.admin_reveal_payout(uuid)', 'public.admin_reward_people()', 'public.admin_reward_winners()',
    'public.admin_reward_stats(integer)', 'public.admin_exclude_user(text, boolean, text)', 'public.admin_reward_exclusions()'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

commit;

select 'postgis' as item, (select extversion from pg_extension where extname = 'postgis') as value
union all select 'reward settings', (select count(*)::text from public.reward_settings)
union all select 'LGAs loaded (import from Admin → Rewards)', (select count(*)::text from public.lgas)
union all select 'vault key', (select case when exists (select 1 from vault.secrets where name = 'qozob_rewards_key') then 'ok' else 'MISSING' end);
