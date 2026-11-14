-- Glowbook calendar import (decision 144, lot 3): the address check used a
-- repetition count above Postgres's limit (255), an invalid regular expression;
-- the length is now checked on its own. Found by the suite.
alter table public.glowbook_booking_settings drop constraint glowbook_booking_settings_import_url_check;
alter table public.glowbook_booking_settings add constraint glowbook_booking_settings_import_url_check
  check (char_length(import_url) between 11 and 1000 and import_url ~ '^https://[^\s<>"]+$');

create or replace function public.glowbook_set_calendar_import(p_url text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.glowbook_require_artist();
  v_url text := nullif(btrim(coalesce(p_url, '')), '');
begin
  if v_url is not null then
    -- webcal:// is how calendar apps often give the address: same thing over https.
    if v_url ~* '^webcals?://' then
      v_url := regexp_replace(v_url, '^webcals?://', 'https://', 'i');
    end if;
    if char_length(v_url) not between 11 and 1000 or v_url !~ '^https://[^\s<>"]+$' then
      raise exception 'glowbook_booking: invalid' using errcode = '22023';
    end if;
  end if;
  insert into public.glowbook_booking_settings (user_id, import_url)
  values (v_uid, v_url)
  on conflict (user_id) do update
     set import_url = excluded.import_url, import_checked_at = null, import_status = null, import_error = null;
  if v_url is null then
    delete from public.glowbook_calendar_overrides o where o.user_id = v_uid and o.source = 'import';
  end if;
end;
$$;

revoke all on function public.glowbook_set_calendar_import(text) from public, anon;
grant execute on function public.glowbook_set_calendar_import(text) to authenticated;
