-- =============================================================================
-- Course reviews validation suite (migrations `20261113111154_course_reviews` and
-- `20261113140000_course_reviews_after_completion`, decision 141).
-- =============================================================================
-- Requires all migrations. ONE transaction, ALWAYS rolled back by raising
-- `ALL COURSE REVIEW TESTS PASSED` (or `FAIL: ...`).
-- Covers: a non-holder refused, a holder who has not completed the course
-- refused (even at 75 %), a holder who completed it accepted (system fields
-- forced, verified, no order for a grant), one review per learner and course, course tags only, draft course
-- refused, revoked access refused, visitors see published reviews only and
-- the stats view counts them (product stats untouched), another member can
-- neither edit nor delete, an author edit goes back to moderation, reports
-- and helpful votes by other members, moderators cannot rewrite the text, a
-- review stays published after the access is revoked.
-- =============================================================================

do $$
declare
  mgr  uuid := '00000000-0000-4000-a000-000001400001';  -- manager: manage_training + moderate_reviews
  lrn  uuid := '00000000-0000-4000-a000-000001400002';  -- learner granted the course
  oth  uuid := '00000000-0000-4000-a000-000001400003';  -- member who never held it
  rev  uuid := '00000000-0000-4000-a000-000001400004';  -- learner whose access is revoked
  c1   uuid := '00000000-0000-4000-a000-0000014000c1';  -- published
  c2   uuid := '00000000-0000-4000-a000-0000014000c2';  -- draft
  m1   uuid := '00000000-0000-4000-a000-0000014000a1';
  s1   uuid := '00000000-0000-4000-a000-0000014000b1';
  s2   uuid := '00000000-0000-4000-a000-0000014000b2';
  s3   uuid := '00000000-0000-4000-a000-0000014000b3';
  s4   uuid := '00000000-0000-4000-a000-0000014000b4';
  ent  uuid;
  rid  uuid;
  r    public.reviews;
  v_cnt int;
  v_txt text;
  passed text[] := '{}';
  body30 text := 'Une formation claire et très bien construite, merci.';
begin
  insert into auth.users (id, aud, role, email, created_at, updated_at) values
    (mgr, 'authenticated', 'authenticated', 'creviews140mgr.test@example.invalid', now(), now()),
    (lrn, 'authenticated', 'authenticated', 'creviews140lrn.test@example.invalid', now(), now()),
    (oth, 'authenticated', 'authenticated', 'creviews140oth.test@example.invalid', now(), now()),
    (rev, 'authenticated', 'authenticated', 'creviews140rev.test@example.invalid', now(), now());
  update public.profiles set role = 'manager' where id = mgr;
  update public.profiles set first_name = 'Léa', last_name = 'Martin' where id = lrn;

  -- The manager builds and publishes a four-step course, a draft, and grants access.
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('aal', 'aal2', 'sub', mgr, 'role', 'authenticated')::text, true);
  perform public.admin_save_course(jsonb_build_object(
    'id', c1, 'slug', 'avis-test-140', 'title', 'Avis test', 'category', 'technique', 'level', 'beginner',
    'price', '150.00',
    'modules', jsonb_build_array(
      jsonb_build_object('id', m1, 'title', 'Module', 'steps', jsonb_build_array(
        jsonb_build_object('id', s1, 'title', 'Un', 'duration_minutes', 5),
        jsonb_build_object('id', s2, 'title', 'Deux', 'duration_minutes', 5),
        jsonb_build_object('id', s3, 'title', 'Trois', 'duration_minutes', 5),
        jsonb_build_object('id', s4, 'title', 'Quatre', 'duration_minutes', 5))))));
  update public.courses set status = 'published' where id = c1;
  perform public.admin_save_course(jsonb_build_object(
    'id', c2, 'slug', 'avis-brouillon-140', 'title', 'Brouillon', 'category', 'technique', 'level', 'beginner',
    'price', '100.00', 'modules', '[]'::jsonb));
  perform public.admin_grant_course('creviews140lrn.test@example.invalid', c1);
  ent := public.admin_grant_course('creviews140rev.test@example.invalid', c1);

  -- R1: a member who never held the course is refused --------------------------------
  perform set_config('request.jwt.claims', json_build_object('aal', 'aal1', 'sub', oth, 'role', 'authenticated')::text, true);
  begin
    insert into public.reviews (course_id, user_id, author_name, rating, title, body, language)
    values (c1, oth, 'X', 5, 'Top', body30, 'fr');
    raise exception 'FAIL R1: a non-holder reviewed the course';
  exception when insufficient_privilege then null;
  end;
  passed := passed || 'R1'::text;

  -- R2: a holder who has not completed the course is refused, even at 75 % ----------
  perform set_config('request.jwt.claims', json_build_object('aal', 'aal1', 'sub', lrn, 'role', 'authenticated')::text, true);
  perform public.complete_course_step(s1);
  perform public.complete_course_step(s2);
  perform public.complete_course_step(s3);                 -- 3 of 4 = 75 %
  begin
    insert into public.reviews (course_id, user_id, author_name, rating, title, body, language)
    values (c1, lrn, 'X', 5, 'Top', body30, 'fr');
    raise exception 'FAIL R2: reviewed before completing the course';
  exception when insufficient_privilege then
    get stacked diagnostics v_txt = message_text;
    if v_txt not like '%complete the course%' then raise exception 'FAIL R2: wrong refusal (%)', v_txt; end if;
  end;
  passed := passed || 'R2'::text;

  -- R3: once the course is completed the review is accepted, system fields forced ----
  perform public.complete_course_step(s4);                 -- 4 of 4: completed
  select count(*) into v_cnt from public.course_completions where user_id = lrn and course_id = c1;
  if v_cnt <> 1 then raise exception 'FAIL R3: the course was not completed (setup)'; end if;
  insert into public.reviews (course_id, user_id, author_name, rating, title, body, language, tags,
                              status, helpful_count, published_at, response_body)
  values (c1, lrn, 'Fake Name', 4, '  Très claire  ', body30, 'fr', array['clear', 'beginner'],
          'published', 99, now(), 'self-reply')
  returning id into rid;
  select * into r from public.reviews where id = rid;
  if r.status <> 'pending' or r.helpful_count <> 0 or r.published_at is not null or r.response_body is not null
     or r.author_name <> 'Léa M.' or r.title <> 'Très claire' then
    raise exception 'FAIL R3: system fields not forced (%, %, %)', r.status, r.author_name, r.title;
  end if;
  if not r.is_verified or r.order_id is not null or r.product_id is not null then
    raise exception 'FAIL R3: verification wrong (verified %, order %)', r.is_verified, r.order_id;
  end if;
  passed := passed || 'R3'::text;

  -- R4: one review per learner and course ---------------------------------------------
  begin
    insert into public.reviews (course_id, user_id, author_name, rating, title, body, language)
    values (c1, lrn, 'X', 5, 'Encore', body30, 'fr');
    raise exception 'FAIL R4: second review accepted';
  exception when unique_violation then null;
  end;
  passed := passed || 'R4'::text;

  -- R5: course reviews take course tags only; one subject only ------------------------
  begin
    update public.reviews set tags = array['delivery'] where id = rid;
    raise exception 'FAIL R5: product tag on a course review';
  exception when check_violation then null;
  end;
  begin
    update public.reviews set course_id = c2 where id = rid;
    raise exception 'FAIL R5: subject changed';
  exception when insufficient_privilege then null;
  end;
  passed := passed || 'R5'::text;

  -- R6: a draft course cannot be reviewed --------------------------------------------
  begin
    insert into public.reviews (course_id, user_id, author_name, rating, title, body, language)
    values (c2, lrn, 'X', 5, 'Top', body30, 'fr');
    raise exception 'FAIL R6: draft course reviewed';
  exception when no_data_found then null;
  end;
  passed := passed || 'R6'::text;

  -- R7: revoked access is refused --------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('aal', 'aal1', 'sub', rev, 'role', 'authenticated')::text, true);
  perform public.complete_course_step(s1);
  perform public.complete_course_step(s2);
  perform public.complete_course_step(s3);
  perform set_config('request.jwt.claims', json_build_object('aal', 'aal2', 'sub', mgr, 'role', 'authenticated')::text, true);
  perform public.admin_revoke_course_entitlement(ent);
  perform set_config('request.jwt.claims', json_build_object('aal', 'aal1', 'sub', rev, 'role', 'authenticated')::text, true);
  begin
    insert into public.reviews (course_id, user_id, author_name, rating, title, body, language)
    values (c1, rev, 'X', 1, 'Bof', body30, 'fr');
    raise exception 'FAIL R7: revoked learner reviewed';
  exception when insufficient_privilege then null;
  end;
  passed := passed || 'R7'::text;

  -- R8: visitors do not see a pending review; nothing counted -------------------------
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  select count(*) into v_cnt from public.reviews where course_id = c1;
  if v_cnt <> 0 then raise exception 'FAIL R8: visitors read a pending review'; end if;
  select count(*) into v_cnt from public.course_review_stats where course_id = c1;
  if v_cnt <> 0 then raise exception 'FAIL R8: pending review counted'; end if;
  passed := passed || 'R8'::text;

  -- R9: another member can neither read nor edit nor delete it ------------------------
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('aal', 'aal1', 'sub', oth, 'role', 'authenticated')::text, true);
  update public.reviews set rating = 1 where id = rid;
  delete from public.reviews where id = rid;
  perform set_config('role', 'postgres', true);
  select * into r from public.reviews where id = rid;
  if r.id is null or r.rating <> 4 then raise exception 'FAIL R9: another member changed the review'; end if;
  passed := passed || 'R9'::text;

  -- R10: a moderator publishes but cannot rewrite; visitors then see it ---------------
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('aal', 'aal2', 'sub', mgr, 'role', 'authenticated')::text, true);
  begin
    update public.reviews set body = body30 || ' (édité)' where id = rid;
    raise exception 'FAIL R10: moderator rewrote the text';
  exception when insufficient_privilege then null;
  end;
  update public.reviews set status = 'published' where id = rid;
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  select count(*) into v_cnt from public.reviews where id = rid and course_id = c1 and is_verified;
  if v_cnt <> 1 then raise exception 'FAIL R10: visitors cannot read the published review'; end if;
  select review_count into v_cnt from public.course_review_stats where course_id = c1;
  if v_cnt is distinct from 1 then raise exception 'FAIL R10: stats count %', v_cnt; end if;
  select count(*) into v_cnt from public.product_review_stats where product_id is null;
  if v_cnt <> 0 then raise exception 'FAIL R10: course reviews leaked into product stats'; end if;
  passed := passed || 'R10'::text;

  -- R11: another member votes and reports; the author cannot -------------------------
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('aal', 'aal1', 'sub', oth, 'role', 'authenticated')::text, true);
  insert into public.review_helpful_votes (review_id, user_id) values (rid, oth);
  insert into public.review_reports (review_id, reason) values (rid, 'spam');
  perform set_config('request.jwt.claims', json_build_object('aal', 'aal1', 'sub', lrn, 'role', 'authenticated')::text, true);
  begin
    insert into public.review_helpful_votes (review_id, user_id) values (rid, lrn);
    raise exception 'FAIL R11: author voted for their own review';
  exception when insufficient_privilege then null;
  end;
  select helpful_count into v_cnt from public.reviews where id = rid;
  if v_cnt <> 1 then raise exception 'FAIL R11: helpful count %', v_cnt; end if;
  passed := passed || 'R11'::text;

  -- R13: a published review stays after the learner's access is revoked --------------
  perform set_config('role', 'postgres', true);
  select id into ent from public.course_entitlements where user_id = lrn and course_id = c1 and revoked_at is null;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('aal', 'aal2', 'sub', mgr, 'role', 'authenticated')::text, true);
  perform public.admin_revoke_course_entitlement(ent);
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  select count(*) into v_cnt from public.reviews where id = rid and status = 'published';
  if v_cnt <> 1 then raise exception 'FAIL R13: the review left the page after the revocation'; end if;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('aal', 'aal1', 'sub', lrn, 'role', 'authenticated')::text, true);
  passed := passed || 'R13'::text;

  -- R12: the author edits (back to moderation), then deletes -------------------------
  update public.reviews set rating = 5, tags = array['skills'] where id = rid;
  select * into r from public.reviews where id = rid;
  if r.status <> 'pending' or r.edited_at is null or r.rating <> 5 then
    raise exception 'FAIL R12: edit not sent back to moderation (%)', r.status;
  end if;
  delete from public.reviews where id = rid;
  perform set_config('role', 'postgres', true);
  select count(*) into v_cnt from public.reviews where id = rid;
  if v_cnt <> 0 then raise exception 'FAIL R12: author could not delete'; end if;
  passed := passed || 'R12'::text;

  raise exception 'ALL COURSE REVIEW TESTS PASSED: %', array_to_string(passed, ', ');
end;
$$;
