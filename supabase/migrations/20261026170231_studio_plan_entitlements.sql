-- =============================================================================
-- 3D Studio: what each plan includes (decision 113, owner's request 2026-10-26)
-- =============================================================================
-- "The first plan is limited in features and in what it can save, the second
-- has more features and more Gem Groups and creations, the third has almost
-- everything unlimited plus the Glowbook, where clients can try the
-- creations on their smile with the AI."
--
--   plan        creations   Gem Groups   Glowbook   smile try-on
--   essential   15          3            no         no
--   artist      150         30           no         no
--   atelier     unlimited   unlimited    yes        yes (decision 111 (a))
--
-- The tier is private.studio_user_tier() (decision 101): an active trial
-- counts as essential, active staff as atelier.
--
--   * Saved content: a BEFORE INSERT trigger on `creations` and `gem_groups`
--     refuses a new row once the owner holds their plan's number (SQLSTATE
--     GTL01, mapped by the browser to "limit reached"). It counts every row
--     of the owner (Glowbook and template copies included). Editing,
--     deleting and reading are never limited: after a downgrade the member
--     keeps everything, and only saves a new one once under the limit again.
--     A per-owner advisory lock keeps two concurrent saves from both passing.
--     Rows written without a Studio tier (service role) are not counted:
--     members without access are already refused by RLS.
--   * Glowbook: reserved to the Atelier tier (private.glowbook_allowed). The
--     owner's writes (page, creations, order, look, sections, spotlight video)
--     are refused below it, and the public page, its creations, renders,
--     pictures and video are shown only while the author is on it — hidden
--     after a downgrade, back as they were on an upgrade (same rule as the
--     loss of Studio access, decision 99). Deleting one's Glowbook or a
--     creation from it stays allowed whatever the plan.
--   * studio_access_state() also returns the tier, the limits and the
--     member's usage, so the pages show them; the database stays the
--     authority.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. The plan's numbers
-- -----------------------------------------------------------------------------
-- Null = unlimited (atelier) or no tier at all.
create or replace function private.studio_plan_limit(p_tier text, p_kind text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_tier
    when 'essential' then case p_kind when 'creations' then 15 when 'gem_groups' then 3 end
    when 'artist'    then case p_kind when 'creations' then 150 when 'gem_groups' then 30 end
  end;
$$;

comment on function private.studio_plan_limit(text, text) is
  '3D Studio (decision 113): how many creations / gem_groups a plan tier may hold; null = unlimited (atelier) or no tier. Mirrored for display in webapp/src/data/studio.ts.';

-- -----------------------------------------------------------------------------
-- 2. The saved-content limit
-- -----------------------------------------------------------------------------
create or replace function private.studio_enforce_plan_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kind  text := tg_argv[0];
  v_limit integer := private.studio_plan_limit(private.studio_user_tier(new.user_id), v_kind);
  v_count integer;
begin
  if v_limit is null then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('studio_plan_limit:' || v_kind || ':' || new.user_id::text, 0));
  if v_kind = 'creations' then
    select count(*) into v_count from public.creations c where c.user_id = new.user_id;
  else
    select count(*) into v_count from public.gem_groups g where g.user_id = new.user_id;
  end if;
  if v_count >= v_limit then
    raise exception 'studio plan limit reached: % (%)', v_kind, v_limit using errcode = 'GTL01';
  end if;
  return new;
end;
$$;

comment on function private.studio_enforce_plan_limit() is
  '3D Studio (decision 113): refuses a new creation / Gem Group once the owner holds their plan''s number (SQLSTATE GTL01).';

create trigger creations_plan_limit
  before insert on public.creations
  for each row execute function private.studio_enforce_plan_limit('creations');
create trigger gem_groups_plan_limit
  before insert on public.gem_groups
  for each row execute function private.studio_enforce_plan_limit('gem_groups');

-- -----------------------------------------------------------------------------
-- 3. The Glowbook's plan
-- -----------------------------------------------------------------------------
create or replace function private.glowbook_allowed(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.studio_user_tier(p_user) = 'atelier', false);
$$;

comment on function private.glowbook_allowed(uuid) is
  'Glowbook (decision 113): whether this member may run a Glowbook and whether it is public — the Atelier tier only (Atelier subscription or active staff).';

-- The look, sections and spotlight video follow the Glowbook itself.
create or replace function private.glowbook_customization_allowed(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.glowbook_allowed(p_user);
$$;

comment on function private.glowbook_customization_allowed(uuid) is
  'Glowbook look (decision 100): who may customise their Glowbook and whose custom look the public page shows. Since decision 113: the Glowbook''s own plan (private.glowbook_allowed).';

-- Owner writes: the page, adding a creation, the order.
create or replace function public.studio_save_showcase(p_handle text, p_display_name text, p_bio text, p_instagram text)
returns public.studio_showcases
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user      uuid := (select auth.uid());
  v_handle    text := lower(btrim(coalesce(p_handle, '')));
  v_name      text := btrim(coalesce(p_display_name, ''));
  v_bio       text := btrim(coalesce(p_bio, ''));
  v_instagram text := nullif(ltrim(btrim(coalesce(p_instagram, '')), '@'), '');
  v_current   public.studio_showcases;
  v_row       public.studio_showcases;
begin
  if v_user is null or not private.has_studio_access() or not private.glowbook_allowed(v_user) then
    raise exception 'studio_save_showcase: Glowbook plan required' using errcode = '42501';
  end if;
  if v_handle !~ '^[a-z0-9]([a-z0-9._-]{1,28})[a-z0-9]$' or v_handle ~ '[._-]{2}' then
    raise exception 'studio_save_showcase: invalid handle' using errcode = '22023';
  end if;
  if v_handle in ('admin', 'api', 'app', 'aide', 'help', 'support', 'contact', 'studio', 'studio-3d', '3d-studio',
                  'glowbook', 'boutique', 'shop', 'academy', 'compte', 'account', 'moderation', 'staff', 'www',
                  'globaltoothgems', 'global-toothgems', 'global.toothgems', 'toothgems') then
    raise exception 'studio_save_showcase: reserved handle' using errcode = '22023';
  end if;
  if char_length(v_name) not between 1 and 60 then
    raise exception 'studio_save_showcase: invalid display name' using errcode = '22023';
  end if;
  if char_length(v_bio) > 300 then
    raise exception 'studio_save_showcase: bio too long' using errcode = '22023';
  end if;
  if v_instagram is not null and v_instagram !~ '^[A-Za-z0-9._]{1,30}$' then
    raise exception 'studio_save_showcase: invalid Instagram account' using errcode = '22023';
  end if;
  if exists (select 1 from public.studio_showcases s where s.handle = v_handle and s.user_id <> v_user) then
    raise exception 'studio_save_showcase: handle taken' using errcode = '23505';
  end if;

  select * into v_current from public.studio_showcases s where s.user_id = v_user for update;

  if v_current.user_id is null then
    insert into public.studio_showcases (user_id, handle, display_name, bio, instagram)
    values (v_user, v_handle, v_name, v_bio, v_instagram)
    returning * into v_row;
    return v_row;
  end if;

  update public.studio_showcases s
     set handle       = v_handle,
         display_name = v_name,
         bio          = v_bio,
         instagram    = v_instagram,
         -- A new address, or a page re-sent after a rejection, is reviewed again;
         -- other edits of an approved page are public at once (decision 99).
         status       = case when s.status = 'rejected' or s.handle <> v_handle then 'pending' else s.status end,
         review_note  = case when s.status = 'rejected' or s.handle <> v_handle then null else s.review_note end,
         submitted_at = case when s.status = 'rejected' or s.handle <> v_handle then now() else s.submitted_at end
   where s.user_id = v_user
  returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.studio_showcase_add(p_creation_id uuid)
returns public.studio_showcase_items
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_row  public.studio_showcase_items;
begin
  if v_user is null or not private.has_studio_access() or not private.glowbook_allowed(v_user) then
    raise exception 'studio_showcase_add: Glowbook plan required' using errcode = '42501';
  end if;
  if not exists (select 1 from public.studio_showcases s where s.user_id = v_user) then
    raise exception 'studio_showcase_add: no Glowbook yet' using errcode = 'P0002';
  end if;
  if not exists (
    select 1 from public.creations c
     where c.id = p_creation_id and c.user_id = v_user
       and jsonb_array_length(coalesce(c.scene_data -> 'pieces', '[]'::jsonb)) > 0
  ) then
    raise exception 'studio_showcase_add: creation not found' using errcode = 'P0002';
  end if;
  if (select count(*) from public.studio_showcase_items i where i.user_id = v_user) >= 60
     and not exists (select 1 from public.studio_showcase_items i where i.creation_id = p_creation_id) then
    raise exception 'studio_showcase_add: Glowbook full' using errcode = '54000';
  end if;

  insert into public.studio_showcase_items (user_id, creation_id, position)
  values (v_user, p_creation_id,
          coalesce((select max(i.position) + 1 from public.studio_showcase_items i where i.user_id = v_user), 0))
  on conflict (creation_id) do update
     -- Already there: re-sent for review only after a rejection.
     set status       = case when public.studio_showcase_items.status = 'rejected' then 'pending' else public.studio_showcase_items.status end,
         review_note  = case when public.studio_showcase_items.status = 'rejected' then null else public.studio_showcase_items.review_note end,
         submitted_at = case when public.studio_showcase_items.status = 'rejected' then now() else public.studio_showcase_items.submitted_at end
   where public.studio_showcase_items.user_id = v_user
  returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.studio_showcase_reorder(p_creation_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null or not private.has_studio_access() or not private.glowbook_allowed(v_user) then
    raise exception 'studio_showcase_reorder: Glowbook plan required' using errcode = '42501';
  end if;
  if p_creation_ids is null or cardinality(p_creation_ids) > 60 then
    raise exception 'studio_showcase_reorder: invalid order' using errcode = '22023';
  end if;
  update public.studio_showcase_items i
     set position = o.ord - 1
    from unnest(p_creation_ids) with ordinality as o(creation_id, ord)
   where i.creation_id = o.creation_id and i.user_id = v_user and i.position <> o.ord - 1;
end;
$$;

-- Public reads: the author must be on the Glowbook's plan (it implies Studio access).
create or replace function public.studio_public_showcase(p_handle text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
           'handle', s.handle,
           'display_name', s.display_name,
           'bio', s.bio,
           'instagram', s.instagram,
           'location', s.location,
           'look', case when private.glowbook_customization_allowed(s.user_id) then jsonb_build_object(
             'accent', s.accent, 'background', s.background, 'layout', s.layout,
             'avatar_path', s.avatar_path, 'banner_path', s.banner_path,
             'booking_url', s.booking_url, 'website_url', s.website_url, 'tiktok', s.tiktok,
             -- Where the artist works (decision 107); an area is already rounded.
             'place', case when s.place_mode is not null then jsonb_build_object(
               'mode', s.place_mode, 'label', s.place_label, 'lat', s.place_lat, 'lng', s.place_lng) end,
             'featured_item_id', (select i.id from public.studio_showcase_items i
                                   where i.id = s.featured_item_id and i.status = 'approved'),
             -- The spotlight's turning video, only while it matches the approved spotlight (decision 103).
             'spotlight_video', case when exists (select 1 from public.studio_showcase_items i
                                                   where i.id = s.featured_item_id and i.status = 'approved')
                                      and private.glowbook_spotlight_video_current(s.user_id)
                                     then jsonb_build_object('path', s.spotlight_video_path,
                                                             'type', s.spotlight_video_type,
                                                             'seconds', s.spotlight_video_seconds)
                                     else null end)
             else null end,
           -- Sections holding at least one approved creation, in the artist's order (plan switch).
           'sections', case when private.glowbook_customization_allowed(s.user_id) then coalesce((
             select jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name) order by x.position, x.created_at)
               from public.studio_showcase_sections x
              where x.user_id = s.user_id
                and exists (select 1 from public.studio_showcase_items i
                             where i.section_id = x.id and i.user_id = s.user_id and i.status = 'approved')
           ), '[]'::jsonb) else '[]'::jsonb end,
           -- Course titles only; absent when hidden or when there is none.
           'certification', case when s.show_certification
                                  and jsonb_array_length(private.glowbook_certification(s.user_id)) > 0
                                 then jsonb_build_object('courses', private.glowbook_certification(s.user_id))
                                 else null end,
           'items', coalesce((
             select jsonb_agg(jsonb_build_object(
                      'id', i.id,
                      'name', c.name,
                      'description', c.description,
                      'element_count', jsonb_array_length(coalesce(c.scene_data -> 'pieces', '[]'::jsonb)),
                      'thumbnail_path', c.thumbnail_path,
                      'updated_at', c.updated_at,
                      'section_id', case when private.glowbook_customization_allowed(s.user_id) then i.section_id end)
                    order by i.position, i.created_at)
               from public.studio_showcase_items i
               join public.creations c on c.id = i.creation_id
              where i.user_id = s.user_id and i.status = 'approved'
           ), '[]'::jsonb))
    from public.studio_showcases s
   where s.handle = lower(btrim(p_handle))
     and s.status = 'approved'
     and private.glowbook_allowed(s.user_id);
$$;

create or replace function public.studio_public_showcase_creation(p_handle text, p_item_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
           'handle', s.handle,
           'display_name', s.display_name,
           'name', c.name,
           'description', c.description,
           'scene_data', c.scene_data || jsonb_build_object(
             'groups', coalesce((
               select jsonb_agg(g || jsonb_build_object('gemGroupId', null))
                 from jsonb_array_elements(case when jsonb_typeof(c.scene_data -> 'groups') = 'array'
                                                then c.scene_data -> 'groups' else '[]'::jsonb end) g
             ), '[]'::jsonb)),
           'updated_at', c.updated_at,
           'try_on', private.studio_try_on_allowed(s.user_id))
    from public.studio_showcases s
    join public.studio_showcase_items i on i.user_id = s.user_id and i.id = p_item_id and i.status = 'approved'
    join public.creations c on c.id = i.creation_id
   where s.handle = lower(btrim(p_handle))
     and s.status = 'approved'
     and private.glowbook_allowed(s.user_id);
$$;

create or replace function private.is_studio_showcase_thumbnail(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.creations c
      join public.studio_showcase_items i on i.creation_id = c.id and i.status = 'approved'
      join public.studio_showcases s on s.user_id = i.user_id and s.status = 'approved'
     where c.thumbnail_path = p_name
       and private.glowbook_allowed(s.user_id)
  );
$$;

create or replace function private.is_public_glowbook_media(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.studio_showcases s
     where (s.avatar_path = p_name or s.banner_path = p_name)
       and s.status = 'approved'
       and private.glowbook_allowed(s.user_id)
  );
$$;

create or replace function private.is_public_glowbook_video(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.studio_showcases s
      join public.studio_showcase_items i on i.id = s.featured_item_id and i.status = 'approved'
     where s.spotlight_video_path = p_name
       and s.status = 'approved'
       and private.glowbook_allowed(s.user_id)
       and private.glowbook_spotlight_video_current(s.user_id)
  );
$$;

-- -----------------------------------------------------------------------------
-- 4. What the browser is told
-- -----------------------------------------------------------------------------
create or replace function private.studio_access_json(p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_trial public.studio_trials;
  v_sub   public.studio_subscriptions;
  v_state text;
  v_tier  text := private.studio_user_tier(p_user);
begin
  select * into v_trial from public.studio_trials t where t.user_id = p_user;
  select * into v_sub from public.studio_subscriptions s
   where s.user_id = p_user
     and s.status <> 'incomplete_expired'
   order by (s.status in ('active', 'trialing', 'past_due') and s.current_period_end > now()) desc,
            s.current_period_end desc
   limit 1;

  v_state := case
    when private.studio_subscription_active(p_user) then 'subscribed'
    when private.is_staff() then 'staff'
    when v_trial.user_id is not null and now() < v_trial.trial_expires_at then 'trial_active'
    when v_sub.id is not null and v_sub.status = 'incomplete' then 'subscription_pending'
    when v_trial.user_id is not null then 'trial_expired'
    when v_sub.id is not null then 'subscription_ended'
    else 'not_started'
  end;

  return jsonb_build_object(
    'state', v_state,
    'server_now', now(),
    'trial_started_at', v_trial.trial_started_at,
    'trial_expires_at', v_trial.trial_expires_at,
    'first_creation_at', v_trial.first_creation_at,
    'subscription_plan', v_sub.plan,
    'subscription_status', v_sub.status,
    'subscription_period_end', v_sub.current_period_end,
    'subscription_interval', v_sub.billing_interval,
    'subscription_cancel_at_period_end', v_sub.cancel_at_period_end,
    -- Decision 113: the plan's entitlements and what the member holds.
    'tier', v_tier,
    'glowbook', coalesce(v_tier = 'atelier', false),
    'limits', jsonb_build_object(
      'creations', private.studio_plan_limit(v_tier, 'creations'),
      'gem_groups', private.studio_plan_limit(v_tier, 'gem_groups')),
    'usage', jsonb_build_object(
      'creations', (select count(*) from public.creations c where c.user_id = p_user),
      'gem_groups', (select count(*) from public.gem_groups g where g.user_id = p_user))
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- 5. Grants (private helpers are not callable by members)
-- -----------------------------------------------------------------------------
revoke all on function private.studio_plan_limit(text, text), private.studio_enforce_plan_limit(),
                       private.glowbook_allowed(uuid) from public;
grant execute on function private.studio_plan_limit(text, text), private.glowbook_allowed(uuid) to service_role;
