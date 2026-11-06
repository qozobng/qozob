-- =====================================================================================
--  QOZOB 20261105: MULTI-REGION + MULTI-CURRENCY
--  Run ONCE in Supabase → SQL Editor → New query → paste everything → Run.
--  • Safe to re-run.  • All-or-nothing (one transaction).
--  • Requires 20261008 … 20261014.
--
--  What this does
--   1. Regions (countries): currency, extra currencies owners may use, price sanity range,
--      open/closed for price updates, name of local areas ("LGA", "District"…).
--      Nigeria + common African countries are set up already.
--   2. Every station gets a country and a currency (from Google, its LGA, its address).
--      Owners can switch only to the extra currencies allowed for their country.
--   3. Prices are only compared with prices in the SAME currency (moderation, averages).
--      Countries that are not open yet: stations show, but prices can't be added.
--   4. Reward programmes per country (currency, prize, quorum, vouchers). The current
--      ₦10,000 programme becomes the Nigeria programme; other countries start with none.
--      Countries without imported area maps get one national winner per month.
--   5. Admin country scope: a master admin can limit an admin to certain countries.
--      Enforced in the database (price reviews, claims, manager requests, stations, rewards,
--      adverts). Mailing needs all countries; auto services need Nigeria.
--   6. Adverts can target a country (or worldwide).
-- =====================================================================================

begin;

-- -------------------------------------------------------------------------------------
-- 0. PRE-FLIGHT
-- -------------------------------------------------------------------------------------
do $$
begin
  if to_regprocedure('public.admin_can(text)') is null or to_regclass('public.admin_permissions') is null then
    raise exception 'Admin access levels not found. Run 20261014_admin_access_price_moderation.sql first. Nothing was changed.';
  end if;
  if to_regprocedure('public.submit_price(text, numeric, text, double precision, double precision, double precision, text, text, double precision, double precision)') is null then
    raise exception 'submit_price() not found. Run 20261014_admin_access_price_moderation.sql first. Nothing was changed.';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'reward_settings' and column_name = 'voucher_bonus_pct') then
    raise exception 'Reward quorum/voucher settings not found. Run 20261013_monetization_and_services.sql first. Nothing was changed.';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'ads' and column_name = 'target_scope') then
    raise exception 'Advert targeting not found. Run 20261012_ad_targeting.sql first. Nothing was changed.';
  end if;
end $$;

-- -------------------------------------------------------------------------------------
-- 1. REGIONS (one row per country)
-- -------------------------------------------------------------------------------------
create table if not exists public.regions (
  country_code     text primary key check (country_code ~ '^[A-Z]{2}$'),
  name             text not null check (char_length(name) between 2 and 80),
  default_currency text not null check (default_currency ~ '^[A-Z]{3}$'),
  currencies       text[] not null default '{}'      -- extra currencies owners may switch to
                   check (array_to_string(currencies, ',') ~ '^([A-Z]{3}(,[A-Z]{3})*)?$'),
  aliases          text[] not null default '{}',     -- other spellings (lower case) to recognise addresses
  price_min        numeric check (price_min is null or price_min > 0),   -- per litre, default currency
  price_max        numeric,
  is_open          boolean not null default false,   -- false = stations show, prices can't be added
  area_label       text not null default 'District' check (char_length(area_label) between 2 and 40),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  updated_by       uuid,
  constraint regions_price_range check (price_max is null or price_min is null or price_max > price_min)
);
alter table public.regions enable row level security;
drop policy if exists "qozob_regions_read" on public.regions;
create policy "qozob_regions_read" on public.regions for select to anon, authenticated using (true);
-- (no write policies: changes go through admin_upsert_region)
grant select on public.regions to anon, authenticated;

insert into public.regions (country_code, name, default_currency, currencies, aliases, is_open, area_label, price_min, price_max)
values
  ('NG', 'Nigeria', 'NGN', '{}', '{}', true, 'LGA',
     (select s.price_min from public.reward_settings s where s.id), (select s.price_max from public.reward_settings s where s.id)),
  ('GH', 'Ghana',                            'GHS', '{}',      '{}',                                                   true, 'District', null, null),
  ('BJ', 'Benin',                            'XOF', '{}',      '{"bénin"}',                                            true, 'Commune',  null, null),
  ('TG', 'Togo',                             'XOF', '{}',      '{}',                                                   true, 'Prefecture', null, null),
  ('CI', 'Côte d''Ivoire',                   'XOF', '{}',      '{"cote d''ivoire","ivory coast","côte d’ivoire"}',     true, 'Department', null, null),
  ('SN', 'Senegal',                          'XOF', '{}',      '{"sénégal"}',                                          true, 'Department', null, null),
  ('BF', 'Burkina Faso',                     'XOF', '{}',      '{}',                                                   true, 'Province', null, null),
  ('ML', 'Mali',                             'XOF', '{}',      '{}',                                                   true, 'Cercle',   null, null),
  ('NE', 'Niger',                            'XOF', '{}',      '{}',                                                   true, 'Department', null, null),
  ('CM', 'Cameroon',                         'XAF', '{}',      '{"cameroun"}',                                         true, 'Department', null, null),
  ('TD', 'Chad',                             'XAF', '{}',      '{"tchad"}',                                            true, 'Department', null, null),
  ('GA', 'Gabon',                            'XAF', '{}',      '{}',                                                   true, 'Department', null, null),
  ('CG', 'Republic of the Congo',            'XAF', '{}',      '{"congo","congo-brazzaville"}',                        true, 'District', null, null),
  ('CD', 'Democratic Republic of the Congo', 'CDF', '{USD}',   '{"dr congo","drc","congo (drc)","congo-kinshasa"}',    true, 'Territory', null, null),
  ('LR', 'Liberia',                          'LRD', '{USD}',   '{}',                                                   true, 'District', null, null),
  ('SL', 'Sierra Leone',                     'SLE', '{}',      '{}',                                                   true, 'District', null, null),
  ('GM', 'The Gambia',                       'GMD', '{}',      '{"gambia"}',                                           true, 'District', null, null),
  ('KE', 'Kenya',                            'KES', '{}',      '{}',                                                   true, 'County',   null, null),
  ('UG', 'Uganda',                           'UGX', '{}',      '{}',                                                   true, 'District', null, null),
  ('TZ', 'Tanzania',                         'TZS', '{}',      '{}',                                                   true, 'District', null, null),
  ('RW', 'Rwanda',                           'RWF', '{}',      '{}',                                                   true, 'District', null, null),
  ('ET', 'Ethiopia',                         'ETB', '{}',      '{}',                                                   true, 'Zone',     null, null),
  ('ZA', 'South Africa',                     'ZAR', '{}',      '{}',                                                   true, 'Municipality', null, null),
  ('ZM', 'Zambia',                           'ZMW', '{}',      '{}',                                                   true, 'District', null, null),
  ('ZW', 'Zimbabwe',                         'USD', '{ZWG}',   '{}',                                                   true, 'District', null, null),
  ('MZ', 'Mozambique',                       'MZN', '{}',      '{"moçambique"}',                                       true, 'District', null, null),
  ('MW', 'Malawi',                           'MWK', '{}',      '{}',                                                   true, 'District', null, null),
  ('BW', 'Botswana',                         'BWP', '{}',      '{}',                                                   true, 'District', null, null),
  ('NA', 'Namibia',                          'NAD', '{}',      '{}',                                                   true, 'Constituency', null, null),
  ('AO', 'Angola',                           'AOA', '{}',      '{}',                                                   true, 'Municipality', null, null),
  ('EG', 'Egypt',                            'EGP', '{}',      '{}',                                                   true, 'Markaz',   null, null),
  ('MA', 'Morocco',                          'MAD', '{}',      '{"maroc"}',                                            true, 'Province', null, null),
  ('DZ', 'Algeria',                          'DZD', '{}',      '{"algérie"}',                                          true, 'Province', null, null),
  ('TN', 'Tunisia',                          'TND', '{}',      '{"tunisie"}',                                          true, 'Delegation', null, null)
on conflict (country_code) do nothing;

-- -------------------------------------------------------------------------------------
-- 2. COLUMNS: areas (LGA table is now "areas of any country"), stations, price reports
-- -------------------------------------------------------------------------------------
alter table public.lgas add column if not exists country_code text not null default 'NG';
create index if not exists lgas_country_idx on public.lgas (country_code);

alter table public.stations add column if not exists country_code text;
alter table public.stations add column if not exists currency     text;
create index if not exists stations_country_idx on public.stations (country_code);

alter table public.price_reports add column if not exists country_code text;
alter table public.price_reports add column if not exists currency     text;
create index if not exists price_reports_country_day_idx on public.price_reports (country_code, lagos_day);

alter table public.payout_accounts add column if not exists country_code text;
alter table public.admin_permissions add column if not exists countries text[] not null default '{}';

-- -------------------------------------------------------------------------------------
-- 3. HELPERS
-- -------------------------------------------------------------------------------------

-- Country from the last part of an address ("…, Lagos, Nigeria" → NG)
create or replace function public._country_from_address(p_address text)
returns text language sql stable set search_path = '' as $$
  with t as (
    select lower(btrim(regexp_replace(regexp_replace(coalesce(p_address, ''), '^.*,', ''), '[0-9]+', '', 'g'))) as last_part
  )
  select r.country_code
    from public.regions r, t
   where t.last_part <> ''
     and (t.last_part = lower(r.name) or t.last_part = any (r.aliases) or upper(t.last_part) = r.country_code)
   limit 1;
$$;

-- Best guess of a station's country: its area (LGA) → its address → inside Nigeria's box
create or replace function public._infer_country(p_lat double precision, p_lng double precision,
                                                 p_lga_id integer, p_address text)
returns text language plpgsql stable set search_path = '' as $$
declare v text;
begin
  if p_lga_id is not null then
    select l.country_code into v from public.lgas l where l.id = p_lga_id;
  end if;
  if v is null then v := public._country_from_address(p_address); end if;
  if v is null and p_lat between 4.0 and 14.0 and p_lng between 2.5 and 15.0 then v := 'NG'; end if;
  return v;
end $$;

-- Highest believable price per litre for a country/currency (blocks typos like an extra zero)
create or replace function public._price_cap(p_country text, p_currency text)
returns numeric language sql stable set search_path = '' as $$
  select coalesce((select r.price_max * 5 from public.regions r
                    where r.country_code = p_country and r.default_currency = p_currency and r.price_max is not null),
                  10000000);
$$;

-- A person's country: profile → latest price report → Nigeria (where every account started)
create or replace function public._user_country(p_user uuid)
returns text language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select r.country_code
       from auth.users u
       join public.regions r
         on upper(btrim(u.raw_user_meta_data ->> 'country')) = r.country_code
         or lower(btrim(u.raw_user_meta_data ->> 'country')) = lower(r.name)
         or lower(btrim(u.raw_user_meta_data ->> 'country')) = any (r.aliases)
      where u.id = p_user
      limit 1),
    (select pr.country_code from public.price_reports pr
      where pr.user_id = p_user and pr.country_code is not null
      order by pr.created_at desc limit 1),
    'NG');
$$;

-- Admin country scope. NULL = every country (master admins, or no countries chosen).
create or replace function public._admin_scope()
returns text[] language sql stable security definer set search_path = '' as $$
  select case
           when not public.is_admin() then '{}'::text[]
           when public.admin_is_master() then null
           when not exists (select 1 from public.admin_permissions p where p.user_id = auth.uid()) then '{}'::text[]
           else (select nullif(p.countries, '{}'::text[]) from public.admin_permissions p where p.user_id = auth.uid())
         end;
$$;

create or replace function public.admin_country_ok(p_country text)
returns boolean language sql stable security definer set search_path = '' as $$
  with s as (select public._admin_scope() as sc)
  select case when s.sc is null then public.is_admin()
              else coalesce(p_country = any (s.sc), false) end
    from s;
$$;

-- Country of a claim (the station's country, or worked out from the claim's position)
create or replace function public._claim_country(p_station_id text, p_lat double precision, p_lng double precision)
returns text language sql stable security definer set search_path = '' as $$
  select coalesce((select s.country_code from public.stations s where s.station_id::text = p_station_id limit 1),
                  public._infer_country(p_lat, p_lng, null, null));
$$;

-- -------------------------------------------------------------------------------------
-- 4. STATIONS: country + currency
-- -------------------------------------------------------------------------------------

-- Backfill existing stations (they were all collected while Qozob was Nigeria-only)
update public.stations s
   set country_code = public._infer_country(s.lat, s.lng, s.lga_id, s.address)
 where s.country_code is null;
update public.stations s
   set currency = r.default_currency
  from public.regions r
 where r.country_code = s.country_code and s.currency is null;

-- Old price reports: same country/currency as their station (Nigeria if unknown)
update public.price_reports r
   set country_code = coalesce(s.country_code, 'NG'), currency = coalesce(s.currency, 'NGN')
  from public.stations s
 where s.station_id::text = r.station_id::text and r.country_code is null;
update public.price_reports set country_code = 'NG', currency = 'NGN' where country_code is null;

-- Every report carries its station's country + currency, whichever code path wrote it
create or replace function public.price_reports_set_region()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.country_code is null or new.currency is null then
    select coalesce(new.country_code, s.country_code), coalesce(new.currency, s.currency)
      into new.country_code, new.currency
      from public.stations s where s.station_id::text = new.station_id::text;
    new.country_code := coalesce(new.country_code, 'NG');
    new.currency     := coalesce(new.currency, (select g.default_currency from public.regions g where g.country_code = new.country_code), 'NGN');
  end if;
  return new;
end $$;
drop trigger if exists price_reports_set_region on public.price_reports;
create trigger price_reports_set_region before insert on public.price_reports
  for each row execute function public.price_reports_set_region();

-- Decides country + currency on every insert/update (runs after stations_guard and
-- stations_set_lga: triggers fire in name order).
--   • Google stations arrive with a country code; otherwise it is worked out.
--   • Only admins (for their countries) change a station's country, or set any currency.
--   • The owner may switch between the currencies allowed for the country.
create or replace function public.stations_set_region()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_trusted boolean := current_user in ('postgres', 'supabase_admin', 'service_role');
  v_admin   boolean := false;
  v_owner   boolean := false;
  v_old_cc  text;
  v_old_cur text;
  r         public.regions%rowtype;
begin
  if tg_op = 'UPDATE' then
    v_old_cc  := old.country_code;
    v_old_cur := old.currency;
    v_owner   := auth.uid() is not null and old.manager_id = auth.uid();
  end if;
  if not v_trusted then
    v_admin := public.admin_can('stations') and public.admin_country_ok(coalesce(v_old_cc, new.country_code));
  end if;

  -- Country
  new.country_code := nullif(upper(btrim(coalesce(new.country_code, ''))), '');
  if new.country_code is not null and new.country_code !~ '^[A-Z]{2}$' then new.country_code := null; end if;
  if tg_op = 'UPDATE' and not (v_trusted or v_admin) then
    new.country_code := v_old_cc;
  end if;
  if tg_op = 'UPDATE' and v_admin and new.country_code is distinct from v_old_cc
     and not public.admin_country_ok(new.country_code) then
    new.country_code := v_old_cc;                      -- can't move a station outside your countries
  end if;
  if new.country_code is null then
    new.country_code := public._infer_country(new.lat, new.lng, new.lga_id, new.address);
  end if;

  -- Currency
  select * into r from public.regions g where g.country_code = new.country_code;
  new.currency := nullif(upper(btrim(coalesce(new.currency, ''))), '');
  if new.currency is not null and new.currency !~ '^[A-Z]{3}$' then new.currency := null; end if;
  if tg_op = 'UPDATE' and new.country_code is distinct from v_old_cc and new.currency is not distinct from v_old_cur then
    new.currency := null;                              -- moved country: use the new country's currency
  end if;

  if v_trusted or v_admin then
    null;                                              -- any valid currency
  elsif v_owner then
    if new.currency is distinct from v_old_cur
       and not coalesce(new.currency = any (array[r.default_currency] || coalesce(r.currencies, '{}'::text[])), false) then
      new.currency := v_old_cur;
    end if;
  else
    new.currency := v_old_cur;                         -- public inserts start empty (NULL)
  end if;

  if new.currency is null and r.country_code is not null then
    new.currency := r.default_currency;
  end if;
  return new;
end $$;

drop trigger if exists stations_set_region on public.stations;
create trigger stations_set_region
  before insert or update on public.stations
  for each row execute function public.stations_set_region();

-- Guard (same rules as 20261014) + admins only for their countries + currency-aware price cap
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

  v_admin := public.admin_can('stations')
             and public.admin_country_ok(case when tg_op = 'UPDATE' then old.country_code else new.country_code end);

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
       and (new.price_pms is null or new.price_pms <= 0
            or new.price_pms > public._price_cap(old.country_code, coalesce(new.currency, old.currency))) then
      new.price_pms := old.price_pms;                  -- blank / impossible price keeps the current one
    end if;
    if new.queue_status is distinct from old.queue_status
       and new.queue_status not in ('No Queue', 'Moderate', 'Heavy', 'No Fuel', 'Unknown') then
      new.queue_status := old.queue_status;
    end if;
    v_changed := new.price_pms is distinct from old.price_pms or new.queue_status is distinct from old.queue_status
                 or new.currency is distinct from old.currency;
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

-- -------------------------------------------------------------------------------------
-- 5. ADMIN COUNTRY SCOPE
-- -------------------------------------------------------------------------------------
create or replace function public.my_admin_access()
returns json language sql stable security definer set search_path = '' as $$
  select json_build_object(
    'is_admin',  public.is_admin(),
    'is_master', public.admin_is_master(),
    'modules',   case
                   when not public.is_admin() then '{}'::text[]
                   when public.admin_is_master() then array['claims', 'requests', 'stations', 'prices', 'ads', 'mailing', 'rewards', 'services']
                   else coalesce((select p.modules from public.admin_permissions p where p.user_id = auth.uid()), '{}'::text[])
                 end,
    'countries', public._admin_scope());          -- null = every country
$$;

drop function if exists public.admin_list_admins();
create function public.admin_list_admins()
returns table (user_id uuid, email text, full_name text, is_master boolean, modules text[], countries text[], note text,
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
         case when p.is_master then '{}'::text[] else coalesce(p.countries, '{}'::text[]) end,
         p.note, p.user_id is not null, g.email::text, p.updated_at, u.last_sign_in_at, u.id = auth.uid()
    from auth.users u
    left join public.admin_permissions p on p.user_id = u.id
    left join auth.users g on g.id = p.granted_by
   where lower(coalesce(u.raw_app_meta_data ->> 'role', '')) = 'admin'
   order by coalesce(p.is_master, false) desc, u.email;
end $$;

-- p_countries: '{}' = every country; NULL = keep the admin's current countries
drop function if exists public.admin_grant_access(text, boolean, text[], text);
create or replace function public.admin_grant_access(p_email text, p_is_master boolean, p_modules text[],
                                                     p_note text default null, p_countries text[] default null)
returns json language plpgsql security definer set search_path = '' as $$
declare
  v_all        text[] := array['claims', 'requests', 'stations', 'prices', 'ads', 'mailing', 'rewards', 'services'];
  v_uid        uuid;
  v_email      text;
  v_was_admin  boolean;
  v_master     boolean := coalesce(p_is_master, false);
  v_mods       text[];
  v_countries  text[];
  v_bad        text;
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

  -- Countries
  if p_countries is null then
    select p.countries into v_countries from public.admin_permissions p where p.user_id = v_uid;
    v_countries := coalesce(v_countries, '{}'::text[]);
  else
    select coalesce(array_agg(distinct upper(btrim(c)) order by upper(btrim(c))), '{}'::text[]) into v_countries
      from unnest(p_countries) as c where btrim(coalesce(c, '')) <> '';
  end if;
  select string_agg(c, ', ') into v_bad from unnest(v_countries) as c
   where not exists (select 1 from public.regions r where r.country_code = c);
  if v_bad is not null then raise exception 'Unknown country code(s): %. Add the country in Admin → Regions first.', v_bad; end if;
  if v_master then v_countries := '{}'::text[]; end if;
  if cardinality(v_countries) > 0 and 'mailing' = any (v_mods) then
    raise exception 'Mailing sends to subscribers in every country, so it needs access to all countries. Remove Mailing or the country limit.';
  end if;
  if cardinality(v_countries) > 0 and 'services' = any (v_mods) and not ('NG' = any (v_countries)) then
    raise exception 'Auto services only run in Nigeria for now. Add Nigeria to this admin''s countries or remove Auto services.';
  end if;

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

  insert into public.admin_permissions as p (user_id, is_master, modules, countries, note, granted_by, updated_at)
  values (v_uid, v_master, v_mods, v_countries, nullif(btrim(coalesce(p_note, '')), ''), auth.uid(), now())
  on conflict (user_id) do update
     set is_master = excluded.is_master, modules = excluded.modules, countries = excluded.countries,
         note = excluded.note, granted_by = excluded.granted_by, updated_at = now();

  insert into public.admin_audit_log (action, target_user, details)
  values (case when v_was_admin then 'admin_access_changed' else 'admin_granted' end, v_uid,
          jsonb_build_object('email', v_email, 'is_master', v_master, 'modules', v_mods, 'countries', v_countries, 'note', p_note));

  return json_build_object('user_id', v_uid, 'email', v_email, 'is_master', v_master, 'modules', v_mods,
                           'countries', v_countries, 'new_admin', not v_was_admin);
end $$;

-- -------------------------------------------------------------------------------------
-- 6. REWARD PROGRAMMES (one per country; Nigeria = the existing programme)
--    Anti-fraud rules (distance, cooldown, daily cap, coins, outlier %, speed) stay global
--    in reward_settings. Money and winner rules live here, in the programme's currency.
-- -------------------------------------------------------------------------------------
create table if not exists public.reward_programs (
  country_code                 text primary key references public.regions (country_code) on update cascade on delete restrict,
  currency                     text not null check (currency ~ '^[A-Z]{3}$'),
  program_active               boolean not null default false,
  monthly_prize                integer not null default 0 check (monthly_prize >= 0),
  annual_prize                 integer check (annual_prize is null or annual_prize >= 0),
  wht_percent                  numeric(5,2) not null default 0 check (wht_percent between 0 and 50),
  voucher_enabled              boolean not null default false,       -- service vouchers (Nigeria only for now)
  voucher_bonus_pct            numeric(5,2) not null default 0 check (voucher_bonus_pct between 0 and 200),
  min_active_days              integer not null default 8  check (min_active_days between 1 and 31),
  annual_min_active_days       integer not null default 60 check (annual_min_active_days between 1 and 366),
  min_area_updates_quorum      integer not null default 30 check (min_area_updates_quorum >= 1),
  min_area_stations_quorum     integer not null default 3  check (min_area_stations_quorum >= 1),
  min_area_participants_quorum integer not null default 2  check (min_area_participants_quorum >= 1),
  active_payout_scope          text not null default 'all' check (active_payout_scope in ('all', 'selected_areas')),
  active_area_ids              integer[],
  note                         text check (note is null or char_length(note) <= 500),
  created_at                   timestamptz not null default now(),
  updated_at                   timestamptz not null default now(),
  updated_by                   uuid
);
alter table public.reward_programs enable row level security;
drop policy if exists "qozob_reward_programs_read" on public.reward_programs;
create policy "qozob_reward_programs_read" on public.reward_programs for select to anon, authenticated using (true);
grant select on public.reward_programs to anon, authenticated;

insert into public.reward_programs (country_code, currency, program_active, monthly_prize, annual_prize, wht_percent,
                                    voucher_enabled, voucher_bonus_pct, min_active_days, annual_min_active_days,
                                    min_area_updates_quorum, min_area_stations_quorum, min_area_participants_quorum,
                                    active_payout_scope, active_area_ids)
select 'NG', 'NGN', s.program_active, s.monthly_prize_ngn, s.annual_prize_ngn, s.wht_percent,
       true, s.voucher_bonus_pct, s.min_active_days, s.annual_min_active_days,
       s.min_lga_updates_quorum, s.min_lga_stations_quorum, s.min_lga_participants_quorum,
       case s.active_payout_scope when 'selected_lgas' then 'selected_areas' else 'all' end, s.active_lga_ids
  from public.reward_settings s where s.id
on conflict (country_code) do nothing;

-- Keep the old Nigeria columns in reward_settings in step (older screens/functions read them)
create or replace function public.reward_programs_sync_ng()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if pg_trigger_depth() > 1 then return new; end if;   -- change came from reward_settings: don't bounce back
  if new.country_code = 'NG' then
    update public.reward_settings
       set program_active = new.program_active, monthly_prize_ngn = new.monthly_prize, annual_prize_ngn = new.annual_prize,
           wht_percent = new.wht_percent, voucher_bonus_pct = new.voucher_bonus_pct,
           min_active_days = new.min_active_days, annual_min_active_days = new.annual_min_active_days,
           min_lga_updates_quorum = new.min_area_updates_quorum, min_lga_stations_quorum = new.min_area_stations_quorum,
           min_lga_participants_quorum = new.min_area_participants_quorum,
           active_payout_scope = case new.active_payout_scope when 'selected_areas' then 'selected_lgas' else 'all' end,
           active_lga_ids = new.active_area_ids
     where id;
  end if;
  return new;
end $$;
drop trigger if exists reward_programs_sync_ng on public.reward_programs;
create trigger reward_programs_sync_ng after insert or update on public.reward_programs
  for each row execute function public.reward_programs_sync_ng();

-- …and the other way: Admin → Rewards → Settings still edits reward_settings, so its Nigeria
-- fields flow into the Nigeria programme (and its price range into the Nigeria region).
create or replace function public.reward_settings_sync_ng()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if pg_trigger_depth() > 1 then return new; end if;   -- change came from reward_programs: don't bounce back
  update public.reward_programs
     set program_active = new.program_active, monthly_prize = new.monthly_prize_ngn, annual_prize = new.annual_prize_ngn,
         wht_percent = new.wht_percent, voucher_bonus_pct = new.voucher_bonus_pct,
         min_active_days = new.min_active_days, annual_min_active_days = new.annual_min_active_days,
         min_area_updates_quorum = new.min_lga_updates_quorum, min_area_stations_quorum = new.min_lga_stations_quorum,
         min_area_participants_quorum = new.min_lga_participants_quorum,
         active_payout_scope = case new.active_payout_scope when 'selected_lgas' then 'selected_areas' else 'all' end,
         active_area_ids = new.active_lga_ids, updated_at = now(), updated_by = auth.uid()
   where country_code = 'NG';
  if new.price_min is distinct from old.price_min or new.price_max is distinct from old.price_max then
    update public.regions set price_min = new.price_min, price_max = new.price_max, updated_at = now(), updated_by = auth.uid()
     where country_code = 'NG';
  end if;
  return new;
end $$;
drop trigger if exists reward_settings_sync_ng on public.reward_settings;
create trigger reward_settings_sync_ng after update on public.reward_settings
  for each row execute function public.reward_settings_sync_ng();

-- Periods and winners belong to a country and are paid in its currency
alter table public.reward_periods add column if not exists country_code text not null default 'NG';
alter table public.reward_periods add column if not exists currency     text not null default 'NGN';
alter table public.reward_winners add column if not exists currency     text not null default 'NGN';
do $$
declare c text;
begin
  for c in select conname from pg_constraint
            where conrelid = 'public.reward_periods'::regclass and contype = 'u'
              and pg_get_constraintdef(oid) ilike '%(kind, period_start)%'
  loop
    execute format('alter table public.reward_periods drop constraint %I', c);
  end loop;
end $$;
create unique index if not exists reward_periods_kind_start_country on public.reward_periods (kind, period_start, country_code);

-- Global rules: only admins who cover every country may change them
drop policy if exists "qozob_reward_settings_admin" on public.reward_settings;
create policy "qozob_reward_settings_admin" on public.reward_settings for update to authenticated
  using ((select public.admin_can('rewards')) and (select public._admin_scope()) is null)
  with check ((select public.admin_can('rewards')) and (select public._admin_scope()) is null);

drop policy if exists "qozob_reward_periods_admin" on public.reward_periods;
create policy "qozob_reward_periods_admin" on public.reward_periods for select to authenticated
  using ((select public.admin_can('rewards')) and public.admin_country_ok(country_code));

drop policy if exists "qozob_reward_winners_read" on public.reward_winners;
create policy "qozob_reward_winners_read" on public.reward_winners for select to authenticated
  using (user_id = auth.uid()
         or ((select public.admin_can('rewards'))
             and public.admin_country_ok((select p.country_code from public.reward_periods p where p.id = period_id))));

-- -------------------------------------------------------------------------------------
-- 7. PRICE SUBMISSION (country open? same-currency checks, programme of that country)
-- -------------------------------------------------------------------------------------
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
  rg         public.regions%rowtype;
  pg         public.reward_programs%rowtype;
  st         record;
  prev       record;
  v_today    date := public._lagos_today();
  v_now      text := to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  v_price    numeric := round(p_price, 2);
  v_queue    text := case when p_queue in ('No Queue', 'Moderate', 'Heavy', 'No Fuel') then p_queue end;
  v_role     text;
  v_admin    boolean;
  v_range    boolean;
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

  select s.station_id, s.name, s.lat, s.lng, s.lga_id, s.manager_id, s.queue_status, s.country_code, s.currency
    into st from public.stations s where s.station_id = p_station_id for update;
  if not found then raise exception 'Station not found. Please refresh the map and try again.' using hint = 'station_not_found'; end if;

  select * into cfg from public.reward_settings where id;
  select * into rg from public.regions r where r.country_code = st.country_code;
  v_admin := public.admin_can('stations') and public.admin_country_ok(st.country_code);

  -- Is Qozob open in this country?
  if not v_admin and (rg.country_code is null or not rg.is_open) then
    raise exception '%', case when rg.country_code is null
                              then 'Qozob isn''t open in this country yet, so prices can''t be added here. We''re working on it!'
                              else 'Qozob isn''t open in ' || rg.name || ' yet, so prices can''t be added here. We''re working on it!' end
      using hint = 'region_closed';
  end if;
  if st.currency is null then
    raise exception 'This station has no currency yet. An admin needs to set its country first.' using hint = 'region_closed';
  end if;

  -- Station owner / Qozob staff: live straight away, no distance limit
  if st.manager_id = v_uid or v_admin then
    if v_price > public._price_cap(st.country_code, st.currency) then
      raise exception 'That price looks wrong. Please check it.' using hint = 'invalid_price';
    end if;
    v_role := case when st.manager_id = v_uid then 'Owner' else 'Qozob rep' end;
    perform set_config('qozob.skip_submission_log', 'on', true);
    update public.stations
       set price_pms = v_price, queue_status = coalesce(v_queue, queue_status), last_updated = v_now,
           updated_by_role = v_role, verified = true
     where station_id = p_station_id;
    perform set_config('qozob.skip_submission_log', 'off', true);
    return json_build_object('status', 'live', 'report_status', null, 'coins', 0, 'reasons', '{}'::text[],
                             'price', v_price, 'currency', st.currency, 'queue_status', coalesce(v_queue, st.queue_status),
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

  -- The country's price range applies to prices in its main currency
  v_range := rg.price_min is not null and rg.price_max is not null and st.currency = rg.default_currency;
  if (v_range and (v_price < rg.price_min / 3 or v_price > rg.price_max * 3))
     or v_price > public._price_cap(st.country_code, st.currency) then
    raise exception '% % does not look like a price per litre. Please check the amount.', st.currency,
      case when v_price = trunc(v_price) then to_char(v_price, 'FM999,999,999,990') else to_char(v_price, 'FM999,999,999,990.00') end
      using hint = 'invalid_price';
  end if;

  -- Who is reporting, and is there a reward programme here?
  if public.reward_is_excluded(v_uid) then v_noreward := true; v_reasons := array_append(v_reasons, 'not_eligible'); end if;
  select * into pg from public.reward_programs p where p.country_code = st.country_code;
  if not found then
    v_noreward := true; v_reasons := array_append(v_reasons, 'no_programme_region');
  elsif not pg.program_active then
    v_noreward := true; v_reasons := array_append(v_reasons, 'programme_paused');
  end if;
  if exists (select 1 from public.reward_participants p where p.user_id = v_uid and p.status = 'suspended') then
    v_hold := true; v_reasons := array_append(v_reasons, 'reporter_suspended');
  end if;

  -- Outside the allowed price range → review
  if v_range and (v_price < rg.price_min or v_price > rg.price_max) then
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

  -- Far from the local average (same currency only)? → review
  v_n := 0;
  if st.lga_id is not null then
    select percentile_cont(0.5) within group (order by r.price), count(*) into v_median, v_n
      from public.price_reports r
     where r.lga_id = st.lga_id and r.status = 'accepted' and r.user_id <> v_uid
       and r.currency = st.currency
       and r.created_at > now() - interval '7 days';
  end if;
  if coalesce(v_n, 0) < 5 then
    select percentile_cont(0.5) within group (order by s.price_pms), count(*) into v_median, v_n
      from public.stations s
     where s.station_id <> p_station_id
       and s.currency = st.currency
       and s.lat between st.lat - 0.09 and st.lat + 0.09
       and s.lng between st.lng - 0.09 and st.lng + 0.09
       and s.price_pms > 0
       and (not v_range or s.price_pms between rg.price_min and rg.price_max);
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
                                    applied, applied_at, station_name, country_code, currency)
  values (v_uid, p_station_id, st.lga_id, v_price, p_lat, p_lng, p_accuracy, round(v_dist)::integer,
          v_status, v_coins, v_reasons, v_today, v_queue, round(v_median::numeric, 2),
          v_live, case when v_live then now() end, st.name, st.country_code, st.currency)
  returning id into v_id;

  select l.name || ', ' || l.state into v_lga from public.lgas l where l.id = st.lga_id;
  return json_build_object('id', v_id, 'status', case when v_live then 'live' else 'held' end,
                           'report_status', v_status, 'coins', v_coins, 'reasons', v_reasons,
                           'distance_m', round(v_dist), 'lga', v_lga, 'price', v_price, 'currency', st.currency,
                           'queue_status', coalesce(v_queue, st.queue_status),
                           'last_updated', case when v_live then v_now end,
                           'updated_by_role', 'User', 'verified', false);
end $$;

-- Approve (publish) or reject a held price: same as 20261014 + country check
create or replace function public.admin_review_report(p_id bigint, p_approve boolean, p_note text default null)
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
  if not public.admin_country_ok(coalesce(r.country_code,
                                          (select s.country_code from public.stations s where s.station_id = r.station_id))) then
    raise exception 'Not authorised: this price is in a country your admin account does not cover.' using errcode = '42501';
  end if;

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

drop function if exists public.admin_price_review_queue();
create function public.admin_price_review_queue()
returns table (id bigint, created_at timestamptz, user_id uuid, email text, display_name text, strikes integer,
               station_id text, station_name text, station_lat double precision, station_lng double precision,
               lga text, state text, price numeric, current_price numeric, current_updated text, ref_median numeric,
               queue_status text, distance_m integer, gps_accuracy_m double precision, coins integer, reasons text[],
               applied boolean, country_code text, currency text)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare v_scope text[] := public._admin_scope();
begin
  if not (public.admin_can('prices') or public.admin_can('rewards')) then
    raise exception 'Not authorised: your admin account does not have access to price reviews.' using errcode = '42501';
  end if;
  return query
  select r.id, r.created_at, r.user_id, u.email::text, public._reward_display_name(r.user_id), coalesce(p.strikes, 0),
         r.station_id, coalesce(s.name, r.station_name), s.lat, s.lng, l.name, l.state, r.price, s.price_pms, s.last_updated,
         r.ref_median, r.queue_status, r.distance_m, r.gps_accuracy_m, r.coins, r.reasons, r.applied,
         coalesce(r.country_code, s.country_code), coalesce(r.currency, s.currency)
    from public.price_reports r
    left join public.stations s on s.station_id = r.station_id
    left join public.lgas l on l.id = r.lga_id
    left join auth.users u on u.id = r.user_id
    left join public.reward_participants p on p.user_id = r.user_id
   where r.status = 'held'
     and (v_scope is null or coalesce(r.country_code, s.country_code) = any (v_scope))
   order by (r.applied is false) desc, r.created_at asc
   limit 1000;
end $$;

drop function if exists public.admin_report_rows(date, date, text, integer);
create or replace function public.admin_report_rows(p_from date default null, p_to date default null,
                                         p_status text default null, p_lga_id integer default null,
                                         p_country text default null)
returns table (id bigint, created_at timestamptz, lagos_day date, status text, live_on_map text, coins integer, price numeric,
               currency text, country_code text,
               queue_status text, ref_median numeric, station_id text, station_name text, lga text, state text,
               user_id uuid, email text, display_name text, distance_m integer, gps_accuracy_m double precision,
               reasons text, reviewed_at timestamptz, reviewer_email text, review_note text)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare v_scope text[] := public._admin_scope();
begin
  if not (public.admin_can('prices') or public.admin_can('rewards')) then
    raise exception 'Not authorised: your admin account does not have access to price reports.' using errcode = '42501';
  end if;
  return query
  select r.id, r.created_at, r.lagos_day, r.status,
         case when r.applied is null then 'Yes (before review rules)' when r.applied then 'Yes' else 'No' end,
         r.coins, r.price, r.currency, r.country_code,
         r.queue_status, r.ref_median, r.station_id, coalesce(s.name, r.station_name), l.name, l.state,
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
     and (p_country is null or r.country_code = upper(p_country))
     and (v_scope is null or r.country_code = any (v_scope))
   order by r.created_at desc
   limit 50000;
end $$;

drop function if exists public.admin_station_directory();
create function public.admin_station_directory()
returns table (station_id text, name text, address text, lat double precision, lng double precision,
               country_code text, currency text,
               lga_id integer, lga text, state text, price_pms numeric, queue_status text, verified boolean,
               updated_by_role text, last_updated text, claim_status text, manager_id uuid, manager_email text,
               manager_name text, custom_logo_url text, pump_accuracy numeric, accuracy_votes integer,
               reports_30d bigint, held_reports bigint, last_report_at timestamptz, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare v_scope text[] := public._admin_scope();
begin
  if not public.admin_can('stations') then
    raise exception 'Not authorised: your admin account does not have access to stations.' using errcode = '42501';
  end if;
  return query
  select s.station_id::text, s.name::text, s.address::text, s.lat::double precision, s.lng::double precision,
         s.country_code, s.currency,
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
   where v_scope is null or s.country_code = any (v_scope)
   order by s.station_id;
end $$;

-- -------------------------------------------------------------------------------------
-- 8. CLAIMS + MANAGER REQUESTS: regional admins see their own countries
-- -------------------------------------------------------------------------------------
drop policy if exists "qozob_claims_select_own_or_admin" on public.station_claims;
create policy "qozob_claims_select_own_or_admin" on public.station_claims
  for select to authenticated
  using (user_id = auth.uid()
         or lower(official_email) = lower(auth.jwt() ->> 'email')
         or ((select public.admin_can('claims')) and public.admin_country_ok(public._claim_country(station_id::text, lat, lng))));

drop policy if exists "qozob_claims_admin_update" on public.station_claims;
create policy "qozob_claims_admin_update" on public.station_claims
  for update to authenticated
  using ((select public.admin_can('claims')) and public.admin_country_ok(public._claim_country(station_id::text, lat, lng)))
  with check ((select public.admin_can('claims')) and public.admin_country_ok(public._claim_country(station_id::text, lat, lng)));

create or replace function public.admin_review_claim(p_claim_id text, p_status text, p_notes text default null)
returns json language plpgsql security definer set search_path = '' as $$
declare
  c record;
begin
  if not public.admin_can('claims') then
    raise exception 'Not authorised: your admin account does not have access to this section.' using errcode = '42501';
  end if;
  if p_status not in ('Approved', 'Rejected') then raise exception 'Status must be Approved or Rejected.'; end if;

  select * into c from public.station_claims where id::text = p_claim_id for update;
  if not found then raise exception 'Claim not found.'; end if;
  if not public.admin_country_ok(public._claim_country(c.station_id::text, c.lat, c.lng)) then
    raise exception 'Not authorised: this station is in a country your admin account does not cover.' using errcode = '42501';
  end if;

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

drop policy if exists "qozob_role_requests_select" on public.role_requests;
create policy "qozob_role_requests_select" on public.role_requests
  for select to authenticated
  using (user_id = auth.uid()
         or ((select public.admin_can('requests')) and public.admin_country_ok(public._user_country(user_id))));

create or replace function public.admin_review_role_request(p_request_id bigint, p_status text, p_notes text default null)
returns json language plpgsql security definer set search_path = '' as $$
declare
  r record;
begin
  if not public.admin_can('requests') then
    raise exception 'Not authorised: your admin account does not have access to this section.' using errcode = '42501';
  end if;
  if p_status not in ('Approved', 'Rejected') then raise exception 'Status must be Approved or Rejected.'; end if;

  select * into r from public.role_requests where id = p_request_id for update;
  if not found then raise exception 'Request not found.'; end if;
  if not public.admin_country_ok(public._user_country(r.user_id)) then
    raise exception 'Not authorised: this person is in a country your admin account does not cover.' using errcode = '42501';
  end if;

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
-- 9. REWARD ENGINE PER COUNTRY
-- -------------------------------------------------------------------------------------
create or replace function public._reward_scores_c(p_start date, p_end date, p_country text)
returns table (user_id uuid, lga_id integer, coins bigint, stations bigint, reports bigint, last_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select r.user_id, r.lga_id, sum(r.coins)::bigint, count(distinct r.station_id)::bigint, count(*)::bigint, max(r.created_at)
    from public.price_reports r
   where r.status = 'accepted' and r.lagos_day between p_start and p_end
     and (p_country is null or r.country_code = p_country)
   group by r.user_id, r.lga_id;
$$;

create or replace function public._reward_active_days_c(p_start date, p_end date, p_country text)
returns table (user_id uuid, active_days bigint)
language sql stable security definer set search_path = '' as $$
  select r.user_id, count(distinct r.lagos_day)::bigint
    from public.price_reports r
   where r.status = 'accepted' and r.lagos_day between p_start and p_end
     and (p_country is null or r.country_code = p_country)
   group by r.user_id;
$$;

-- Ranked, qualified candidates for one country. Countries without imported area maps
-- compete nationally (lga_id = NULL = one national winner).
drop function if exists public._reward_candidates(text, date, date);
drop function if exists public._reward_candidates(text, date, date, text);
create function public._reward_candidates(p_kind text, p_start date, p_end date, p_country text)
returns table (user_id uuid, lga_id integer, coins bigint, stations bigint, active_days bigint, last_at timestamptz)
language sql stable security definer set search_path = '' as $$
  with pg as (select * from public.reward_programs where country_code = p_country),
  ar as (select exists (select 1 from public.lgas l where l.country_code = p_country) as has_areas),
  ad as (select * from public._reward_active_days_c(p_start, p_end, p_country)),
  sc as (
    select s.user_id,
           case when p_kind = 'monthly' and (select has_areas from ar) then s.lga_id end as lga_id,
           sum(s.coins)::bigint as coins, sum(s.stations)::bigint as stations, max(s.last_at) as last_at
      from public._reward_scores_c(p_start, p_end, p_country) s
     where p_kind = 'annual' or not (select has_areas from ar) or s.lga_id is not null
     group by 1, 2
  )
  select sc.user_id, sc.lga_id, sc.coins, sc.stations, ad.active_days, sc.last_at
    from sc join ad on ad.user_id = sc.user_id, pg
   where sc.coins > 0
     and ad.active_days >= case when p_kind = 'monthly' then pg.min_active_days else pg.annual_min_active_days end
     and public._reward_verified(sc.user_id)
     and not public.reward_is_excluded(sc.user_id)
   order by sc.coins desc, sc.stations desc, sc.last_at asc, sc.user_id;
$$;

-- Public leaderboard (names masked). p_lga_id = null → whole country. p_country = null → everywhere.
drop function if exists public.reward_leaderboard(date, date, integer, integer);
drop function if exists public.reward_leaderboard(date, date, integer, integer, text);
create function public.reward_leaderboard(p_start date, p_end date, p_lga_id integer default null,
                                          p_limit integer default 20, p_country text default 'NG')
returns table (rank bigint, display_name text, coins bigint, active_days bigint, stations bigint, verified boolean, is_me boolean)
language sql stable security definer set search_path = '' as $$
  with s as (
    select sc.user_id, sum(sc.coins)::bigint as coins, sum(sc.stations)::bigint as stations, max(sc.last_at) as last_at
      from public._reward_scores_c(p_start, least(p_end, p_start + 366), upper(p_country)) sc
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
    left join public._reward_active_days_c(p_start, least(p_end, p_start + 366), upper(p_country)) a on a.user_id = s.user_id
   order by 1
   limit least(greatest(coalesce(p_limit, 20), 1), 100);
$$;

create or replace function public.my_reward_summary()
returns json language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_cc  text;
  v_today date := public._lagos_today();
  v_ms date := date_trunc('month', v_today)::date;
  v_me date := (date_trunc('month', v_today) + interval '1 month - 1 day')::date;
  v_ys date := date_trunc('year', v_today)::date;
  v_ye date := (date_trunc('year', v_today) + interval '1 year - 1 day')::date;
begin
  if v_uid is null then return null; end if;
  v_cc := public._user_country(v_uid);
  return json_build_object(
    'month_start', v_ms, 'month_end', v_me, 'year_start', v_ys, 'year_end', v_ye,
    'country_code', v_cc,
    'program', (select json_build_object('country_code', p.country_code, 'currency', p.currency, 'active', p.program_active,
                                         'monthly_prize', p.monthly_prize, 'annual_prize', p.annual_prize,
                                         'voucher_enabled', p.voucher_enabled, 'voucher_bonus_pct', p.voucher_bonus_pct,
                                         'min_active_days', p.min_active_days, 'area_label', g.area_label, 'country_name', g.name)
                  from public.reward_programs p join public.regions g on g.country_code = p.country_code
                 where p.country_code = v_cc),
    'coins_month', (select coalesce(sum(r.coins), 0) from public.price_reports r where r.user_id = v_uid and r.status = 'accepted' and r.lagos_day between v_ms and v_me),
    'coins_year',  (select coalesce(sum(r.coins), 0) from public.price_reports r where r.user_id = v_uid and r.status = 'accepted' and r.lagos_day between v_ys and v_ye),
    'coins_held',  (select coalesce(sum(r.coins), 0) from public.price_reports r where r.user_id = v_uid and r.status = 'held'),
    'coins_total', (select coalesce(sum(r.coins), 0) from public.price_reports r where r.user_id = v_uid and r.status = 'accepted'),
    'active_days_month', (select count(distinct r.lagos_day) from public.price_reports r where r.user_id = v_uid and r.status = 'accepted' and r.lagos_day between v_ms and v_me),
    'active_days_year',  (select count(distinct r.lagos_day) from public.price_reports r where r.user_id = v_uid and r.status = 'accepted' and r.lagos_day between v_ys and v_ye),
    'reports_month', (select count(*) from public.price_reports r where r.user_id = v_uid and r.lagos_day between v_ms and v_me),
    'lgas', (
      select coalesce(json_agg(json_build_object('lga_id', x.lga_id, 'name', coalesce(l.name, g.name), 'state', l.state,
                                                 'country_code', x.country_code, 'coins', x.coins, 'rank', x.rnk)
                               order by x.coins desc), '[]'::json)
        from (select y.user_id, y.lga_id, y.country_code, y.coins,
                     row_number() over (partition by y.country_code, y.lga_id
                                        order by y.coins desc, y.stations desc, y.last_at asc, y.user_id) as rnk
                from (select r.user_id, r.lga_id, r.country_code, sum(r.coins)::bigint as coins,
                             count(distinct r.station_id) as stations, max(r.created_at) as last_at
                        from public.price_reports r
                       where r.status = 'accepted' and r.lagos_day between v_ms and v_me
                         and not public.reward_is_excluded(r.user_id)
                       group by r.user_id, r.lga_id, r.country_code) y) x
        left join public.lgas l on l.id = x.lga_id
        left join public.regions g on g.country_code = x.country_code
       where x.user_id = v_uid),
    'excluded', public.reward_is_excluded(v_uid),
    'participant', (select json_build_object('status', p.status, 'legal_name', p.legal_name, 'id_type', p.id_type, 'id_last4', p.id_last4,
                                             'review_note', p.review_note, 'strikes', p.strikes, 'submitted_at', p.submitted_at,
                                             'terms_accepted_at', p.terms_accepted_at, 'terms_version', p.terms_version)
                      from public.reward_participants p where p.user_id = v_uid),
    'phone_verified', public._reward_phone_ok(v_uid),
    'phone', (select u.phone from auth.users u where u.id = v_uid),
    'bank', (select json_build_object('bank_name', a.bank_name, 'account_name', a.account_name, 'last4', a.account_last4,
                                      'country_code', a.country_code)
               from public.payout_accounts a where a.user_id = v_uid),
    'verified', public._reward_verified(v_uid),
    'wins', (select coalesce(json_agg(json_build_object('kind', p.kind, 'period_start', p.period_start, 'lga', w.lga_name, 'state', w.state,
                                                        'country_code', p.country_code, 'currency', w.currency,
                                                        'gross_ngn', w.gross_ngn, 'net_ngn', w.net_ngn, 'status', w.status, 'paid_at', w.paid_at,
                                                        'payout_type', w.payout_type, 'voucher_code', w.voucher_code,
                                                        'voucher_value_ngn', w.voucher_value_ngn, 'voucher_redeemed_at', w.voucher_redeemed_at)
                                      order by p.period_start desc), '[]'::json)
               from public.reward_winners w join public.reward_periods p on p.id = w.period_id
              where w.user_id = v_uid and w.status <> 'forfeited')
  );
end $$;

-- Payout choice uses the programme of the person's country (vouchers only where enabled)
create or replace function public.my_payout_preference()
returns json language sql stable security definer set search_path = '' as $$
  select json_build_object(
    'preference', coalesce((select p.payout_preference from public.reward_participants p where p.user_id = auth.uid()), 'cash'),
    'set_at', (select p.payout_preference_set_at from public.reward_participants p where p.user_id = auth.uid()),
    'country_code', g.country_code,
    'currency', g.currency,
    'voucher_available', coalesce(g.voucher_enabled, false),
    'monthly_prize', g.monthly_prize,
    'monthly_prize_ngn', g.monthly_prize,
    'voucher_bonus_pct', g.voucher_bonus_pct,
    'voucher_value', round(g.monthly_prize * (1.0 + g.voucher_bonus_pct / 100.0)),
    'voucher_value_ngn', round(g.monthly_prize * (1.0 + g.voucher_bonus_pct / 100.0)))
  from (select 1) one
  left join public.reward_programs g on g.country_code = public._user_country(auth.uid());
$$;

drop function if exists public.admin_close_period(text, date);
create or replace function public.admin_close_period(p_kind text, p_start date, p_country text default 'NG')
returns json language plpgsql security definer set search_path = '' as $$
declare
  v_country   text := upper(btrim(coalesce(p_country, 'NG')));
  pg          public.reward_programs%rowtype;
  rg          public.regions%rowtype;
  v_start     date;
  v_end       date;
  v_pay_by    date;
  v_prize     integer;
  v_period    bigint;
  v_lgas      integer[] := '{}';
  v_users     uuid[] := '{}';
  v_national  boolean := false;
  c           record;
  v_count     integer := 0;
  v_wht       integer;
  v_held      integer;
  v_updates   bigint;
  v_stations  bigint;
  v_people    bigint;
  v_pref      text;
  v_vouch_code text;
  v_vouch_val  integer;
  v_gross     integer;
  v_net       integer;
  v_act_wht   integer;
  v_area_name text;
  v_area_state text;
begin
  if not public.admin_can('rewards') then
    raise exception 'Not authorised: your admin account does not have access to this section.' using errcode = '42501';
  end if;
  if not public.admin_country_ok(v_country) then
    raise exception 'Not authorised: your admin account does not cover this country.' using errcode = '42501';
  end if;
  select * into pg from public.reward_programs where country_code = v_country;
  if not found then raise exception 'There is no reward programme for this country. Set one up in Admin → Regions first.'; end if;
  select * into rg from public.regions where country_code = v_country;

  if p_kind = 'monthly' then
    v_start := date_trunc('month', p_start)::date;
    v_end := (v_start + interval '1 month - 1 day')::date;
    v_pay_by := (v_start + interval '1 month')::date + 6;
    v_prize := pg.monthly_prize;
    if coalesce(v_prize, 0) <= 0 then raise exception 'Set the monthly prize for % in Admin → Regions first.', rg.name; end if;
  elsif p_kind = 'annual' then
    v_start := date_trunc('year', p_start)::date;
    v_end := (v_start + interval '1 year - 1 day')::date;
    v_pay_by := (v_start + interval '1 year')::date + 30;
    v_prize := pg.annual_prize;
    if coalesce(v_prize, 0) <= 0 then raise exception 'Set the annual grand prize for % in Admin → Regions first.', rg.name; end if;
  else
    raise exception 'Unknown period type.';
  end if;
  if v_end >= public._lagos_today() then raise exception 'This period has not ended yet (it ends %).', v_end; end if;
  if exists (select 1 from public.reward_periods p where p.kind = p_kind and p.period_start = v_start and p.country_code = v_country) then
    raise exception 'This period has already been closed for %.', rg.name;
  end if;
  select count(*) into v_held from public.price_reports r
   where r.status = 'held' and r.lagos_day between v_start and v_end and r.country_code = v_country;
  if v_held > 0 then
    raise exception '% price update(s) from this period in % are still waiting for review. Approve or reject them in Admin → Price reviews first, so nobody loses coins.', v_held, rg.name;
  end if;

  insert into public.reward_periods (kind, period_start, period_end, prize_ngn, wht_percent, pay_by, country_code, currency)
  values (p_kind, v_start, v_end, v_prize, pg.wht_percent, v_pay_by, v_country, pg.currency) returning id into v_period;
  v_wht := round(v_prize * pg.wht_percent / 100.0);

  for c in select * from public._reward_candidates(p_kind, v_start, v_end, v_country) loop
    v_updates := null; v_stations := null; v_people := null;
    if p_kind = 'annual' then
      if v_count >= 1 then exit; end if;
    else
      if c.user_id = any (v_users) then continue; end if;
      if c.lga_id is null then
        if v_national then exit; end if;            -- national programme: one winner
      elsif c.lga_id = any (v_lgas) then
        continue;
      end if;
      if pg.active_payout_scope = 'selected_areas' and c.lga_id is not null
         and not (c.lga_id = any (coalesce(pg.active_area_ids, '{}'::integer[]))) then
        continue;
      end if;
      select count(*)::bigint, count(distinct r.station_id)::bigint, count(distinct r.user_id)::bigint
        into v_updates, v_stations, v_people
        from public.price_reports r
       where r.status = 'accepted' and r.country_code = v_country and r.lagos_day between v_start and v_end
         and (c.lga_id is null or r.lga_id = c.lga_id);
      if v_updates < pg.min_area_updates_quorum or v_stations < pg.min_area_stations_quorum
         or v_people < pg.min_area_participants_quorum then
        if c.lga_id is null then exit; end if;      -- the whole country is below quorum
        continue;
      end if;
    end if;

    v_pref := 'cash';
    if pg.voucher_enabled then
      select coalesce(p.payout_preference, 'cash') into v_pref from public.reward_participants p where p.user_id = c.user_id;
      v_pref := coalesce(v_pref, 'cash');
    end if;

    if v_pref = 'voucher' then
      v_vouch_val := round(v_prize * (1.0 + (pg.voucher_bonus_pct / 100.0)))::integer;
      v_vouch_code := 'QZ-VCH-' || upper(substr(md5(random()::text || c.user_id::text || clock_timestamp()::text), 1, 8));
      v_gross := v_vouch_val; v_act_wht := 0; v_net := v_vouch_val;
    else
      v_vouch_val := null; v_vouch_code := null;
      v_gross := v_prize; v_act_wht := v_wht; v_net := v_prize - v_wht;
    end if;

    v_area_name := null; v_area_state := null;
    if c.lga_id is not null then
      select l.name, l.state into v_area_name, v_area_state from public.lgas l where l.id = c.lga_id;
    elsif p_kind = 'monthly' then
      v_area_name := rg.name || ' (national)';
    end if;

    insert into public.reward_winners (period_id, lga_id, lga_name, state, user_id, coins, active_days, stations,
                                       gross_ngn, wht_ngn, net_ngn, payout_type, voucher_code, voucher_value_ngn,
                                       quorum_metrics, currency)
    values (v_period, c.lga_id, v_area_name, v_area_state, c.user_id, c.coins, c.active_days, c.stations,
            v_gross, v_act_wht, v_net, v_pref, v_vouch_code, v_vouch_val,
            jsonb_build_object('lga_updates', coalesce(v_updates, 0), 'lga_stations', coalesce(v_stations, 0),
                               'lga_participants', coalesce(v_people, 0), 'national', c.lga_id is null),
            pg.currency);

    if c.lga_id is null then v_national := true; else v_lgas := v_lgas || c.lga_id; end if;
    v_users := v_users || c.user_id;
    v_count := v_count + 1;
  end loop;

  update public.price_reports set reporter_lat = null, reporter_lng = null
   where reporter_lat is not null and created_at < now() - interval '13 months';

  insert into public.reward_audit_log (action, details)
  values ('period_closed', jsonb_build_object('kind', p_kind, 'start', v_start, 'country', v_country,
                                              'winners', v_count, 'scope', pg.active_payout_scope));
  return json_build_object('period_id', v_period, 'winners', v_count, 'pay_by', v_pay_by, 'country_code', v_country,
                           'currency', pg.currency);
end $$;

-- Forfeit a winner and award the next qualified person in that area (cash, at the period's prize)
create or replace function public.admin_replace_winner(p_winner_id bigint, p_note text)
returns json language plpgsql security definer set search_path = '' as $$
declare
  w     public.reward_winners%rowtype;
  p     public.reward_periods%rowtype;
  c     record;
  v_new bigint;
  v_wht integer;
begin
  if not public.admin_can('rewards') then
    raise exception 'Not authorised: your admin account does not have access to this section.' using errcode = '42501';
  end if;
  select * into w from public.reward_winners where id = p_winner_id for update;
  if not found then raise exception 'Winner not found.'; end if;
  if w.status = 'paid' then raise exception 'This prize has already been paid.'; end if;
  select * into p from public.reward_periods where id = w.period_id;
  if not public.admin_country_ok(p.country_code) then
    raise exception 'Not authorised: your admin account does not cover this country.' using errcode = '42501';
  end if;

  update public.reward_winners set status = 'forfeited', note = coalesce(p_note, note) where id = w.id;

  select * into c from public._reward_candidates(p.kind, p.period_start, p.period_end, p.country_code) x
   where (p.kind = 'annual' or x.lga_id is not distinct from w.lga_id)
     and not exists (select 1 from public.reward_winners o where o.period_id = p.id and o.user_id = x.user_id)
   limit 1;
  if found then
    v_wht := round(p.prize_ngn * p.wht_percent / 100.0);
    insert into public.reward_winners (period_id, lga_id, lga_name, state, user_id, coins, active_days, stations,
                                       gross_ngn, wht_ngn, net_ngn, payout_type, currency)
    values (p.id, w.lga_id, w.lga_name, w.state, c.user_id, c.coins, c.active_days, c.stations,
            p.prize_ngn, v_wht, p.prize_ngn - v_wht, 'cash', p.currency)
    returning id into v_new;
  end if;
  insert into public.reward_audit_log (action, target_user, details)
  values ('winner_forfeited', w.user_id, json_build_object('winner_id', w.id, 'replacement_id', v_new, 'note', p_note)::jsonb);
  return json_build_object('replacement_id', v_new);
end $$;

create or replace function public.admin_update_winner(p_winner_id bigint, p_status text, p_reference text default null, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.admin_can('rewards') then
    raise exception 'Not authorised: your admin account does not have access to this section.' using errcode = '42501';
  end if;
  if not public.admin_country_ok((select p.country_code from public.reward_winners w
                                    join public.reward_periods p on p.id = w.period_id where w.id = p_winner_id)) then
    raise exception 'Not authorised: your admin account does not cover this country.' using errcode = '42501';
  end if;
  if p_status not in ('pending', 'approved', 'paid') then raise exception 'Use "replace" to forfeit a winner.'; end if;
  if p_status = 'paid' and coalesce(trim(p_reference), '') = '' then raise exception 'Enter the payment reference.'; end if;
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
-- 10. ADMIN REWARD SCREENS (country filter + admin scope)
-- -------------------------------------------------------------------------------------
drop function if exists public.admin_reward_lga_summary(date, date);
create or replace function public.admin_reward_lga_summary(p_from date, p_to date, p_country text default null)
returns table (lga_id integer, lga text, state text, country_code text, updates bigint, all_reports bigint, stations bigint,
               contributors bigint, coins bigint, held bigint, quorum_met boolean, in_scope boolean,
               leader_name text, leader_email text, leader_coins bigint)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare v_scope text[] := public._admin_scope();
begin
  if not public.admin_can('rewards') then
    raise exception 'Not authorised: your admin account does not have access to rewards.' using errcode = '42501';
  end if;
  return query
  with base as (
    select r.* from public.price_reports r
     where r.lagos_day between p_from and p_to
       and (p_country is null or r.country_code = upper(p_country))
       and (v_scope is null or r.country_code = any (v_scope))
  ), agg as (
    select b.country_code, b.lga_id,
           count(*) filter (where b.status = 'accepted') as updates,
           count(*) as all_reports,
           count(distinct b.station_id) filter (where b.status = 'accepted') as stations,
           count(distinct b.user_id) filter (where b.status = 'accepted') as contributors,
           coalesce(sum(b.coins) filter (where b.status = 'accepted'), 0) as coins,
           count(*) filter (where b.status = 'held') as held
      from base b
     group by b.country_code, b.lga_id
  ), ranked as (
    select distinct on (x.country_code, x.lga_id) x.country_code, x.lga_id, x.user_id, x.coins
      from (select b.country_code, b.lga_id, b.user_id, sum(b.coins) as coins, count(distinct b.station_id) as st,
                   max(b.created_at) as last_at
              from base b
             where b.status = 'accepted' and not public.reward_is_excluded(b.user_id)
             group by b.country_code, b.lga_id, b.user_id) x
     order by x.country_code, x.lga_id, x.coins desc, x.st desc, x.last_at asc
  )
  select a.lga_id, coalesce(l.name, g.name || case when a.lga_id is null then ' (no area)' else '' end), l.state, a.country_code,
         a.updates::bigint, a.all_reports::bigint, a.stations::bigint, a.contributors::bigint, a.coins::bigint, a.held::bigint,
         (pg.country_code is not null and a.updates >= pg.min_area_updates_quorum and a.stations >= pg.min_area_stations_quorum
          and a.contributors >= pg.min_area_participants_quorum),
         (pg.country_code is not null and (pg.active_payout_scope = 'all'
                                           or a.lga_id = any (coalesce(pg.active_area_ids, '{}'::integer[])))),
         public._reward_display_name(k.user_id), u.email::text, k.coins::bigint
    from agg a
    left join public.lgas l on l.id = a.lga_id
    left join public.regions g on g.country_code = a.country_code
    left join public.reward_programs pg on pg.country_code = a.country_code
    left join ranked k on k.country_code is not distinct from a.country_code and k.lga_id is not distinct from a.lga_id
    left join auth.users u on u.id = k.user_id
   order by a.coins desc, a.updates desc;
end $$;

drop function if exists public.admin_reward_contributors(date, date);
create or replace function public.admin_reward_contributors(p_from date, p_to date, p_country text default null)
returns table (user_id uuid, email text, display_name text, legal_name text, participant_status text, verified boolean,
               phone_ok boolean, bank_on_file boolean, payout_preference text, excluded boolean,
               reports bigint, accepted bigint, held bigint, rejected bigint, no_reward bigint,
               coins bigint, coins_held bigint, stations bigint, active_days bigint, lgas text, countries text,
               last_report_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare v_scope text[] := public._admin_scope();
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
         string_agg(distinct r.country_code, ', '),
         max(r.created_at)
    from public.price_reports r
    join auth.users u on u.id = r.user_id
    left join public.reward_participants p on p.user_id = r.user_id
    left join public.lgas l on l.id = r.lga_id
   where r.lagos_day between p_from and p_to
     and (p_country is null or r.country_code = upper(p_country))
     and (v_scope is null or r.country_code = any (v_scope))
   group by r.user_id, u.email, p.legal_name, p.status, p.payout_preference
   order by 16 desc, 11 desc;
end $$;

drop function if exists public.admin_reward_stats(integer);
create or replace function public.admin_reward_stats(p_days integer default 30, p_country text default null)
returns json language plpgsql stable security definer set search_path = '' as $$
declare
  v_today date := public._lagos_today();
  v_ms    date := date_trunc('month', v_today)::date;
  v_from  date := v_today - least(greatest(coalesce(p_days, 30), 7), 120) + 1;
  v_scope text[] := public._admin_scope();
  v_cc    text := nullif(upper(btrim(coalesce(p_country, ''))), '');
begin
  if not public.admin_can('rewards') then
    raise exception 'Not authorised: your admin account does not have access to rewards.' using errcode = '42501';
  end if;
  if v_cc is not null and not public.admin_country_ok(v_cc) then
    raise exception 'Not authorised: your admin account does not cover this country.' using errcode = '42501';
  end if;
  return (
    with r as (
      select * from public.price_reports x
       where (v_cc is null or x.country_code = v_cc)
         and (v_scope is null or x.country_code = any (v_scope))
    ), st as (
      select * from public.stations s
       where (v_cc is null or s.country_code = v_cc)
         and (v_scope is null or s.country_code = any (v_scope))
    )
    select json_build_object(
      'daily', (select coalesce(json_agg(json_build_object('day', d.day::date, 'accepted', coalesce(x.accepted, 0), 'held', coalesce(x.held, 0),
                                                           'no_reward', coalesce(x.no_reward, 0), 'rejected', coalesce(x.rejected, 0)) order by d.day), '[]'::json)
                  from generate_series(v_from, v_today, interval '1 day') as d(day)
                  left join (select r.lagos_day,
                                    count(*) filter (where r.status = 'accepted') as accepted,
                                    count(*) filter (where r.status = 'held') as held,
                                    count(*) filter (where r.status = 'no_reward') as no_reward,
                                    count(*) filter (where r.status = 'rejected') as rejected
                               from r where r.lagos_day >= v_from group by r.lagos_day) x on x.lagos_day = d.day::date),
      'reports_month', (select count(*) from r where r.lagos_day >= v_ms),
      'coins_month', (select coalesce(sum(r.coins), 0) from r where r.lagos_day >= v_ms and r.status = 'accepted'),
      'contributors_month', (select count(distinct r.user_id) from r where r.lagos_day >= v_ms and r.status = 'accepted'),
      'lgas_active_month', (select count(distinct r.lga_id) from r where r.lagos_day >= v_ms and r.status = 'accepted'),
      'held_pending', (select count(*) from r where r.status = 'held'),
      'kyc_pending', (select count(*) from public.reward_participants p
                       where p.status = 'pending_review'
                         and (v_cc is null or public._user_country(p.user_id) = v_cc)
                         and (v_scope is null or public._user_country(p.user_id) = any (v_scope))),
      'verified_people', (select count(*) from public.reward_participants p
                           where p.status = 'verified'
                             and (v_cc is null or public._user_country(p.user_id) = v_cc)
                             and (v_scope is null or public._user_country(p.user_id) = any (v_scope))),
      'lgas_loaded', (select count(*) from public.lgas l
                       where (v_cc is null or l.country_code = v_cc) and (v_scope is null or l.country_code = any (v_scope))),
      'lgas_loaded_ng', (select count(*) from public.lgas l where l.country_code = 'NG'),
      'stations_with_lga', (select count(*) from st where st.lga_id is not null),
      'stations_total', (select count(*) from st),
      'top_lgas', (select coalesce(json_agg(t), '[]'::json) from (
                     select l.name, l.state, r.country_code, sum(r.coins)::bigint as coins, count(distinct r.user_id) as contributors
                       from r join public.lgas l on l.id = r.lga_id
                      where r.lagos_day >= v_ms and r.status = 'accepted'
                      group by l.name, l.state, r.country_code order by 4 desc limit 10) t),
      'reasons', (select coalesce(json_agg(t), '[]'::json) from (
                    select x.reason, count(*) as n
                      from r, unnest(r.reasons) as x(reason)
                     where r.lagos_day >= v_from and x.reason <> 'fresh_bonus'
                     group by x.reason order by 2 desc) t)
    )
  );
end $$;

drop function if exists public.admin_reward_people();
create or replace function public.admin_reward_people(p_country text default null)
returns table (user_id uuid, email text, display_name text, legal_name text, status text, id_type text, id_last4 text,
               dob date, id_doc_path text, phone text, phone_ok boolean, bank_name text, account_name text, account_last4 text,
               strikes integer, excluded boolean, coins_month bigint, submitted_at timestamptz, review_note text,
               country_code text)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_ms    date := date_trunc('month', public._lagos_today())::date;
  v_scope text[] := public._admin_scope();
  v_cc    text := nullif(upper(btrim(coalesce(p_country, ''))), '');
begin
  if not public.admin_can('rewards') then
    raise exception 'Not authorised: your admin account does not have access to rewards.' using errcode = '42501';
  end if;
  return query
  with ids as (
    select p.user_id as uid from public.reward_participants p
    union select a.user_id from public.payout_accounts a
    union select distinct r.user_id from public.price_reports r where r.lagos_day >= v_ms and r.status = 'accepted'
  ), people as (
    select ids.uid, public._user_country(ids.uid) as cc from ids
  )
  select people.uid, u.email::text, public._reward_display_name(people.uid), p.legal_name, coalesce(p.status, 'incomplete'), p.id_type, p.id_last4,
         p.dob, p.id_doc_path, u.phone::text, public._reward_phone_ok(people.uid), a.bank_name, a.account_name, a.account_last4,
         coalesce(p.strikes, 0), public.reward_is_excluded(people.uid),
         (select coalesce(sum(r.coins), 0)::bigint from public.price_reports r where r.user_id = people.uid and r.status = 'accepted' and r.lagos_day >= v_ms),
         p.submitted_at, p.review_note, people.cc
    from people
    join auth.users u on u.id = people.uid
    left join public.reward_participants p on p.user_id = people.uid
    left join public.payout_accounts a on a.user_id = people.uid
   where (v_cc is null or people.cc = v_cc)
     and (v_scope is null or people.cc = any (v_scope))
   order by (coalesce(p.status, '') = 'pending_review') desc, 17 desc;
end $$;

drop function if exists public.admin_reward_winners();
create or replace function public.admin_reward_winners(p_country text default null)
returns table (id bigint, period_id bigint, kind text, period_start date, pay_by date, lga_name text, state text, user_id uuid,
               email text, display_name text, legal_name text, coins integer, active_days integer, stations integer,
               gross_ngn integer, wht_ngn integer, net_ngn integer, status text, payment_reference text, paid_at timestamptz,
               note text, bank_name text, account_name text, account_last4 text,
               country_code text, currency text, payout_type text, voucher_code text, voucher_value_ngn integer,
               voucher_redeemed_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_scope text[] := public._admin_scope();
  v_cc    text := nullif(upper(btrim(coalesce(p_country, ''))), '');
begin
  if not public.admin_can('rewards') then
    raise exception 'Not authorised: your admin account does not have access to rewards.' using errcode = '42501';
  end if;
  return query
  select w.id, w.period_id, p.kind, p.period_start, p.pay_by, w.lga_name, w.state, w.user_id, u.email::text,
         public._reward_display_name(w.user_id), rp.legal_name, w.coins, w.active_days, w.stations,
         w.gross_ngn, w.wht_ngn, w.net_ngn, w.status, w.payment_reference, w.paid_at, w.note,
         a.bank_name, a.account_name, a.account_last4,
         p.country_code, w.currency, w.payout_type, w.voucher_code, w.voucher_value_ngn, w.voucher_redeemed_at
    from public.reward_winners w
    join public.reward_periods p on p.id = w.period_id
    left join auth.users u on u.id = w.user_id
    left join public.reward_participants rp on rp.user_id = w.user_id
    left join public.payout_accounts a on a.user_id = w.user_id
   where (v_cc is null or p.country_code = v_cc)
     and (v_scope is null or p.country_code = any (v_scope))
   order by p.period_start desc, p.kind, p.country_code, w.state, w.lga_name;
end $$;

-- People checks: regional admins only for people in their countries
create or replace function public.admin_review_kyc(p_user uuid, p_approve boolean, p_note text default null)
returns text language plpgsql security definer set search_path = '' as $$
declare v_path text;
begin
  if not public.admin_can('rewards') then
    raise exception 'Not authorised: your admin account does not have access to this section.' using errcode = '42501';
  end if;
  if not public.admin_country_ok(public._user_country(p_user)) then
    raise exception 'Not authorised: this person is in a country your admin account does not cover.' using errcode = '42501';
  end if;
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
  if not public.admin_can('rewards') then
    raise exception 'Not authorised: your admin account does not have access to this section.' using errcode = '42501';
  end if;
  if not public.admin_country_ok(public._user_country(p_user)) then
    raise exception 'Not authorised: this person is in a country your admin account does not cover.' using errcode = '42501';
  end if;
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

create or replace function public.admin_reveal_payout(p_user uuid)
returns json language plpgsql security definer set search_path = '' as $$
declare a public.payout_accounts%rowtype;
begin
  if not public.admin_can('rewards') then
    raise exception 'Not authorised: your admin account does not have access to this section.' using errcode = '42501';
  end if;
  if not public.admin_country_ok(public._user_country(p_user)) then
    raise exception 'Not authorised: this person is in a country your admin account does not cover.' using errcode = '42501';
  end if;
  select * into a from public.payout_accounts where user_id = p_user;
  if not found then raise exception 'No payout account on file.'; end if;
  insert into public.reward_audit_log (action, target_user) values ('bank_revealed', p_user);
  return json_build_object('bank_name', a.bank_name, 'account_name', a.account_name, 'country_code', a.country_code,
                           'account_number', extensions.pgp_sym_decrypt(a.account_number_enc, public._rewards_key()));
end $$;

-- -------------------------------------------------------------------------------------
-- 11. PARTICIPANTS OUTSIDE NIGERIA: national ID + any bank / mobile-money account
-- -------------------------------------------------------------------------------------
do $$
declare c text;
begin
  for c in select conname from pg_constraint
            where conrelid = 'public.reward_participants'::regclass and contype = 'c'
              and pg_get_constraintdef(oid) ilike '%id_type%'
  loop
    execute format('alter table public.reward_participants drop constraint %I', c);
  end loop;
end $$;
alter table public.reward_participants add constraint reward_participants_id_type_check
  check (id_type is null or id_type in ('nin', 'voters_card', 'drivers_licence', 'passport', 'national_id'));

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
  if p_id_type not in ('nin', 'voters_card', 'drivers_licence', 'passport', 'national_id') then raise exception 'Choose an ID type.'; end if;
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

drop function if exists public.save_payout_account(text, text, text);
create or replace function public.save_payout_account(p_bank_name text, p_account_number text, p_account_name text,
                                                      p_country text default null)
returns json language plpgsql security definer set search_path = '' as $$
declare
  v_uid  uuid := auth.uid();
  v_cc   text;
  v_num  text;
  v_hash text;
  v_key  text;
begin
  if v_uid is null then raise exception 'Please sign in.' using errcode = '42501'; end if;
  if public.reward_is_excluded(v_uid) then raise exception 'This account is not eligible for rewards.'; end if;
  v_cc := coalesce(nullif(upper(btrim(coalesce(p_country, ''))), ''), public._user_country(v_uid));
  if v_cc = 'NG' then
    v_num := regexp_replace(coalesce(p_account_number, ''), '\D', '', 'g');
    if v_num !~ '^[0-9]{10}$' then raise exception 'Nigerian bank account numbers (NUBAN) have exactly 10 digits.'; end if;
  else
    v_num := upper(regexp_replace(coalesce(p_account_number, ''), '[^A-Za-z0-9]', '', 'g'));
    if char_length(v_num) not between 6 and 34 then
      raise exception 'Enter your bank account, IBAN or mobile-money number (6 to 34 letters/digits).';
    end if;
  end if;
  if char_length(trim(coalesce(p_bank_name, ''))) < 2 then raise exception 'Enter your bank or mobile-money provider.'; end if;
  if char_length(trim(coalesce(p_account_name, ''))) < 3 then raise exception 'Enter the account name exactly as your bank shows it.'; end if;
  if exists (select 1 from public.reward_winners w where w.user_id = v_uid and w.status in ('pending', 'approved')) then
    raise exception 'You have a prize being processed. To protect your payment, contact support to change bank details.';
  end if;

  v_key  := public._rewards_key();
  v_hash := encode(extensions.hmac(v_num, v_key, 'sha256'), 'hex');
  if exists (select 1 from public.payout_accounts a where a.account_hash = v_hash and a.user_id <> v_uid) then
    raise exception 'This account is already linked to another Qozob account. Each person may use one account.';
  end if;

  insert into public.payout_accounts as a (user_id, bank_name, account_name, account_number_enc, account_last4, account_hash,
                                           country_code, updated_at)
  values (v_uid, trim(p_bank_name), trim(p_account_name), extensions.pgp_sym_encrypt(v_num, v_key), right(v_num, 4), v_hash,
          v_cc, now())
  on conflict (user_id) do update
     set bank_name = excluded.bank_name, account_name = excluded.account_name, account_number_enc = excluded.account_number_enc,
         account_last4 = excluded.account_last4, account_hash = excluded.account_hash, country_code = excluded.country_code,
         updated_at = now();

  insert into public.reward_audit_log (action, target_user, details)
  values ('bank_saved', v_uid, json_build_object('last4', right(v_num, 4), 'country', v_cc)::jsonb);
  return json_build_object('ok', true, 'last4', right(v_num, 4));
end $$;
update public.payout_accounts set country_code = 'NG' where country_code is null;

-- -------------------------------------------------------------------------------------
-- 12. ADVERTS: country targeting (NULL = worldwide). Existing adverts stay in Nigeria.
-- -------------------------------------------------------------------------------------
alter table public.ads add column if not exists target_country text default 'NG';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ads_target_country_fmt' and conrelid = 'public.ads'::regclass) then
    alter table public.ads add constraint ads_target_country_fmt
      check (target_country is null or target_country ~ '^[A-Z]{2}$');
  end if;
  -- States / areas only make sense inside one country
  if not exists (select 1 from pg_constraint where conname = 'ads_target_country_scope' and conrelid = 'public.ads'::regclass) then
    alter table public.ads add constraint ads_target_country_scope
      check (target_scope = 'national' or target_country is not null);
  end if;
end $$;
create index if not exists ads_target_country_idx on public.ads (target_country);

drop policy if exists "qozob_ads_read" on public.ads;
create policy "qozob_ads_read" on public.ads
  for select to anon, authenticated
  using ((select public.admin_can('ads')) or (is_active and starts_at <= now() and (ends_at is null or ends_at > now())));
drop policy if exists "qozob_ads_admin_insert" on public.ads;
create policy "qozob_ads_admin_insert" on public.ads
  for insert to authenticated with check ((select public.admin_can('ads')) and public.admin_country_ok(target_country));
drop policy if exists "qozob_ads_admin_update" on public.ads;
create policy "qozob_ads_admin_update" on public.ads
  for update to authenticated
  using ((select public.admin_can('ads')) and public.admin_country_ok(target_country))
  with check ((select public.admin_can('ads')) and public.admin_country_ok(target_country));
drop policy if exists "qozob_ads_admin_delete" on public.ads;
create policy "qozob_ads_admin_delete" on public.ads
  for delete to authenticated using ((select public.admin_can('ads')) and public.admin_country_ok(target_country));

-- Country comes from (1) the area the viewer is in, (2) p_country sent by the app (nearest
-- station's country), (3) Nigeria. Order: area → state → country-wide → worldwide.
drop function if exists public.ads_for_viewer(text, double precision, double precision, text);
create or replace function public.ads_for_viewer(
  p_placement text,
  p_lat       double precision default null,
  p_lng       double precision default null,
  p_state     text default null,
  p_country   text default null
)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_placement text := case when p_placement in ('mobile_bottom', 'desktop_header') then p_placement else 'desktop_header' end;
  v_lga_id    integer;
  v_lga       text;
  v_geo_state text;
  v_geo_cc    text;
  v_state     text := nullif(btrim(coalesce(p_state, '')), '');
  v_country   text := nullif(upper(btrim(coalesce(p_country, ''))), '');
  v_ads       jsonb;
begin
  if p_lat between -90 and 90 and p_lng between -180 and 180 then
    select l.id, l.name, l.state, l.country_code into v_lga_id, v_lga, v_geo_state, v_geo_cc
      from public.lgas l
     where extensions.st_intersects(l.geom, extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326))
     limit 1;
    if v_geo_state is not null then v_state := v_geo_state; end if;
    if v_geo_cc is not null then v_country := v_geo_cc; end if;
  end if;
  v_country := coalesce(v_country, 'NG');

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', x.id, 'title', x.title, 'advertiser', x.advertiser, 'link_url', x.link_url,
           'desktop_image_url', x.desktop_image_url, 'mobile_image_url', x.mobile_image_url,
           'weight', x.weight, 'target_scope', x.target_scope, 'target_country', x.target_country
         ) order by x.scope_rank, x.sort_order, x.created_at desc), '[]'::jsonb)
    into v_ads
    from (
      select a.*, case when a.target_country is null then 3
                       when a.target_scope = 'lgas' then 0 when a.target_scope = 'states' then 1 else 2 end as scope_rank
        from public.ads a
       where a.is_active
         and a.starts_at <= now()
         and (a.ends_at is null or a.ends_at > now())
         and a.placement in (v_placement, 'both')
         and (a.target_country is null or a.target_country = v_country)
         and (
           a.target_scope = 'national'
           or (a.target_scope = 'states' and v_state is not null
               and exists (select 1 from unnest(a.target_states) s where lower(s) = lower(v_state)))
           or (a.target_scope = 'lgas' and v_lga_id is not null and v_lga_id = any (a.target_lga_ids))
         )
       order by scope_rank, a.sort_order, a.created_at desc
       limit 20
    ) x;

  return jsonb_build_object('lga_id', v_lga_id, 'lga', v_lga, 'state', v_state, 'country', v_country, 'ads', v_ads);
end $$;

-- -------------------------------------------------------------------------------------
-- 13. REGION ADMIN
-- -------------------------------------------------------------------------------------
create or replace function public.admin_regions_overview()
returns json language plpgsql stable security definer set search_path = '' as $$
declare v_scope text[];
begin
  if not public.is_admin() then raise exception 'Not authorised: admin access required.' using errcode = '42501'; end if;
  v_scope := public._admin_scope();
  return (
    with sc as (
      select s.country_code, count(*) as stations, count(*) filter (where s.price_pms is not null) as priced,
             count(*) filter (where s.manager_id is not null) as claimed,
             count(*) filter (where s._fresh) as fresh_7d
        from (select st.country_code, st.price_pms, st.manager_id,
                     coalesce(public._try_ts(st.last_updated) > now() - interval '7 days', false) as _fresh
                from public.stations st) s
       group by s.country_code
    ), rc as (
      select r.country_code, count(*) as reports_30d, count(*) filter (where r.status = 'held') as held,
             count(distinct r.user_id) as contributors_30d
        from public.price_reports r where r.created_at > now() - interval '30 days'
       group by r.country_code
    ), ac as (
      select l.country_code, count(*) as areas from public.lgas l group by l.country_code
    )
    select json_build_object(
      'is_master', public.admin_is_master(),
      'scope', v_scope,
      'regions', (select coalesce(json_agg(json_build_object(
                     'country_code', g.country_code, 'name', g.name, 'default_currency', g.default_currency,
                     'currencies', g.currencies, 'aliases', g.aliases, 'price_min', g.price_min, 'price_max', g.price_max,
                     'is_open', g.is_open, 'area_label', g.area_label, 'updated_at', g.updated_at,
                     'stations', coalesce(sc.stations, 0), 'priced', coalesce(sc.priced, 0), 'claimed', coalesce(sc.claimed, 0),
                     'fresh_7d', coalesce(sc.fresh_7d, 0), 'reports_30d', coalesce(rc.reports_30d, 0),
                     'held', coalesce(rc.held, 0), 'contributors_30d', coalesce(rc.contributors_30d, 0),
                     'areas', coalesce(ac.areas, 0),
                     'program', case when p.country_code is null then null else json_build_object(
                        'currency', p.currency, 'program_active', p.program_active, 'monthly_prize', p.monthly_prize,
                        'annual_prize', p.annual_prize, 'wht_percent', p.wht_percent, 'voucher_enabled', p.voucher_enabled,
                        'voucher_bonus_pct', p.voucher_bonus_pct, 'min_active_days', p.min_active_days,
                        'annual_min_active_days', p.annual_min_active_days,
                        'min_area_updates_quorum', p.min_area_updates_quorum, 'min_area_stations_quorum', p.min_area_stations_quorum,
                        'min_area_participants_quorum', p.min_area_participants_quorum,
                        'active_payout_scope', p.active_payout_scope, 'active_area_ids', p.active_area_ids,
                        'note', p.note, 'updated_at', p.updated_at) end
                   ) order by (g.country_code = 'NG') desc, coalesce(sc.stations, 0) desc, g.name), '[]'::json)
                    from public.regions g
                    left join sc on sc.country_code = g.country_code
                    left join rc on rc.country_code = g.country_code
                    left join ac on ac.country_code = g.country_code
                    left join public.reward_programs p on p.country_code = g.country_code
                   where v_scope is null or g.country_code = any (v_scope)),
      'waiting', case when v_scope is null then
                   (select coalesce(json_agg(json_build_object('country_code', sc.country_code, 'stations', sc.stations)
                                             order by sc.stations desc), '[]'::json)
                      from sc where sc.country_code is not null
                       and not exists (select 1 from public.regions g where g.country_code = sc.country_code))
                 else '[]'::json end,
      'unknown_country', case when v_scope is null then coalesce((select sc.stations from sc where sc.country_code is null), 0) else 0 end
    )
  );
end $$;

create or replace function public.admin_upsert_region(
  p_code text, p_name text, p_default_currency text, p_currencies text[] default '{}',
  p_aliases text[] default '{}', p_price_min numeric default null, p_price_max numeric default null,
  p_is_open boolean default true, p_area_label text default 'District'
)
returns json language plpgsql security definer set search_path = '' as $$
declare
  v_code   text := upper(btrim(coalesce(p_code, '')));
  v_def    text := upper(btrim(coalesce(p_default_currency, '')));
  v_cur    text[];
  v_alias  text[];
  v_old    public.regions%rowtype;
  v_filled integer := 0;
  v_adopt  integer := 0;
begin
  if not public.admin_is_master() then raise exception 'Only a master admin can add or change countries.' using errcode = '42501'; end if;
  if v_code !~ '^[A-Z]{2}$' then raise exception 'Use the 2-letter country code (for example GH for Ghana).'; end if;
  if v_def !~ '^[A-Z]{3}$' then raise exception 'Use the 3-letter currency code (for example GHS).'; end if;
  if char_length(btrim(coalesce(p_name, ''))) < 2 then raise exception 'Enter the country name.'; end if;
  if p_price_min is not null and p_price_max is not null and p_price_max <= p_price_min then
    raise exception 'The highest price must be above the lowest price.';
  end if;
  if (p_price_min is null) <> (p_price_max is null) then
    raise exception 'Enter both the lowest and highest usual price, or leave both empty.';
  end if;

  select coalesce(array_agg(distinct upper(btrim(c)) order by upper(btrim(c))), '{}'::text[]) into v_cur
    from unnest(coalesce(p_currencies, '{}'::text[])) as c
   where upper(btrim(coalesce(c, ''))) ~ '^[A-Z]{3}$' and upper(btrim(c)) <> v_def;
  select coalesce(array_agg(distinct lower(btrim(a))), '{}'::text[]) into v_alias
    from unnest(coalesce(p_aliases, '{}'::text[])) as a where btrim(coalesce(a, '')) <> '';

  select * into v_old from public.regions where country_code = v_code;

  insert into public.regions as g (country_code, name, default_currency, currencies, aliases, price_min, price_max,
                                   is_open, area_label, updated_at, updated_by)
  values (v_code, btrim(p_name), v_def, v_cur, v_alias, p_price_min, p_price_max, coalesce(p_is_open, true),
          coalesce(nullif(btrim(p_area_label), ''), 'District'), now(), auth.uid())
  on conflict (country_code) do update
     set name = excluded.name, default_currency = excluded.default_currency, currencies = excluded.currencies,
         aliases = excluded.aliases, price_min = excluded.price_min, price_max = excluded.price_max,
         is_open = excluded.is_open, area_label = excluded.area_label, updated_at = now(), updated_by = auth.uid();

  -- Stations in this country that had no currency yet get the default one
  update public.stations set currency = v_def where country_code = v_code and currency is null;
  get diagnostics v_filled = row_count;
  -- Nigeria's range is also shown in Rewards → Settings
  if v_code = 'NG' and p_price_min is not null and p_price_max is not null then
    update public.reward_settings set price_min = p_price_min, price_max = p_price_max where id;
  end if;
  -- Stations with an unknown country whose address names this country
  update public.stations set country_code = v_code
   where country_code is null and public._country_from_address(address) = v_code;
  get diagnostics v_adopt = row_count;

  insert into public.admin_audit_log (action, details)
  values (case when v_old.country_code is null then 'region_added' else 'region_changed' end,
          jsonb_build_object('country', v_code, 'currency', v_def, 'currencies', v_cur, 'is_open', p_is_open,
                             'price_min', p_price_min, 'price_max', p_price_max));
  return json_build_object('country_code', v_code, 'new', v_old.country_code is null, 'stations_filled', v_filled,
                           'stations_adopted', v_adopt,
                           'currency_changed', v_old.country_code is not null and v_old.default_currency <> v_def);
end $$;

create or replace function public.admin_upsert_reward_program(p_code text, p jsonb)
returns json language plpgsql security definer set search_path = '' as $$
declare
  v_code text := upper(btrim(coalesce(p_code, '')));
  rg     public.regions%rowtype;
  cur    public.reward_programs%rowtype;
  v_cur  text;
  v_new  boolean;
begin
  if not public.admin_is_master() then raise exception 'Only a master admin can set up or change reward programmes.' using errcode = '42501'; end if;
  select * into rg from public.regions where country_code = v_code;
  if not found then raise exception 'Add the country in Regions first.'; end if;
  select * into cur from public.reward_programs where country_code = v_code;
  v_new := not found;

  v_cur := upper(coalesce(nullif(btrim(p ->> 'currency'), ''), cur.currency, rg.default_currency));
  if not (v_cur = rg.default_currency or v_cur = any (rg.currencies)) then
    raise exception 'The prize currency must be one of the currencies set for % (%).', rg.name,
      array_to_string(array[rg.default_currency] || rg.currencies, ', ');
  end if;

  insert into public.reward_programs as g (
    country_code, currency, program_active, monthly_prize, annual_prize, wht_percent, voucher_enabled, voucher_bonus_pct,
    min_active_days, annual_min_active_days, min_area_updates_quorum, min_area_stations_quorum, min_area_participants_quorum,
    active_payout_scope, active_area_ids, note, updated_at, updated_by)
  values (
    v_code, v_cur,
    coalesce((p ->> 'program_active')::boolean, cur.program_active, false),
    coalesce((p ->> 'monthly_prize')::integer, cur.monthly_prize, 0),
    case when p ? 'annual_prize' then nullif(p ->> 'annual_prize', '')::integer else cur.annual_prize end,
    coalesce((p ->> 'wht_percent')::numeric, cur.wht_percent, 0),
    v_code = 'NG' and coalesce((p ->> 'voucher_enabled')::boolean, cur.voucher_enabled, false),   -- auto services: Nigeria only
    coalesce((p ->> 'voucher_bonus_pct')::numeric, cur.voucher_bonus_pct, 0),
    coalesce((p ->> 'min_active_days')::integer, cur.min_active_days, 8),
    coalesce((p ->> 'annual_min_active_days')::integer, cur.annual_min_active_days, 60),
    coalesce((p ->> 'min_area_updates_quorum')::integer, cur.min_area_updates_quorum, 30),
    coalesce((p ->> 'min_area_stations_quorum')::integer, cur.min_area_stations_quorum, 3),
    coalesce((p ->> 'min_area_participants_quorum')::integer, cur.min_area_participants_quorum, 2),
    coalesce(p ->> 'active_payout_scope', cur.active_payout_scope, 'all'),
    case when p ? 'active_area_ids'
         then (select array_agg(x::integer) from jsonb_array_elements_text(p -> 'active_area_ids') as x)
         else cur.active_area_ids end,
    case when p ? 'note' then nullif(btrim(p ->> 'note'), '') else cur.note end,
    now(), auth.uid())
  on conflict (country_code) do update
     set currency = excluded.currency, program_active = excluded.program_active, monthly_prize = excluded.monthly_prize,
         annual_prize = excluded.annual_prize, wht_percent = excluded.wht_percent, voucher_enabled = excluded.voucher_enabled,
         voucher_bonus_pct = excluded.voucher_bonus_pct, min_active_days = excluded.min_active_days,
         annual_min_active_days = excluded.annual_min_active_days, min_area_updates_quorum = excluded.min_area_updates_quorum,
         min_area_stations_quorum = excluded.min_area_stations_quorum,
         min_area_participants_quorum = excluded.min_area_participants_quorum,
         active_payout_scope = excluded.active_payout_scope, active_area_ids = excluded.active_area_ids,
         note = excluded.note, updated_at = now(), updated_by = auth.uid();

  insert into public.reward_audit_log (action, details)
  values (case when v_new then 'program_created' else 'program_changed' end,
          jsonb_build_object('country', v_code) || coalesce(p, '{}'::jsonb));
  return json_build_object('country_code', v_code, 'new', v_new, 'currency', v_cur);
end $$;

-- Area maps for any country (geoBoundaries / GRID3 GeoJSON, sent in batches by the admin panel)
create or replace function public.admin_import_areas(p_rows jsonb, p_country text)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_cc text := upper(btrim(coalesce(p_country, '')));
  v_rg text;
  r    jsonb;
  n    integer := 0;
  g    extensions.geometry;
begin
  if not public.admin_can('rewards') then
    raise exception 'Not authorised: your admin account does not have access to this section.' using errcode = '42501';
  end if;
  select name into v_rg from public.regions where country_code = v_cc;
  if v_rg is null then raise exception 'Add the country in Regions first.'; end if;
  if not public.admin_country_ok(v_cc) then
    raise exception 'Not authorised: your admin account does not cover this country.' using errcode = '42501';
  end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    if coalesce(btrim(r ->> 'shape_id'), '') = '' or coalesce(btrim(r ->> 'name'), '') = '' or r -> 'geometry' is null then
      continue;
    end if;
    g := extensions.st_multi(extensions.st_collectionextract(extensions.st_makevalid(
           extensions.st_setsrid(extensions.st_geomfromgeojson((r -> 'geometry')::text), 4326)), 3));
    insert into public.lgas (shape_id, name, state, geom, country_code)
    values (btrim(r ->> 'shape_id'), btrim(r ->> 'name'), coalesce(nullif(btrim(r ->> 'state'), ''), v_rg), g, v_cc)
    on conflict (shape_id) do update
       set name = excluded.name, state = excluded.state, geom = excluded.geom, country_code = excluded.country_code;
    n := n + 1;
  end loop;
  return n;
end $$;

-- Give every station in a country its area (run after importing that country's map)
create or replace function public.admin_assign_station_areas(p_country text default null)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_cc text := nullif(upper(btrim(coalesce(p_country, ''))), '');
  n    integer;
begin
  if not public.admin_can('rewards') then
    raise exception 'Not authorised: your admin account does not have access to this section.' using errcode = '42501';
  end if;
  if (v_cc is null and public._admin_scope() is not null) or (v_cc is not null and not public.admin_country_ok(v_cc)) then
    raise exception 'Not authorised: your admin account does not cover this country.' using errcode = '42501';
  end if;
  update public.stations s
     set lga_id = (select l.id from public.lgas l
                    where extensions.st_intersects(l.geom, extensions.st_setsrid(extensions.st_makepoint(s.lng, s.lat), 4326))
                    limit 1)
   where s.lat is not null and s.lng is not null
     and (v_cc is null or s.country_code = v_cc);
  get diagnostics n = row_count;
  return n;
end $$;

-- Work out the country again for stations whose country is unknown (e.g. after adding aliases)
create or replace function public.admin_assign_unknown_countries()
returns integer language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  if not (public.admin_can('stations') and public._admin_scope() is null) then
    raise exception 'Not authorised: this needs Stations access for every country.' using errcode = '42501';
  end if;
  update public.stations s
     set country_code = public._infer_country(s.lat, s.lng, s.lga_id, s.address)
   where s.country_code is null
     and public._infer_country(s.lat, s.lng, s.lga_id, s.address) is not null;
  get diagnostics n = row_count;
  return n;
end $$;

-- -------------------------------------------------------------------------------------
-- 14. PERMISSIONS
-- -------------------------------------------------------------------------------------
do $$
declare f text;
begin
  -- internal: nobody calls these directly
  foreach f in array array[
    'public._reward_scores_c(date, date, text)', 'public._reward_active_days_c(date, date, text)',
    'public._reward_candidates(text, date, date, text)', 'public.reward_programs_sync_ng()', 'public.reward_settings_sync_ng()',
    'public.price_reports_set_region()'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;

  -- used inside table triggers / policies that visitors and members pass through
  foreach f in array array[
    'public._country_from_address(text)',
    'public._infer_country(double precision, double precision, integer, text)',
    'public._price_cap(text, text)', 'public._admin_scope()', 'public.admin_country_ok(text)',
    'public._user_country(uuid)', 'public._claim_country(text, double precision, double precision)',
    'public.reward_leaderboard(date, date, integer, integer, text)',
    'public.ads_for_viewer(text, double precision, double precision, text, text)',
    'public.my_admin_access()'
  ] loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to anon, authenticated', f);
  end loop;

  -- signed-in people (each function checks admin rights itself where needed)
  foreach f in array array[
    'public.admin_list_admins()', 'public.admin_grant_access(text, boolean, text[], text, text[])',
    'public.submit_price(text, numeric, text, double precision, double precision, double precision, text, text, double precision, double precision)',
    'public.admin_review_report(bigint, boolean, text)', 'public.admin_price_review_queue()',
    'public.admin_report_rows(date, date, text, integer, text)', 'public.admin_station_directory()',
    'public.admin_review_claim(text, text, text)', 'public.admin_review_role_request(bigint, text, text)',
    'public.my_reward_summary()', 'public.my_payout_preference()',
    'public.admin_close_period(text, date, text)', 'public.admin_replace_winner(bigint, text)',
    'public.admin_update_winner(bigint, text, text, text)',
    'public.admin_reward_lga_summary(date, date, text)', 'public.admin_reward_contributors(date, date, text)',
    'public.admin_reward_stats(integer, text)', 'public.admin_reward_people(text)', 'public.admin_reward_winners(text)',
    'public.admin_review_kyc(uuid, boolean, text)', 'public.admin_set_participant(uuid, text, text)',
    'public.admin_reveal_payout(uuid)',
    'public.submit_reward_kyc(text, date, text, text, text, boolean)',
    'public.save_payout_account(text, text, text, text)',
    'public.admin_regions_overview()',
    'public.admin_upsert_region(text, text, text, text[], text[], numeric, numeric, boolean, text)',
    'public.admin_upsert_reward_program(text, jsonb)',
    'public.admin_import_areas(jsonb, text)', 'public.admin_assign_station_areas(text)',
    'public.admin_assign_unknown_countries()'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

commit;

-- -------------------------------------------------------------------------------------
-- DONE. Summary:
-- -------------------------------------------------------------------------------------
select 'Countries set up' as item, (select count(*)::text from public.regions) as value
union all
select 'Stations per country', (select string_agg(x.cc || ': ' || x.n, ', ' order by x.n desc)
                                  from (select coalesce(country_code, 'unknown') as cc, count(*)::text as n
                                          from public.stations group by 1 order by count(*) desc limit 8) x)
union all
select 'Stations without a currency', (select count(*)::text from public.stations where currency is null)
union all
select 'Reward programmes', (select string_agg(country_code || ' (' || currency || case when program_active then ', active' else ', paused' end || ')', ', ')
                               from public.reward_programs)
union all
select 'Price reports with a currency', (select count(*)::text from public.price_reports where currency is not null);
