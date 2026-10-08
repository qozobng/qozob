-- =====================================================================================
--  QOZOB SECURITY HARDENING
--  Run ONCE in Supabase → SQL Editor → New query → paste everything → Run.
--
--  • Safe to re-run (every step checks before it changes anything).
--  • All-or-nothing: it runs inside a transaction, so if any step fails NOTHING changes.
--  • Existing policies on the affected tables are backed up to public._policy_backup first.
--
--  BEFORE RUNNING: put your admin email(s) in STEP 10 (search for  >>> ADMIN EMAILS <<< ).
--  The admin account must already exist (sign up / sign in to Qozob once with that email).
-- =====================================================================================

begin;

-- -------------------------------------------------------------------------------------
-- STEP 0. PRE-FLIGHT CHECKS  (stops with a clear message if the database looks different)
-- -------------------------------------------------------------------------------------
do $$
declare
  missing text;
begin
  if to_regclass('public.stations') is null then
    raise exception 'Table public.stations was not found. Nothing was changed.';
  end if;
  if to_regclass('public.station_claims') is null then
    raise exception 'Table public.station_claims was not found. Nothing was changed.';
  end if;

  select string_agg(c, ', ') into missing
  from unnest(array['station_id','name','address','lat','lng','price_pms','queue_status',
                    'verified','updated_by_role','last_updated']) as c
  where not exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = 'stations' and column_name = c);
  if missing is not null then
    raise exception 'stations table is missing column(s): %. Nothing was changed.', missing;
  end if;

  select string_agg(c, ', ') into missing
  from unnest(array['id','station_id','station_name','status','official_email']) as c
  where not exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = 'station_claims' and column_name = c);
  if missing is not null then
    raise exception 'station_claims table is missing column(s): %. Nothing was changed.', missing;
  end if;
end $$;

-- Columns the app already relies on. "if not exists" = no effect when they are already there.
alter table public.stations       add column if not exists manager_id      uuid;
alter table public.stations       add column if not exists custom_logo_url text;
alter table public.stations       add column if not exists claim_status    text default 'None';
alter table public.stations       add column if not exists pump_accuracy   numeric default 0;
alter table public.stations       add column if not exists accuracy_votes  integer default 0;
alter table public.station_claims add column if not exists user_id         uuid;
alter table public.station_claims add column if not exists lat             double precision;
alter table public.station_claims add column if not exists lng             double precision;
alter table public.station_claims add column if not exists admin_notes     text;
alter table public.station_claims add column if not exists reviewed_at     timestamptz;
alter table public.station_claims add column if not exists created_at      timestamptz default now();

do $$
declare
  manager_type text;
  user_type text;
begin
  select data_type into manager_type from information_schema.columns
   where table_schema = 'public' and table_name = 'stations' and column_name = 'manager_id';
  select data_type into user_type from information_schema.columns
   where table_schema = 'public' and table_name = 'station_claims' and column_name = 'user_id';
  if manager_type <> 'uuid' or user_type <> 'uuid' then
    raise exception 'Expected uuid columns but found stations.manager_id = %, station_claims.user_id = %. Nothing was changed - please send this message to your developer.', manager_type, user_type;
  end if;
end $$;

-- -------------------------------------------------------------------------------------
-- STEP 1. BACK UP, THEN REMOVE, EXISTING POLICIES ON THE TABLES WE ARE SECURING
--         (old "allow everything" policies would otherwise keep the holes open)
-- -------------------------------------------------------------------------------------
create table if not exists public._policy_backup (
  backed_up_at timestamptz not null default now(),
  schemaname name, tablename name, policyname name,
  permissive text, roles name[], cmd text, qual text, with_check text
);
alter table public._policy_backup enable row level security;   -- no policies = hidden from app users

insert into public._policy_backup (schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check)
select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where ((schemaname = 'public' and tablename in ('stations', 'station_claims'))
   or (schemaname = 'storage' and tablename = 'objects'
       and (coalesce(qual, '') || coalesce(with_check, '')) like '%cac_documents%'))
  and policyname not like 'qozob\_%';

do $$
declare
  p record;
begin
  for p in
    select schemaname, tablename, policyname from pg_policies
    where (schemaname = 'public' and tablename in ('stations', 'station_claims'))
       or (schemaname = 'storage' and tablename = 'objects'
           and (coalesce(qual, '') || coalesce(with_check, '')) like '%cac_documents%')
  loop
    execute format('drop policy if exists %I on %I.%I', p.policyname, p.schemaname, p.tablename);
  end loop;
end $$;

-- -------------------------------------------------------------------------------------
-- STEP 2. ROLE HELPERS
--   Trusted roles live in auth.users.raw_app_meta_data ("app_metadata"), which users
--   CANNOT edit. (user_metadata, which the old code trusted, is editable by any user.)
-- -------------------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce(
    (select lower(u.raw_app_meta_data ->> 'role') = 'admin' from auth.users u where u.id = auth.uid()),
    false
  );
$$;

-- Internal: set a user's trusted role (never downgrades an Admin). NOT callable from the app.
create or replace function public._set_app_role(p_user uuid, p_role text)
returns void
language sql security definer
set search_path = ''
as $$
  update auth.users
     set raw_app_meta_data  = coalesce(raw_app_meta_data, '{}'::jsonb)  || jsonb_build_object('role', p_role),
         raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('role', p_role)
   where id = p_user
     and coalesce(lower(raw_app_meta_data ->> 'role'), '') <> 'admin';
$$;

-- -------------------------------------------------------------------------------------
-- STEP 3. MANAGER ACCESS REQUESTS  (replaces the old self-serve "switch to Manager")
-- -------------------------------------------------------------------------------------
create table if not exists public.role_requests (
  id             bigint generated always as identity primary key,
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  email          text,
  full_name      text,
  company_name   text,
  phone          text,
  document_url   text,
  note           text,
  requested_role text not null default 'Manager' check (requested_role = 'Manager'),
  status         text not null default 'Pending' check (status in ('Pending', 'Approved', 'Rejected')),
  admin_notes    text,
  created_at     timestamptz not null default now(),
  reviewed_at    timestamptz,
  reviewed_by    uuid
);
create unique index if not exists role_requests_one_pending_per_user
  on public.role_requests (user_id) where status = 'Pending';

alter table public.role_requests enable row level security;

drop policy if exists "qozob_role_requests_select" on public.role_requests;
create policy "qozob_role_requests_select" on public.role_requests
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists "qozob_role_requests_insert" on public.role_requests;
create policy "qozob_role_requests_insert" on public.role_requests
  for insert to authenticated
  with check (user_id = auth.uid() and status = 'Pending'
              and admin_notes is null and reviewed_at is null and reviewed_by is null);

drop policy if exists "qozob_role_requests_withdraw" on public.role_requests;
create policy "qozob_role_requests_withdraw" on public.role_requests
  for delete to authenticated
  using (user_id = auth.uid() and status = 'Pending');

-- -------------------------------------------------------------------------------------
-- STEP 4. STATION CLAIMS  (contain names, phone numbers, CAC numbers → must be private)
-- -------------------------------------------------------------------------------------
alter table public.station_claims enable row level security;

create policy "qozob_claims_insert_own" on public.station_claims
  for insert to authenticated
  with check (user_id = auth.uid() and status = 'Pending Review'
              and admin_notes is null and reviewed_at is null);

create policy "qozob_claims_select_own_or_admin" on public.station_claims
  for select to authenticated
  using (user_id = auth.uid()
         or lower(official_email) = lower(auth.jwt() ->> 'email')
         or public.is_admin());

create policy "qozob_claims_admin_update" on public.station_claims
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- The map only needs "is this station claimed / pending?" - expose just that, nothing personal.
create or replace function public.get_claim_statuses(ids text[])
returns table (station_id text, status text)
language sql stable security definer
set search_path = ''
as $$
  select c.station_id::text, c.status::text
  from public.station_claims c
  where c.station_id::text = any (ids[1:200]);
$$;

-- -------------------------------------------------------------------------------------
-- STEP 5. STATIONS  (everyone can read; signed-in users can update prices; a guard
--         trigger decides WHICH columns each kind of user may change)
-- -------------------------------------------------------------------------------------
alter table public.stations enable row level security;

create policy "qozob_stations_read_all" on public.stations
  for select to anon, authenticated using (true);

-- anon is needed because /api/stations caches new Google stations without a user session
create policy "qozob_stations_insert" on public.stations
  for insert to anon, authenticated with check (true);

create policy "qozob_stations_update_signed_in" on public.stations
  for update to authenticated using (true) with check (true);
-- (no DELETE policy → stations can only be deleted from the Supabase dashboard)

create or replace function public.stations_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_uid      uuid := auth.uid();
  v_is_admin boolean;
  v_is_owner boolean;
  v_changed  boolean;
begin
  -- Trusted contexts: SQL editor, service-role key, and Qozob's own secure functions below.
  if current_user in ('postgres', 'supabase_admin', 'service_role') then
    return new;
  end if;

  v_is_admin := public.is_admin();

  if tg_op = 'INSERT' then
    if v_is_admin then
      if new.price_pms is not null then new.updated_by_role := 'Qozob rep'; new.verified := true; end if;
      return new;
    end if;
    -- New rows from the public can never arrive pre-verified, pre-owned or pre-rated
    new.manager_id      := null;
    new.custom_logo_url := null;
    new.claim_status    := 'None';
    new.verified        := false;
    new.pump_accuracy   := 0;
    new.accuracy_votes  := 0;
    if new.updated_by_role is distinct from 'System' then new.updated_by_role := 'User'; end if;
    return new;
  end if;

  -- UPDATE ------------------------------------------------------------------------
  new.station_id := old.station_id;
  v_changed := new.price_pms is distinct from old.price_pms
            or new.queue_status is distinct from old.queue_status;

  if v_is_admin then
    if v_changed then new.updated_by_role := 'Qozob rep'; new.verified := true; end if;
    return new;
  end if;

  -- Only admins can change ownership, claim status, location or rating totals
  -- (ratings go through public.rate_station so each person gets one vote).
  new.manager_id     := old.manager_id;
  new.claim_status   := old.claim_status;
  new.pump_accuracy  := old.pump_accuracy;
  new.accuracy_votes := old.accuracy_votes;
  new.lat            := old.lat;
  new.lng            := old.lng;

  v_is_owner := v_uid is not null and old.manager_id = v_uid;

  if v_is_owner then
    if v_changed then
      new.updated_by_role := 'Owner';
      new.verified := true;
    elsif new.updated_by_role is distinct from old.updated_by_role and new.updated_by_role <> 'Owner' then
      new.updated_by_role := old.updated_by_role;
    end if;
    return new;
  end if;

  -- Community member: may update price / queue only
  new.name            := old.name;
  new.address         := old.address;
  new.custom_logo_url := old.custom_logo_url;
  if v_changed then
    new.updated_by_role := 'User';
    new.verified := false;
  else
    new.updated_by_role := old.updated_by_role;
    new.verified := old.verified;
  end if;
  return new;
end;
$$;

drop trigger if exists stations_guard on public.stations;
create trigger stations_guard
  before insert or update on public.stations
  for each row execute function public.stations_guard();

-- -------------------------------------------------------------------------------------
-- STEP 6. PUMP RATINGS: one vote per person per station, counted safely on the server
-- -------------------------------------------------------------------------------------
create table if not exists public.station_ratings (
  station_id text not null,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  stars      smallint not null check (stars between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (station_id, user_id)
);
alter table public.station_ratings enable row level security;

drop policy if exists "qozob_ratings_select_own" on public.station_ratings;
create policy "qozob_ratings_select_own" on public.station_ratings
  for select to authenticated using (user_id = auth.uid());

create or replace function public.rate_station(
  p_station_id text,
  p_stars      integer,
  p_name       text default null,
  p_address    text default null,
  p_lat        double precision default null,
  p_lng        double precision default null
)
returns json
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_old   smallint;
  v_avg   numeric;
  v_votes integer;
begin
  if v_uid is null then raise exception 'Please sign in to rate stations.'; end if;
  if p_stars is null or p_stars < 1 or p_stars > 5 then raise exception 'Rating must be between 1 and 5.'; end if;

  if p_lat is not null and p_lng is not null then
    insert into public.stations (station_id, name, address, lat, lng, price_pms, queue_status, verified,
                                 updated_by_role, pump_accuracy, accuracy_votes, last_updated)
    values (p_station_id, coalesce(p_name, 'Unknown Station'), p_address, p_lat, p_lng, null, 'Unknown', false,
            'System', 0, 0, 'Never')
    on conflict (station_id) do nothing;
  end if;

  select coalesce(s.pump_accuracy, 0), coalesce(s.accuracy_votes, 0)
    into v_avg, v_votes
    from public.stations s where s.station_id = p_station_id
    for update;
  if not found then raise exception 'Station not found.'; end if;

  select r.stars into v_old from public.station_ratings r
   where r.station_id = p_station_id and r.user_id = v_uid;

  if v_old is null then
    v_avg   := (v_avg * v_votes + p_stars) / (v_votes + 1);
    v_votes := v_votes + 1;
    insert into public.station_ratings (station_id, user_id, stars) values (p_station_id, v_uid, p_stars);
  else
    if v_votes > 0 then v_avg := (v_avg * v_votes - v_old + p_stars) / v_votes; end if;
    update public.station_ratings set stars = p_stars, updated_at = now()
     where station_id = p_station_id and user_id = v_uid;
  end if;

  v_avg := round(greatest(0, least(5, v_avg)), 1);
  update public.stations set pump_accuracy = v_avg, accuracy_votes = v_votes where station_id = p_station_id;

  return json_build_object('pump_accuracy', v_avg, 'accuracy_votes', v_votes, 'changed_vote', v_old is not null);
end;
$$;

-- -------------------------------------------------------------------------------------
-- STEP 7. ADMIN ACTIONS  (each one re-checks that the caller really is an admin)
-- -------------------------------------------------------------------------------------
create or replace function public.admin_review_claim(p_claim_id text, p_status text, p_notes text default null)
returns json
language plpgsql security definer
set search_path = ''
as $$
declare
  c record;
begin
  if not public.is_admin() then raise exception 'Not authorised: admin access required.' using errcode = '42501'; end if;
  if p_status not in ('Approved', 'Rejected') then raise exception 'Status must be Approved or Rejected.'; end if;

  select * into c from public.station_claims where id::text = p_claim_id for update;
  if not found then raise exception 'Claim not found.'; end if;

  if p_status = 'Approved' and c.user_id is null then
    raise exception 'This claim is not linked to a user account, so it cannot be approved automatically.';
  end if;

  update public.station_claims
     set status = p_status, admin_notes = p_notes, reviewed_at = now()
   where id::text = p_claim_id;

  if p_status = 'Approved' then
    update public.stations
       set verified = true, claim_status = 'Claimed', manager_id = c.user_id
     where station_id = c.station_id;

    if not found and c.lat is not null and c.lng is not null then
      insert into public.stations (station_id, name, lat, lng, verified, claim_status, manager_id)
      values (c.station_id, c.station_name, c.lat, c.lng, true, 'Claimed', c.user_id);
    end if;

    perform public._set_app_role(c.user_id, 'Manager');

    update public.role_requests
       set status = 'Approved', reviewed_at = now(), reviewed_by = auth.uid(),
           admin_notes = coalesce(admin_notes, 'Approved together with station claim')
     where user_id = c.user_id and status = 'Pending';
  end if;

  return json_build_object('success', true, 'status', p_status);
end;
$$;

create or replace function public.admin_review_role_request(p_request_id bigint, p_status text, p_notes text default null)
returns json
language plpgsql security definer
set search_path = ''
as $$
declare
  r record;
begin
  if not public.is_admin() then raise exception 'Not authorised: admin access required.' using errcode = '42501'; end if;
  if p_status not in ('Approved', 'Rejected') then raise exception 'Status must be Approved or Rejected.'; end if;

  select * into r from public.role_requests where id = p_request_id for update;
  if not found then raise exception 'Request not found.'; end if;

  update public.role_requests
     set status = p_status, admin_notes = p_notes, reviewed_at = now(), reviewed_by = auth.uid()
   where id = p_request_id;

  if p_status = 'Approved' then
    perform public._set_app_role(r.user_id, 'Manager');
  else
    -- Rejected: clear the self-selected "Manager" flag so the app shows them as a normal user again
    update auth.users
       set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || '{"role":"User"}'::jsonb
     where id = r.user_id
       and coalesce(lower(raw_app_meta_data ->> 'role'), '') not in ('admin', 'manager');
  end if;

  return json_build_object('success', true, 'status', p_status);
end;
$$;

-- -------------------------------------------------------------------------------------
-- STEP 8. FILE STORAGE
--   CAC documents → private (only admins can open them, via short-lived links).
--   Station logos stay public; managers may upload into their own folder.
-- -------------------------------------------------------------------------------------
update storage.buckets set public = false where id = 'cac_documents';

drop policy if exists "qozob_cac_upload" on storage.objects;
create policy "qozob_cac_upload" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'cac_documents');

drop policy if exists "qozob_cac_admin_read" on storage.objects;
create policy "qozob_cac_admin_read" on storage.objects
  for select to authenticated
  using (bucket_id = 'cac_documents' and public.is_admin());

drop policy if exists "qozob_logos_upload_own_folder" on storage.objects;
create policy "qozob_logos_upload_own_folder" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'station_logos' and (storage.foldername(name))[1] = auth.uid()::text);

-- -------------------------------------------------------------------------------------
-- STEP 9. MOVE EXISTING USERS OVER
-- -------------------------------------------------------------------------------------
-- 9a. Real managers (already linked to a station, or with an approved claim) keep Manager.
update auth.users u
   set raw_app_meta_data = coalesce(u.raw_app_meta_data, '{}'::jsonb) || '{"role":"Manager"}'::jsonb
 where coalesce(lower(u.raw_app_meta_data ->> 'role'), '') not in ('admin', 'manager')
   and (exists (select 1 from public.stations s where s.manager_id = u.id)
        or exists (select 1 from public.station_claims c where c.user_id = u.id and c.status = 'Approved'));

-- 9b. People who simply picked "Manager" themselves become pending requests for you to review.
insert into public.role_requests (user_id, email, full_name, company_name, phone, document_url, note)
select u.id,
       u.email,
       nullif(trim(concat_ws(' ', u.raw_user_meta_data ->> 'first_name', u.raw_user_meta_data ->> 'last_name')), ''),
       u.raw_user_meta_data ->> 'company_name',
       u.raw_user_meta_data ->> 'full_phone',
       coalesce(u.raw_user_meta_data ->> 'cac_document_path', u.raw_user_meta_data ->> 'cac_document_url'),
       'Imported: selected Manager before admin approval was required'
  from auth.users u
 where u.raw_user_meta_data ->> 'role' = 'Manager'
   and coalesce(lower(u.raw_app_meta_data ->> 'role'), '') not in ('admin', 'manager')
on conflict do nothing;

-- -------------------------------------------------------------------------------------
-- STEP 10. MAKE YOURSELF ADMIN
--   >>> ADMIN EMAILS <<<  replace the example below with your real email(s).
--   For several admins:  in (lower('a@x.com'), lower('b@y.com'))
-- -------------------------------------------------------------------------------------
update auth.users
   set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"Admin"}'::jsonb
 where lower(email) in (lower('YOUR-ADMIN-EMAIL@example.com'));

do $$
begin
  if not exists (select 1 from auth.users where lower(raw_app_meta_data ->> 'role') = 'admin') then
    raise exception 'No admin account found. Put YOUR email in STEP 10 (the account must already exist - sign in to Qozob once first), then run again. Nothing was changed.';
  end if;
end $$;

-- -------------------------------------------------------------------------------------
-- STEP 11. FUNCTION PERMISSIONS
-- -------------------------------------------------------------------------------------
revoke all on function public._set_app_role(uuid, text) from public, anon, authenticated;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

revoke all on function public.get_claim_statuses(text[]) from public;
grant execute on function public.get_claim_statuses(text[]) to anon, authenticated;

revoke all on function public.rate_station(text, integer, text, text, double precision, double precision) from public, anon;
grant execute on function public.rate_station(text, integer, text, text, double precision, double precision) to authenticated;

revoke all on function public.admin_review_claim(text, text, text) from public, anon;
grant execute on function public.admin_review_claim(text, text, text) to authenticated;

revoke all on function public.admin_review_role_request(bigint, text, text) from public, anon;
grant execute on function public.admin_review_role_request(bigint, text, text) to authenticated;

-- -------------------------------------------------------------------------------------
-- STEP 12. LIVE PRICES: make sure Realtime is switched on for the stations table
-- -------------------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'stations') then
    alter publication supabase_realtime add table public.stations;
  end if;
end $$;

commit;

-- -------------------------------------------------------------------------------------
-- DONE. This summary should show your admin email(s) and the security status:
-- -------------------------------------------------------------------------------------
select 'Admin account' as item, email as value from auth.users where lower(raw_app_meta_data ->> 'role') = 'admin'
union all
select 'Verified managers', count(*)::text from auth.users where lower(raw_app_meta_data ->> 'role') = 'manager'
union all
select 'Manager requests waiting for you', count(*)::text from public.role_requests where status = 'Pending'
union all
select 'RLS on stations', relrowsecurity::text from pg_class where oid = 'public.stations'::regclass
union all
select 'RLS on station_claims', relrowsecurity::text from pg_class where oid = 'public.station_claims'::regclass
union all
select 'CAC bucket public?', coalesce((select public::text from storage.buckets where id = 'cac_documents'), 'bucket not found');
