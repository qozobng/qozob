-- =====================================================================================
--  QOZOB 20261107: VEHICLE DETAILS, TIERED PRICING, NEW SERVICES, DOCUMENT VAULT & REMINDERS
--  Run ONCE in Supabase → SQL Editor → New query → paste everything → Run.
--  • Safe to re-run (idempotent).
--  • Requires 20261013 (auto services) and 20261106 (service pricing & partner portal).
--
--  What this does:
--   1. Vehicle body type, engine/body pricing tier, private/commercial usage, POC &
--      Hackney expiry dates, and automated email reminder settings on user_vehicles.
--   2. Engine-capacity / body-type tiered pricing (tier_prices JSONB) + Comprehensive
--      Insurance percentage rate (rate_percent, min_price) on service_catalog,
--      service_state_prices, service_price_proposals, and service_price_history.
--   3. Seeds 9 new CarPaddy+ auto services:
--        • Annual Proof of Ownership Certificate (POC) Renewal
--        • FRSC Learner's Permit (3 Months + L-Plate)
--        • Nigerian Driver's License Renewal / Re-issue
--        • Police Tinted Glass Permit (NPF Biometric)
--        • Commercial Haulage & Heavy-Duty Vehicle Permit
--        • Dispatch Rider Card & Commercial Motorcycle Permit
--        • Comprehensive Auto Insurance (Rate % Calculator)
--        • Customised / Fancy Number Plate (JTB / FRSC)
--        • Lost / Damaged Number Plate Replacement
--   4. Digital Document Vault (public.vehicle_documents) so users, admins, and partner
--      agents can store and download renewed certificates, auto-syncing expiry dates.
--   5. Automated Email Expiry Reminder tracking (public.vehicle_reminder_logs).
-- =====================================================================================

begin;

-- -------------------------------------------------------------------------------------
-- 0. PRE-FLIGHT
-- -------------------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.user_vehicles') is null then
    raise exception 'user_vehicles not found. Run 20261013_monetization_and_services.sql first.';
  end if;
  if to_regclass('public.service_catalog') is null then
    raise exception 'service_catalog not found. Run 20261106_service_pricing.sql first.';
  end if;
end $$;

-- -------------------------------------------------------------------------------------
-- 1. USER VEHICLES: body type, engine/body tier, usage, extra expiries & email alerts
-- -------------------------------------------------------------------------------------
alter table public.user_vehicles
  add column if not exists vehicle_type text check (vehicle_type is null or char_length(vehicle_type) <= 40),
  add column if not exists vehicle_tier text check (vehicle_tier is null or vehicle_tier in (
    'saloon_small', 'saloon_large', 'suv_pickup', 'bus', 'truck', 'motorcycle'
  )),
  add column if not exists vehicle_usage text not null default 'private'
    check (vehicle_usage in ('private', 'commercial')),
  add column if not exists poc_expiry date,
  add column if not exists hackney_expiry date,
  add column if not exists reminder_enabled boolean not null default true,
  add column if not exists last_reminder_sent_at timestamptz,
  add column if not exists last_reminder_milestone text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'user_vehicles_year_chk') then
    alter table public.user_vehicles
      add constraint user_vehicles_year_chk
      check (vehicle_year is null or vehicle_year ~ '^(19|20)[0-9]{2}$') not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'service_requests_year_chk') then
    alter table public.service_requests
      add constraint service_requests_year_chk
      check (vehicle_year is null or vehicle_year ~ '^(19|20)[0-9]{2}$') not valid;
  end if;
end $$;

-- -------------------------------------------------------------------------------------
-- 2. ENGINE-CAPACITY / BODY-TYPE TIERED PRICING & COMPREHENSIVE INSURANCE RATE %
-- -------------------------------------------------------------------------------------
alter table public.service_catalog
  add column if not exists tier_prices jsonb not null default '{}'::jsonb,
  add column if not exists rate_percent numeric(5,2) check (rate_percent is null or (rate_percent >= 0 and rate_percent <= 100)),
  add column if not exists min_price numeric(12,2) check (min_price is null or min_price >= 0);

alter table public.service_state_prices
  add column if not exists tier_prices jsonb not null default '{}'::jsonb;

alter table public.service_price_proposals
  add column if not exists tier_prices jsonb,
  add column if not exists rate_percent numeric(5,2) check (rate_percent is null or (rate_percent >= 0 and rate_percent <= 100));

alter table public.service_price_history
  add column if not exists old_tier_prices jsonb,
  add column if not exists new_tier_prices jsonb,
  add column if not exists old_rate_percent numeric(5,2),
  add column if not exists new_rate_percent numeric(5,2);

-- Seed default engine/body-type tiers on existing statutory services (only if tier_prices is still empty)
update public.service_catalog
   set tier_prices = '{
     "saloon_small": {"private": 15000, "commercial": 20000},
     "saloon_large": {"private": 15000, "commercial": 20000},
     "suv_pickup":   {"private": 15000, "commercial": 25000},
     "bus":          {"private": 20000, "commercial": 25000},
     "truck":        {"private": 100000, "commercial": 100000},
     "motorcycle":   {"private": 3000, "commercial": 5000}
   }'::jsonb
 where id = 'insurance_3rd_party' and tier_prices = '{}'::jsonb;

update public.service_catalog
   set tier_prices = '{
     "saloon_small": {"private": 4500, "commercial": 6500},
     "saloon_large": {"private": 5500, "commercial": 7500},
     "suv_pickup":   {"private": 6500, "commercial": 9000},
     "bus":          {"private": 8500, "commercial": 11500},
     "truck":        {"private": 18000, "commercial": 25000},
     "motorcycle":   {"private": 2500, "commercial": 3500}
   }'::jsonb
 where id = 'vehicle_license' and tier_prices = '{}'::jsonb;

update public.service_catalog
   set tier_prices = '{
     "saloon_small": {"private": 6500, "commercial": 8500},
     "saloon_large": {"private": 7500, "commercial": 9500},
     "suv_pickup":   {"private": 8500, "commercial": 11000},
     "bus":          {"private": 10500, "commercial": 14000},
     "truck":        {"private": 22000, "commercial": 28000},
     "motorcycle":   {"private": 3000, "commercial": 4000}
   }'::jsonb
 where id = 'roadworthiness' and tier_prices = '{}'::jsonb;

update public.service_catalog
   set tier_prices = '{
     "saloon_small": {"private": 0, "commercial": 6000},
     "saloon_large": {"private": 0, "commercial": 6000},
     "suv_pickup":   {"private": 0, "commercial": 7500},
     "bus":          {"private": 0, "commercial": 9500},
     "truck":        {"private": 0, "commercial": 18000},
     "motorcycle":   {"private": 0, "commercial": 3500}
   }'::jsonb
 where id = 'hackney_permit' and tier_prices = '{}'::jsonb;

update public.service_catalog
   set tier_prices = '{
     "saloon_small": {"private": 48000, "commercial": 58000},
     "saloon_large": {"private": 52000, "commercial": 62000},
     "suv_pickup":   {"private": 56000, "commercial": 66000},
     "bus":          {"private": 65000, "commercial": 75000},
     "truck":        {"private": 95000, "commercial": 115000},
     "motorcycle":   {"private": 28000, "commercial": 32000}
   }'::jsonb
 where id = 'new_plate_number' and tier_prices = '{}'::jsonb;

-- Seed the 9 new services
insert into public.service_catalog (
  id, title, category, description, statutory, turnaround,
  private_price, commercial_price, tier_prices, rate_percent, min_price, sort_order
) values
  ('proof_of_ownership',
   'Annual Proof of Ownership Certificate (POC) Renewal',
   'papers_renewal',
   'Mandatory Joint Tax Board (JTB) annual Proof of Ownership Certificate renewal verifying legal title on the national database.',
   true, '24–48 hours', 3000, 3500,
   '{
     "saloon_small": {"private": 3000, "commercial": 3500},
     "saloon_large": {"private": 3000, "commercial": 3500},
     "suv_pickup":   {"private": 3000, "commercial": 4000},
     "bus":          {"private": 3500, "commercial": 4500},
     "truck":        {"private": 5000, "commercial": 6000},
     "motorcycle":   {"private": 2000, "commercial": 2500}
   }'::jsonb,
   null, null, 25),

  ('comprehensive_insurance',
   'Comprehensive Auto Insurance (Full Cover + Flood, Fire & Theft)',
   'auto_insurance',
   'Full-value NAICOM/NIID-registered motor insurance covering accidental collision damage, vehicle theft, fire, flood extension, and up to ₦3,000,000 third-party liability.',
   false, '24 hours', 45000, 65000, '{}'::jsonb, 3.50, 45000, 15),

  ('heavy_duty_haulage_permit',
   'Commercial Haulage & Heavy-Duty Vehicle Permit',
   'papers_renewal',
   'Unified state haulage, heavy-duty carriage, environmental mobile emission & inter-state transit permit for buses, coasters, trucks, and tankers.',
   true, '24–48 hours', 0, 25000,
   '{
     "saloon_small": {"private": 0, "commercial": 12000},
     "saloon_large": {"private": 0, "commercial": 12000},
     "suv_pickup":   {"private": 0, "commercial": 18000},
     "bus":          {"private": 18000, "commercial": 22000},
     "truck":        {"private": 35000, "commercial": 45000},
     "motorcycle":   {"private": 0, "commercial": 8000}
   }'::jsonb,
   null, null, 42),

  ('dispatch_rider_permit',
   'Dispatch Rider Card & Commercial Motorcycle Permit',
   'papers_renewal',
   'Statutory State Rider’s Card, MOT / courier carriage emblem, and local government permit for dispatch bikes and commercial tricycles (Keke).',
   true, '48–72 hours', 15000, 15000,
   '{
     "motorcycle": {"private": 15000, "commercial": 15000}
   }'::jsonb,
   null, null, 44),

  ('tinted_glass_permit',
   'Police Tinted Glass Permit (NPF Digital Biometric)',
   'papers_renewal',
   'Official Nigeria Police Force (NPF POSSAP) tinted-window permit processing with QR verification slip.',
   true, '3–5 working days', 35000, 35000, '{}'::jsonb, null, null, 52),

  ('learners_permit',
   'FRSC Learner’s Permit (3 Months + Official L-Plate)',
   'papers_renewal',
   'Official Federal Road Safety Corps (FRSC) 3-month learner’s driving permit and highway code pack for new drivers.',
   true, '24–48 hours', 6500, 6500, '{}'::jsonb, null, null, 55),

  ('drivers_license_renewal',
   'Nigerian Driver’s License Renewal / Re-issue (3 or 5 Years)',
   'papers_renewal',
   'Fast-track FRSC Driver’s License renewal or lost/damaged license replacement with instant temporary slip and DLC capture support.',
   true, '3–7 working days', 28000, 28000, '{}'::jsonb, null, null, 56),

  ('custom_plate_number',
   'Customised / Fancy Plate Number (JTB / FRSC Official)',
   'new_registration',
   'Personalised Joint Tax Board (JTB) & FRSC custom vehicle number plate (up to 8 characters, e.g. ODOGWU-1) with Proof of Ownership and allocation certificate.',
   false, '2–4 weeks', 250000, 250000, '{}'::jsonb, null, null, 72),

  ('plate_replacement',
   'Lost or Damaged Number Plate Replacement',
   'new_registration',
   'Official FRSC replacement of lost, stolen, or defaced vehicle number plates, including police extract and court affidavit processing.',
   true, '5–10 working days', 38000, 42000, '{}'::jsonb, null, null, 74)
on conflict (id) do nothing;

-- -------------------------------------------------------------------------------------
-- 3. DIGITAL DOCUMENT VAULT & AUTOMATED EMAIL REMINDER LOGS
-- -------------------------------------------------------------------------------------
create table if not exists public.vehicle_documents (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users (id) on delete cascade,
  vehicle_id         uuid references public.user_vehicles (id) on delete cascade,
  service_request_id uuid references public.service_requests (id) on delete set null,
  doc_type           text not null check (doc_type in (
    'insurance', 'vehicle_license', 'roadworthiness', 'proof_of_ownership',
    'hackney_permit', 'cmris', 'custom_plate', 'drivers_license',
    'learners_permit', 'tinted_permit', 'haulage_permit', 'other'
  )),
  title              text not null check (char_length(title) between 2 and 160),
  file_url           text not null check (char_length(file_url) between 5 and 600000),
  reference_number   text check (reference_number is null or char_length(reference_number) <= 80),
  issued_date        date,
  expiry_date        date,
  uploaded_by_role   text not null default 'user' check (uploaded_by_role in ('user', 'admin', 'partner')),
  uploaded_by        uuid default auth.uid(),
  created_at         timestamptz not null default now()
);
create index if not exists vehicle_documents_user_idx on public.vehicle_documents (user_id, created_at desc);
create index if not exists vehicle_documents_vehicle_idx on public.vehicle_documents (vehicle_id, created_at desc);

alter table public.vehicle_documents enable row level security;

drop policy if exists "qozob_vehicle_documents_read" on public.vehicle_documents;
create policy "qozob_vehicle_documents_read" on public.vehicle_documents for select to authenticated
  using (
    user_id = auth.uid()
    or (select public.admin_can('services'))
    or (service_request_id is not null and exists (
      select 1 from public.service_requests sr
       where sr.id = vehicle_documents.service_request_id
         and sr.partner_id is not null
         and sr.partner_id = (select public.my_partner_id())
    ))
  );

drop policy if exists "qozob_vehicle_documents_insert_own" on public.vehicle_documents;
create policy "qozob_vehicle_documents_insert_own" on public.vehicle_documents for insert to authenticated
  with check (
    (user_id = auth.uid() and uploaded_by_role = 'user')
    or (select public.admin_can('services'))
  );

drop policy if exists "qozob_vehicle_documents_delete_own" on public.vehicle_documents;
create policy "qozob_vehicle_documents_delete_own" on public.vehicle_documents for delete to authenticated
  using (user_id = auth.uid() or (select public.admin_can('services')));

grant select, insert, delete on public.vehicle_documents to authenticated;

-- Save a document to the vault and automatically sync the vehicle's expiry date
create or replace function public.save_vehicle_document(p jsonb)
returns json language plpgsql security definer set search_path = '' as $$
declare
  v_uid        uuid := auth.uid();
  v_is_admin   boolean := public.admin_can('services');
  v_pid        uuid := public.my_partner_id();
  v_owner      uuid;
  v_vid        uuid := nullif(btrim(coalesce(p ->> 'vehicle_id', '')), '')::uuid;
  v_req_id     uuid := nullif(btrim(coalesce(p ->> 'service_request_id', '')), '')::uuid;
  v_doc_type   text := lower(btrim(coalesce(p ->> 'doc_type', 'other')));
  v_title      text := btrim(coalesce(p ->> 'title', ''));
  v_url        text := btrim(coalesce(p ->> 'file_url', ''));
  v_ref        text := nullif(btrim(coalesce(p ->> 'reference_number', '')), '');
  v_issued     date := nullif(btrim(coalesce(p ->> 'issued_date', '')), '')::date;
  v_expiry     date := nullif(btrim(coalesce(p ->> 'expiry_date', '')), '')::date;
  v_role       text := 'user';
  v_doc_id     uuid;
begin
  if v_uid is null then raise exception 'Please sign in first.' using errcode = '42501'; end if;

  if v_vid is not null then
    select uv.user_id into v_owner from public.user_vehicles uv where uv.id = v_vid;
    if v_owner is null then raise exception 'Vehicle not found.'; end if;
  elsif v_req_id is not null then
    select sr.user_id into v_owner from public.service_requests sr where sr.id = v_req_id;
  else
    v_owner := v_uid;
  end if;

  if v_owner = v_uid then
    v_role := 'user';
  elsif v_is_admin then
    v_role := 'admin';
  elsif v_pid is not null and v_req_id is not null and exists (
    select 1 from public.service_requests sr where sr.id = v_req_id and sr.partner_id = v_pid
  ) then
    v_role := 'partner';
  else
    raise exception 'Not authorised to upload a document for this vehicle.' using errcode = '42501';
  end if;

  if v_owner is null then
    raise exception 'This request is not linked to a registered user account.';
  end if;

  if char_length(v_title) < 2 then raise exception 'Enter a document title.'; end if;
  if char_length(v_url) < 5 then raise exception 'Provide a document file or verification link.'; end if;

  insert into public.vehicle_documents (
    user_id, vehicle_id, service_request_id, doc_type, title, file_url,
    reference_number, issued_date, expiry_date, uploaded_by_role, uploaded_by
  ) values (
    v_owner, v_vid, v_req_id, v_doc_type, v_title, v_url,
    v_ref, v_issued, v_expiry, v_role, v_uid
  ) returning id into v_doc_id;

  -- Automatically sync expiry date onto the vehicle in My Garage
  if v_vid is not null and v_expiry is not null then
    update public.user_vehicles
       set insurance_expiry      = case when v_doc_type = 'insurance' then v_expiry else insurance_expiry end,
           license_expiry        = case when v_doc_type = 'vehicle_license' then v_expiry else license_expiry end,
           roadworthiness_expiry = case when v_doc_type = 'roadworthiness' then v_expiry else roadworthiness_expiry end,
           poc_expiry            = case when v_doc_type = 'proof_of_ownership' then v_expiry else poc_expiry end,
           hackney_expiry        = case when v_doc_type in ('hackney_permit', 'haulage_permit') then v_expiry else hackney_expiry end,
           updated_at            = now()
     where id = v_vid;
  end if;

  return json_build_object('id', v_doc_id, 'vehicle_id', v_vid, 'expiry_synced', (v_vid is not null and v_expiry is not null));
end $$;

-- Automated email expiry reminder audit table
create table if not exists public.vehicle_reminder_logs (
  id              bigint generated always as identity primary key,
  vehicle_id      uuid not null references public.user_vehicles (id) on delete cascade,
  user_id         uuid not null references auth.users (id) on delete cascade,
  email           text not null,
  plate_number    text not null,
  milestone       text not null,
  expiring_items  jsonb not null default '[]'::jsonb,
  provider_id     text,
  sent_at         timestamptz not null default now()
);
create index if not exists vehicle_reminder_logs_vehicle_idx on public.vehicle_reminder_logs (vehicle_id, sent_at desc);
alter table public.vehicle_reminder_logs enable row level security;
drop policy if exists "qozob_vehicle_reminder_logs_read" on public.vehicle_reminder_logs;
create policy "qozob_vehicle_reminder_logs_read" on public.vehicle_reminder_logs for select to authenticated
  using (user_id = auth.uid() or (select public.admin_can('services')));
grant select on public.vehicle_reminder_logs to authenticated;

-- -------------------------------------------------------------------------------------
-- 4. UPGRADED PRICE FUNCTIONS (supporting tier_prices JSONB & rate_percent)
-- -------------------------------------------------------------------------------------
create or replace function public._clean_tier_prices(p jsonb)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare
  v_out jsonb := '{}'::jsonb;
  v_key text;
  v_obj jsonb;
  v_priv numeric;
  v_comm numeric;
begin
  if p is null or jsonb_typeof(p) <> 'object' then return '{}'::jsonb; end if;
  foreach v_key in array array['saloon_small', 'saloon_large', 'suv_pickup', 'bus', 'truck', 'motorcycle'] loop
    if p ? v_key and jsonb_typeof(p -> v_key) = 'object' then
      v_obj := p -> v_key;
      v_priv := nullif(btrim(coalesce(v_obj ->> 'private', '')), '')::numeric;
      v_comm := nullif(btrim(coalesce(v_obj ->> 'commercial', '')), '')::numeric;
      if v_priv is not null and v_priv < 0 then raise exception 'Tier price for % cannot be negative.', v_key; end if;
      if v_comm is not null and v_comm < 0 then raise exception 'Commercial tier price for % cannot be negative.', v_key; end if;
      if v_priv is not null or v_comm is not null then
        v_out := v_out || jsonb_build_object(v_key, jsonb_strip_nulls(jsonb_build_object(
          'private', case when v_priv is not null then round(v_priv, 2) else null end,
          'commercial', case when v_comm is not null then round(v_comm, 2) else null end
        )));
      end if;
    end if;
  end loop;
  return v_out;
end $$;

create or replace function public._apply_service_price_v2(
  p_service_id text, p_state text, p_private numeric, p_commercial numeric,
  p_tier_prices jsonb, p_rate_percent numeric,
  p_source text, p_proposal_id bigint default null, p_partner_id uuid default null, p_note text default null
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_old_p numeric; v_old_c numeric; v_old_t jsonb; v_old_r numeric;
  v_tiers jsonb;
begin
  if p_state is null then
    select c.private_price, c.commercial_price, c.tier_prices, c.rate_percent
      into v_old_p, v_old_c, v_old_t, v_old_r
      from public.service_catalog c where c.id = p_service_id for update;
    v_tiers := case when p_tier_prices is null then coalesce(v_old_t, '{}'::jsonb) else public._clean_tier_prices(p_tier_prices) end;
    update public.service_catalog
       set private_price    = p_private,
           commercial_price = p_commercial,
           tier_prices      = v_tiers,
           rate_percent     = case when p_rate_percent is not null then round(p_rate_percent, 2) else rate_percent end,
           min_price        = case when rate_percent is not null or p_rate_percent is not null then p_private else min_price end,
           updated_at       = now(),
           updated_by       = auth.uid()
     where id = p_service_id;
  else
    select s.private_price, s.commercial_price, s.tier_prices
      into v_old_p, v_old_c, v_old_t
      from public.service_state_prices s where s.service_id = p_service_id and s.state = p_state for update;
    v_tiers := case when p_tier_prices is null then coalesce(v_old_t, '{}'::jsonb) else public._clean_tier_prices(p_tier_prices) end;
    insert into public.service_state_prices as s (service_id, state, private_price, commercial_price, tier_prices, updated_at, updated_by)
    values (p_service_id, p_state, p_private, p_commercial, v_tiers, now(), auth.uid())
    on conflict (service_id, state) do update
       set private_price    = excluded.private_price,
           commercial_price = excluded.commercial_price,
           tier_prices      = excluded.tier_prices,
           updated_at       = now(),
           updated_by       = auth.uid();
  end if;

  insert into public.service_price_history (
    service_id, state, old_private, old_commercial, new_private, new_commercial,
    old_tier_prices, new_tier_prices, old_rate_percent, new_rate_percent,
    source, proposal_id, partner_id, note
  ) values (
    p_service_id, p_state, v_old_p, v_old_c, p_private, p_commercial,
    v_old_t, v_tiers, v_old_r, case when p_state is null then coalesce(round(p_rate_percent, 2), v_old_r) else null end,
    p_source, p_proposal_id, p_partner_id, p_note
  );
end $$;

-- Drop old 5-arg signature before creating the 7-arg signature with defaults so 5-arg calls still resolve unambiguously
drop function if exists public.admin_set_service_price(text, text, numeric, numeric, text);
create or replace function public.admin_set_service_price(
  p_service_id text, p_state text, p_private numeric,
  p_commercial numeric default null, p_note text default null,
  p_tier_prices jsonb default null, p_rate_percent numeric default null
)
returns json language plpgsql security definer set search_path = '' as $$
declare v_state text := public._clean_state(p_state);
begin
  if not public.admin_can('services') then
    raise exception 'Not authorised: your admin account does not have access to auto services.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.service_catalog c where c.id = p_service_id) then raise exception 'Service not found.'; end if;
  if p_private is null or p_private < 0 then raise exception 'Enter the price for private vehicles (0 or more).'; end if;
  if p_commercial is not null and p_commercial < 0 then raise exception 'The commercial price cannot be negative.'; end if;
  if p_rate_percent is not null and (p_rate_percent < 0 or p_rate_percent > 100) then
    raise exception 'Percentage rate must be between 0 and 100.';
  end if;

  perform public._apply_service_price_v2(
    p_service_id, v_state, round(p_private, 2), round(p_commercial, 2),
    p_tier_prices, p_rate_percent, 'admin', null, null, nullif(btrim(coalesce(p_note, '')), '')
  );

  update public.service_price_proposals
     set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(),
         review_note = 'Replaced by an admin price change'
   where service_id = p_service_id and coalesce(state, '') = coalesce(v_state, '') and status = 'pending';

  return json_build_object(
    'service_id', p_service_id, 'state', v_state,
    'private_price', p_private, 'commercial_price', p_commercial
  );
end $$;

drop function if exists public.partner_propose_price(text, text, numeric, numeric, text);
create or replace function public.partner_propose_price(
  p_service_id text, p_state text, p_private numeric,
  p_commercial numeric default null, p_note text default null,
  p_tier_prices jsonb default null, p_rate_percent numeric default null
)
returns json language plpgsql security definer set search_path = '' as $$
declare
  v_pid   uuid := public.my_partner_id();
  v_state text := public._clean_state(p_state);
  pt      public.service_partners%rowtype;
  c       public.service_catalog%rowtype;
  v_cp    numeric; v_cc numeric;
  v_id    bigint;
begin
  if v_pid is null then raise exception 'Only partner company agents can propose prices.' using errcode = '42501'; end if;
  select * into pt from public.service_partners where id = v_pid;
  select * into c from public.service_catalog where id = p_service_id;
  if not found then raise exception 'Service not found.'; end if;
  if not (c.category = any (pt.categories)) then raise exception 'Your company does not offer this service on Qozob.'; end if;
  if v_state is not null and cardinality(pt.states) > 0 and not (v_state = any (pt.states)) then
    raise exception 'Your company does not work in %.', v_state;
  end if;
  if v_state is null and cardinality(pt.states) > 0 then
    raise exception 'Your company works in selected states only. Propose a price for one of your states.';
  end if;
  if p_private is null or p_private < 0 then raise exception 'Enter the price for private vehicles (0 or more).'; end if;
  if p_commercial is not null and p_commercial < 0 then raise exception 'The commercial price cannot be negative.'; end if;
  if p_rate_percent is not null and (p_rate_percent < 0 or p_rate_percent > 100) then
    raise exception 'Percentage rate must be between 0 and 100.';
  end if;

  if v_state is null then
    v_cp := c.private_price; v_cc := c.commercial_price;
  else
    select coalesce(s.private_price, c.private_price), case when s.service_id is null then c.commercial_price else s.commercial_price end
      into v_cp, v_cc
      from (select 1) one left join public.service_state_prices s on s.service_id = c.id and s.state = v_state;
  end if;

  update public.service_price_proposals set status = 'withdrawn'
   where partner_id = v_pid and service_id = p_service_id and coalesce(state, '') = coalesce(v_state, '') and status = 'pending';

  insert into public.service_price_proposals (
    service_id, state, private_price, commercial_price, current_private, current_commercial,
    tier_prices, rate_percent, partner_id, note
  ) values (
    p_service_id, v_state, round(p_private, 2), round(p_commercial, 2), v_cp, v_cc,
    case when p_tier_prices is null then null else public._clean_tier_prices(p_tier_prices) end,
    round(p_rate_percent, 2), v_pid, nullif(btrim(coalesce(p_note, '')), '')
  ) returning id into v_id;

  return json_build_object('id', v_id, 'status', 'pending');
end $$;

create or replace function public.admin_review_price_proposal(p_id bigint, p_approve boolean, p_note text default null)
returns json language plpgsql security definer set search_path = '' as $$
declare pr public.service_price_proposals%rowtype;
begin
  if not public.admin_can('services') then
    raise exception 'Not authorised: your admin account does not have access to auto services.' using errcode = '42501';
  end if;
  select * into pr from public.service_price_proposals where id = p_id for update;
  if not found or pr.status <> 'pending' then raise exception 'This proposal is not waiting for review.'; end if;
  if p_approve then
    perform public._apply_service_price_v2(
      pr.service_id, pr.state, pr.private_price, pr.commercial_price,
      pr.tier_prices, pr.rate_percent,
      'proposal', pr.id, pr.partner_id,
      coalesce(nullif(btrim(coalesce(p_note, '')), ''), pr.note)
    );
  end if;
  update public.service_price_proposals
     set status = case when p_approve then 'approved' else 'rejected' end,
         reviewed_by = auth.uid(), reviewed_at = now(), review_note = nullif(btrim(coalesce(p_note, '')), '')
   where id = p_id;
  return json_build_object('id', p_id, 'status', case when p_approve then 'approved' else 'rejected' end);
end $$;

create or replace function public.admin_service_overview()
returns json language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.admin_can('services') then
    raise exception 'Not authorised: your admin account does not have access to auto services.' using errcode = '42501';
  end if;
  return json_build_object(
    'services', (select coalesce(json_agg(json_build_object(
                    'id', c.id, 'title', c.title, 'category', c.category, 'description', c.description, 'statutory', c.statutory,
                    'turnaround', c.turnaround, 'private_price', c.private_price, 'commercial_price', c.commercial_price,
                    'tier_prices', coalesce(c.tier_prices, '{}'::jsonb), 'rate_percent', c.rate_percent, 'min_price', c.min_price,
                    'currency', c.currency, 'is_active', c.is_active, 'sort_order', c.sort_order, 'updated_at', c.updated_at,
                    'updated_by_email', u.email,
                    'state_prices', (select coalesce(json_agg(json_build_object(
                                                                'state', s.state, 'private_price', s.private_price,
                                                                'commercial_price', s.commercial_price,
                                                                'tier_prices', coalesce(s.tier_prices, '{}'::jsonb),
                                                                'updated_at', s.updated_at)
                                                              order by s.state), '[]'::json)
                                       from public.service_state_prices s where s.service_id = c.id),
                    'pending', (select count(*) from public.service_price_proposals pp where pp.service_id = c.id and pp.status = 'pending')
                 ) order by c.sort_order, c.title), '[]'::json)
                   from public.service_catalog c left join auth.users u on u.id = c.updated_by),
    'partners', (select coalesce(json_agg(json_build_object(
                    'id', p.id, 'name', p.name, 'contact_email', p.contact_email, 'contact_phone', p.contact_phone,
                    'categories', p.categories, 'states', p.states, 'is_active', p.is_active, 'note', p.note, 'created_at', p.created_at,
                    'members', (select coalesce(json_agg(json_build_object('user_id', m.user_id, 'role', m.role, 'email', mu.email,
                                   'name', nullif(btrim(concat_ws(' ', mu.raw_user_meta_data ->> 'first_name', mu.raw_user_meta_data ->> 'last_name')), ''),
                                   'last_sign_in_at', mu.last_sign_in_at) order by m.role, mu.email), '[]'::json)
                                  from public.service_partner_members m join auth.users mu on mu.id = m.user_id
                                 where m.partner_id = p.id),
                    'open_requests', (select count(*) from public.service_requests sr
                                       where sr.partner_id = p.id and sr.status not in ('completed', 'cancelled')),
                    'done_requests', (select count(*) from public.service_requests sr where sr.partner_id = p.id and sr.status = 'completed')
                 ) order by p.is_active desc, p.name), '[]'::json)
                   from public.service_partners p),
    'proposals', (select coalesce(json_agg(json_build_object(
                    'id', pp.id, 'service_id', pp.service_id, 'service_title', c.title, 'state', pp.state,
                    'private_price', pp.private_price, 'commercial_price', pp.commercial_price,
                    'tier_prices', pp.tier_prices, 'rate_percent', pp.rate_percent,
                    'current_private', pp.current_private, 'current_commercial', pp.current_commercial,
                    'partner_id', pp.partner_id, 'partner_name', pt.name, 'proposed_by_email', u.email, 'note', pp.note,
                    'status', pp.status, 'review_note', pp.review_note, 'reviewed_at', pp.reviewed_at, 'reviewer_email', rv.email,
                    'created_at', pp.created_at
                 ) order by (pp.status = 'pending') desc, pp.created_at desc), '[]'::json)
                   from (select * from public.service_price_proposals order by (status = 'pending') desc, created_at desc limit 300) pp
                   left join public.service_catalog c on c.id = pp.service_id
                   left join public.service_partners pt on pt.id = pp.partner_id
                   left join auth.users u on u.id = pp.proposed_by
                   left join auth.users rv on rv.id = pp.reviewed_by),
    'history', (select coalesce(json_agg(json_build_object(
                    'id', h.id, 'service_id', h.service_id, 'service_title', c.title, 'state', h.state,
                    'old_private', h.old_private, 'old_commercial', h.old_commercial, 'new_private', h.new_private,
                    'new_commercial', h.new_commercial, 'old_tier_prices', h.old_tier_prices, 'new_tier_prices', h.new_tier_prices,
                    'old_rate_percent', h.old_rate_percent, 'new_rate_percent', h.new_rate_percent,
                    'source', h.source, 'partner_name', pt.name,
                    'changed_by_email', u.email, 'note', h.note, 'created_at', h.created_at
                 ) order by h.created_at desc), '[]'::json)
                  from (select * from public.service_price_history order by created_at desc limit 500) h
                  left join public.service_catalog c on c.id = h.service_id
                  left join public.service_partners pt on pt.id = h.partner_id
                  left join auth.users u on u.id = h.changed_by)
  );
end $$;

create or replace function public.my_partner_portal()
returns json language plpgsql stable security definer set search_path = '' as $$
declare
  v_pid  uuid := public.my_partner_id();
  pt     public.service_partners%rowtype;
  v_role text;
begin
  if v_pid is null then return null; end if;
  select * into pt from public.service_partners where id = v_pid;
  select m.role into v_role from public.service_partner_members m where m.partner_id = v_pid and m.user_id = auth.uid();
  return json_build_object(
    'partner', json_build_object('id', pt.id, 'name', pt.name, 'categories', pt.categories, 'states', pt.states, 'role', v_role),
    'services', (select coalesce(json_agg(json_build_object(
                    'id', c.id, 'title', c.title, 'category', c.category, 'private_price', c.private_price,
                    'commercial_price', c.commercial_price, 'tier_prices', coalesce(c.tier_prices, '{}'::jsonb),
                    'rate_percent', c.rate_percent, 'min_price', c.min_price,
                    'currency', c.currency, 'is_active', c.is_active,
                    'state_prices', (select coalesce(json_agg(json_build_object(
                                                                'state', s.state, 'private_price', s.private_price,
                                                                'commercial_price', s.commercial_price,
                                                                'tier_prices', coalesce(s.tier_prices, '{}'::jsonb)
                                                              ) order by s.state), '[]'::json)
                                       from public.service_state_prices s
                                      where s.service_id = c.id and (cardinality(pt.states) = 0 or s.state = any (pt.states)))
                 ) order by c.sort_order, c.title), '[]'::json)
                   from public.service_catalog c where c.category = any (pt.categories)),
    'proposals', (select coalesce(json_agg(json_build_object(
                    'id', pp.id, 'service_id', pp.service_id, 'service_title', c.title, 'state', pp.state,
                    'private_price', pp.private_price, 'commercial_price', pp.commercial_price,
                    'tier_prices', pp.tier_prices, 'rate_percent', pp.rate_percent,
                    'current_private', pp.current_private, 'current_commercial', pp.current_commercial,
                    'note', pp.note, 'status', pp.status, 'review_note', pp.review_note, 'reviewed_at', pp.reviewed_at,
                    'created_at', pp.created_at
                 ) order by pp.created_at desc), '[]'::json)
                    from (select * from public.service_price_proposals where partner_id = v_pid order by created_at desc limit 100) pp
                    left join public.service_catalog c on c.id = pp.service_id),
    'requests', (select coalesce(json_agg(json_build_object(
                    'id', r.id, 'service_category', r.service_category, 'service_name', r.service_name, 'full_name', r.full_name,
                    'phone', r.phone, 'email', r.email, 'state', r.state, 'lga', r.lga, 'delivery_address', r.delivery_address,
                    'vehicle_make', r.vehicle_make, 'vehicle_model', r.vehicle_model, 'vehicle_year', r.vehicle_year,
                    'plate_number', r.plate_number, 'chassis_number', r.chassis_number, 'details', r.details,
                    'status', r.status, 'estimated_price', r.estimated_price, 'quoted_price', r.quoted_price,
                    'payment_status', r.payment_status, 'admin_notes', r.admin_notes,
                    'partner_assigned_at', r.partner_assigned_at, 'created_at', r.created_at, 'updated_at', r.updated_at
                 ) order by (r.status in ('completed', 'cancelled')), r.created_at desc), '[]'::json)
                   from public.service_requests r where r.partner_id = v_pid)
  );
end $$;

-- -------------------------------------------------------------------------------------
-- 5. PERMISSIONS
-- -------------------------------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array[
    'public._clean_tier_prices(jsonb)',
    'public._apply_service_price_v2(text, text, numeric, numeric, jsonb, numeric, text, bigint, uuid, text)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;

  foreach f in array array[
    'public.admin_set_service_price(text, text, numeric, numeric, text, jsonb, numeric)',
    'public.partner_propose_price(text, text, numeric, numeric, text, jsonb, numeric)',
    'public.admin_review_price_proposal(bigint, boolean, text)',
    'public.admin_service_overview()',
    'public.my_partner_portal()',
    'public.save_vehicle_document(jsonb)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

commit;

-- Summary
select 'Total services in catalog' as item, (select count(*)::text from public.service_catalog) as value
union all select 'Services with tiered pricing', (select count(*)::text from public.service_catalog where tier_prices <> '{}'::jsonb)
union all select 'Documents in vault', (select count(*)::text from public.vehicle_documents);
