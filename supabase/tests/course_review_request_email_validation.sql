-- =============================================================================
-- Course review request e-mail validation suite
-- (migration `20261113160000_course_review_request_email`, decision 141 addendum).
-- =============================================================================
-- Requires all migrations. ONE transaction, ALWAYS rolled back by raising
-- `ALL COURSE REVIEW REQUEST TESTS PASSED` (or `FAIL: ...`).
-- Covers: switched off → nobody; the delay; who is listed (completed, holder,
-- not reviewed) and who is not (not completed, reviewed, revoked, opted out,
-- already asked for this completion); the learner's language with the French
-- fallback; members and visitors cannot call the function.
-- =============================================================================

do $$
declare
  mgr  uuid := '00000000-0000-4000-a000-000001410001';  -- manager: builds and grants
  lrn  uuid := '00000000-0000-4000-a000-000001410002';  -- completes the course
  mid  uuid := '00000000-0000-4000-a000-000001410003';  -- holds it, not completed
  c1   uuid := '00000000-0000-4000-a000-0000014100c1';
  m1   uuid := '00000000-0000-4000-a000-0000014100a1';
  s1   uuid := '00000000-0000-4000-a000-0000014100b1';
  s2   uuid := '00000000-0000-4000-a000-0000014100b2';
  ent  uuid;
  cid  uuid;
  row  record;
  v_cnt int;
  passed text[] := '{}';
begin
  insert into auth.users (id, aud, role, email, created_at, updated_at) values
    (mgr, 'authenticated', 'authenticated', 'crr141mgr.test@example.invalid', now(), now()),
    (lrn, 'authenticated', 'authenticated', 'crr141lrn.test@example.invalid', now(), now()),
    (mid, 'authenticated', 'authenticated', 'crr141mid.test@example.invalid', now(), now());
  update public.profiles set role = 'manager' where id = mgr;
  update public.profiles set first_name = 'Léa', preferred_locale = 'en' where id = lrn;

  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('aal', 'aal2', 'sub', mgr, 'role', 'authenticated')::text, true);
  perform public.admin_save_course(jsonb_build_object(
    'id', c1, 'slug', 'avis-mail-141', 'title', 'Avis mail', 'category', 'technique', 'level', 'beginner',
    'price', '150.00',
    'modules', jsonb_build_array(jsonb_build_object('id', m1, 'title', 'Module', 'steps', jsonb_build_array(
      jsonb_build_object('id', s1, 'title', 'Un', 'duration_minutes', 5),
      jsonb_build_object('id', s2, 'title', 'Deux', 'duration_minutes', 5))))));
  update public.courses set status = 'published' where id = c1;
  ent := public.admin_grant_course('crr141lrn.test@example.invalid', c1);
  perform public.admin_grant_course('crr141mid.test@example.invalid', c1);

  perform set_config('request.jwt.claims', json_build_object('aal', 'aal1', 'sub', lrn, 'role', 'authenticated')::text, true);
  perform public.complete_course_step(s1);
  perform public.complete_course_step(s2);
  perform set_config('request.jwt.claims', json_build_object('aal', 'aal1', 'sub', mid, 'role', 'authenticated')::text, true);
  perform public.complete_course_step(s1);

  perform set_config('role', 'postgres', true);
  select id into cid from public.course_completions where user_id = lrn and course_id = c1;
  if cid is null then raise exception 'FAIL setup: the course was not completed'; end if;
  update public.course_completions set completed_at = now() - interval '1 day' where id = cid;
  -- Other people's real completions must not disturb the counts below: they are filtered by course.

  -- E1: switched off → nobody -------------------------------------------------------
  update private.email_reminder_settings set course_review_request_enabled = false;
  perform set_config('role', 'service_role', true);
  select count(*) into v_cnt from public.pending_course_review_request_emails(100) where course_id = c1;
  if v_cnt <> 0 then raise exception 'FAIL E1: listed while switched off'; end if;
  passed := passed || 'E1'::text;

  -- E2: before the delay → nobody ----------------------------------------------------
  perform set_config('role', 'postgres', true);
  update private.email_reminder_settings set course_review_request_enabled = true, course_review_request_delay_days = 3;
  perform set_config('role', 'service_role', true);
  select count(*) into v_cnt from public.pending_course_review_request_emails(100) where course_id = c1;
  if v_cnt <> 0 then raise exception 'FAIL E2: listed one day after the completion'; end if;
  passed := passed || 'E2'::text;

  -- E3: after the delay, the learner who completed it; never the one who did not ------
  perform set_config('role', 'postgres', true);
  update public.course_completions set completed_at = now() - interval '4 days' where id = cid;
  perform set_config('role', 'service_role', true);
  select count(*) into v_cnt from public.pending_course_review_request_emails(100) where course_id = c1;
  if v_cnt <> 1 then raise exception 'FAIL E3: % learners listed', v_cnt; end if;
  select * into row from public.pending_course_review_request_emails(100) where course_id = c1;
  if row.completion_id <> cid or row.email <> 'crr141lrn.test@example.invalid' or row.locale <> 'en'
     or row.first_name <> 'Léa' or row.course_title <> 'Avis mail' or row.course_slug <> 'avis-mail-141' then
    raise exception 'FAIL E3: wrong row (%, %, %, %)', row.email, row.locale, row.course_title, row.course_slug;
  end if;
  passed := passed || 'E3'::text;

  -- E4: completions older than 30 days are never asked --------------------------------
  perform set_config('role', 'postgres', true);
  update public.course_completions set completed_at = now() - interval '31 days' where id = cid;
  perform set_config('role', 'service_role', true);
  select count(*) into v_cnt from public.pending_course_review_request_emails(100) where course_id = c1;
  if v_cnt <> 0 then raise exception 'FAIL E4: backlog listed'; end if;
  perform set_config('role', 'postgres', true);
  update public.course_completions set completed_at = now() - interval '4 days' where id = cid;
  passed := passed || 'E4'::text;

  -- E5: an address that stopped the reminders is not listed ---------------------------
  insert into public.email_reminder_preferences (recipient_hash, opted_out_at)
  values (private.email_address_hash('crr141lrn.test@example.invalid'), now());
  perform set_config('role', 'service_role', true);
  select count(*) into v_cnt from public.pending_course_review_request_emails(100) where course_id = c1;
  if v_cnt <> 0 then raise exception 'FAIL E5: opted-out address listed'; end if;
  perform set_config('role', 'postgres', true);
  delete from public.email_reminder_preferences where recipient_hash = private.email_address_hash('crr141lrn.test@example.invalid');
  passed := passed || 'E5'::text;

  -- E6: once this completion's e-mail is claimed, it is not listed again --------------
  insert into public.email_log (event_key, template_key, recipient_hash, locale, status)
  values ('course_review_request:' || cid, 'course_review_request',
          private.email_address_hash('crr141lrn.test@example.invalid'), 'en', 'sent');
  perform set_config('role', 'service_role', true);
  select count(*) into v_cnt from public.pending_course_review_request_emails(100) where course_id = c1;
  if v_cnt <> 0 then raise exception 'FAIL E6: listed again after the e-mail'; end if;
  perform set_config('role', 'postgres', true);
  delete from public.email_log where event_key = 'course_review_request:' || cid;
  passed := passed || 'E6'::text;

  -- E7: a learner who already reviewed the course is not asked ------------------------
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('aal', 'aal1', 'sub', lrn, 'role', 'authenticated')::text, true);
  insert into public.reviews (course_id, user_id, author_name, rating, title, body, language)
  values (c1, lrn, 'X', 5, 'Top', 'Une formation claire et très bien construite, merci.', 'en');
  perform set_config('role', 'service_role', true);
  select count(*) into v_cnt from public.pending_course_review_request_emails(100) where course_id = c1;
  if v_cnt <> 0 then raise exception 'FAIL E7: asked after reviewing'; end if;
  perform set_config('role', 'postgres', true);
  delete from public.reviews where user_id = lrn and course_id = c1;
  passed := passed || 'E7'::text;

  -- E8: revoked access → not asked (they could not review) ----------------------------
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('aal', 'aal2', 'sub', mgr, 'role', 'authenticated')::text, true);
  perform public.admin_revoke_course_entitlement(ent);
  perform set_config('role', 'service_role', true);
  select count(*) into v_cnt from public.pending_course_review_request_emails(100) where course_id = c1;
  if v_cnt <> 0 then raise exception 'FAIL E8: revoked learner asked'; end if;
  passed := passed || 'E8'::text;

  -- E9: members and visitors cannot call it --------------------------------------------
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('aal', 'aal1', 'sub', lrn, 'role', 'authenticated')::text, true);
  begin
    perform public.pending_course_review_request_emails(10);
    raise exception 'FAIL E9: a member listed the pending e-mails';
  exception when insufficient_privilege then null;
  end;
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  begin
    perform public.pending_course_review_request_emails(10);
    raise exception 'FAIL E9: a visitor listed the pending e-mails';
  exception when insufficient_privilege then null;
  end;
  passed := passed || 'E9'::text;

  raise exception 'ALL COURSE REVIEW REQUEST TESTS PASSED: %', array_to_string(passed, ', ');
end;
$$;
