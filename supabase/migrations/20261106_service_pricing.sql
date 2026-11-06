-- =====================================================================================
--  QOZOB 20261106: AUTO-SERVICE PRICES + PARTNER COMPANIES
--  Run ONCE in Supabase → SQL Editor → New query → paste everything → Run.
--  • Safe to re-run.  • All-or-nothing (one transaction).
--  • Requires 20261013 (auto services) and 20261014 (admin access levels).
--
--  What this does
--   1. Service price list in the database (was fixed in the app): price for private and
--      commercial vehicles, plus an optional different price per state (e.g. Lagos vs Abuja).
--      Seeded with today's prices, so nothing changes for customers until you edit them.
--   2. Admins with "Auto services" access change prices straight away. Every change is logged.
--   3. Partner companies (insurers, papers agents, tracker installers): their agents sign in to
--      a partner portal, PROPOSE prices for the services they deliver (live only after an admin
--      approves), and work on the requests assigned to their company.
--   4. Admins assign service requests to a partner.
-- =====================================================================================

begin;

-- -------------------------------------------------------------------------------------
-- 0. PRE-FLIGHT
-- -------------------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.service_requests') is null then
    raise exception 'service_requests not found. Run 20261013_monetization_and_services.sql first. Nothing was changed.';
  end if;
  if to_regprocedure('public.admin_can(text)') is null then
    raise exception 'Admin access levels not found. Run 20261014_admin_access_price_moderation.sql first. Nothing was changed.';
  end if;
end $$;

-- -------------------------------------------------------------------------------------
-- 1. PRICE LIST
-- -------------------------------------------------------------------------------------
create table if not exists public.service_catalog (
  id               text primary key check (id ~ '^[a-z0-9_]{2,60}$'),
  title            text not null check (char_length(title) between 3 and 160),
  category         text not null check (category in ('papers_renewal', 'new_registration', 'auto_insurance', 'gps_tracker', 'fleet_solution')),
  description      text check (description is null or char_length(description) <= 1000),
  statutory        boolean not null default false,
  turnaround       text check (turnaround is null or char_length(turnaround) <= 80),
  private_price    numeric(12,2) not null check (private_price >= 0),
  commercial_price numeric(12,2) check (commercial_price is null or commercial_price >= 0),  -- null = same as private
  currency         text not null default 'NGN' check (currency ~ '^[A-Z]{3}$'),
  is_active        boolean not null default true,
  sort_order       integer not null default 100,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  updated_by       uuid
);
alter table public.service_catalog enable row level security;
drop policy if exists "qozob_service_catalog_read" on public.service_catalog;
create policy "qozob_service_catalog_read" on public.service_catalog for select to anon, authenticated using (true);
grant select on public.service_catalog to anon, authenticated;
-- (no write policies: changes go through the admin_* / partner_* functions below)

insert into public.service_catalog (id, title, category, description, statutory, turnaround, private_price, commercial_price, sort_order) values
  ('insurance_3rd_party', 'Third-Party Auto Insurance (NIID Validated)', 'auto_insurance',
   'Mandatory statutory cover registered directly on the Nigerian Insurance Industry Database (NIID). Immediate digital certificate + police proof.',
   true, 'Instant (15 mins)', 15000, 25000, 10),
  ('vehicle_license', 'Vehicle License Renewal', 'papers_renewal',
   'Official annual State Vehicle License paper renewal with barcode verification.', true, '24–48 hours', 4500, 6500, 20),
  ('roadworthiness', 'Roadworthiness Certificate (LACVIS / State)', 'papers_renewal',
   'State computerised inspection & roadworthiness compliance certificate.', true, '24–48 hours', 6500, 8500, 30),
  ('hackney_permit', 'Hackney Permit / Local Government Emblem', 'papers_renewal',
   'Statutory commercial transit and local government carriage sticker for business vehicles.', true, '24–48 hours', 0, 6000, 40),
  ('cmris_police', 'Police CMRIS Digital Registration', 'papers_renewal',
   'Official Nigeria Police Force Central Motor Registry Information System registration.', true, '24 hours', 7500, 7500, 50),
  ('change_ownership', 'Change of Vehicle Ownership', 'new_registration',
   'Complete transfer of title, police report, court affidavit, and updated Proof of Ownership Certificate.', true, '3–5 working days', 25000, 30000, 60),
  ('new_plate_number', 'New Vehicle Registration & Plate Numbers', 'new_registration',
   'Brand new state plate number allocation, vehicle license, proof of ownership, and roadworthiness pack.', true, '3–5 working days', 48000, 58000, 70),
  ('gps_tracker_4g', '4G Live GPS Tracker & Remote Engine Immobilizer', 'gps_tracker',
   'Live mobile phone GPS tracking, remote SMS/App fuel pump shut-off, anti-theft SOS alerts, 1-year data SIM included, plus doorstep technician installation.',
   false, 'Same-day or next-day install', 55000, 55000, 80)
on conflict (id) do nothing;

-- Different price in some states (falls back to the national price above)
create table if not exists public.service_state_prices (
  service_id       text not null references public.service_catalog (id) on delete cascade,
  state            text not null check (char_length(state) between 2 and 60),
  private_price    numeric(12,2) not null check (private_price >= 0),
  commercial_price numeric(12,2) check (commercial_price is null or commercial_price >= 0),
  updated_at       timestamptz not null default now(),
  updated_by       uuid,
  primary key (service_id, state)
);
alter table public.service_state_prices enable row level security;
drop policy if exists "qozob_service_state_prices_read" on public.service_state_prices;
create policy "qozob_service_state_prices_read" on public.service_state_prices for select to anon, authenticated using (true);
grant select on public.service_state_prices to anon, authenticated;

-- -------------------------------------------------------------------------------------
-- 2. PARTNER COMPANIES + THEIR AGENTS
-- -------------------------------------------------------------------------------------
create table if not exists public.service_partners (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (char_length(name) between 2 and 120),
  contact_email text check (contact_email is null or char_length(contact_email) <= 200),
  contact_phone text check (contact_phone is null or char_length(contact_phone) <= 40),
  categories    text[] not null default '{}'
                check (categories <@ array['papers_renewal', 'new_registration', 'auto_insurance', 'gps_tracker', 'fleet_solution']::text[]),
  states        text[] not null default '{}',          -- empty = every state
  is_active     boolean not null default true,
  note          text check (note is null or char_length(note) <= 500),
  created_by    uuid default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index if not exists service_partners_name_key on public.service_partners (lower(name));

create table if not exists public.service_partner_members (
  partner_id uuid not null references public.service_partners (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  role       text not null default 'agent' check (role in ('lead', 'agent')),
  added_by   uuid default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (partner_id, user_id)
);
create unique index if not exists service_partner_members_one_company on public.service_partner_members (user_id);

alter table public.service_partners enable row level security;
alter table public.service_partner_members enable row level security;

-- The signed-in person's (active) partner company, if any
create or replace function public.my_partner_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select m.partner_id
    from public.service_partner_members m
    join public.service_partners p on p.id = m.partner_id
   where m.user_id = auth.uid() and p.is_active
   limit 1;
$$;

drop policy if exists "qozob_service_partners_read" on public.service_partners;
create policy "qozob_service_partners_read" on public.service_partners for select to authenticated
  using ((select public.admin_can('services')) or id = (select public.my_partner_id()));
drop policy if exists "qozob_service_partner_members_read" on public.service_partner_members;
create policy "qozob_service_partner_members_read" on public.service_partner_members for select to authenticated
  using (user_id = auth.uid() or (select public.admin_can('services')));

-- Requests can be handed to a partner company
alter table public.service_requests add column if not exists partner_id uuid references public.service_partners (id) on delete set null;
alter table public.service_requests add column if not exists partner_assigned_at timestamptz;
create index if not exists service_requests_partner_idx on public.service_requests (partner_id, status);

drop policy if exists "qozob_service_requests_partner_read" on public.service_requests;
create policy "qozob_service_requests_partner_read" on public.service_requests for select to authenticated
  using (partner_id is not null and partner_id = (select public.my_partner_id()));

-- -------------------------------------------------------------------------------------
-- 3. PRICE PROPOSALS (partners) + PRICE HISTORY (everyone's changes)
-- -------------------------------------------------------------------------------------
create table if not exists public.service_price_proposals (
  id                 bigint generated always as identity primary key,
  service_id         text not null references public.service_catalog (id) on delete cascade,
  state              text,                                  -- null = national price
  private_price      numeric(12,2) not null check (private_price >= 0),
  commercial_price   numeric(12,2) check (commercial_price is null or commercial_price >= 0),
  current_private    numeric(12,2),                         -- price at the time of the proposal
  current_commercial numeric(12,2),
  partner_id         uuid references public.service_partners (id) on delete set null,
  proposed_by        uuid default auth.uid(),
  note               text check (note is null or char_length(note) <= 500),
  status             text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'withdrawn')),
  reviewed_by        uuid,
  reviewed_at        timestamptz,
  review_note        text check (review_note is null or char_length(review_note) <= 500),
  created_at         timestamptz not null default now()
);
create unique index if not exists service_price_proposals_one_pending
  on public.service_price_proposals (service_id, coalesce(state, ''), partner_id) where status = 'pending';
create index if not exists service_price_proposals_status_idx on public.service_price_proposals (status, created_at);
alter table public.service_price_proposals enable row level security;
drop policy if exists "qozob_service_price_proposals_read" on public.service_price_proposals;
create policy "qozob_service_price_proposals_read" on public.service_price_proposals for select to authenticated
  using ((select public.admin_can('services')) or (partner_id is not null and partner_id = (select public.my_partner_id())));

create table if not exists public.service_price_history (
  id             bigint generated always as identity primary key,
  service_id     text not null,
  state          text,
  old_private    numeric(12,2),
  old_commercial numeric(12,2),
  new_private    numeric(12,2),
  new_commercial numeric(12,2),
  source         text not null check (source in ('admin', 'proposal', 'cleared')),
  proposal_id    bigint,
  partner_id     uuid,
  changed_by     uuid default auth.uid(),
  note           text,
  created_at     timestamptz not null default now()
);
create index if not exists service_price_history_service_idx on public.service_price_history (service_id, created_at desc);
alter table public.service_price_history enable row level security;
drop policy if exists "qozob_service_price_history_read" on public.service_price_history;
create policy "qozob_service_price_history_read" on public.service_price_history for select to authenticated
  using ((select public.admin_can('services')) or (partner_id is not null and partner_id = (select public.my_partner_id())));

-- -------------------------------------------------------------------------------------
-- 4. APPLYING A PRICE (internal) — always writes the history
-- -------------------------------------------------------------------------------------
create or replace function public._apply_service_price(
  p_service_id text, p_state text, p_private numeric, p_commercial numeric,
  p_source text, p_proposal_id bigint default null, p_partner_id uuid default null, p_note text default null
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_old_p numeric; v_old_c numeric;
begin
  if p_state is null then
    select c.private_price, c.commercial_price into v_old_p, v_old_c
      from public.service_catalog c where c.id = p_service_id for update;
    update public.service_catalog
       set private_price = p_private, commercial_price = p_commercial, updated_at = now(), updated_by = auth.uid()
     where id = p_service_id;
  else
    select s.private_price, s.commercial_price into v_old_p, v_old_c
      from public.service_state_prices s where s.service_id = p_service_id and s.state = p_state for update;
    insert into public.service_state_prices as s (service_id, state, private_price, commercial_price, updated_at, updated_by)
    values (p_service_id, p_state, p_private, p_commercial, now(), auth.uid())
    on conflict (service_id, state) do update
       set private_price = excluded.private_price, commercial_price = excluded.commercial_price,
           updated_at = now(), updated_by = auth.uid();
  end if;
  insert into public.service_price_history (service_id, state, old_private, old_commercial, new_private, new_commercial,
                                            source, proposal_id, partner_id, note)
  values (p_service_id, p_state, v_old_p, v_old_c, p_private, p_commercial, p_source, p_proposal_id, p_partner_id, p_note);
end $$;

create or replace function public._clean_state(p text)
returns text language sql immutable set search_path = '' as $$
  select nullif(btrim(coalesce(p, '')), '');
$$;

-- -------------------------------------------------------------------------------------
-- 5. ADMIN: prices, services, partners, assignment, proposal review
-- -------------------------------------------------------------------------------------
create or replace function public.admin_set_service_price(p_service_id text, p_state text, p_private numeric,
                                                          p_commercial numeric default null, p_note text default null)
returns json language plpgsql security definer set search_path = '' as $$
declare v_state text := public._clean_state(p_state);
begin
  if not public.admin_can('services') then
    raise exception 'Not authorised: your admin account does not have access to auto services.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.service_catalog c where c.id = p_service_id) then raise exception 'Service not found.'; end if;
  if p_private is null or p_private < 0 then raise exception 'Enter the price for private vehicles (0 or more).'; end if;
  if p_commercial is not null and p_commercial < 0 then raise exception 'The commercial price cannot be negative.'; end if;
  perform public._apply_service_price(p_service_id, v_state, round(p_private, 2), round(p_commercial, 2), 'admin', null, null,
                                      nullif(btrim(coalesce(p_note, '')), ''));
  -- An admin decision replaces any proposal waiting for the same price
  update public.service_price_proposals
     set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(),
         review_note = 'Replaced by an admin price change'
   where service_id = p_service_id and coalesce(state, '') = coalesce(v_state, '') and status = 'pending';
  return json_build_object('service_id', p_service_id, 'state', v_state, 'private_price', p_private, 'commercial_price', p_commercial);
end $$;

create or replace function public.admin_clear_state_price(p_service_id text, p_state text, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.service_state_prices%rowtype;
begin
  if not public.admin_can('services') then
    raise exception 'Not authorised: your admin account does not have access to auto services.' using errcode = '42501';
  end if;
  delete from public.service_state_prices where service_id = p_service_id and state = public._clean_state(p_state) returning * into r;
  if r.service_id is null then raise exception 'There is no separate price for that state.'; end if;
  insert into public.service_price_history (service_id, state, old_private, old_commercial, new_private, new_commercial, source, note)
  values (r.service_id, r.state, r.private_price, r.commercial_price, null, null, 'cleared',
          coalesce(nullif(btrim(coalesce(p_note, '')), ''), 'State uses the national price again'));
end $$;

-- Create a service, or edit its details (prices of an existing service change through admin_set_service_price)
create or replace function public.admin_upsert_service(p_id text, p jsonb)
returns json language plpgsql security definer set search_path = '' as $$
declare
  v_id  text := lower(btrim(coalesce(p_id, '')));
  cur   public.service_catalog%rowtype;
  v_new boolean;
begin
  if not public.admin_can('services') then
    raise exception 'Not authorised: your admin account does not have access to auto services.' using errcode = '42501';
  end if;
  if v_id !~ '^[a-z0-9_]{2,60}$' then raise exception 'Use a short code with lower-case letters, numbers and _ (for example comprehensive_insurance).'; end if;
  select * into cur from public.service_catalog where id = v_id;
  v_new := not found;
  if v_new and (p ->> 'private_price') is null then raise exception 'Enter the price for private vehicles.'; end if;

  insert into public.service_catalog as c (id, title, category, description, statutory, turnaround, private_price, commercial_price,
                                           is_active, sort_order, updated_at, updated_by)
  values (v_id,
          coalesce(nullif(btrim(p ->> 'title'), ''), cur.title),
          coalesce(nullif(p ->> 'category', ''), cur.category),
          case when p ? 'description' then nullif(btrim(p ->> 'description'), '') else cur.description end,
          coalesce((p ->> 'statutory')::boolean, cur.statutory, false),
          case when p ? 'turnaround' then nullif(btrim(p ->> 'turnaround'), '') else cur.turnaround end,
          coalesce(cur.private_price, (p ->> 'private_price')::numeric),
          case when v_new then nullif(p ->> 'commercial_price', '')::numeric else cur.commercial_price end,
          coalesce((p ->> 'is_active')::boolean, cur.is_active, true),
          coalesce((p ->> 'sort_order')::integer, cur.sort_order, 100),
          now(), auth.uid())
  on conflict (id) do update
     set title = excluded.title, category = excluded.category, description = excluded.description,
         statutory = excluded.statutory, turnaround = excluded.turnaround, is_active = excluded.is_active,
         sort_order = excluded.sort_order, updated_at = now(), updated_by = auth.uid();

  if v_new then
    insert into public.service_price_history (service_id, new_private, new_commercial, source, note)
    select c.id, c.private_price, c.commercial_price, 'admin', 'Service added' from public.service_catalog c where c.id = v_id;
  end if;
  return json_build_object('id', v_id, 'new', v_new);
end $$;

create or replace function public.admin_upsert_partner(p_id uuid, p jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := p_id;
  v_cats text[];
  v_states text[];
begin
  if not public.admin_can('services') then
    raise exception 'Not authorised: your admin account does not have access to auto services.' using errcode = '42501';
  end if;
  if p ? 'categories' then
    select coalesce(array_agg(distinct x), '{}') into v_cats from jsonb_array_elements_text(p -> 'categories') x;
  end if;
  if p ? 'states' then
    select coalesce(array_agg(distinct btrim(x)), '{}') into v_states from jsonb_array_elements_text(p -> 'states') x where btrim(x) <> '';
  end if;
  if v_id is null then
    if char_length(btrim(coalesce(p ->> 'name', ''))) < 2 then raise exception 'Enter the company name.'; end if;
    insert into public.service_partners (name, contact_email, contact_phone, categories, states, is_active, note)
    values (btrim(p ->> 'name'), nullif(btrim(p ->> 'contact_email'), ''), nullif(btrim(p ->> 'contact_phone'), ''),
            coalesce(v_cats, '{}'), coalesce(v_states, '{}'), coalesce((p ->> 'is_active')::boolean, true), nullif(btrim(p ->> 'note'), ''))
    returning id into v_id;
  else
    update public.service_partners
       set name          = coalesce(nullif(btrim(p ->> 'name'), ''), name),
           contact_email = case when p ? 'contact_email' then nullif(btrim(p ->> 'contact_email'), '') else contact_email end,
           contact_phone = case when p ? 'contact_phone' then nullif(btrim(p ->> 'contact_phone'), '') else contact_phone end,
           categories    = coalesce(v_cats, categories),
           states        = coalesce(v_states, states),
           is_active     = coalesce((p ->> 'is_active')::boolean, is_active),
           note          = case when p ? 'note' then nullif(btrim(p ->> 'note'), '') else note end,
           updated_at    = now()
     where id = v_id;
    if not found then raise exception 'Partner not found.'; end if;
  end if;
  insert into public.admin_audit_log (action, details)
  values (case when p_id is null then 'partner_added' else 'partner_changed' end, jsonb_build_object('partner_id', v_id) || coalesce(p, '{}'::jsonb));
  return v_id;
end $$;

create or replace function public.admin_add_partner_member(p_partner_id uuid, p_email text, p_role text default 'agent')
returns json language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid; v_email text; v_other uuid;
begin
  if not public.admin_can('services') then
    raise exception 'Not authorised: your admin account does not have access to auto services.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.service_partners where id = p_partner_id) then raise exception 'Partner not found.'; end if;
  select u.id, u.email::text into v_uid, v_email from auth.users u where lower(u.email) = lower(btrim(p_email)) limit 1;
  if v_uid is null then
    raise exception 'No Qozob account uses %. Ask them to sign up at qozob.com first, then add them again.', btrim(p_email) using hint = 'user_not_found';
  end if;
  select m.partner_id into v_other from public.service_partner_members m where m.user_id = v_uid;
  if v_other is not null and v_other <> p_partner_id then
    raise exception '% already works for another partner company. Remove them there first.', v_email;
  end if;
  insert into public.service_partner_members as m (partner_id, user_id, role)
  values (p_partner_id, v_uid, case when p_role = 'lead' then 'lead' else 'agent' end)
  on conflict (partner_id, user_id) do update set role = excluded.role;
  insert into public.admin_audit_log (action, target_user, details)
  values ('partner_member_added', v_uid, jsonb_build_object('partner_id', p_partner_id, 'email', v_email, 'role', p_role));
  return json_build_object('user_id', v_uid, 'email', v_email);
end $$;

create or replace function public.admin_remove_partner_member(p_partner_id uuid, p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.admin_can('services') then
    raise exception 'Not authorised: your admin account does not have access to auto services.' using errcode = '42501';
  end if;
  delete from public.service_partner_members where partner_id = p_partner_id and user_id = p_user;
  insert into public.admin_audit_log (action, target_user, details)
  values ('partner_member_removed', p_user, jsonb_build_object('partner_id', p_partner_id));
end $$;

-- Hand a request to a partner company (NULL = take it back)
create or replace function public.admin_assign_service_request(p_request_id uuid, p_partner_id uuid)
returns json language plpgsql security definer set search_path = '' as $$
declare
  r  public.service_requests%rowtype;
  pt public.service_partners%rowtype;
begin
  if not public.admin_can('services') then
    raise exception 'Not authorised: your admin account does not have access to auto services.' using errcode = '42501';
  end if;
  select * into r from public.service_requests where id = p_request_id for update;
  if not found then raise exception 'Service request not found.'; end if;
  if p_partner_id is not null then
    select * into pt from public.service_partners where id = p_partner_id;
    if not found or not pt.is_active then raise exception 'That partner is not active.'; end if;
    if not (r.service_category = any (pt.categories)) then
      raise exception '% does not offer this kind of service. Add it to their services first.', pt.name;
    end if;
    if cardinality(pt.states) > 0 and r.state is not null and not (r.state = any (pt.states)) then
      raise exception '% does not work in %.', pt.name, r.state;
    end if;
  end if;
  update public.service_requests
     set partner_id = p_partner_id,
         partner_assigned_at = case when p_partner_id is null then null else now() end,
         assigned_to = case when p_partner_id is null then assigned_to else pt.name end
   where id = p_request_id;
  return json_build_object('request_id', p_request_id, 'partner_id', p_partner_id, 'partner_name', pt.name);
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
    perform public._apply_service_price(pr.service_id, pr.state, pr.private_price, pr.commercial_price, 'proposal', pr.id, pr.partner_id,
                                        coalesce(nullif(btrim(coalesce(p_note, '')), ''), pr.note));
  end if;
  update public.service_price_proposals
     set status = case when p_approve then 'approved' else 'rejected' end,
         reviewed_by = auth.uid(), reviewed_at = now(), review_note = nullif(btrim(coalesce(p_note, '')), '')
   where id = p_id;
  return json_build_object('id', p_id, 'status', case when p_approve then 'approved' else 'rejected' end);
end $$;

-- Everything the admin "Prices & partners" screens need, in one call
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
                    'currency', c.currency, 'is_active', c.is_active, 'sort_order', c.sort_order, 'updated_at', c.updated_at,
                    'updated_by_email', u.email,
                    'state_prices', (select coalesce(json_agg(json_build_object('state', s.state, 'private_price', s.private_price,
                                                                                'commercial_price', s.commercial_price, 'updated_at', s.updated_at)
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
                    'new_commercial', h.new_commercial, 'source', h.source, 'partner_name', pt.name,
                    'changed_by_email', u.email, 'note', h.note, 'created_at', h.created_at
                 ) order by h.created_at desc), '[]'::json)
                  from (select * from public.service_price_history order by created_at desc limit 500) h
                  left join public.service_catalog c on c.id = h.service_id
                  left join public.service_partners pt on pt.id = h.partner_id
                  left join auth.users u on u.id = h.changed_by)
  );
end $$;

-- -------------------------------------------------------------------------------------
-- 6. PARTNER PORTAL
-- -------------------------------------------------------------------------------------
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
                    'commercial_price', c.commercial_price, 'currency', c.currency, 'is_active', c.is_active,
                    'state_prices', (select coalesce(json_agg(json_build_object('state', s.state, 'private_price', s.private_price,
                                                                                'commercial_price', s.commercial_price) order by s.state), '[]'::json)
                                       from public.service_state_prices s
                                      where s.service_id = c.id and (cardinality(pt.states) = 0 or s.state = any (pt.states)))
                 ) order by c.sort_order, c.title), '[]'::json)
                   from public.service_catalog c where c.category = any (pt.categories)),
    'proposals', (select coalesce(json_agg(json_build_object(
                    'id', pp.id, 'service_id', pp.service_id, 'service_title', c.title, 'state', pp.state,
                    'private_price', pp.private_price, 'commercial_price', pp.commercial_price,
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

create or replace function public.partner_propose_price(p_service_id text, p_state text, p_private numeric,
                                                        p_commercial numeric default null, p_note text default null)
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

  if v_state is null then
    v_cp := c.private_price; v_cc := c.commercial_price;
  else
    select coalesce(s.private_price, c.private_price), case when s.service_id is null then c.commercial_price else s.commercial_price end
      into v_cp, v_cc
      from (select 1) one left join public.service_state_prices s on s.service_id = c.id and s.state = v_state;
  end if;

  -- A new proposal replaces this company's earlier one for the same price
  update public.service_price_proposals set status = 'withdrawn'
   where partner_id = v_pid and service_id = p_service_id and coalesce(state, '') = coalesce(v_state, '') and status = 'pending';

  insert into public.service_price_proposals (service_id, state, private_price, commercial_price, current_private, current_commercial,
                                              partner_id, note)
  values (p_service_id, v_state, round(p_private, 2), round(p_commercial, 2), v_cp, v_cc, v_pid, nullif(btrim(coalesce(p_note, '')), ''))
  returning id into v_id;
  return json_build_object('id', v_id, 'status', 'pending');
end $$;

create or replace function public.partner_withdraw_proposal(p_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.service_price_proposals set status = 'withdrawn'
   where id = p_id and partner_id = public.my_partner_id() and status = 'pending';
  if not found then raise exception 'This proposal is not waiting for review.'; end if;
end $$;

-- Partners move their own requests forward: contacted → quoted → in progress → completed (or cancelled)
create or replace function public.partner_update_request(p_request_id uuid, p_status text, p_quoted_price numeric default null,
                                                         p_note text default null)
returns json language plpgsql security definer set search_path = '' as $$
declare
  v_pid  uuid := public.my_partner_id();
  v_name text;
  r      public.service_requests%rowtype;
  v_status text := p_status;
begin
  if v_pid is null then raise exception 'Only partner company agents can update requests.' using errcode = '42501'; end if;
  select * into r from public.service_requests where id = p_request_id for update;
  if not found or r.partner_id is distinct from v_pid then raise exception 'This request is not assigned to your company.'; end if;
  if r.status in ('completed', 'cancelled') then raise exception 'This request is already closed.'; end if;
  if v_status is null then v_status := r.status; end if;
  if v_status not in ('contacted', 'quoted', 'in_progress', 'completed', 'cancelled') then raise exception 'Choose a valid status.'; end if;
  if p_quoted_price is not null and p_quoted_price < 0 then raise exception 'The quote cannot be negative.'; end if;
  if v_status = 'cancelled' and char_length(btrim(coalesce(p_note, ''))) < 3 then
    raise exception 'Say why the request is cancelled (the customer and Qozob will see it).';
  end if;
  select name into v_name from public.service_partners where id = v_pid;

  update public.service_requests
     set status = v_status,
         quoted_price = coalesce(round(p_quoted_price, 2), quoted_price),
         admin_notes = case when nullif(btrim(coalesce(p_note, '')), '') is null then admin_notes
                            else concat_ws(E'\n', admin_notes,
                                   '[' || v_name || ' · ' || to_char(now() at time zone 'Africa/Lagos', 'DD Mon HH24:MI') || '] ' || btrim(p_note)) end
   where id = p_request_id;
  return json_build_object('id', p_request_id, 'status', v_status);
end $$;

-- -------------------------------------------------------------------------------------
-- 7. PERMISSIONS
-- -------------------------------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array[
    'public._apply_service_price(text, text, numeric, numeric, text, bigint, uuid, text)', 'public._clean_state(text)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;

  -- used inside table policies
  execute 'revoke all on function public.my_partner_id() from public';
  execute 'grant execute on function public.my_partner_id() to authenticated';

  foreach f in array array[
    'public.admin_set_service_price(text, text, numeric, numeric, text)', 'public.admin_clear_state_price(text, text, text)',
    'public.admin_upsert_service(text, jsonb)', 'public.admin_upsert_partner(uuid, jsonb)',
    'public.admin_add_partner_member(uuid, text, text)', 'public.admin_remove_partner_member(uuid, uuid)',
    'public.admin_assign_service_request(uuid, uuid)', 'public.admin_review_price_proposal(bigint, boolean, text)',
    'public.admin_service_overview()', 'public.my_partner_portal()',
    'public.partner_propose_price(text, text, numeric, numeric, text)', 'public.partner_withdraw_proposal(bigint)',
    'public.partner_update_request(uuid, text, numeric, text)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

commit;

-- Summary
select 'Services in the price list' as item, (select count(*)::text from public.service_catalog) as value
union all select 'State price differences', (select count(*)::text from public.service_state_prices)
union all select 'Partner companies', (select count(*)::text from public.service_partners);
