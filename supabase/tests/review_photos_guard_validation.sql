-- =============================================================================
-- Review photos update guard (migration `20261120163844_review_photos_update_guard`,
-- security review of 2026-11-20).
-- =============================================================================
-- Requires all migrations. ONE transaction, ALWAYS rolled back by raising
-- `ALL REVIEW PHOTO GUARD TESTS PASSED` (or `FAIL: ...`).
-- Covers, on a published review: the author cannot repoint a photo's file
-- (`storage_path`) or move it to another review (`review_id`); another member
-- cannot touch it; the author may change the alt text, which sends the review
-- back to moderation; even the backend cannot change a photo's file.
-- =============================================================================

do $$
declare
  mgr  uuid := '00000000-0000-4000-a000-000001500001';  -- manager: manage_training + moderate_reviews
  lrn  uuid := '00000000-0000-4000-a000-000001500002';  -- learner who completed the course
  oth  uuid := '00000000-0000-4000-a000-000001500003';  -- another member
  c1   uuid := '00000000-0000-4000-a000-0000015000c1';
  m1   uuid := '00000000-0000-4000-a000-0000015000a1';
  s1   uuid := '00000000-0000-4000-a000-0000015000b1';
  rid  uuid;
  pid  uuid;
  r    public.reviews;
  v_cnt int;
  v_txt text;
  passed text[] := '{}';
begin
  insert into auth.users (id, aud, role, email, created_at, updated_at) values
    (mgr, 'authenticated', 'authenticated', 'rphoto150mgr.test@example.invalid', now(), now()),
    (lrn, 'authenticated', 'authenticated', 'rphoto150lrn.test@example.invalid', now(), now()),
    (oth, 'authenticated', 'authenticated', 'rphoto150oth.test@example.invalid', now(), now());
  update public.profiles set role = 'manager' where id = mgr;
  update public.profiles set first_name = 'Léa', last_name = 'Martin' where id = lrn;

  -- Setup: a one-step published course, granted to the learner.
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('aal', 'aal2', 'sub', mgr, 'role', 'authenticated')::text, true);
  perform public.admin_save_course(jsonb_build_object(
    'id', c1, 'slug', 'photo-test-150', 'title', 'Photo test', 'category', 'technique', 'level', 'beginner',
    'price', '150.00',
    'modules', jsonb_build_array(
      jsonb_build_object('id', m1, 'title', 'Module', 'steps', jsonb_build_array(
        jsonb_build_object('id', s1, 'title', 'Un', 'duration_minutes', 5))))));
  update public.courses set status = 'published' where id = c1;
  perform public.admin_grant_course('rphoto150lrn.test@example.invalid', c1);

  -- The learner completes it, reviews it with one photo; the manager publishes the review.
  perform set_config('request.jwt.claims', json_build_object('aal', 'aal1', 'sub', lrn, 'role', 'authenticated')::text, true);
  perform public.complete_course_step(s1);
  insert into public.reviews (course_id, user_id, author_name, rating, title, body, language)
  values (c1, lrn, 'X', 5, 'Top', 'Une formation claire et très bien construite, merci.', 'fr')
  returning id into rid;
  insert into public.review_photos (review_id, storage_path, alt_text, position)
  values (rid, lrn::text || '/approved.jpg', 'Résultat', 0)
  returning id into pid;

  perform set_config('request.jwt.claims', json_build_object('aal', 'aal2', 'sub', mgr, 'role', 'authenticated')::text, true);
  update public.reviews set status = 'published' where id = rid;
  select * into r from public.reviews where id = rid;
  if r.status <> 'published' then raise exception 'FAIL setup: review not published (%)', r.status; end if;

  -- P1: the author cannot repoint the photo's file ---------------------------------
  perform set_config('request.jwt.claims', json_build_object('aal', 'aal1', 'sub', lrn, 'role', 'authenticated')::text, true);
  begin
    update public.review_photos set storage_path = lrn::text || '/unmoderated.jpg' where id = pid;
    raise exception 'FAIL P1: the author changed storage_path';
  exception when insufficient_privilege then null;
  end;
  passed := passed || 'P1'::text;

  -- P2: the author cannot move the photo to another review -------------------------
  begin
    update public.review_photos set review_id = gen_random_uuid() where id = pid;
    raise exception 'FAIL P2: the author changed review_id';
  exception when insufficient_privilege then null;
  end;
  select * into r from public.reviews where id = rid;
  if r.status <> 'published' then raise exception 'FAIL P2: refused edits changed the review (%)', r.status; end if;
  passed := passed || 'P2'::text;

  -- P3: another member cannot change the alt text ----------------------------------
  perform set_config('request.jwt.claims', json_build_object('aal', 'aal1', 'sub', oth, 'role', 'authenticated')::text, true);
  update public.review_photos set alt_text = 'Piraté' where id = pid;
  get diagnostics v_cnt = row_count;
  if v_cnt <> 0 then raise exception 'FAIL P3: another member edited the photo'; end if;
  passed := passed || 'P3'::text;

  -- P4: the author may change the alt text; the review goes back to moderation -----
  perform set_config('request.jwt.claims', json_build_object('aal', 'aal1', 'sub', lrn, 'role', 'authenticated')::text, true);
  update public.review_photos set alt_text = 'Après la pose' where id = pid;
  get diagnostics v_cnt = row_count;
  if v_cnt <> 1 then raise exception 'FAIL P4: the author could not change the alt text'; end if;
  select * into r from public.reviews where id = rid;
  if r.status <> 'pending' or r.edited_at is null then
    raise exception 'FAIL P4: alt text change not sent back to moderation (%)', r.status;
  end if;
  passed := passed || 'P4'::text;

  -- P5: even the backend cannot change a photo's file (the trigger refuses) --------
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
  begin
    update public.review_photos set storage_path = lrn::text || '/other.jpg' where id = pid;
    raise exception 'FAIL P5: storage_path changed by the backend';
  exception when insufficient_privilege then
    get stacked diagnostics v_txt = message_text;
    if v_txt not like '%cannot change%' then raise exception 'FAIL P5: wrong refusal (%)', v_txt; end if;
  end;
  select storage_path into v_txt from public.review_photos where id = pid;
  if v_txt <> lrn::text || '/approved.jpg' then raise exception 'FAIL P5: storage_path is %', v_txt; end if;
  passed := passed || 'P5'::text;

  raise exception 'ALL REVIEW PHOTO GUARD TESTS PASSED: %', array_to_string(passed, ', ');
end;
$$;
