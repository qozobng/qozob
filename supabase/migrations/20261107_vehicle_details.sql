-- =====================================================================================
--  QOZOB 20261107: VEHICLE DETAILS FROM PICK-LISTS
--  Run ONCE in Supabase → SQL Editor → New query → paste everything → Run.
--  • Safe to re-run.  • All-or-nothing (one transaction).  • Requires 20261013 (My Garage).
--
--  Vehicle forms now use pick-lists (type → make → model, year, colour). This adds:
--   1. user_vehicles.vehicle_type  (saloon, suv, pickup, minivan, bus, truck, motorcycle, tricycle)
--   2. user_vehicles.vehicle_usage (private / commercial: decides the service price)
--   3. A year check (4-digit year) on new garage vehicles and service requests.
--      Existing rows are NOT checked (NOT VALID), so nothing old breaks.
-- =====================================================================================

begin;

do $$
begin
  if to_regclass('public.user_vehicles') is null then
    raise exception 'user_vehicles not found. Run 20261013_monetization_and_services.sql first. Nothing was changed.';
  end if;
end $$;

alter table public.user_vehicles add column if not exists vehicle_type text;
alter table public.user_vehicles add column if not exists vehicle_usage text not null default 'private';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'user_vehicles_vehicle_type_check') then
    alter table public.user_vehicles add constraint user_vehicles_vehicle_type_check
      check (vehicle_type is null or vehicle_type in ('saloon', 'suv', 'pickup', 'minivan', 'bus', 'truck', 'motorcycle', 'tricycle'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'user_vehicles_vehicle_usage_check') then
    alter table public.user_vehicles add constraint user_vehicles_vehicle_usage_check
      check (vehicle_usage in ('private', 'commercial'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'user_vehicles_vehicle_year_format') then
    alter table public.user_vehicles add constraint user_vehicles_vehicle_year_format
      check (vehicle_year is null or vehicle_year ~ '^(19|20)[0-9]{2}$') not valid;
  end if;
  if to_regclass('public.service_requests') is not null
     and not exists (select 1 from pg_constraint where conname = 'service_requests_vehicle_year_format') then
    alter table public.service_requests add constraint service_requests_vehicle_year_format
      check (vehicle_year is null or vehicle_year ~ '^(19|20)[0-9]{2}$') not valid;
  end if;
end $$;

comment on column public.user_vehicles.vehicle_type  is 'Body type chosen from the app list (lib/vehicles.ts)';
comment on column public.user_vehicles.vehicle_usage is 'private or commercial (decides auto-service prices)';

commit;

select 'vehicle details ready' as status,
       (select count(*) from public.user_vehicles) as garage_vehicles;

