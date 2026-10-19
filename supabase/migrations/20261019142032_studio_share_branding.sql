-- =============================================================================
-- 3D Studio: social exports branded by plan (decision 101, user's request 2026-10-19)
-- =============================================================================
-- A member exports a creation for social networks (still render, 360° video
-- or GIF; Story / square / portrait), drawn in the browser. What the export
-- may carry depends on the member's plan:
--   essential   the Global Toothgems watermark, always;
--   artist      their own logo, or no watermark at all;
--   atelier     the same, plus layout templates.
-- Trial = essential; active staff = atelier (support and testing).
--
-- What the database guarantees: the TIER (one helper, used by the policies
-- and returned to the page) and the LOGO entitlement — only an artist or
-- atelier member may upload a logo, record it, or read it back. The
-- watermark and the templates themselves are drawn by the browser: a
-- determined member could remove the watermark from their own copy. Nothing
-- is published or stored by an export.
--
-- Logos live in the private bucket `studio-share-logos` (`<user id>/<file>`,
-- 2 MB, PNG / JPEG / WebP — no SVG). One logo per member, recorded in
-- `studio_share_logos` by `studio_set_share_logo()`. Removing it is always
-- allowed (also after a downgrade), reading and uploading need the tier.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. The tier
-- -----------------------------------------------------------------------------
-- Highest of: an active subscription's plan (same rule as
-- private.studio_subscription_active), an active trial (essential), active
-- staff (atelier). Null without Studio access.
create or replace function private.studio_user_tier(p_user uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  with tiers(tier, rank) as (
    select s.plan, case s.plan when 'atelier' then 3 when 'artist' then 2 else 1 end
      from public.studio_subscriptions s
     where s.user_id = p_user
       and s.status in ('active', 'trialing', 'past_due')
       and s.current_period_end > now()
    union all
    select 'essential', 1
      from public.studio_trials t
     where t.user_id = p_user and now() < t.trial_expires_at
    union all
    select 'atelier', 3
      from public.profiles p
      join public.roles r on r.key = p.role and r.is_staff
     where p.id = p_user and p.status = 'active'
  )
  select tier from tiers where p_user is not null order by rank desc limit 1;
$$;

comment on function private.studio_user_tier(uuid) is
  '3D Studio plan tier of a member (decision 101): essential | artist | atelier, null without Studio access. Trial = essential, active staff = atelier.';

-- May the caller brand an export with their own logo?
create or replace function private.studio_share_logo_allowed()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.studio_user_tier((select auth.uid())) in ('artist', 'atelier'), false);
$$;

revoke all on function private.studio_user_tier(uuid), private.studio_share_logo_allowed() from public;
grant execute on function private.studio_share_logo_allowed() to authenticated, service_role;
grant execute on function private.studio_user_tier(uuid) to service_role;

-- -----------------------------------------------------------------------------
-- 2. The member's logo
-- -----------------------------------------------------------------------------
create table public.studio_share_logos (
  user_id     uuid primary key references public.profiles (id) on delete cascade,
  logo_path   text not null check (logo_path like user_id::text || '/%' and char_length(logo_path) <= 200),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.studio_share_logos is
  'The logo a member puts on their social exports (decision 101). Written only by studio_set_share_logo(); the owner reads it.';

alter table public.studio_share_logos enable row level security;

create policy "studio_share_logos: owners read"
  on public.studio_share_logos for select to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.studio_share_logos from anon, authenticated;
grant select on public.studio_share_logos to authenticated;

create trigger studio_share_logos_touch_updated_at
  before update on public.studio_share_logos
  for each row execute function private.studio_touch_updated_at();

-- -----------------------------------------------------------------------------
-- 3. Storage: studio-share-logos
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('studio-share-logos', 'studio-share-logos', false, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

create policy "studio-share-logos: artist and atelier members upload into own folder"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'studio-share-logos'
              and (storage.foldername(name))[1] = (select auth.uid())::text
              and (select private.studio_share_logo_allowed()));

create policy "studio-share-logos: artist and atelier members read their own"
  on storage.objects for select to authenticated
  using (bucket_id = 'studio-share-logos'
         and (storage.foldername(name))[1] = (select auth.uid())::text
         and (select private.studio_share_logo_allowed()));

-- Always: a member who left the plan still clears their files.
create policy "studio-share-logos: owners delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'studio-share-logos'
         and (storage.foldername(name))[1] = (select auth.uid())::text);

-- -----------------------------------------------------------------------------
-- 4. Functions for the page
-- -----------------------------------------------------------------------------
-- The caller's export branding: {tier, logo_path}. logo_path is the recorded
-- logo, returned only while the tier allows it (has_logo says one is kept).
create or replace function public.studio_share_branding()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_tier text;
  v_path text;
begin
  if v_user is null then
    raise exception 'studio_share_branding: sign in required' using errcode = '42501';
  end if;
  v_tier := private.studio_user_tier(v_user);
  select l.logo_path into v_path from public.studio_share_logos l where l.user_id = v_user;
  return jsonb_build_object(
    'tier', v_tier,
    'logo_path', case when v_tier in ('artist', 'atelier') then v_path end,
    'has_logo', v_path is not null
  );
end;
$$;

comment on function public.studio_share_branding() is
  'Social exports (decision 101): the caller''s plan tier (essential | artist | atelier | null) and their logo, returned while the tier allows it.';

-- Record (p_path) or remove (null) the caller's logo. Recording needs the
-- artist or atelier tier and a file of the caller's folder in the bucket;
-- removing is always allowed. Returns the previous path, for the page to
-- delete that file.
create or replace function public.studio_set_share_logo(p_path text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user     uuid := (select auth.uid());
  v_path     text := nullif(btrim(coalesce(p_path, '')), '');
  v_previous text;
begin
  if v_user is null then
    raise exception 'studio_set_share_logo: sign in required' using errcode = '42501';
  end if;
  select l.logo_path into v_previous from public.studio_share_logos l where l.user_id = v_user for update;

  if v_path is null then
    delete from public.studio_share_logos l where l.user_id = v_user;
    return v_previous;
  end if;

  if not private.studio_share_logo_allowed() then
    raise exception 'studio_set_share_logo: Artist or Atelier plan required' using errcode = '42501';
  end if;
  if v_path not like v_user::text || '/%' or char_length(v_path) > 200 or not exists (
    select 1 from storage.objects o where o.bucket_id = 'studio-share-logos' and o.name = v_path
  ) then
    raise exception 'studio_set_share_logo: unknown file' using errcode = '22023';
  end if;

  insert into public.studio_share_logos as l (user_id, logo_path)
  values (v_user, v_path)
  on conflict (user_id) do update set logo_path = excluded.logo_path;
  return case when v_previous is distinct from v_path then v_previous end;
end;
$$;

comment on function public.studio_set_share_logo(text) is
  'Social exports (decision 101): record the caller''s logo (artist / atelier tier, a file of their folder in studio-share-logos) or remove it (null, always). Returns the previous path.';

revoke all on function public.studio_share_branding(), public.studio_set_share_logo(text) from public, anon;
grant execute on function public.studio_share_branding(), public.studio_set_share_logo(text) to authenticated;
