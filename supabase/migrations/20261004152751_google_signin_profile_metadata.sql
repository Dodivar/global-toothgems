-- =============================================================================
-- Google sign-in: read the identity Google supplies when the profile is created.
-- =============================================================================
-- An account created through Google (`signInWithOAuth`) carries no registration
-- form answers: Google puts `given_name`, `family_name`, `full_name` / `name` in
-- the user metadata. `handle_new_auth_user` only read `first_name` / `last_name`
-- / `display_name`, so a Google member would have had an empty profile.
-- The form keys keep priority; the Google keys are only a fallback. Nothing else
-- changes: the role is still always the default, invalid optional values are
-- still dropped, and no consent is recorded here (Google never shows our terms:
-- the consent is asked for on the account page, see supabase/README.md).
-- =============================================================================

create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta      jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_country text  := upper(nullif(trim(meta ->> 'country'), ''));
  v_locale  text  := lower(nullif(trim(meta ->> 'locale'), ''));
  v_phone   text  := nullif(trim(meta ->> 'phone'), '');
  v_persona text  := nullif(trim(meta ->> 'persona'), '');
  v_interest text := nullif(trim(meta ->> 'interest'), '');
  v_version text  := left(nullif(trim(meta ->> 'policy_version'), ''), 40);
begin
  insert into public.profiles (id, email, first_name, last_name, display_name, phone,
                               country_code, preferred_locale, persona, interest)
  values (
    new.id,
    new.email,
    left(coalesce(nullif(trim(meta ->> 'first_name'), ''), nullif(trim(meta ->> 'given_name'), '')), 100),
    left(coalesce(nullif(trim(meta ->> 'last_name'), ''), nullif(trim(meta ->> 'family_name'), '')), 100),
    left(coalesce(nullif(trim(meta ->> 'display_name'), ''), nullif(trim(meta ->> 'full_name'), ''),
                  nullif(trim(meta ->> 'name'), '')), 100),
    case when v_phone ~ '^\+?[0-9 ().-]{6,20}$' then v_phone end,
    case when v_country ~ '^[A-Z]{2}$' then v_country end,
    coalesce((select l.code from public.languages l where l.code = v_locale and l.is_enabled), 'fr'),
    case when v_persona in ('artist', 'student', 'customer', 'other') then v_persona end,
    case when v_interest in ('products', 'training', 'community', 'all') then v_interest end
  )
  on conflict (id) do nothing;

  if v_version is not null then
    if (meta ->> 'terms_accepted') = 'true' then
      insert into public.consent_records (user_id, purpose, granted, policy_version, source)
      values (new.id, 'terms', true, v_version, 'registration'),
             (new.id, 'privacy', true, v_version, 'registration');
    end if;
    if (meta ->> 'marketing') in ('true', 'false') then
      insert into public.consent_records (user_id, purpose, granted, policy_version, source)
      values (new.id, 'marketing_email', (meta ->> 'marketing')::boolean, v_version, 'registration');
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.handle_new_auth_user() from public;
