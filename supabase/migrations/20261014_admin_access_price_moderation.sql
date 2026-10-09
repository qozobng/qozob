-- =====================================================================================
--  QOZOB 20261014: ADMIN ACCESS LEVELS + PRICE MODERATION + REPORTING
--  Run ONCE in Supabase → SQL Editor → New query → paste everything → Run.
--  • Safe to re-run.  • All-or-nothing (one transaction).
--  • Requires 20261008, 20261009, 20261010, 20261011, 20261012 and 20261013.
--
--  What this does
--   1. FIXES "null value in column price_pms violates not-null constraint" (pump ratings, claim
--      approvals and the Google-station cache all failed for stations without a price yet).
--      Also tidies legacy values (queue names, 'Just now' timestamps, quoted role labels).
--   2. Admin access levels: master admins decide which sections each admin can use
--      (claims, manager requests, stations, price reviews, adverts, mailing, rewards, auto services).
--      Enforced in the database (every admin function and table policy), not just in the app.
--   3. Price updates go through submit_price():
--        - community members must be within the distance set in Rewards → Settings (default 1 km);
--          owners of a claimed station and Qozob staff with "Stations" access can update from anywhere
--        - prices outside the allowed range / far from the local average / impossible travel are HELD:
--          they are NOT shown on the map until an admin approves them; coins are counted on the
--          day of the original update
--   4. Station owners can edit name, address, logo, price and queue of their own stations (checked).
--   5. Reporting functions for the admin panel (price reports, contributors, LGA summary, review queue).
--   6. Rewards: payout preference now defaults to CASH and can be chosen by each person; vouchers can
--      only be redeemed once, by an admin, against the winner's own service request.
--   7. Service requests can no longer be submitted pre-marked as paid / voucher-used.
--   8. Saved stations: members can bookmark stations on the map; they appear in their dashboard.
-- =====================================================================================

begin;

-- -------------------------------------------------------------------------------------
-- 0. PRE-FLIGHT
-- -------------------------------------------------------------------------------------
do $$
declare
  v_type text;
begin
  if to_regprocedure('public.is_admin()') is null then
    raise exception 'public.is_admin() not found. Run 20261008_security_hardening.sql first. Nothing was changed.';
  end if;
  if to_regclass('public.price_reports') is null or to_regclass('public.reward_settings') is null then
    raise exception 'Rewards tables not found. Run 20261011_rewards.sql first. Nothing was changed.';
  end if;
  if to_regclass('public.service_requests') is null then
    raise exception 'service_requests not found. Run 20261013_monetization_and_services.sql first. Nothing was changed.';
  end if;
  select data_type into v_type from information_schema.columns
   where table_schema = 'public' and table_name = 'stations' and column_name = 'last_updated';
  if v_type not in ('text', 'character varying') then
    raise exception 'stations.last_updated is "%" (expected text). Please send this message to your developer. Nothing was changed.', v_type;
  end if;
end $$;

-- -------------------------------------------------------------------------------------
-- 1. STATIONS: allow "no price yet" + tidy legacy values
-- -------------------------------------------------------------------------------------
do $$
declare c text;
begin
  foreach c in array array['price_pms', 'address', 'queue_status', 'last_updated', 'updated_by_role'] loop
    if exists (select 1 from information_schema.columns
                where table_schema = 'public' and table_name = 'stations' and column_name = c and is_nullable = 'NO') then
      execute format('alter table public.stations alter column %I drop not null', c);
    end if;
  end loop;
end $$;

-- Role labels saved with stray quotes ('User') by an old version of the app
update public.stations set updated_by_role = btrim(updated_by_role, '''" ')
 where updated_by_role ~ '[''"]';

-- Legacy queue names → the four the map uses
update public.stations
   set queue_status = case queue_status
                        when 'Moderate Queue' then 'Moderate'
                        when 'Long Queue'     then 'Heavy'
                        when 'Short Queue'    then 'No Queue'
                        when 'Normal'         then 'No Queue'
                      end
 where queue_status in ('Moderate Queue', 'Long Queue', 'Short Queue', 'Normal');

-- 'Just now' and other non-dates → the row's creation time (so "updated x ago" is honest)
do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'stations' and column_name = 'created_at') then
    execute $q$
      update public.stations
         set last_updated = to_char(coalesce(created_at, now()) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
       where last_updated is not null and last_updated <> 'Never'
         and last_updated !~ '^\d{4}-\d{2}-\d{2}'
    $q$;
  end if;
end $$;

-- -------------------------------------------------------------------------------------
-- 2. ADMIN ACCESS LEVELS
-- -------------------------------------------------------------------------------------
create table if not exists public.admin_permissions (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  is_master   boolean not null default false,
  modules     text[] not null default '{}'
              check (modules <@ array['claims', 'requests', 'stations', 'prices', 'ads', 'mailing', 'rewards', 'services']::text[]),
  note        text,
  granted_by  uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.admin_permissions enable row level security;

create table if not exists public.admin_audit_log (
  id           bigint generated always as identity primary key,
  actor        uuid default auth.uid(),
  action       text not null,
  target_user  uuid,
  details      jsonb,
  created_at   timestamptz not null default now()
);
alter table public.admin_audit_log enable row level security;

-- Everyone who is an admin today keeps full access (master). "do nothing" on conflict means a
-- re-run never promotes an admin whose access was later limited.
insert into public.admin_permissions (user_id, is_master, modules, note)
select u.id, true, array['claims', 'requests', 'stations', 'prices', 'ads', 'mailing', 'rewards', 'services'], 'Existing admin (20261014)'
  from auth.users u
 where lower(coalesce(u.raw_app_meta_data ->> 'role', '')) = 'admin'
on conflict (user_id) do nothing;

create or replace function public.admin_is_master()
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_admin()
     and coalesce((select p.is_master from public.admin_permissions p where p.user_id = auth.uid()), false);
$$;

-- An admin with no access row can open nothing until a master admin assigns sections.
create or replace function public.admin_can(p_module text)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_admin()
     and coalesce((select p.is_master or p_module = any (p.modules)
                     from public.admin_permissions p where p.user_id = auth.uid()), false);
$$;

drop policy if exists "qozob_admin_permissions_read" on public.admin_permissions;
create policy "qozob_admin_permissions_read" on public.admin_permissions for select to authenticated
  using (user_id = auth.uid() or (select public.admin_is_master()));
-- (no write policies: changes go through admin_grant_access / admin_revoke_access)

drop policy if exists "qozob_admin_audit_read" on public.admin_audit_log;
create policy "qozob_admin_audit_read" on public.admin_audit_log for select to authenticated
  using ((select public.admin_is_master()));

create or replace function public.my_admin_access()
returns json language sql stable security definer set search_path = '' as $$
  select json_build_object(
    'is_admin',  public.is_admin(),
    'is_master', public.admin_is_master(),
    'modules',   case
                   when not public.is_admin() then '{}'::text[]
                   when public.admin_is_master() then array['claims', 'requests', 'stations', 'prices', 'ads', 'mailing', 'rewards', 'services']
                   else coalesce((select p.modules from public.admin_permissions p where p.user_id = auth.uid()), '{}'::text[])
                 end);
$$;

create or replace function public.admin_list_admins()
returns table (user_id uuid, email text, full_name text, is_master boolean, modules text[], note text,
               has_access_row boolean, granted_by_email text, updated_at timestamptz, last_sign_in_at timestamptz, is_me boolean)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if not public.admin_is_master() then raise exception 'Only a master admin can manage admin access.' using errcode = '42501'; end if;
  return query
  select u.id, u.email::text,
         nullif(btrim(concat_ws(' ', u.raw_user_meta_data ->> 'first_name', u.raw_user_meta_data ->> 'last_name')), ''),
         coalesce(p.is_master, false),
         case when p.is_master then array['claims', 'requests', 'stations', 'prices', 'ads', 'mailing', 'rewards', 'services']
              else coalesce(p.modules, '{}'::text[]) end,
         p.note, p.user_id is not null, g.email::text, p.updated_at, u.last_sign_in_at, u.id = auth.uid()
    from auth.users u
    left join public.admin_permissions p on p.user_id = u.id
    left join auth.users g on g.id = p.granted_by
   where lower(coalesce(u.raw_app_meta_data ->> 'role', '')) = 'admin'
   order by coalesce(p.is_master, false) desc, u.email;
end $$;

create or replace function public.admin_find_user(p_email text)
returns json language plpgsql stable security definer set search_path = '' as $$
declare r record;
begin
  if not public.admin_is_master() then raise exception 'Only a master admin can manage admin access.' using errcode = '42501'; end if;
  select u.id, u.email::text as email,
         nullif(btrim(concat_ws(' ', u.raw_user_meta_data ->> 'first_name', u.raw_user_meta_data ->> 'last_name')), '') as full_name,
         coalesce(u.raw_app_meta_data ->> 'role', 'User') as role
    into r
    from auth.users u where lower(u.email) = lower(btrim(p_email)) limit 1;
  if not found then return null; end if;
  return json_build_object('user_id', r.id, 'email', r.email, 'full_name', r.full_name, 'role', r.role,
                           'is_admin', lower(r.role) = 'admin');
end $$;

create or replace function public.admin_grant_access(p_email text, p_is_master boolean, p_modules text[], p_note text default null)
returns json language plpgsql security definer set search_path = '' as $$
declare
  v_all       text[] := array['claims', 'requests', 'stations', 'prices', 'ads', 'mailing', 'rewards', 'services'];
  v_uid       uuid;
  v_email     text;
  v_was_admin boolean;
  v_master    boolean := coalesce(p_is_master, false);
  v_mods      text[];
  v_cur_master boolean;
begin
  if not public.admin_is_master() then raise exception 'Only a master admin can manage admin access.' using errcode = '42501'; end if;

  select u.id, u.email::text, lower(coalesce(u.raw_app_meta_data ->> 'role', '')) = 'admin'
    into v_uid, v_email, v_was_admin
    from auth.users u where lower(u.email) = lower(btrim(p_email)) limit 1;
  if v_uid is null then
    raise exception 'No Qozob account uses %.', btrim(p_email) using hint = 'user_not_found';
  end if;

  select coalesce(array_agg(distinct m order by m), '{}'::text[]) into v_mods
    from unnest(coalesce(p_modules, '{}'::text[])) as m where m = any (v_all);
  if v_master then v_mods := v_all; end if;
  if cardinality(v_mods) = 0 then raise exception 'Choose at least one section this admin can use.'; end if;

  if v_uid = auth.uid() and not v_master then
    raise exception 'You cannot remove your own master access. Ask another master admin.';
  end if;
  select p.is_master into v_cur_master from public.admin_permissions p where p.user_id = v_uid;
  if coalesce(v_cur_master, false) and not v_master and not exists (
       select 1 from public.admin_permissions p join auth.users u on u.id = p.user_id
        where p.is_master and p.user_id <> v_uid and lower(coalesce(u.raw_app_meta_data ->> 'role', '')) = 'admin') then
    raise exception 'At least one master admin must remain.';
  end if;

  update auth.users
     set raw_app_meta_data  = coalesce(raw_app_meta_data, '{}'::jsonb)  || '{"role":"Admin"}'::jsonb,
         raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || '{"role":"Admin"}'::jsonb
   where id = v_uid;

  insert into public.admin_permissions as p (user_id, is_master, modules, note, granted_by, updated_at)
  values (v_uid, v_master, v_mods, nullif(btrim(coalesce(p_note, '')), ''), auth.uid(), now())
  on conflict (user_id) do update
     set is_master = excluded.is_master, modules = excluded.modules, note = excluded.note,
         granted_by = excluded.granted_by, updated_at = now();

  insert into public.admin_audit_log (action, target_user, details)
  values (case when v_was_admin then 'admin_access_changed' else 'admin_granted' end, v_uid,
          jsonb_build_object('email', v_email, 'is_master', v_master, 'modules', v_mods, 'note', p_note));

  return json_build_object('user_id', v_uid, 'email', v_email, 'is_master', v_master, 'modules', v_mods,
                           'new_admin', not v_was_admin);
end $$;

create or replace function public.admin_revoke_access(p_user uuid)
returns json language plpgsql security definer set search_path = '' as $$
declare
  v_email  text;
  v_master boolean;
  v_role   text;
begin
  if not public.admin_is_master() then raise exception 'Only a master admin can manage admin access.' using errcode = '42501'; end if;
  if p_user = auth.uid() then raise exception 'You cannot remove your own admin access.'; end if;
  select u.email::text into v_email from auth.users u where u.id = p_user;
  if v_email is null then raise exception 'User not found.'; end if;

  select p.is_master into v_master from public.admin_permissions p where p.user_id = p_user;
  if coalesce(v_master, false) and not exists (
       select 1 from public.admin_permissions p join auth.users u on u.id = p.user_id
        where p.is_master and p.user_id <> p_user and lower(coalesce(u.raw_app_meta_data ->> 'role', '')) = 'admin') then
    raise exception 'At least one master admin must remain.';
  end if;

  v_role := case when exists (select 1 from public.stations s where s.manager_id = p_user) then 'Manager' else 'User' end;
  update auth.users
     set raw_app_meta_data  = coalesce(raw_app_meta_data, '{}'::jsonb)  || jsonb_build_object('role', v_role),
         raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('role', v_role)
   where id = p_user;
  delete from public.admin_permissions where user_id = p_user;

  insert into public.admin_audit_log (action, target_user, details)
  values ('admin_revoked', p_user, jsonb_build_object('email', v_email, 'new_role', v_role));
  return json_build_object('user_id', p_user, 'email', v_email, 'role', v_role);
end $$;

-- -------------------------------------------------------------------------------------
-- 3. SWITCH EXISTING ADMIN FUNCTIONS + POLICIES FROM "any admin" TO "admin with this section"
-- -------------------------------------------------------------------------------------
do $$
declare
  m     record;
  v_fn  regprocedure;
  v_def text;
begin
  for m in
    select * from (values
      ('public.admin_review_claim(text, text, text)',                 'claims'),
      ('public.admin_review_role_request(bigint, text, text)',        'requests'),
      ('public.admin_queue_campaign(uuid)',                           'mailing'),
      ('public.admin_import_lgas(jsonb)',                             'rewards'),
      ('public.admin_assign_station_lgas()',                          'rewards'),
      ('public.admin_replace_winner(bigint, text)',                   'rewards'),
      ('public.admin_update_winner(bigint, text, text, text)',        'rewards'),
      ('public.admin_review_kyc(uuid, boolean, text)',                'rewards'),
      ('public.admin_set_participant(uuid, text, text)',              'rewards'),
      ('public.admin_reveal_payout(uuid)',                            'rewards'),
      ('public.admin_reward_people()',                                'rewards'),
      ('public.admin_reward_winners()',                               'rewards'),
      ('public.admin_reward_stats(integer)',                          'rewards'),
      ('public.admin_exclude_user(text, boolean, text)',              'rewards'),
      ('public.admin_reward_exclusions()',                            'rewards')
    ) as t(sig, module)
  loop
    v_fn := to_regprocedure(m.sig);
    if v_fn is null then continue; end if;
    v_def := pg_get_functiondef(v_fn);
    if position('public.is_admin()' in v_def) = 0 then continue; end if;   -- already converted
    v_def := replace(v_def, 'public.is_admin()', format('public.admin_can(%L)', m.module));
    v_def := replace(v_def, 'Not authorised: admin access required.',
                            'Not authorised: your admin account does not have access to this section.');
    execute v_def;
  end loop;
end $$;

do $$
declare
  p     record;
  v_q   text;
  v_c   text;
  v_sql text;
begin
  for p in
    select pol.schemaname, pol.tablename, pol.policyname, pol.qual, pol.with_check, m.expr
      from pg_policies pol
      join (values
        ('public',  'station_claims',      null::text, '(select public.admin_can(''claims''))'),
        ('public',  'role_requests',       null,       '(select public.admin_can(''requests''))'),
        ('public',  'ads',                 null,       '(select public.admin_can(''ads''))'),
        ('public',  'ad_stats_daily',      null,       '(select public.admin_can(''ads''))'),
        ('public',  'mailing_subscribers', null,       '(select public.admin_can(''mailing''))'),
        ('public',  'mail_campaigns',      null,       '(select public.admin_can(''mailing''))'),
        ('public',  'mail_deliveries',     null,       '(select public.admin_can(''mailing''))'),
        ('public',  'reward_settings',     null,       '(select public.admin_can(''rewards''))'),
        ('public',  'reward_exclusions',   null,       '(select public.admin_can(''rewards''))'),
        ('public',  'reward_audit_log',    null,       '(select public.admin_can(''rewards''))'),
        ('public',  'reward_periods',      null,       '(select public.admin_can(''rewards''))'),
        ('public',  'reward_winners',      null,       '(select public.admin_can(''rewards''))'),
        ('public',  'reward_participants', null,       '(select public.admin_can(''rewards''))'),
        ('public',  'price_reports',       null,       '(select (public.admin_can(''prices'') or public.admin_can(''rewards'')))'),
        ('public',  'service_requests',    null,       '(select public.admin_can(''services''))'),
        ('public',  'user_vehicles',       null,       '(select public.admin_can(''services''))'),
        ('public',  'fuel_logs',           null,       '(select public.admin_can(''services''))'),
        ('storage', 'objects', 'qozob_cac_admin_read',            '(select (public.admin_can(''claims'') or public.admin_can(''requests'')))'),
        ('storage', 'objects', 'qozob_reward_kyc_admin_read',     '(select public.admin_can(''rewards''))'),
        ('storage', 'objects', 'qozob_reward_kyc_admin_delete',   '(select public.admin_can(''rewards''))'),
        ('storage', 'objects', 'qozob_ad_creatives_admin_insert', '(select public.admin_can(''ads''))'),
        ('storage', 'objects', 'qozob_ad_creatives_admin_update', '(select public.admin_can(''ads''))'),
        ('storage', 'objects', 'qozob_ad_creatives_admin_delete', '(select public.admin_can(''ads''))')
      ) as m(schemaname, tablename, policyname, expr)
        on m.schemaname = pol.schemaname and m.tablename = pol.tablename
       and (m.policyname is null or m.policyname = pol.policyname)
     where coalesce(pol.qual, '') ~ 'is_admin\(\)' or coalesce(pol.with_check, '') ~ 'is_admin\(\)'
  loop
    v_q := regexp_replace(p.qual,       '(public\.)?is_admin\(\)', p.expr, 'g');
    v_c := regexp_replace(p.with_check, '(public\.)?is_admin\(\)', p.expr, 'g');
    v_sql := format('alter policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
    if v_q is not null then v_sql := v_sql || ' using (' || v_q || ')'; end if;
    if v_c is not null then v_sql := v_sql || ' with check (' || v_c || ')'; end if;
    execute v_sql;
  end loop;
end $$;

-- -------------------------------------------------------------------------------------
-- 4. STATIONS GUARD (who may change which columns)
--    • admins with "Stations" access: anything
--    • station owner (manager_id): name, address, logo (own upload folder), price, queue
--    • everyone else: nothing directly — prices go through submit_price() below
--    Trusted contexts (SQL editor, service role, Qozob's own secure functions) skip the guard.
-- -------------------------------------------------------------------------------------
create or replace function public.stations_guard()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_uid     uuid := auth.uid();
  v_admin   boolean;
  v_changed boolean;
  v_now     text := to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
begin
  if current_user in ('postgres', 'supabase_admin', 'service_role') then
    return new;
  end if;

  v_admin := public.admin_can('stations');

  if tg_op = 'INSERT' then
    if v_admin then
      if new.price_pms is not null then new.updated_by_role := 'Qozob rep'; new.verified := true; end if;
      return new;
    end if;
    -- New rows from the public (map cache of Google stations) arrive empty and unowned
    new.manager_id      := null;
    new.custom_logo_url := null;
    new.claim_status    := 'None';
    new.verified        := false;
    new.pump_accuracy   := 0;
    new.accuracy_votes  := 0;
    new.price_pms       := null;
    new.queue_status    := 'Unknown';
    new.updated_by_role := 'System';
    new.last_updated    := 'Never';
    return new;
  end if;

  -- UPDATE ------------------------------------------------------------------------
  new.station_id := old.station_id;

  if v_admin then
    v_changed := new.price_pms is distinct from old.price_pms or new.queue_status is distinct from old.queue_status;
    if v_changed then new.updated_by_role := 'Qozob rep'; new.verified := true; end if;
    return new;
  end if;

  -- Only admins change ownership, claim status, location or rating totals
  new.manager_id     := old.manager_id;
  new.claim_status   := old.claim_status;
  new.pump_accuracy  := old.pump_accuracy;
  new.accuracy_votes := old.accuracy_votes;
  new.lat            := old.lat;
  new.lng            := old.lng;

  if v_uid is not null and old.manager_id = v_uid then
    -- Station owner
    new.name    := left(coalesce(nullif(btrim(new.name), ''), old.name), 120);
    new.address := left(coalesce(nullif(btrim(new.address), ''), old.address), 300);
    new.custom_logo_url := nullif(btrim(coalesce(new.custom_logo_url, '')), '');
    if new.custom_logo_url is distinct from old.custom_logo_url and new.custom_logo_url is not null
       and position(('/storage/v1/object/public/station_logos/' || v_uid::text || '/') in new.custom_logo_url) = 0 then
      new.custom_logo_url := old.custom_logo_url;     -- only logos uploaded to their own folder
    end if;
    if new.price_pms is distinct from old.price_pms
       and (new.price_pms is null or new.price_pms <= 0 or new.price_pms > 100000) then
      new.price_pms := old.price_pms;                  -- blank / impossible price keeps the current one
    end if;
    if new.queue_status is distinct from old.queue_status
       and new.queue_status not in ('No Queue', 'Moderate', 'Heavy', 'No Fuel', 'Unknown') then
      new.queue_status := old.queue_status;
    end if;
    v_changed := new.price_pms is distinct from old.price_pms or new.queue_status is distinct from old.queue_status;
    if v_changed then
      new.updated_by_role := 'Owner';
      new.verified        := true;
      new.last_updated    := v_now;
    else
      new.updated_by_role := old.updated_by_role;
      new.verified        := old.verified;
      new.last_updated    := old.last_updated;
    end if;
    return new;
  end if;

  -- Community member: no direct edits (use submit_price)
  new.name            := old.name;
  new.address         := old.address;
  new.custom_logo_url := old.custom_logo_url;
  new.price_pms       := old.price_pms;
  new.queue_status    := old.queue_status;
  new.last_updated    := old.last_updated;
  new.updated_by_role := old.updated_by_role;
  new.verified        := old.verified;
  return new;
end $$;

drop trigger if exists stations_guard on public.stations;
create trigger stations_guard
  before insert or update on public.stations
  for each row execute function public.stations_guard();

-- submit_price() writes price_reports itself, so it switches off the old submission log
create or replace function public.stations_log_submission()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(current_setting('qozob.skip_submission_log', true), '') = 'on' then return null; end if;
  if auth.uid() is null or new.price_pms is null then return null; end if;
  if tg_op = 'UPDATE' and new.price_pms is not distinct from old.price_pms
     and new.queue_status is not distinct from old.queue_status
     and new.last_updated is not distinct from old.last_updated then
    return null;
  end if;
  insert into public.pending_price_submissions (station_id, user_id, price)
  values (new.station_id::text, auth.uid(), new.price_pms);
  return null;
end $$;

-- -------------------------------------------------------------------------------------
-- 5. PRICE SUBMISSION WITH DISTANCE CHECK + REVIEW QUEUE
-- -------------------------------------------------------------------------------------
alter table public.price_reports add column if not exists queue_status text;
alter table public.price_reports add column if not exists ref_median   numeric;
alter table public.price_reports add column if not exists applied      boolean;      -- null = before 20261014 (was live at once)
alter table public.price_reports add column if not exists applied_at   timestamptz;
alter table public.price_reports add column if not exists applied_note text;
alter table public.price_reports add column if not exists station_name text;
create index if not exists price_reports_not_live_idx on public.price_reports (created_at) where status = 'held' and applied is false;

create or replace function public._fmt_distance(p_m double precision)
returns text language sql immutable set search_path = '' as $$
  select case when p_m is null then 'an unknown distance'
              when p_m >= 1000 then rtrim(rtrim(to_char(p_m / 1000.0, 'FM999990.0'), '0'), '.') || ' km'
              else round(p_m)::text || ' m' end;
$$;

create or replace function public._try_ts(p text)
returns timestamptz language plpgsql stable set search_path = '' as $$
begin
  if p is null or p !~ '^\d{4}-\d{2}-\d{2}' then return null; end if;
  return p::timestamptz;
exception when others then
  return null;
end $$;

create or replace function public.submit_price(
  p_station_id  text,
  p_price       numeric,
  p_queue       text             default null,
  p_lat         double precision default null,
  p_lng         double precision default null,
  p_accuracy    double precision default null,
  p_name        text             default null,
  p_address     text             default null,
  p_station_lat double precision default null,
  p_station_lng double precision default null
)
returns json language plpgsql security definer set search_path = '' as $$
declare
  v_uid      uuid := auth.uid();
  cfg        public.reward_settings%rowtype;
  st         record;
  prev       record;
  v_today    date := public._lagos_today();
  v_now      text := to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  v_price    numeric := round(p_price, 2);
  v_queue    text := case when p_queue in ('No Queue', 'Moderate', 'Heavy', 'No Fuel') then p_queue end;
  v_role     text;
  v_reasons  text[] := '{}';
  v_hold     boolean := false;
  v_noreward boolean := false;
  v_dist     double precision;
  v_median   double precision;
  v_n        integer;
  v_coins    integer := 0;
  v_status   text;
  v_id       bigint;
  v_hours    double precision;
  v_d2       double precision;
  v_lga      text;
  v_live     boolean;
begin
  if v_uid is null then raise exception 'Please sign in to update prices.' using errcode = '42501', hint = 'auth'; end if;
  if coalesce(btrim(p_station_id), '') = '' then raise exception 'Station not found.' using hint = 'station_not_found'; end if;
  if v_price is null or v_price <= 0 then raise exception 'Enter a valid price per litre.' using hint = 'invalid_price'; end if;

  -- First price for a station that is not saved yet (it came straight from Google)
  if p_station_lat between -90 and 90 and p_station_lng between -180 and 180 then
    insert into public.stations (station_id, name, address, lat, lng, price_pms, queue_status, verified,
                                 updated_by_role, pump_accuracy, accuracy_votes, last_updated)
    values (p_station_id, left(coalesce(nullif(btrim(p_name), ''), 'Unknown Station'), 120), left(nullif(btrim(p_address), ''), 300),
            p_station_lat, p_station_lng, null, 'Unknown', false, 'System', 0, 0, 'Never')
    on conflict (station_id) do nothing;
  end if;

  select s.station_id, s.name, s.lat, s.lng, s.lga_id, s.manager_id, s.queue_status
    into st from public.stations s where s.station_id = p_station_id for update;
  if not found then raise exception 'Station not found. Please refresh the map and try again.' using hint = 'station_not_found'; end if;

  select * into cfg from public.reward_settings where id;

  -- Station owner / Qozob staff: live straight away, no distance limit
  if st.manager_id = v_uid or public.admin_can('stations') then
    if v_price > 100000 then raise exception 'That price looks wrong. Please check it.' using hint = 'invalid_price'; end if;
    v_role := case when st.manager_id = v_uid then 'Owner' else 'Qozob rep' end;
    perform set_config('qozob.skip_submission_log', 'on', true);
    update public.stations
       set price_pms = v_price, queue_status = coalesce(v_queue, queue_status), last_updated = v_now,
           updated_by_role = v_role, verified = true
     where station_id = p_station_id;
    perform set_config('qozob.skip_submission_log', 'off', true);
    return json_build_object('status', 'live', 'report_status', null, 'coins', 0, 'reasons', '{}'::text[],
                             'price', v_price, 'queue_status', coalesce(v_queue, st.queue_status),
                             'last_updated', v_now, 'updated_by_role', v_role, 'verified', true);
  end if;

  -- Community member: must be at the station
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'We need your location to accept a price update. Turn on location for Qozob and try again.'
      using hint = 'no_location';
  end if;
  if st.lat is null or st.lng is null then
    raise exception 'This station''s location is not known yet, so we cannot check you are there. Please try again later.'
      using hint = 'station_location_unknown';
  end if;
  v_dist := public._haversine_m(p_lat, p_lng, st.lat, st.lng);
  if v_dist > cfg.max_distance_m then
    raise exception 'You are about % from this station. To keep prices accurate, updates are only accepted within % of the station. If you own or manage this station, claim it to update prices from anywhere.',
      public._fmt_distance(v_dist), public._fmt_distance(cfg.max_distance_m)
      using hint = 'too_far';
  end if;
  if p_accuracy is not null and p_accuracy > greatest(cfg.max_distance_m, 200) then
    raise exception 'Your location is not precise enough right now (about % accuracy). Move to an open area or wait a few seconds, then try again.',
      public._fmt_distance(p_accuracy)
      using hint = 'weak_gps';
  end if;
  if exists (select 1 from public.price_reports r
              where r.user_id = v_uid and r.station_id = p_station_id and r.created_at > now() - interval '5 minutes') then
    raise exception 'You just updated this station. Please wait a few minutes before sending another price.' using hint = 'too_soon';
  end if;
  if v_price < cfg.price_min / 3 or v_price > cfg.price_max * 3 then
    raise exception '₦% does not look like a price per litre. Please check the amount.', to_char(v_price, 'FM999,999,990') using hint = 'invalid_price';
  end if;

  -- Who is reporting?
  if public.reward_is_excluded(v_uid) then v_noreward := true; v_reasons := array_append(v_reasons, 'not_eligible'); end if;
  if not cfg.program_active then v_noreward := true; v_reasons := array_append(v_reasons, 'programme_paused'); end if;
  if exists (select 1 from public.reward_participants p where p.user_id = v_uid and p.status = 'suspended') then
    v_hold := true; v_reasons := array_append(v_reasons, 'reporter_suspended');
  end if;

  -- Outside the allowed price range → review
  if v_price < cfg.price_min or v_price > cfg.price_max then
    v_hold := true; v_reasons := array_append(v_reasons, 'price_out_of_range');
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

  -- Spamming? (still goes live, just no coins)
  if exists (select 1 from public.price_reports r
              where r.user_id = v_uid and r.station_id = p_station_id and r.status in ('accepted', 'held')
                and r.created_at > now() - make_interval(hours => cfg.cooldown_hours)) then
    v_noreward := true; v_reasons := array_append(v_reasons, 'cooldown');
  end if;
  if (select count(*) from public.price_reports r
       where r.user_id = v_uid and r.lagos_day = v_today and r.status in ('accepted', 'held')) >= cfg.daily_cap then
    v_noreward := true; v_reasons := array_append(v_reasons, 'daily_cap');
  end if;

  -- Far from the local average? → review
  v_n := 0;
  if st.lga_id is not null then
    select percentile_cont(0.5) within group (order by r.price), count(*) into v_median, v_n
      from public.price_reports r
     where r.lga_id = st.lga_id and r.status = 'accepted' and r.user_id <> v_uid
       and r.created_at > now() - interval '7 days';
  end if;
  if coalesce(v_n, 0) < 5 then
    select percentile_cont(0.5) within group (order by s.price_pms), count(*) into v_median, v_n
      from public.stations s
     where s.station_id <> p_station_id
       and s.lat between st.lat - 0.09 and st.lat + 0.09
       and s.lng between st.lng - 0.09 and st.lng + 0.09
       and s.price_pms between cfg.price_min and cfg.price_max;
  end if;
  if coalesce(v_n, 0) >= 3 and v_median > 0 then
    if abs(v_price - v_median) / v_median * 100 > cfg.outlier_percent then
      v_hold := true; v_reasons := array_append(v_reasons, 'price_outlier');
    end if;
  else
    v_median := null;
  end if;

  -- Coins (reserved while held; paid when an admin approves)
  if not v_noreward then
    v_coins := cfg.coins_per_update;
    if not exists (select 1 from public.price_reports r
                    where r.station_id = p_station_id and r.status in ('accepted', 'held')
                      and r.created_at > now() - interval '24 hours') then
      v_coins := v_coins + cfg.coins_fresh_bonus;
      v_reasons := array_append(v_reasons, 'fresh_bonus');
    end if;
  end if;
  v_status := case when v_hold then 'held' when v_noreward then 'no_reward' else 'accepted' end;
  v_live := not v_hold;

  if v_live then
    perform set_config('qozob.skip_submission_log', 'on', true);
    update public.stations
       set price_pms = v_price, queue_status = coalesce(v_queue, queue_status), last_updated = v_now,
           updated_by_role = 'User', verified = false
     where station_id = p_station_id;
    perform set_config('qozob.skip_submission_log', 'off', true);
  end if;

  insert into public.price_reports (user_id, station_id, lga_id, price, reporter_lat, reporter_lng, gps_accuracy_m,
                                    distance_m, status, coins, reasons, lagos_day, queue_status, ref_median,
                                    applied, applied_at, station_name)
  values (v_uid, p_station_id, st.lga_id, v_price, p_lat, p_lng, p_accuracy, round(v_dist)::integer,
          v_status, v_coins, v_reasons, v_today, v_queue, round(v_median::numeric, 2),
          v_live, case when v_live then now() end, st.name)
  returning id into v_id;

  select l.name || ', ' || l.state into v_lga from public.lgas l where l.id = st.lga_id;
  return json_build_object('id', v_id, 'status', case when v_live then 'live' else 'held' end,
                           'report_status', v_status, 'coins', v_coins, 'reasons', v_reasons,
                           'distance_m', round(v_dist), 'lga', v_lga, 'price', v_price,
                           'queue_status', coalesce(v_queue, st.queue_status),
                           'last_updated', case when v_live then v_now end,
                           'updated_by_role', 'User', 'verified', false);
end $$;

-- Approve (publish) or reject a held price
drop function if exists public.admin_review_report(bigint, boolean, text);
create function public.admin_review_report(p_id bigint, p_approve boolean, p_note text default null)
returns json language plpgsql security definer set search_path = '' as $$
declare
  r           public.price_reports%rowtype;
  v_cur       text;
  v_found     boolean;
  v_published boolean := false;
  v_status    text;
begin
  if not (public.admin_can('prices') or public.admin_can('rewards')) then
    raise exception 'Not authorised: your admin account does not have access to price reviews.' using errcode = '42501';
  end if;
  select * into r from public.price_reports where id = p_id for update;
  if not found or r.status <> 'held' then raise exception 'This report is not waiting for review.'; end if;

  if p_approve then
    if r.applied is false then
      select s.last_updated into v_cur from public.stations s where s.station_id = r.station_id for update;
      v_found := found;
      -- Publish with the ORIGINAL time, unless a newer price is already on the map
      if v_found and coalesce(public._try_ts(v_cur) <= r.created_at, true) then
        perform set_config('qozob.skip_submission_log', 'on', true);
        update public.stations
           set price_pms = r.price, queue_status = coalesce(r.queue_status, queue_status),
               last_updated = to_char(r.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
               updated_by_role = 'User', verified = false
         where station_id = r.station_id;
        perform set_config('qozob.skip_submission_log', 'off', true);
        v_published := true;
      end if;
    end if;
    v_status := case when r.coins > 0 then 'accepted' else 'no_reward' end;
    update public.price_reports
       set status = v_status,
           applied = case when r.applied is false then v_published else r.applied end,
           applied_at = case when v_published then now() else applied_at end,
           applied_note = case when r.applied is false and not v_published
                               then 'Approved, but a newer price was already on the map' else applied_note end,
           reviewed_by = auth.uid(), reviewed_at = now(), review_note = p_note
     where id = p_id;
  else
    v_status := 'rejected';
    update public.price_reports
       set status = 'rejected', coins = 0, reviewed_by = auth.uid(), reviewed_at = now(), review_note = p_note
     where id = p_id;
    insert into public.reward_participants as p (user_id, strikes) values (r.user_id, 1)
    on conflict (user_id) do update set strikes = p.strikes + 1, updated_at = now();
    update public.reward_participants set status = 'suspended', review_note = 'Suspended after 3 rejected price reports.'
     where user_id = r.user_id and strikes >= 3 and status <> 'suspended';
  end if;

  insert into public.reward_audit_log (action, target_user, details)
  values (case when p_approve then 'report_approved' else 'report_rejected' end, r.user_id,
          json_build_object('report_id', p_id, 'note', p_note, 'published', v_published)::jsonb);
  return json_build_object('status', v_status, 'published', v_published, 'station_id', r.station_id, 'price', r.price,
                           'already_live', r.applied is null);
end $$;

-- -------------------------------------------------------------------------------------
-- 6. REPORTING FUNCTIONS FOR THE ADMIN PANEL
-- -------------------------------------------------------------------------------------
create or replace function public.admin_price_review_queue()
returns table (id bigint, created_at timestamptz, user_id uuid, email text, display_name text, strikes integer,
               station_id text, station_name text, station_lat double precision, station_lng double precision,
               lga text, state text, price numeric, current_price numeric, current_updated text, ref_median numeric,
               queue_status text, distance_m integer, gps_accuracy_m double precision, coins integer, reasons text[],
               applied boolean)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if not (public.admin_can('prices') or public.admin_can('rewards')) then
    raise exception 'Not authorised: your admin account does not have access to price reviews.' using errcode = '42501';
  end if;
  return query
  select r.id, r.created_at, r.user_id, u.email::text, public._reward_display_name(r.user_id), coalesce(p.strikes, 0),
         r.station_id, coalesce(s.name, r.station_name), s.lat, s.lng, l.name, l.state, r.price, s.price_pms, s.last_updated,
         r.ref_median, r.queue_status, r.distance_m, r.gps_accuracy_m, r.coins, r.reasons, r.applied
    from public.price_reports r
    left join public.stations s on s.station_id = r.station_id
    left join public.lgas l on l.id = r.lga_id
    left join auth.users u on u.id = r.user_id
    left join public.reward_participants p on p.user_id = r.user_id
   where r.status = 'held'
   order by (r.applied is false) desc, r.created_at asc
   limit 1000;
end $$;

create or replace function public.admin_report_rows(p_from date default null, p_to date default null,
                                                    p_status text default null, p_lga_id integer default null)
returns table (id bigint, created_at timestamptz, lagos_day date, status text, live_on_map text, coins integer, price numeric,
               queue_status text, ref_median numeric, station_id text, station_name text, lga text, state text,
               user_id uuid, email text, display_name text, distance_m integer, gps_accuracy_m double precision,
               reasons text, reviewed_at timestamptz, reviewer_email text, review_note text)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if not (public.admin_can('prices') or public.admin_can('rewards')) then
    raise exception 'Not authorised: your admin account does not have access to price reports.' using errcode = '42501';
  end if;
  return query
  select r.id, r.created_at, r.lagos_day, r.status,
         case when r.applied is null then 'Yes (before review rules)' when r.applied then 'Yes' else 'No' end,
         r.coins, r.price, r.queue_status, r.ref_median, r.station_id, coalesce(s.name, r.station_name), l.name, l.state,
         r.user_id, u.email::text, public._reward_display_name(r.user_id), r.distance_m, r.gps_accuracy_m,
         array_to_string(r.reasons, ', '), r.reviewed_at, rv.email::text, r.review_note
    from public.price_reports r
    left join public.stations s on s.station_id = r.station_id
    left join public.lgas l on l.id = r.lga_id
    left join auth.users u on u.id = r.user_id
    left join auth.users rv on rv.id = r.reviewed_by
   where (p_from is null or r.lagos_day >= p_from)
     and (p_to is null or r.lagos_day <= p_to)
     and (p_status is null or r.status = p_status)
     and (p_lga_id is null or r.lga_id = p_lga_id)
   order by r.created_at desc
   limit 50000;
end $$;

create or replace function public.admin_reward_contributors(p_from date, p_to date)
returns table (user_id uuid, email text, display_name text, legal_name text, participant_status text, verified boolean,
               phone_ok boolean, bank_on_file boolean, payout_preference text, excluded boolean,
               reports bigint, accepted bigint, held bigint, rejected bigint, no_reward bigint,
               coins bigint, coins_held bigint, stations bigint, active_days bigint, lgas text, last_report_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if not public.admin_can('rewards') then
    raise exception 'Not authorised: your admin account does not have access to rewards.' using errcode = '42501';
  end if;
  return query
  select r.user_id, u.email::text, public._reward_display_name(r.user_id), p.legal_name, coalesce(p.status, 'incomplete'),
         public._reward_verified(r.user_id), public._reward_phone_ok(r.user_id),
         exists (select 1 from public.payout_accounts a where a.user_id = r.user_id),
         coalesce(p.payout_preference, 'cash'), public.reward_is_excluded(r.user_id),
         count(*)::bigint,
         count(*) filter (where r.status = 'accepted')::bigint,
         count(*) filter (where r.status = 'held')::bigint,
         count(*) filter (where r.status = 'rejected')::bigint,
         count(*) filter (where r.status = 'no_reward')::bigint,
         coalesce(sum(r.coins) filter (where r.status = 'accepted'), 0)::bigint,
         coalesce(sum(r.coins) filter (where r.status = 'held'), 0)::bigint,
         count(distinct r.station_id) filter (where r.status = 'accepted')::bigint,
         count(distinct r.lagos_day) filter (where r.status = 'accepted')::bigint,
         string_agg(distinct l.name || ' (' || l.state || ')', '; '),
         max(r.created_at)
    from public.price_reports r
    join auth.users u on u.id = r.user_id
    left join public.reward_participants p on p.user_id = r.user_id
    left join public.lgas l on l.id = r.lga_id
   where r.lagos_day between p_from and p_to
   group by r.user_id, u.email, p.legal_name, p.status, p.payout_preference
   order by 16 desc, 11 desc;
end $$;

create or replace function public.admin_reward_lga_summary(p_from date, p_to date)
returns table (lga_id integer, lga text, state text, updates bigint, all_reports bigint, stations bigint, contributors bigint,
               coins bigint, held bigint, quorum_met boolean, in_scope boolean, leader_name text, leader_email text, leader_coins bigint)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare cfg public.reward_settings%rowtype;
begin
  if not public.admin_can('rewards') then
    raise exception 'Not authorised: your admin account does not have access to rewards.' using errcode = '42501';
  end if;
  select * into cfg from public.reward_settings where id;
  return query
  with agg as (
    select r.lga_id,
           count(*) filter (where r.status = 'accepted') as updates,
           count(*) as all_reports,
           count(distinct r.station_id) filter (where r.status = 'accepted') as stations,
           count(distinct r.user_id) filter (where r.status = 'accepted') as contributors,
           coalesce(sum(r.coins) filter (where r.status = 'accepted'), 0) as coins,
           count(*) filter (where r.status = 'held') as held
      from public.price_reports r
     where r.lagos_day between p_from and p_to and r.lga_id is not null
     group by r.lga_id
  ), ranked as (
    select distinct on (x.lga_id) x.lga_id, x.user_id, x.coins
      from (select r.lga_id, r.user_id, sum(r.coins) as coins, count(distinct r.station_id) as st, max(r.created_at) as last_at
              from public.price_reports r
             where r.status = 'accepted' and r.lagos_day between p_from and p_to and r.lga_id is not null
               and not public.reward_is_excluded(r.user_id)
             group by r.lga_id, r.user_id) x
     order by x.lga_id, x.coins desc, x.st desc, x.last_at asc
  )
  select a.lga_id, l.name, l.state, a.updates::bigint, a.all_reports::bigint, a.stations::bigint, a.contributors::bigint,
         a.coins::bigint, a.held::bigint,
         (a.updates >= cfg.min_lga_updates_quorum and a.stations >= cfg.min_lga_stations_quorum
          and a.contributors >= cfg.min_lga_participants_quorum),
         (cfg.active_payout_scope = 'all' or a.lga_id = any (coalesce(cfg.active_lga_ids, '{}'::integer[]))),
         public._reward_display_name(k.user_id), u.email::text, k.coins::bigint
    from agg a
    left join public.lgas l on l.id = a.lga_id
    left join ranked k on k.lga_id = a.lga_id
    left join auth.users u on u.id = k.user_id
   order by a.coins desc, a.updates desc;
end $$;

-- Every station with its LGA, owner and report activity (Stations tab + Excel export).
-- Read in pages of 1,000 by the admin panel (.range()), so it is ordered by station_id.
create or replace function public.admin_station_directory()
returns table (station_id text, name text, address text, lat double precision, lng double precision,
               lga_id integer, lga text, state text, price_pms numeric, queue_status text, verified boolean,
               updated_by_role text, last_updated text, claim_status text, manager_id uuid, manager_email text,
               manager_name text, custom_logo_url text, pump_accuracy numeric, accuracy_votes integer,
               reports_30d bigint, held_reports bigint, last_report_at timestamptz, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if not public.admin_can('stations') then
    raise exception 'Not authorised: your admin account does not have access to stations.' using errcode = '42501';
  end if;
  return query
  select s.station_id::text, s.name::text, s.address::text, s.lat::double precision, s.lng::double precision,
         s.lga_id, l.name, l.state, s.price_pms::numeric, s.queue_status::text, coalesce(s.verified, false)::boolean,
         s.updated_by_role::text, s.last_updated::text, s.claim_status::text, s.manager_id, m.email::text,
         nullif(btrim(concat_ws(' ', m.raw_user_meta_data ->> 'first_name', m.raw_user_meta_data ->> 'last_name')), ''),
         s.custom_logo_url::text, s.pump_accuracy::numeric, s.accuracy_votes::integer,
         coalesce(pr.reports_30d, 0)::bigint, coalesce(pr.held, 0)::bigint, pr.last_at,
         public._try_ts(to_jsonb(s) ->> 'created_at')
    from public.stations s
    left join public.lgas l on l.id = s.lga_id
    left join auth.users m on m.id = s.manager_id
    left join (select r.station_id::text as sid,
                      count(*) filter (where r.created_at > now() - interval '30 days') as reports_30d,
                      count(*) filter (where r.status = 'held') as held,
                      max(r.created_at) as last_at
                 from public.price_reports r group by r.station_id) pr on pr.sid = s.station_id::text
   order by s.station_id;
end $$;

-- -------------------------------------------------------------------------------------
-- 7. REWARDS: cash by default, personal choice, safe vouchers, period closing
-- -------------------------------------------------------------------------------------
alter table public.reward_participants alter column payout_preference set default 'cash';
alter table public.reward_participants add column if not exists payout_preference_set_at timestamptz;
-- Nobody has actually chosen a voucher yet (there was no way to), so everyone starts on cash
update public.reward_participants set payout_preference = 'cash'
 where payout_preference = 'voucher' and payout_preference_set_at is null;

alter table public.reward_winners add column if not exists voucher_redeemed_at timestamptz;
alter table public.reward_winners add column if not exists voucher_request_id  uuid;

create or replace function public.set_payout_preference(p_pref text)
returns json language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Please sign in.' using errcode = '42501'; end if;
  if p_pref not in ('cash', 'voucher') then raise exception 'Choose cash or voucher.'; end if;
  if public.reward_is_excluded(v_uid) then raise exception 'This account is not eligible for rewards.'; end if;
  insert into public.reward_participants as p (user_id, payout_preference, payout_preference_set_at, updated_at)
  values (v_uid, p_pref, now(), now())
  on conflict (user_id) do update
     set payout_preference = excluded.payout_preference, payout_preference_set_at = now(), updated_at = now();
  insert into public.reward_audit_log (action, target_user, details)
  values ('payout_preference', v_uid, jsonb_build_object('preference', p_pref));
  return json_build_object('preference', p_pref);
end $$;

create or replace function public.my_payout_preference()
returns json language sql stable security definer set search_path = '' as $$
  select json_build_object(
    'preference', coalesce((select p.payout_preference from public.reward_participants p where p.user_id = auth.uid()), 'cash'),
    'set_at', (select p.payout_preference_set_at from public.reward_participants p where p.user_id = auth.uid()),
    'monthly_prize_ngn', s.monthly_prize_ngn,
    'voucher_bonus_pct', s.voucher_bonus_pct,
    'voucher_value_ngn', round(s.monthly_prize_ngn * (1.0 + s.voucher_bonus_pct / 100.0)))
  from public.reward_settings s where s.id;
$$;

-- Show voucher details in "My rewards" wins
do $$
declare v_def text;
begin
  v_def := pg_get_functiondef('public.my_reward_summary()'::regprocedure);
  if position('''voucher_code''' in v_def) = 0 and position('''paid_at'', w.paid_at)' in v_def) > 0 then
    v_def := replace(v_def, '''paid_at'', w.paid_at)',
      '''paid_at'', w.paid_at, ''payout_type'', w.payout_type, ''voucher_code'', w.voucher_code, ''voucher_value_ngn'', w.voucher_value_ngn, ''voucher_redeemed_at'', w.voucher_redeemed_at)');
    execute v_def;
  end if;
end $$;

create or replace function public.check_voucher(p_code text)
returns json language plpgsql stable security definer set search_path = '' as $$
declare w public.reward_winners%rowtype;
begin
  if auth.uid() is null then raise exception 'Please sign in.' using errcode = '42501'; end if;
  select * into w from public.reward_winners
   where upper(voucher_code) = upper(btrim(p_code)) and user_id = auth.uid() and payout_type = 'voucher'
   limit 1;
  if not found then return json_build_object('valid', false, 'message', 'This voucher code is not linked to your account.'); end if;
  if w.status = 'forfeited' then return json_build_object('valid', false, 'message', 'This voucher is no longer valid.'); end if;
  if w.voucher_redeemed_at is not null then return json_build_object('valid', false, 'message', 'This voucher has already been used.'); end if;
  return json_build_object('valid', true, 'value_ngn', w.voucher_value_ngn, 'status', w.status,
                           'message', 'Valid voucher worth ₦' || to_char(w.voucher_value_ngn, 'FM999,999,999') || '. Our team will apply it when they confirm your request.');
end $$;

create or replace function public.admin_redeem_voucher(p_request_id uuid, p_code text)
returns json language plpgsql security definer set search_path = '' as $$
declare
  sr     public.service_requests%rowtype;
  w      public.reward_winners%rowtype;
  v_code text := upper(btrim(coalesce(p_code, '')));
begin
  if not public.admin_can('services') then
    raise exception 'Not authorised: your admin account does not have access to auto services.' using errcode = '42501';
  end if;
  select * into sr from public.service_requests where id = p_request_id for update;
  if not found then raise exception 'Service request not found.'; end if;
  select * into w from public.reward_winners where upper(voucher_code) = v_code and payout_type = 'voucher' for update;
  if not found then raise exception 'Voucher code not found.'; end if;
  if w.status = 'forfeited' then raise exception 'This voucher was forfeited and cannot be used.'; end if;
  if w.voucher_redeemed_at is not null then
    raise exception 'This voucher was already used on %.', to_char(w.voucher_redeemed_at at time zone 'Africa/Lagos', 'DD Mon YYYY HH24:MI');
  end if;
  if w.status <> 'approved' and w.status <> 'paid' then
    raise exception 'This prize has not been approved yet. Approve the winner in Rewards → Payouts first.';
  end if;
  if sr.user_id is null or sr.user_id is distinct from w.user_id then
    raise exception 'This voucher belongs to a different Qozob account. Ask the customer to submit the request while signed in to the account that won.';
  end if;

  update public.reward_winners
     set voucher_redeemed_at = now(), voucher_request_id = sr.id,
         status = 'paid', paid_at = coalesce(paid_at, now()),
         payment_reference = coalesce(payment_reference, 'VOUCHER ' || sr.id::text)
   where id = w.id;
  update public.service_requests
     set voucher_code = v_code, payment_status = 'voucher_used',
         admin_notes = concat_ws(E'\n', admin_notes,
           'Voucher ' || v_code || ' (₦' || to_char(w.voucher_value_ngn, 'FM999,999,999') || ') redeemed ' ||
           to_char(now() at time zone 'Africa/Lagos', 'DD Mon YYYY HH24:MI'))
   where id = sr.id;
  insert into public.reward_audit_log (action, target_user, details)
  values ('voucher_redeemed', w.user_id, jsonb_build_object('winner_id', w.id, 'request_id', sr.id, 'value_ngn', w.voucher_value_ngn));
  return json_build_object('value_ngn', w.voucher_value_ngn, 'winner_id', w.id);
end $$;

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
  v_held     integer;
  v_lga_updates       bigint;
  v_lga_stations      bigint;
  v_lga_participants  bigint;
  v_pref              text;
  v_vouch_code        text;
  v_vouch_val         integer;
  v_gross             integer;
  v_net               integer;
  v_act_wht           integer;
begin
  if not public.admin_can('rewards') then
    raise exception 'Not authorised: your admin account does not have access to this section.' using errcode = '42501';
  end if;
  select * into cfg from public.reward_settings where id;

  if p_kind = 'monthly' then
    v_start := date_trunc('month', p_start)::date;
    v_end := (v_start + interval '1 month - 1 day')::date;
    v_pay_by := (v_start + interval '1 month')::date + 6;
    v_prize := cfg.monthly_prize_ngn;
  elsif p_kind = 'annual' then
    v_start := date_trunc('year', p_start)::date;
    v_end := (v_start + interval '1 year - 1 day')::date;
    v_pay_by := (v_start + interval '1 year')::date + 30;
    v_prize := cfg.annual_prize_ngn;
    if coalesce(v_prize, 0) <= 0 then raise exception 'Set the annual grand prize amount in Rewards → Settings first.'; end if;
  else
    raise exception 'Unknown period type.';
  end if;
  if v_end >= public._lagos_today() then raise exception 'This period has not ended yet (it ends %).', v_end; end if;
  if exists (select 1 from public.reward_periods p where p.kind = p_kind and p.period_start = v_start) then
    raise exception 'This period has already been closed.';
  end if;
  select count(*) into v_held from public.price_reports r where r.status = 'held' and r.lagos_day between v_start and v_end;
  if v_held > 0 then
    raise exception '% price update(s) from this period are still waiting for review. Approve or reject them in Admin → Price reviews first, so nobody loses coins.', v_held;
  end if;

  insert into public.reward_periods (kind, period_start, period_end, prize_ngn, wht_percent, pay_by)
  values (p_kind, v_start, v_end, v_prize, cfg.wht_percent, v_pay_by) returning id into v_period;
  v_wht := round(v_prize * cfg.wht_percent / 100.0);

  for c in select * from public._reward_candidates(p_kind, v_start, v_end) loop
    v_lga_updates := null; v_lga_stations := null; v_lga_participants := null;
    if p_kind = 'annual' then
      if v_count >= 1 then exit; end if;
    else
      if c.lga_id = any (v_lgas) or c.user_id = any (v_users) then continue; end if;
      if cfg.active_payout_scope = 'selected_lgas' and not (c.lga_id = any (coalesce(cfg.active_lga_ids, '{}'::integer[]))) then
        continue;
      end if;
      select count(*)::bigint, count(distinct r.station_id)::bigint, count(distinct r.user_id)::bigint
        into v_lga_updates, v_lga_stations, v_lga_participants
        from public.price_reports r
       where r.status = 'accepted' and r.lga_id = c.lga_id and r.lagos_day between v_start and v_end;
      if v_lga_updates < cfg.min_lga_updates_quorum
         or v_lga_stations < cfg.min_lga_stations_quorum
         or v_lga_participants < cfg.min_lga_participants_quorum then
        continue;
      end if;
    end if;

    v_pref := null;
    select p.payout_preference into v_pref from public.reward_participants p where p.user_id = c.user_id;
    v_pref := coalesce(v_pref, 'cash');

    if v_pref = 'voucher' then
      v_vouch_val := round(v_prize * (1.0 + (cfg.voucher_bonus_pct / 100.0)))::integer;
      v_vouch_code := 'QZ-VCH-' || upper(substr(md5(random()::text || c.user_id::text || clock_timestamp()::text), 1, 8));
      v_gross := v_vouch_val; v_act_wht := 0; v_net := v_vouch_val;
    else
      v_vouch_val := null; v_vouch_code := null;
      v_gross := v_prize; v_act_wht := v_wht; v_net := v_prize - v_wht;
    end if;

    insert into public.reward_winners (period_id, lga_id, lga_name, state, user_id, coins, active_days, stations,
                                       gross_ngn, wht_ngn, net_ngn, payout_type, voucher_code, voucher_value_ngn, quorum_metrics)
    select v_period, c.lga_id, l.name, l.state, c.user_id, c.coins, c.active_days, c.stations,
           v_gross, v_act_wht, v_net, v_pref, v_vouch_code, v_vouch_val,
           jsonb_build_object('lga_updates', coalesce(v_lga_updates, 0), 'lga_stations', coalesce(v_lga_stations, 0),
                              'lga_participants', coalesce(v_lga_participants, 0))
      from (select 1) one left join public.lgas l on l.id = c.lga_id;

    v_lgas := v_lgas || c.lga_id;
    v_users := v_users || c.user_id;
    v_count := v_count + 1;
  end loop;

  update public.price_reports set reporter_lat = null, reporter_lng = null
   where reporter_lat is not null and created_at < now() - interval '13 months';

  insert into public.reward_audit_log (action, details)
  values ('period_closed', jsonb_build_object('kind', p_kind, 'start', v_start, 'winners', v_count, 'scope', cfg.active_payout_scope));
  return json_build_object('period_id', v_period, 'winners', v_count, 'pay_by', v_pay_by);
end $$;

-- -------------------------------------------------------------------------------------
-- 8. SERVICE REQUESTS: the public can only submit NEW, UNPAID requests
-- -------------------------------------------------------------------------------------
drop policy if exists "qozob_service_requests_insert" on public.service_requests;
create policy "qozob_service_requests_insert" on public.service_requests
  for insert to anon, authenticated
  with check (
    (user_id is null or user_id = auth.uid())
    and status = 'pending' and payment_status = 'unpaid'
    and quoted_price is null and paid_price is null and admin_notes is null and assigned_to is null
  );

-- -------------------------------------------------------------------------------------
-- 8b. SAVED STATIONS: each member's own bookmarks (synced across devices)
-- -------------------------------------------------------------------------------------
create table if not exists public.saved_stations (
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  station_id text not null check (char_length(station_id) between 1 and 300),
  name       text check (name is null or char_length(name) <= 200),
  address    text check (address is null or char_length(address) <= 400),
  lat        double precision check (lat is null or lat between -90 and 90),
  lng        double precision check (lng is null or lng between -180 and 180),
  created_at timestamptz not null default now(),
  primary key (user_id, station_id)
);
alter table public.saved_stations enable row level security;

drop policy if exists "qozob_saved_select_own" on public.saved_stations;
create policy "qozob_saved_select_own" on public.saved_stations
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "qozob_saved_insert_own" on public.saved_stations;
create policy "qozob_saved_insert_own" on public.saved_stations
  for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "qozob_saved_delete_own" on public.saved_stations;
create policy "qozob_saved_delete_own" on public.saved_stations
  for delete to authenticated using (user_id = (select auth.uid()));

revoke all on public.saved_stations from anon;
grant select, insert, delete on public.saved_stations to authenticated;

create or replace function public.saved_stations_cap()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.saved_stations where user_id = new.user_id) >= 100 then
    raise exception 'You can save up to 100 stations. Remove one to save another.';
  end if;
  return new;
end $$;
revoke all on function public.saved_stations_cap() from public, anon, authenticated;
drop trigger if exists saved_stations_cap on public.saved_stations;
create trigger saved_stations_cap before insert on public.saved_stations
  for each row execute function public.saved_stations_cap();

-- -------------------------------------------------------------------------------------
-- 9. PERMISSIONS
-- -------------------------------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array['public._fmt_distance(double precision)', 'public._try_ts(text)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;

  -- needed by table policies that anonymous visitors also pass through (e.g. adverts)
  foreach f in array array['public.admin_can(text)', 'public.admin_is_master()', 'public.my_admin_access()'] loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to anon, authenticated', f);
  end loop;

  foreach f in array array[
    'public.admin_list_admins()', 'public.admin_find_user(text)',
    'public.admin_grant_access(text, boolean, text[], text)', 'public.admin_revoke_access(uuid)',
    'public.submit_price(text, numeric, text, double precision, double precision, double precision, text, text, double precision, double precision)',
    'public.admin_review_report(bigint, boolean, text)', 'public.admin_price_review_queue()',
    'public.admin_report_rows(date, date, text, integer)', 'public.admin_reward_contributors(date, date)',
    'public.admin_reward_lga_summary(date, date)', 'public.admin_station_directory()',
    'public.set_payout_preference(text)', 'public.my_payout_preference()',
    'public.check_voucher(text)', 'public.admin_redeem_voucher(uuid, text)', 'public.admin_close_period(text, date)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

commit;

-- -------------------------------------------------------------------------------------
-- DONE. Summary:
-- -------------------------------------------------------------------------------------
select 'Master admins' as item, string_agg(u.email, ', ') as value
  from public.admin_permissions p join auth.users u on u.id = p.user_id where p.is_master
union all
select 'Stations may have no price yet', (select is_nullable from information_schema.columns
                                           where table_schema = 'public' and table_name = 'stations' and column_name = 'price_pms')
union all
select 'Price updates waiting for review', (select count(*)::text from public.price_reports where status = 'held')
union all
select 'Policies still using plain is_admin()', (select count(*)::text from pg_policies
                                                  where coalesce(qual, '') || coalesce(with_check, '') ~ 'is_admin\(\)');
