-- Glowbook: no Instagram account any more (decision 146 (a), owner's choice
-- 2026-11-15). After the outside links went away (20261115132328), the
-- Instagram account was kept for staff only; the owner chose to remove it too.
--
-- * the column is emptied and must stay empty (CHECK); kept rather than
--   dropped, so the change can be reversed and studio_showcase_queue() keeps
--   its shape;
-- * studio_save_showcase() keeps its signature (the app sends '') but refuses
--   an account (null or '' accepted).

update public.studio_showcases set instagram = null where instagram is not null;

alter table public.studio_showcases
  add constraint studio_showcases_no_instagram check (instagram is null);

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
  -- No Instagram account any more (decision 146 (a)).
  if nullif(btrim(coalesce(p_instagram, '')), '') is not null then
    raise exception 'studio_save_showcase: Instagram account not accepted' using errcode = '22023';
  end if;
  if exists (select 1 from public.studio_showcases s where s.handle = v_handle and s.user_id <> v_user) then
    raise exception 'studio_save_showcase: handle taken' using errcode = '23505';
  end if;

  select * into v_current from public.studio_showcases s where s.user_id = v_user for update;

  if v_current.user_id is null then
    insert into public.studio_showcases (user_id, handle, display_name, bio)
    values (v_user, v_handle, v_name, v_bio)
    returning * into v_row;
    return v_row;
  end if;

  update public.studio_showcases s
     set handle       = v_handle,
         display_name = v_name,
         bio          = v_bio,
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
