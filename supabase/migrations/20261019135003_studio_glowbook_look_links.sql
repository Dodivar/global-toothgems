-- Glowbook look (decision 100): Postgres regular expressions cap a repetition
-- at 255, so the link checks of 20261019134715 (`{3,290}`) could not run.
-- Same rule, written as a pattern plus a length.
alter table public.studio_showcases
  drop constraint studio_showcases_booking_url_check,
  drop constraint studio_showcases_website_url_check,
  add constraint studio_showcases_booking_url_check
    check (booking_url ~ '^https://[^\s<>"]+$' and char_length(booking_url) between 11 and 300),
  add constraint studio_showcases_website_url_check
    check (website_url ~ '^https://[^\s<>"]+$' and char_length(website_url) between 11 and 300);

create or replace function private.glowbook_link_valid(p_url text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_url ~ '^https://[^\s<>"]+$' and char_length(p_url) between 11 and 300;
$$;

create or replace function public.studio_save_showcase_look(p_look jsonb)
returns public.studio_showcases
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user    uuid := (select auth.uid());
  v_row     public.studio_showcases;
  v_pending jsonb;
  v_key     text;
  v_value   text;
  v_current text;
begin
  if v_user is null or not private.has_studio_access() or not private.glowbook_customization_allowed(v_user) then
    raise exception 'studio_save_showcase_look: Studio access required' using errcode = '42501';
  end if;
  if p_look is null or jsonb_typeof(p_look) <> 'object' then
    raise exception 'studio_save_showcase_look: invalid look' using errcode = '22023';
  end if;
  select * into v_row from public.studio_showcases s where s.user_id = v_user for update;
  if v_row.user_id is null then
    raise exception 'studio_save_showcase_look: no Glowbook yet' using errcode = 'P0002';
  end if;

  -- Live settings (the CHECKs validate the lists).
  if p_look ? 'accent' then v_row.accent := p_look ->> 'accent'; end if;
  if p_look ? 'background' then v_row.background := p_look ->> 'background'; end if;
  if p_look ? 'layout' then v_row.layout := p_look ->> 'layout'; end if;
  if p_look ? 'location' then v_row.location := nullif(btrim(coalesce(p_look ->> 'location', '')), ''); end if;
  if p_look ? 'featured_item_id' then
    v_row.featured_item_id := nullif(p_look ->> 'featured_item_id', '')::uuid;
    if v_row.featured_item_id is not null and not exists (
      select 1 from public.studio_showcase_items i where i.id = v_row.featured_item_id and i.user_id = v_user
    ) then
      raise exception 'studio_save_showcase_look: not one of your creations' using errcode = '22023';
    end if;
  end if;

  -- Pictures and links: removed at once, or proposed.
  v_pending := coalesce(v_row.pending_changes, '{}'::jsonb);
  foreach v_key in array array['avatar_path', 'banner_path', 'booking_url', 'website_url', 'tiktok'] loop
    continue when not p_look ? v_key;
    v_value := nullif(btrim(coalesce(p_look ->> v_key, '')), '');
    if v_key = 'tiktok' then v_value := ltrim(v_value, '@'); end if;
    v_current := case v_key when 'avatar_path' then v_row.avatar_path when 'banner_path' then v_row.banner_path
                            when 'booking_url' then v_row.booking_url when 'website_url' then v_row.website_url
                            else v_row.tiktok end;
    if v_value is null then
      v_pending := v_pending - v_key;
      case v_key when 'avatar_path' then v_row.avatar_path := null; when 'banner_path' then v_row.banner_path := null;
                 when 'booking_url' then v_row.booking_url := null; when 'website_url' then v_row.website_url := null;
                 else v_row.tiktok := null; end case;
    elsif v_value is not distinct from v_current then
      v_pending := v_pending - v_key;
    else
      if v_key in ('avatar_path', 'banner_path') then
        if v_value not like v_user::text || '/%' or not exists (
          select 1 from storage.objects o where o.bucket_id = 'glowbook-media' and o.name = v_value
        ) then
          raise exception 'studio_save_showcase_look: unknown picture' using errcode = '22023';
        end if;
      elsif v_key in ('booking_url', 'website_url') then
        if not private.glowbook_link_valid(v_value) then
          raise exception 'studio_save_showcase_look: invalid link' using errcode = '22023';
        end if;
      elsif v_value !~ '^[A-Za-z0-9._]{2,24}$' then
        raise exception 'studio_save_showcase_look: invalid TikTok account' using errcode = '22023';
      end if;
      v_pending := v_pending || jsonb_build_object(v_key, v_value);
    end if;
  end loop;

  if v_pending = '{}'::jsonb then
    v_row.pending_changes := null;
    v_row.changes_submitted_at := null;
  elsif v_pending is distinct from v_row.pending_changes then
    v_row.pending_changes := v_pending;
    v_row.changes_submitted_at := now();
    v_row.changes_review_note := null;
  end if;

  update public.studio_showcases s
     set accent = v_row.accent, background = v_row.background, layout = v_row.layout,
         location = v_row.location, featured_item_id = v_row.featured_item_id,
         avatar_path = v_row.avatar_path, banner_path = v_row.banner_path,
         booking_url = v_row.booking_url, website_url = v_row.website_url, tiktok = v_row.tiktok,
         pending_changes = v_row.pending_changes, changes_submitted_at = v_row.changes_submitted_at,
         changes_review_note = v_row.changes_review_note
   where s.user_id = v_user
  returning * into v_row;
  return v_row;
end;
$$;

revoke all on function private.glowbook_link_valid(text) from public;
grant execute on function private.glowbook_link_valid(text) to authenticated, service_role;
