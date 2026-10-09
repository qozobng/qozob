-- =====================================================================================
-- Migration: 20261013_monetization_and_services.sql
-- Description:
--   1. Reward Quorum & Payout Safeguards:
--      - Protects startup cash by requiring minimum LGA activity (quorum) before prize payouts.
--      - Phased rollout support (Nationwide vs Selected Tier-1 LGAs).
--      - Dual payout choice: ₦10,000 cash vs ₦15,000 service voucher (+50% bonus).
--   2. Auto Services & Revenue Hub (service_requests table):
--      - Vehicle Papers Renewal, Third-Party/Comprehensive Insurance, New Plate Registration.
--      - Vehicle Security & Live 4G GPS Tracker orders with doorstep installation.
--   3. "My Garage" Vehicle Management (user_vehicles table):
--      - Driver vehicle wallet, document expiration countdowns, and automated reminders.
--   4. "Fuel & Fleet Logbook" (fuel_logs table):
--      - Vehicle and generator fuel expense tracking, mileage, and consumption analytics.
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- 1. REWARD QUORUM & SAFEGUARDS (Altering reward_settings, participants & winners)
-- -------------------------------------------------------------------------------------

alter table public.reward_settings
  add column if not exists min_lga_updates_quorum integer not null default 30 check (min_lga_updates_quorum >= 1),
  add column if not exists min_lga_stations_quorum integer not null default 3 check (min_lga_stations_quorum >= 1),
  add column if not exists min_lga_participants_quorum integer not null default 2 check (min_lga_participants_quorum >= 1),
  add column if not exists active_payout_scope text not null default 'all' check (active_payout_scope in ('all', 'selected_lgas')),
  add column if not exists active_lga_ids integer[] default null,
  add column if not exists voucher_bonus_pct numeric(5,2) not null default 50.00 check (voucher_bonus_pct >= 0);

alter table public.reward_participants
  add column if not exists payout_preference text not null default 'voucher' check (payout_preference in ('cash', 'voucher'));

alter table public.reward_winners
  add column if not exists payout_type text not null default 'cash' check (payout_type in ('cash', 'voucher')),
  add column if not exists voucher_code text default null,
  add column if not exists voucher_value_ngn integer default null,
  add column if not exists quorum_metrics jsonb default null;

-- Re-implement admin_close_period with strict quorum protection & dual payout support
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

  -- Quorum check variables
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
  if not public.is_admin() then
    raise exception 'Not authorised: admin access required.' using errcode = '42501';
  end if;

  select * into cfg from public.reward_settings where id;

  if p_kind = 'monthly' then
    v_start := date_trunc('month', p_start)::date;
    v_end := (v_start + interval '1 month - 1 day')::date;
    v_pay_by := (v_start + interval '1 month')::date + 6; -- 7th of the following month
    v_prize := cfg.monthly_prize_ngn;
  elsif p_kind = 'annual' then
    v_start := date_trunc('year', p_start)::date;
    v_end := (v_start + interval '1 year - 1 day')::date;
    v_pay_by := (v_start + interval '1 year')::date + 30; -- 31 January of the following year
    v_prize := cfg.annual_prize_ngn;
    if coalesce(v_prize, 0) <= 0 then
      raise exception 'Set the annual grand prize amount in Rewards → Settings first.';
    end if;
  else
    raise exception 'Unknown period type.';
  end if;

  if v_end >= public._lagos_today() then
    raise exception 'This period has not ended yet (it ends %).', v_end;
  end if;

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

      -- SAFEGUARD 1: Check if LGA is in selected active scope
      if cfg.active_payout_scope = 'selected_lgas' and cfg.active_lga_ids is not null then
        if not (c.lga_id = any (cfg.active_lga_ids)) then
          continue;
        end if;
      end if;

      -- SAFEGUARD 2: Evaluate LGA Quorum (minimum updates, stations, and competing participants)
      select count(*)::bigint,
             count(distinct r.station_id)::bigint,
             count(distinct r.user_id)::bigint
        into v_lga_updates, v_lga_stations, v_lga_participants
        from public.price_reports r
       where r.status = 'accepted'
         and r.lga_id = c.lga_id
         and r.lagos_day between v_start and v_end;

      if v_lga_updates < cfg.min_lga_updates_quorum
         or v_lga_stations < cfg.min_lga_stations_quorum
         or v_lga_participants < cfg.min_lga_participants_quorum then
        -- Quorum not met for this LGA: skip payout to protect startup funds
        continue;
      end if;
    end if;

    -- Determine payout preference (cash vs voucher)
    select coalesce(p.payout_preference, 'voucher') into v_pref
      from public.reward_participants p
     where p.user_id = c.user_id;

    if v_pref = 'voucher' then
      v_vouch_val := round(v_prize * (1.0 + (cfg.voucher_bonus_pct / 100.0)))::integer;
      v_vouch_code := 'QZ-VCH-' || upper(substr(md5(random()::text || c.user_id::text), 1, 8));
      v_gross := v_vouch_val;
      v_act_wht := 0;
      v_net := v_vouch_val;
    else
      v_vouch_val := null;
      v_vouch_code := null;
      v_gross := v_prize;
      v_act_wht := v_wht;
      v_net := v_prize - v_wht;
    end if;

    insert into public.reward_winners (
      period_id, lga_id, lga_name, state, user_id,
      coins, active_days, stations, gross_ngn, wht_ngn, net_ngn,
      payout_type, voucher_code, voucher_value_ngn, quorum_metrics
    )
    select v_period, c.lga_id, l.name, l.state, c.user_id,
           c.coins, c.active_days, c.stations, v_gross, v_act_wht, v_net,
           v_pref, v_vouch_code, v_vouch_val,
           json_build_object(
             'lga_updates', coalesce(v_lga_updates, 0),
             'lga_stations', coalesce(v_lga_stations, 0),
             'lga_participants', coalesce(v_lga_participants, 0)
           )::jsonb
      from (select 1) one left join public.lgas l on l.id = c.lga_id;

    v_lgas := v_lgas || c.lga_id;
    v_users := v_users || c.user_id;
    v_count := v_count + 1;
  end loop;

  -- Data minimisation: drop exact GPS positions older than 13 months
  update public.price_reports set reporter_lat = null, reporter_lng = null
   where reporter_lat is not null and created_at < now() - interval '13 months';

  insert into public.reward_audit_log (action, details)
  values ('period_closed', json_build_object('kind', p_kind, 'start', v_start, 'winners', v_count, 'scope', cfg.active_payout_scope)::jsonb);

  return json_build_object('period_id', v_period, 'winners', v_count, 'pay_by', v_pay_by);
end $$;

-- -------------------------------------------------------------------------------------
-- 2. AUTO SERVICES & REVENUE HUB (service_requests table)
-- -------------------------------------------------------------------------------------

create table if not exists public.service_requests (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid references auth.users(id) on delete set null,
  service_category    text not null check (service_category in ('papers_renewal', 'new_registration', 'auto_insurance', 'gps_tracker', 'fleet_solution')),
  service_name        text not null,
  full_name           text not null,
  phone               text not null,
  email               text not null,
  state               text,
  lga                 text,
  delivery_address    text,
  vehicle_make        text,
  vehicle_model       text,
  vehicle_year        text,
  plate_number        text,
  chassis_number      text,
  details             jsonb not null default '{}'::jsonb,
  status              text not null default 'pending' check (status in ('pending', 'contacted', 'quoted', 'in_progress', 'completed', 'cancelled')),
  estimated_price     numeric(12,2) default null,
  quoted_price        numeric(12,2) default null,
  paid_price          numeric(12,2) default null,
  payment_status      text not null default 'unpaid' check (payment_status in ('unpaid', 'partially_paid', 'paid', 'voucher_used')),
  voucher_code        text default null,
  admin_notes         text,
  assigned_to         text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists service_requests_user_idx on public.service_requests(user_id);
create index if not exists service_requests_status_idx on public.service_requests(status, created_at desc);
create index if not exists service_requests_phone_idx on public.service_requests(phone);

alter table public.service_requests enable row level security;

-- Policies:
-- 1. Anyone (guests or members) can submit a service quote/order
drop policy if exists "qozob_service_requests_insert" on public.service_requests;
create policy "qozob_service_requests_insert" on public.service_requests
  for insert to anon, authenticated with check (true);

-- 2. Authenticated users can view their own requests
drop policy if exists "qozob_service_requests_user_read" on public.service_requests;
create policy "qozob_service_requests_user_read" on public.service_requests
  for select to authenticated using (user_id = auth.uid() or public.is_admin());

-- 3. Admins can update/manage all service requests
drop policy if exists "qozob_service_requests_admin_all" on public.service_requests;
create policy "qozob_service_requests_admin_all" on public.service_requests
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Touch trigger
create or replace function public.touch_service_requests()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists touch_service_requests on public.service_requests;
create trigger touch_service_requests
  before update on public.service_requests
  for each row execute function public.touch_service_requests();

-- -------------------------------------------------------------------------------------
-- 3. "MY GARAGE" (user_vehicles table)
-- -------------------------------------------------------------------------------------

create table if not exists public.user_vehicles (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users(id) on delete cascade,
  plate_number          text not null,
  vehicle_make          text,
  vehicle_model         text,
  vehicle_year          text,
  color                 text,
  insurance_type        text default 'third_party' check (insurance_type in ('third_party', 'comprehensive', 'none')),
  insurance_expiry      date,
  license_expiry        date,
  roadworthiness_expiry date,
  has_tracker           boolean not null default false,
  tracker_installed_at  date,
  notes                 text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists user_vehicles_user_idx on public.user_vehicles(user_id, created_at desc);

alter table public.user_vehicles enable row level security;

drop policy if exists "qozob_user_vehicles_user" on public.user_vehicles;
create policy "qozob_user_vehicles_user" on public.user_vehicles
  for all to authenticated
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

-- Touch trigger
create or replace function public.touch_user_vehicles()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists touch_user_vehicles on public.user_vehicles;
create trigger touch_user_vehicles
  before update on public.user_vehicles
  for each row execute function public.touch_user_vehicles();

-- -------------------------------------------------------------------------------------
-- 4. "FUEL & FLEET LOGBOOK" (fuel_logs table)
-- -------------------------------------------------------------------------------------

create table if not exists public.fuel_logs (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  vehicle_id          uuid references public.user_vehicles(id) on delete set null,
  log_type            text not null default 'vehicle' check (log_type in ('vehicle', 'generator')),
  label               text, -- e.g. "Toyota Corolla" or "Lister 20kVA Generator"
  fuel_type           text not null default 'pms' check (fuel_type in ('pms', 'ago', 'dpk', 'cng', 'lpg')),
  station_id          text,
  station_name        text,
  price_per_litre     numeric(10,2) not null check (price_per_litre > 0),
  litres_bought       numeric(10,2) not null check (litres_bought > 0),
  total_amount        numeric(12,2) not null check (total_amount > 0),
  odometer_km         numeric(10,1) check (odometer_km is null or odometer_km >= 0),
  engine_hours        numeric(10,1) check (engine_hours is null or engine_hours >= 0),
  receipt_url         text,
  notes               text,
  logged_at           date not null default current_date,
  created_at          timestamptz not null default now()
);

create index if not exists fuel_logs_user_idx on public.fuel_logs(user_id, logged_at desc);

alter table public.fuel_logs enable row level security;

drop policy if exists "qozob_fuel_logs_user" on public.fuel_logs;
create policy "qozob_fuel_logs_user" on public.fuel_logs
  for all to authenticated
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

-- -------------------------------------------------------------------------------------
-- 5. PUBLIC VIEW OR RPC FOR ACTIVE LGA REWARD STATUS
-- -------------------------------------------------------------------------------------
create or replace function public.lga_reward_status(p_lga_id integer)
returns json language plpgsql stable security definer set search_path = '' as $$
declare
  cfg                 public.reward_settings%rowtype;
  v_today             date := public._lagos_today();
  v_ms                date := date_trunc('month', v_today)::date;
  v_me                date := (date_trunc('month', v_today) + interval '1 month - 1 day')::date;
  v_updates           bigint;
  v_stations          bigint;
  v_participants      bigint;
  v_is_active_scope   boolean;
begin
  select * into cfg from public.reward_settings where id;

  v_is_active_scope := (cfg.active_payout_scope = 'all')
                       or (cfg.active_lga_ids is not null and p_lga_id = any (cfg.active_lga_ids));

  select count(*)::bigint,
         count(distinct r.station_id)::bigint,
         count(distinct r.user_id)::bigint
    into v_updates, v_stations, v_participants
    from public.price_reports r
   where r.status = 'accepted'
     and r.lga_id = p_lga_id
     and r.lagos_day between v_ms and v_me;

  return json_build_object(
    'lga_id', p_lga_id,
    'month_start', v_ms,
    'month_end', v_me,
    'in_active_scope', v_is_active_scope,
    'current_updates', v_updates,
    'min_updates_required', cfg.min_lga_updates_quorum,
    'current_stations', v_stations,
    'min_stations_required', cfg.min_lga_stations_quorum,
    'current_participants', v_participants,
    'min_participants_required', cfg.min_lga_participants_quorum,
    'quorum_met', (v_is_active_scope and v_updates >= cfg.min_lga_updates_quorum
                   and v_stations >= cfg.min_lga_stations_quorum
                   and v_participants >= cfg.min_lga_participants_quorum),
    'prize_ngn', cfg.monthly_prize_ngn,
    'voucher_value_ngn', round(cfg.monthly_prize_ngn * (1.0 + (cfg.voucher_bonus_pct / 100.0)))
  );
end $$;

grant execute on function public.lga_reward_status(integer) to anon, authenticated;

