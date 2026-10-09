-- =====================================================================================
--  QOZOB · LOCATION-TARGETED ADVERTS
--  Run ONCE in Supabase → SQL Editor → New query → paste everything → Run.
--  • Safe to re-run (every step checks before it changes anything).
--  • Needs: 20261009_ads.sql (adverts) and 20261011_rewards.sql (LGA boundaries + lga_at()).
--
--  What it adds
--   • ads.target_scope    – 'national' (whole country, default) | 'states' | 'lgas'
--   • ads.target_states   – state names, exactly as in public.lgas.state (e.g. 'Lagos', 'Federal Capital Territory')
--   • ads.target_lga_ids  – public.lgas ids
--   • public.ads_for_viewer() – returns the live adverts that match where the viewer is.
--     The viewer's approximate position (rounded to ~1 km by the website) is used only to look
--     up their LGA for this request. It is NOT stored anywhere.
--  Also (re)applies the ARCON columns in case the earlier ARCON update was not run.
-- =====================================================================================

begin;

do $$
begin
  if to_regclass('public.ads') is null then
    raise exception 'public.ads not found. Run 20261009_ads.sql first. Nothing was changed.';
  end if;
  if to_regprocedure('public.lga_at(double precision, double precision)') is null then
    raise exception 'public.lga_at() not found. Run 20261011_rewards.sql first. Nothing was changed.';
  end if;
end $$;

-- -------------------------------------------------------------------------------------
-- 0. ARCON columns (no-op if already there)
-- -------------------------------------------------------------------------------------
alter table public.ads add column if not exists arcon_ref text;
alter table public.ads add column if not exists advertiser_confirmed boolean not null default false;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ads_arcon_ref_len' and conrelid = 'public.ads'::regclass) then
    alter table public.ads add constraint ads_arcon_ref_len check (arcon_ref is null or char_length(arcon_ref) between 3 and 80);
  end if;
end $$;

-- -------------------------------------------------------------------------------------
-- 1. TARGETING COLUMNS
-- -------------------------------------------------------------------------------------
alter table public.ads add column if not exists target_scope   text      not null default 'national';
alter table public.ads add column if not exists target_states  text[]    not null default '{}';
alter table public.ads add column if not exists target_lga_ids integer[] not null default '{}';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ads_target_scope_chk' and conrelid = 'public.ads'::regclass) then
    alter table public.ads add constraint ads_target_scope_chk
      check (target_scope in ('national', 'states', 'lgas'));
  end if;
  -- A "states" advert needs at least one state; an "lgas" advert at least one LGA
  if not exists (select 1 from pg_constraint where conname = 'ads_target_consistent' and conrelid = 'public.ads'::regclass) then
    alter table public.ads add constraint ads_target_consistent
      check (
        target_scope = 'national'
        or (target_scope = 'states' and cardinality(target_states) > 0)
        or (target_scope = 'lgas'   and cardinality(target_lga_ids) > 0)
      );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ads_target_size' and conrelid = 'public.ads'::regclass) then
    alter table public.ads add constraint ads_target_size
      check (cardinality(target_states) <= 40 and cardinality(target_lga_ids) <= 800);
  end if;
end $$;

create index if not exists ads_target_states_gin on public.ads using gin (target_states);
create index if not exists ads_target_lgas_gin   on public.ads using gin (target_lga_ids);

-- -------------------------------------------------------------------------------------
-- 2. ADVERTS FOR THIS VIEWER
--    Order: LGA-targeted first, then state-targeted, then nationwide; then the admin's sort order.
--    Location comes from (1) the map position → LGA (and its state), else (2) the profile state.
-- -------------------------------------------------------------------------------------
create or replace function public.ads_for_viewer(
  p_placement text,
  p_lat       double precision default null,
  p_lng       double precision default null,
  p_state     text default null
)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_placement text := case when p_placement in ('mobile_bottom', 'desktop_header') then p_placement else 'desktop_header' end;
  v_lga_id    integer;
  v_lga       text;
  v_geo_state text;
  v_state     text := nullif(btrim(coalesce(p_state, '')), '');
  v_ads       jsonb;
begin
  -- Only look up points inside Nigeria's bounding box
  if p_lat is not null and p_lng is not null
     and p_lat between 4.0 and 14.0 and p_lng between 2.5 and 15.0 then
    select l.id, l.name, l.state into v_lga_id, v_lga, v_geo_state
      from public.lga_at(p_lat, p_lng) l;
    if v_geo_state is not null then
      v_state := v_geo_state;   -- where they are now beats the state on their profile
    end if;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', x.id, 'title', x.title, 'advertiser', x.advertiser, 'link_url', x.link_url,
           'desktop_image_url', x.desktop_image_url, 'mobile_image_url', x.mobile_image_url,
           'weight', x.weight, 'target_scope', x.target_scope
         ) order by x.scope_rank, x.sort_order, x.created_at desc), '[]'::jsonb)
    into v_ads
    from (
      select a.*, case a.target_scope when 'lgas' then 0 when 'states' then 1 else 2 end as scope_rank
        from public.ads a
       where a.is_active
         and a.starts_at <= now()
         and (a.ends_at is null or a.ends_at > now())
         and a.placement in (v_placement, 'both')
         and (
           a.target_scope = 'national'
           or (a.target_scope = 'states' and v_state is not null
               and exists (select 1 from unnest(a.target_states) s where lower(s) = lower(v_state)))
           or (a.target_scope = 'lgas' and v_lga_id is not null and v_lga_id = any (a.target_lga_ids))
         )
       order by scope_rank, a.sort_order, a.created_at desc
       limit 20
    ) x;

  return jsonb_build_object('lga_id', v_lga_id, 'lga', v_lga, 'state', v_state, 'ads', v_ads);
end;
$$;

revoke all on function public.ads_for_viewer(text, double precision, double precision, text) from public;
grant execute on function public.ads_for_viewer(text, double precision, double precision, text) to anon, authenticated;

commit;

-- Quick check (should list your live adverts for central Lagos):
--   select public.ads_for_viewer('desktop_header', 6.45, 3.39, null);

