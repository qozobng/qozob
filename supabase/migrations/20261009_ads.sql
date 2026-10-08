-- =====================================================================================
--  QOZOB ADVERTS MODULE
--  Run ONCE in Supabase → SQL Editor → New query → paste everything → Run.
--  • Safe to re-run (every step checks before it changes anything).
--  • Requires the security migration (20261008_security_hardening.sql) to have been run,
--    because it uses public.is_admin().
--
--  What it creates
--   • public.ads              – each advert (images, link, placement, schedule, weight)
--   • public.ad_stats_daily   – views and clicks per advert per day (for the admin charts)
--   • public.track_ad_event() – the only way the public site can count a view / click
--   • storage bucket "ad_creatives" – public images, only admins can upload / delete
-- =====================================================================================

begin;

do $$
begin
  if to_regprocedure('public.is_admin()') is null then
    raise exception 'public.is_admin() not found. Run 20261008_security_hardening.sql first. Nothing was changed.';
  end if;
end $$;

-- -------------------------------------------------------------------------------------
-- 1. ADVERTS
-- -------------------------------------------------------------------------------------
create table if not exists public.ads (
  id                uuid primary key default gen_random_uuid(),
  title             text not null check (char_length(title) between 1 and 120),
  advertiser        text check (advertiser is null or char_length(advertiser) <= 120),
  link_url          text check (link_url is null or link_url ~* '^https?://[^\s]+$'),
  desktop_image_url  text,          -- 728 × 90 banner (desktop header)
  desktop_image_path text,          -- storage path, so the file can be deleted with the ad
  mobile_image_url   text,          -- 640 × 100 banner (mobile bottom bar)
  mobile_image_path  text,
  placement         text not null default 'both' check (placement in ('both', 'mobile_bottom', 'desktop_header')),
  starts_at         timestamptz not null default now(),
  ends_at           timestamptz,
  is_active         boolean not null default true,
  weight            smallint not null default 1 check (weight between 1 and 10),  -- 10 = shown most often
  sort_order        integer not null default 0,
  impressions       bigint not null default 0,
  clicks            bigint not null default 0,
  created_by        uuid default auth.uid(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint ads_has_image check (desktop_image_url is not null or mobile_image_url is not null),
  constraint ads_dates check (ends_at is null or ends_at > starts_at)
);

-- ARCON compliance: every advert shown in Nigeria must be vetted by the Advertising Standards Panel
-- (ARCON Act 2022). Keep the approval number and whether the advertiser confirmed the advert is lawful.
alter table public.ads add column if not exists arcon_ref text;
alter table public.ads add column if not exists advertiser_confirmed boolean not null default false;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ads_arcon_ref_len' and conrelid = 'public.ads'::regclass) then
    alter table public.ads add constraint ads_arcon_ref_len check (arcon_ref is null or char_length(arcon_ref) between 3 and 80);
  end if;
end $$;

create index if not exists ads_live_idx on public.ads (is_active, starts_at, ends_at);

alter table public.ads enable row level security;

-- Everyone sees only adverts that are switched on and inside their schedule; admins see all.
drop policy if exists "qozob_ads_read" on public.ads;
create policy "qozob_ads_read" on public.ads
  for select to anon, authenticated
  using (
    public.is_admin()
    or (is_active and starts_at <= now() and (ends_at is null or ends_at > now()))
  );

drop policy if exists "qozob_ads_admin_insert" on public.ads;
create policy "qozob_ads_admin_insert" on public.ads
  for insert to authenticated with check (public.is_admin());

drop policy if exists "qozob_ads_admin_update" on public.ads;
create policy "qozob_ads_admin_update" on public.ads
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "qozob_ads_admin_delete" on public.ads;
create policy "qozob_ads_admin_delete" on public.ads
  for delete to authenticated using (public.is_admin());

-- Counters can only change through track_ad_event (not by editing the row from the browser)
create or replace function public.ads_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' and current_user not in ('postgres', 'supabase_admin', 'service_role') then
    new.impressions := old.impressions;
    new.clicks      := old.clicks;
    new.created_by  := old.created_by;
    new.created_at  := old.created_at;
  end if;
  return new;
end;
$$;

drop trigger if exists ads_guard on public.ads;
create trigger ads_guard before update on public.ads
  for each row execute function public.ads_guard();

-- -------------------------------------------------------------------------------------
-- 2. DAILY STATS
-- -------------------------------------------------------------------------------------
create table if not exists public.ad_stats_daily (
  ad_id       uuid not null references public.ads (id) on delete cascade,
  day         date not null,
  impressions integer not null default 0,
  clicks      integer not null default 0,
  primary key (ad_id, day)
);
alter table public.ad_stats_daily enable row level security;

drop policy if exists "qozob_ad_stats_admin_read" on public.ad_stats_daily;
create policy "qozob_ad_stats_admin_read" on public.ad_stats_daily
  for select to authenticated using (public.is_admin());

-- Count a view or click. Only works for adverts that are currently live.
create or replace function public.track_ad_event(p_ad_id uuid, p_event text)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_day date := (now() at time zone 'Africa/Lagos')::date;
begin
  if p_event not in ('impression', 'click') then return; end if;

  if not exists (
    select 1 from public.ads a
    where a.id = p_ad_id and a.is_active and a.starts_at <= now() and (a.ends_at is null or a.ends_at > now())
  ) then
    return;
  end if;

  if p_event = 'impression' then
    update public.ads set impressions = impressions + 1 where id = p_ad_id;
    insert into public.ad_stats_daily (ad_id, day, impressions) values (p_ad_id, v_day, 1)
      on conflict (ad_id, day) do update set impressions = public.ad_stats_daily.impressions + 1;
  else
    update public.ads set clicks = clicks + 1 where id = p_ad_id;
    insert into public.ad_stats_daily (ad_id, day, clicks) values (p_ad_id, v_day, 1)
      on conflict (ad_id, day) do update set clicks = public.ad_stats_daily.clicks + 1;
  end if;
end;
$$;

revoke all on function public.track_ad_event(uuid, text) from public;
grant execute on function public.track_ad_event(uuid, text) to anon, authenticated;

-- -------------------------------------------------------------------------------------
-- 3. IMAGE STORAGE  (public bucket: images load fast on the site; only admins can change them)
-- -------------------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ad_creatives', 'ad_creatives', true, 2097152,
        array['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "qozob_ad_creatives_admin_insert" on storage.objects;
create policy "qozob_ad_creatives_admin_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'ad_creatives' and public.is_admin());

drop policy if exists "qozob_ad_creatives_admin_update" on storage.objects;
create policy "qozob_ad_creatives_admin_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'ad_creatives' and public.is_admin());

drop policy if exists "qozob_ad_creatives_admin_delete" on storage.objects;
create policy "qozob_ad_creatives_admin_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'ad_creatives' and public.is_admin());

commit;

-- DONE. Quick check:
select 'ads table' as item, (to_regclass('public.ads') is not null)::text as ok
union all select 'ad_stats_daily table', (to_regclass('public.ad_stats_daily') is not null)::text
union all select 'ad_creatives bucket public', coalesce((select public::text from storage.buckets where id = 'ad_creatives'), 'missing');

