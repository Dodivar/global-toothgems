-- =============================================================================
-- Iteration 12 validation suite — member sign-up through Supabase Auth.
-- =============================================================================
-- The webapp now creates accounts with `supabase.auth.signUp`, sending the
-- registration answers as user metadata (`registrationMetadata()` in
-- webapp/src/lib/registration.ts). No schema change was needed: this suite pins
-- the contract between that metadata and `private.handle_new_auth_user`, plus
-- what a signed-in member may then change on their own profile.
--
-- Requires all migrations. ONE transaction, ALWAYS rolled back by raising
-- `ALL ITERATION 12 TESTS PASSED` (or `FAIL: ...`).
-- =============================================================================

do $$
declare
  m1 uuid := '00000000-0000-4000-a000-000000120001';
  m2 uuid := '00000000-0000-4000-a000-000000120002';
  p  public.profiles;
  v_cnt int;
  passed text[] := '{}';
begin
  -- S1: the full registration form becomes a profile and three consents -------
  insert into auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at) values
    (m1, 'authenticated', 'authenticated', 'signup12.test@example.invalid',
     '{"first_name":" Léa ","last_name":"Martin","phone":"+32 470 12 34 56","country":"BE","locale":"en",
       "persona":"artist","interest":"training","terms_accepted":true,"marketing":true,
       "policy_version":"2026-09-26","role":"admin"}', now(), now());
  select * into p from public.profiles where id = m1;
  if p.first_name <> 'Léa' or p.last_name <> 'Martin' or p.phone <> '+32 470 12 34 56'
     or p.country_code <> 'BE' or p.preferred_locale <> 'en' or p.persona <> 'artist' or p.interest <> 'training' then
    raise exception 'FAIL S1: registration answers not copied: %', row_to_json(p);
  end if;
  select count(*) into v_cnt from public.member_consents
   where user_id = m1 and granted and policy_version = '2026-09-26' and source = 'registration'
     and purpose in ('terms', 'privacy', 'marketing_email');
  if v_cnt <> 3 then raise exception 'FAIL S1: expected 3 registration consents, got %', v_cnt; end if;
  if not p.marketing_opt_in then raise exception 'FAIL S1: marketing opt-in cache not set'; end if;
  passed := passed || 'S1'::text;

  -- S2: metadata never grants a role ------------------------------------------
  if p.role <> 'customer' then raise exception 'FAIL S2: role taken from metadata: %', p.role; end if;
  passed := passed || 'S2'::text;

  -- S3: invalid or missing optional answers are dropped, not fatal -------------
  insert into auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at) values
    (m2, 'authenticated', 'authenticated', 'signup12b.test@example.invalid',
     '{"first_name":"Noa","phone":"call me","country":"France","locale":"xx","persona":"boss",
       "terms_accepted":true,"marketing":false,"policy_version":"2026-09-26"}', now(), now());
  select * into p from public.profiles where id = m2;
  if p.phone is not null or p.country_code is not null or p.persona is not null or p.preferred_locale <> 'fr' then
    raise exception 'FAIL S3: invalid answers kept: %', row_to_json(p);
  end if;
  if p.marketing_opt_in then raise exception 'FAIL S3: declined marketing recorded as opt-in'; end if;
  passed := passed || 'S3'::text;

  -- Act as the new member ------------------------------------------------------
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', m1, 'role', 'authenticated')::text, true);

  -- S4: the member edits their own name and phone -------------------------------
  update public.profiles set first_name = 'Léna', phone = '+33 6 00 00 00 00' where id = m1;
  if not exists (select 1 from public.profiles where id = m1 and first_name = 'Léna') then
    raise exception 'FAIL S4: own profile update refused';
  end if;
  passed := passed || 'S4'::text;

  -- S5: the opt-in cache is read-only; the newsletter choice is a consent record
  begin
    update public.profiles set marketing_opt_in = false where id = m1;
    raise exception 'FAIL S5: marketing_opt_in written directly';
  exception when insufficient_privilege then null;
  end;
  insert into public.consent_records (user_id, purpose, granted, policy_version, source)
  values (m1, 'marketing_email', false, '2026-09-26', 'account');
  if exists (select 1 from public.profiles where id = m1 and marketing_opt_in) then
    raise exception 'FAIL S5: withdrawal not reflected in the opt-in cache';
  end if;
  passed := passed || 'S5'::text;

  -- S6: a member cannot record consent as "registration" nor for someone else --
  begin
    insert into public.consent_records (user_id, purpose, granted, policy_version, source)
    values (m1, 'marketing_email', true, '2026-09-26', 'registration');
    raise exception 'FAIL S6: member recorded a registration consent';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.consent_records (user_id, purpose, granted, policy_version, source)
    values (m2, 'marketing_email', true, '2026-09-26', 'account');
    raise exception 'FAIL S6: member recorded consent for another account';
  exception when insufficient_privilege then null;
  end;
  passed := passed || 'S6'::text;

  -- S7: a member cannot read another member's profile -----------------------------
  if exists (select 1 from public.profiles where id = m2) then
    raise exception 'FAIL S7: another profile is readable';
  end if;
  passed := passed || 'S7'::text;

  raise exception 'ALL ITERATION 12 TESTS PASSED: %', array_to_string(passed, ', ');
end;
$$;
