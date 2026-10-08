-- =====================================================================================
--  QOZOB MAILING LIST + BULK MESSAGES
--  Run ONCE in Supabase → SQL Editor → New query → paste everything → Run.
--  • Safe to re-run.  • Requires 20261008_security_hardening.sql (uses public.is_admin()).
--
--  Privacy by design (Nigeria Data Protection Act 2023 + NDPC GAID 2025):
--   • Only people who ticked an (unticked-by-default) box are added; the exact wording,
--     time and source of their consent are recorded.
--   • People who are not signed in must confirm by email (double opt-in).
--   • Every email carries a one-click unsubscribe link that works immediately.
--   • The tables are private: only admins can read them in the app; the website's server
--     (service-role key) handles subscribe / confirm / unsubscribe.
-- =====================================================================================

begin;

do $$
begin
  if to_regprocedure('public.is_admin()') is null then
    raise exception 'public.is_admin() not found. Run 20261008_security_hardening.sql first. Nothing was changed.';
  end if;
end $$;

-- -------------------------------------------------------------------------------------
-- 1. SUBSCRIBERS
-- -------------------------------------------------------------------------------------
create table if not exists public.mailing_subscribers (
  id                 uuid primary key default gen_random_uuid(),
  email              text not null check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  user_id            uuid references auth.users (id) on delete set null,
  full_name          text,
  state              text,
  lga                text,
  source             text not null default 'website' check (source in ('website', 'signup', 'dashboard', 'rewards', 'admin')),
  status             text not null default 'pending' check (status in ('pending', 'subscribed', 'unsubscribed', 'bounced', 'complained')),
  consent_text       text,                 -- the exact sentence the person agreed to
  consent_at         timestamptz,
  confirmed_at       timestamptz,
  unsubscribed_at    timestamptz,
  confirm_token      uuid default gen_random_uuid(),
  unsubscribe_token  uuid not null default gen_random_uuid(),
  last_emailed_at    timestamptz,
  confirm_sent_at    timestamptz,          -- throttles repeat confirmation emails
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create unique index if not exists mailing_subscribers_email_key on public.mailing_subscribers (email);
create unique index if not exists mailing_subscribers_unsub_key on public.mailing_subscribers (unsubscribe_token);
create index if not exists mailing_subscribers_status_idx on public.mailing_subscribers (status);
create index if not exists mailing_subscribers_user_idx on public.mailing_subscribers (user_id);

alter table public.mailing_subscribers enable row level security;

drop policy if exists "qozob_mailing_subs_admin_all" on public.mailing_subscribers;
create policy "qozob_mailing_subs_admin_all" on public.mailing_subscribers
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Signed-in people can see their own subscription (for the "Email updates" switch)
drop policy if exists "qozob_mailing_subs_select_own" on public.mailing_subscribers;
create policy "qozob_mailing_subs_select_own" on public.mailing_subscribers
  for select to authenticated using (user_id = auth.uid());

-- -------------------------------------------------------------------------------------
-- 2. CAMPAIGNS (bulk messages) + DELIVERIES (one row per recipient, so sending can resume)
-- -------------------------------------------------------------------------------------
create table if not exists public.mail_campaigns (
  id            uuid primary key default gen_random_uuid(),
  subject       text not null check (char_length(subject) between 1 and 150),
  preheader     text check (preheader is null or char_length(preheader) <= 200),
  body          text not null,             -- plain text; blank lines = paragraphs, **bold**, links auto-detected
  cta_label     text,
  cta_url       text check (cta_url is null or cta_url ~* '^https?://[^\s]+$'),
  audience      jsonb not null default '{"type":"all"}'::jsonb,   -- {"type":"all"} | {"type":"state","value":"Lagos"} | {"type":"lga","value":"Ikeja"}
  status        text not null default 'draft' check (status in ('draft', 'sending', 'sent', 'cancelled')),
  total         integer not null default 0,
  sent_count    integer not null default 0,
  failed_count  integer not null default 0,
  created_by    uuid default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  queued_at     timestamptz,
  completed_at  timestamptz
);
alter table public.mail_campaigns enable row level security;

drop policy if exists "qozob_mail_campaigns_admin_all" on public.mail_campaigns;
create policy "qozob_mail_campaigns_admin_all" on public.mail_campaigns
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create table if not exists public.mail_deliveries (
  id             bigint generated always as identity primary key,
  campaign_id    uuid not null references public.mail_campaigns (id) on delete cascade,
  subscriber_id  uuid references public.mailing_subscribers (id) on delete set null,
  email          text not null,
  status         text not null default 'queued' check (status in ('queued', 'sending', 'sent', 'failed', 'skipped')),
  provider_id    text,
  error          text,
  claimed_at     timestamptz,                -- set while a sender is working on this row
  created_at     timestamptz not null default now(),
  sent_at        timestamptz
);
create unique index if not exists mail_deliveries_once on public.mail_deliveries (campaign_id, email);
create index if not exists mail_deliveries_queue_idx on public.mail_deliveries (status, campaign_id);
create index if not exists mail_deliveries_sent_day_idx on public.mail_deliveries (sent_at);

alter table public.mail_deliveries enable row level security;

drop policy if exists "qozob_mail_deliveries_admin_read" on public.mail_deliveries;
create policy "qozob_mail_deliveries_admin_read" on public.mail_deliveries
  for select to authenticated using (public.is_admin());

-- -------------------------------------------------------------------------------------
-- 3. QUEUE A CAMPAIGN  (admin only; snapshots the audience into mail_deliveries)
-- -------------------------------------------------------------------------------------
create or replace function public.admin_queue_campaign(p_campaign_id uuid)
returns json
language plpgsql security definer
set search_path = ''
as $$
declare
  c        record;
  v_type   text;
  v_value  text;
  v_count  integer;
begin
  if not public.is_admin() then raise exception 'Not authorised: admin access required.' using errcode = '42501'; end if;

  select * into c from public.mail_campaigns where id = p_campaign_id for update;
  if not found then raise exception 'Campaign not found.'; end if;
  if c.status not in ('draft', 'sending') then raise exception 'This campaign has already finished.'; end if;

  v_type  := coalesce(c.audience ->> 'type', 'all');
  v_value := nullif(trim(c.audience ->> 'value'), '');

  insert into public.mail_deliveries (campaign_id, subscriber_id, email)
  select c.id, s.id, s.email
    from public.mailing_subscribers s
   where s.status = 'subscribed'
     and (v_type = 'all'
          or (v_type = 'state' and lower(s.state) = lower(v_value))
          or (v_type = 'lga'   and lower(s.lga)   = lower(v_value)))
  on conflict (campaign_id, email) do nothing;

  select count(*) into v_count from public.mail_deliveries where campaign_id = c.id;

  update public.mail_campaigns
     set status = 'sending', total = v_count, queued_at = coalesce(queued_at, now()), updated_at = now()
   where id = c.id;

  return json_build_object('queued', v_count);
end;
$$;

revoke all on function public.admin_queue_campaign(uuid) from public, anon;
grant execute on function public.admin_queue_campaign(uuid) to authenticated;

-- -------------------------------------------------------------------------------------
-- 4. CLAIM A BATCH TO SEND  (website server only). SKIP LOCKED means two senders running
--    at the same time never pick the same person, so nobody gets the email twice.
--    Rows stuck in 'sending' for 15+ minutes (e.g. a crash) are picked up again.
-- -------------------------------------------------------------------------------------
create or replace function public.claim_mail_deliveries(p_campaign_id uuid, p_limit integer)
returns setof public.mail_deliveries
language sql security definer
set search_path = ''
as $$
  update public.mail_deliveries d
     set status = 'sending', claimed_at = now()
   where d.id in (
           select x.id from public.mail_deliveries x
            where x.campaign_id = p_campaign_id
              and (x.status = 'queued' or (x.status = 'sending' and x.claimed_at < now() - interval '15 minutes'))
            order by x.id
            limit greatest(0, least(p_limit, 100))
            for update skip locked)
  returning d.*;
$$;

revoke all on function public.claim_mail_deliveries(uuid, integer) from public, anon, authenticated;
grant execute on function public.claim_mail_deliveries(uuid, integer) to service_role;

-- Keep updated_at fresh
create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end; $$;

drop trigger if exists mailing_subscribers_touch on public.mailing_subscribers;
create trigger mailing_subscribers_touch before update on public.mailing_subscribers
  for each row execute function public.touch_updated_at();

drop trigger if exists mail_campaigns_touch on public.mail_campaigns;
create trigger mail_campaigns_touch before update on public.mail_campaigns
  for each row execute function public.touch_updated_at();

commit;

select 'mailing_subscribers' as item, (to_regclass('public.mailing_subscribers') is not null)::text as ok
union all select 'mail_campaigns', (to_regclass('public.mail_campaigns') is not null)::text
union all select 'mail_deliveries', (to_regclass('public.mail_deliveries') is not null)::text;
