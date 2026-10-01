-- =============================================================================
-- Iteration 21 validation suite — Academy public pages (migration `…_academy_public_pages`).
-- =============================================================================
-- Requires all migrations. ONE transaction, ALWAYS rolled back by raising
-- `ALL ITERATION 21 TESTS PASSED` (or `FAIL: ...`).
-- =============================================================================

do $$
declare
  mgr     uuid := '00000000-0000-4000-a000-000000210001';  -- manager: manage_training
  vwr     uuid := '00000000-0000-4000-a000-000000210002';  -- viewer: staff, read only
  cst     uuid := '00000000-0000-4000-a000-000000210003';  -- customer
  c1      uuid := '00000000-0000-4000-a000-0000002100c1';  -- published
  c2      uuid := '00000000-0000-4000-a000-0000002100c2';  -- draft
  m1      uuid := '00000000-0000-4000-a000-0000002100a1';
  m2      uuid := '00000000-0000-4000-a000-0000002100a2';
  s1      uuid := '00000000-0000-4000-a000-0000002100b1';
  s2      uuid := '00000000-0000-4000-a000-0000002100b2';
  s3      uuid := '00000000-0000-4000-a000-0000002100b3';
  b1      uuid := '00000000-0000-4000-a000-0000002100d1';
  qz      uuid := '00000000-0000-4000-a000-0000002100e1';
  q1      uuid := '00000000-0000-4000-a000-0000002100f1';
  cover   uuid := '00000000-0000-4000-a000-000000210201';  -- cover of c1
  other   uuid := '00000000-0000-4000-a000-000000210202';  -- lesson image, not a cover
  draftc  uuid := '00000000-0000-4000-a000-000000210203';  -- cover of the draft c2
  v_cnt   int;
  v_txt   text;
  v_num   numeric;
  passed  text[] := '{}';
begin
  insert into auth.users (id, aud, role, email, created_at, updated_at) values
    (mgr, 'authenticated', 'authenticated', 'academy21mgr.test@example.invalid', now(), now()),
    (vwr, 'authenticated', 'authenticated', 'academy21vwr.test@example.invalid', now(), now()),
    (cst, 'authenticated', 'authenticated', 'academy21cst.test@example.invalid', now(), now());
  update public.profiles set role = 'manager' where id = mgr;
  update public.profiles set role = 'viewer'  where id = vwr;

  -- Files in the private bucket (written as the owner: uploads are not under test)
  insert into storage.objects (bucket_id, name) values
    ('training-media', 'media/' || cover  || '/cover.jpg'),
    ('training-media', 'media/' || other  || '/lesson.jpg'),
    ('training-media', 'media/' || draftc || '/draft.jpg');

  -- Build as the manager: one published course, one draft ---------------------------
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', mgr, 'role', 'authenticated')::text, true);

  insert into public.training_media (id, kind, storage_path, mime_type, name, alt_text, bytes, width, height, tags) values
    (cover,  'image', 'media/' || cover  || '/cover.jpg',  'image/jpeg', 'Couverture interne', 'Pose d’une gem', 1000, 1600, 900, '{interne}'),
    (other,  'image', 'media/' || other  || '/lesson.jpg', 'image/jpeg', 'Image de leçon', null, 1000, 800, 600, '{}'),
    (draftc, 'image', 'media/' || draftc || '/draft.jpg',  'image/jpeg', 'Brouillon', null, 1000, 800, 600, '{}');
  insert into public.training_media_translations (media_id, locale, alt_text) values (cover, 'en', 'Placing a gem');

  perform public.admin_save_course(jsonb_build_object(
    'id', c1, 'slug', 'pose-test-21', 'title', 'Pose test', 'short_description', 'Court',
    'cover_media_id', cover, 'category', 'technique', 'level', 'beginner', 'duration_minutes', 90, 'price', '200.00', 'currency', 'EUR',
    'en', jsonb_build_object('title', 'Placement test', 'slug', 'placement-test-21'),
    'modules', jsonb_build_array(
      jsonb_build_object('id', m1, 'title', 'Préparer', 'en', jsonb_build_object('title', 'Prepare'),
        'steps', jsonb_build_array(
          jsonb_build_object('id', s1, 'title', 'Hygiène', 'duration_minutes', 12,
            'en', jsonb_build_object('title', 'Hygiene'),
            'blocks', jsonb_build_array(
              jsonb_build_object('id', b1, 'kind', 'image', 'media_id', other, 'alt_text', 'Poste')))),
        'quiz', jsonb_build_object('id', qz, 'title', 'Contrôle', 'passing_score', 80,
          'questions', jsonb_build_array(
            jsonb_build_object('id', q1, 'text', 'Combien ?',
              'answers', jsonb_build_array(
                jsonb_build_object('id', gen_random_uuid(), 'text', 'Un', 'is_correct', true),
                jsonb_build_object('id', gen_random_uuid(), 'text', 'Deux', 'is_correct', false)))))),
      jsonb_build_object('id', m2, 'title', 'Poser', 'steps',
        jsonb_build_array(jsonb_build_object('id', s2, 'title', 'Pose', 'duration_minutes', 20))))));
  update public.courses set status = 'published' where id = c1;

  perform public.admin_save_course(jsonb_build_object(
    'id', c2, 'slug', 'brouillon-21', 'title', 'Brouillon', 'cover_media_id', draftc,
    'category', 'technique', 'level', 'beginner', 'price', '100.00',
    'modules', jsonb_build_array(
      jsonb_build_object('id', gen_random_uuid(), 'title', 'Secret', 'steps',
        jsonb_build_array(jsonb_build_object('id', s3, 'title', 'Étape secrète'))))));

  insert into public.course_promotions (course_id, label, discount_type, discount_value, starts_at, ends_at)
  values (c1, 'Interne rentrée', 'percentage', 25, now() - interval '1 day', now() + interval '7 days');

  -- Anonymous visitor ---------------------------------------------------------------
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);

  -- N1: the published course and its English translation; never the draft -----------
  select count(*) into v_cnt from public.courses where id in (c1, c2);
  if v_cnt <> 1 then raise exception 'FAIL N1: visitor sees % courses', v_cnt; end if;
  select slug into v_txt from public.course_translations where course_id = c1 and locale = 'en';
  if v_txt is distinct from 'placement-test-21' then raise exception 'FAIL N1: English slug %', v_txt; end if;
  passed := passed || 'N1'::text;

  -- N2: who wrote a course is not readable --------------------------------------------
  begin
    select created_by::text into v_txt from public.courses where id = c1;
    raise exception 'FAIL N2: visitor reads courses.created_by';
  exception when insufficient_privilege then null;
  end;
  select title into v_txt from public.courses where id = c1;
  if v_txt <> 'Pose test' then raise exception 'FAIL N2: listed columns unreadable'; end if;
  passed := passed || 'N2'::text;

  -- N3: the outline of the published course (modules, steps, checks, translations) ---
  select count(*) into v_cnt from public.course_modules where course_id = c1;
  if v_cnt <> 2 then raise exception 'FAIL N3: % modules', v_cnt; end if;
  select count(*) into v_cnt from public.course_steps s join public.course_modules m on m.id = s.module_id where m.course_id = c1;
  if v_cnt <> 2 then raise exception 'FAIL N3: % steps', v_cnt; end if;
  select passing_score into v_cnt from public.course_quizzes where module_id = m1;
  if v_cnt is distinct from 80 then raise exception 'FAIL N3: quiz pass mark %', v_cnt; end if;
  select title into v_txt from public.course_module_translations where module_id = m1 and locale = 'en';
  if v_txt is distinct from 'Prepare' then raise exception 'FAIL N3: module translation %', v_txt; end if;
  select title into v_txt from public.course_step_translations where step_id = s1 and locale = 'en';
  if v_txt is distinct from 'Hygiene' then raise exception 'FAIL N3: step translation %', v_txt; end if;
  passed := passed || 'N3'::text;

  -- N4: nothing of the draft, none of the content -------------------------------------
  select count(*) into v_cnt from public.course_modules where course_id = c2;
  if v_cnt <> 0 then raise exception 'FAIL N4: draft modules visible'; end if;
  if exists (select 1 from public.course_steps where id = s3) then raise exception 'FAIL N4: draft step visible'; end if;
  select count(*) into v_cnt from public.course_blocks;
  if v_cnt <> 0 then raise exception 'FAIL N4: visitor reads lesson content'; end if;
  select count(*) into v_cnt from public.quiz_questions;
  if v_cnt <> 0 then raise exception 'FAIL N4: visitor reads questions'; end if;
  select count(*) into v_cnt from public.quiz_answers;
  if v_cnt <> 0 then raise exception 'FAIL N4: visitor reads answer keys'; end if;
  passed := passed || 'N4'::text;

  -- N5: the cover of the published course, and only it --------------------------------
  select count(*) into v_cnt from public.training_media where id in (cover, other, draftc);
  if v_cnt <> 1 then raise exception 'FAIL N5: visitor sees % media rows', v_cnt; end if;
  select storage_path into v_txt from public.training_media where id = cover;
  if v_txt is distinct from 'media/' || cover || '/cover.jpg' then raise exception 'FAIL N5: cover path %', v_txt; end if;
  select alt_text into v_txt from public.training_media_translations where media_id = cover and locale = 'en';
  if v_txt is distinct from 'Placing a gem' then raise exception 'FAIL N5: cover translation %', v_txt; end if;
  begin
    select name into v_txt from public.training_media where id = cover;
    raise exception 'FAIL N5: visitor reads the media''s internal name';
  exception when insufficient_privilege then null;
  end;
  select count(*) into v_cnt from storage.objects where bucket_id = 'training-media';
  if v_cnt <> 1 then raise exception 'FAIL N5: visitor sees % bucket objects', v_cnt; end if;
  if not exists (select 1 from storage.objects where bucket_id = 'training-media' and name = 'media/' || cover || '/cover.jpg') then
    raise exception 'FAIL N5: cover file unreadable';
  end if;
  passed := passed || 'N5'::text;

  -- N6: the discounted price is public, the promotion row is not ----------------------
  select current_price into v_num from public.course_current_prices where course_id = c1;
  if v_num is distinct from 150.00 then raise exception 'FAIL N6: visitor price %', v_num; end if;
  select count(*) into v_cnt from public.course_current_prices where course_id = c1 and promotion_ends_at is not null;
  if v_cnt <> 1 then raise exception 'FAIL N6: promotion end date missing'; end if;
  select count(*) into v_cnt from public.course_current_prices where course_id = c2;
  if v_cnt <> 0 then raise exception 'FAIL N6: draft price visible'; end if;
  begin
    select label into v_txt from public.course_promotions where course_id = c1;
    raise exception 'FAIL N6: visitor reads course_promotions';
  exception when insufficient_privilege then null;
  end;
  passed := passed || 'N6'::text;

  -- Customer -------------------------------------------------------------------------
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', cst, 'role', 'authenticated')::text, true);

  -- C1: same outline and price, no promotion rows, no other media ---------------------
  select count(*) into v_cnt from public.course_modules where course_id in (c1, c2);
  if v_cnt <> 2 then raise exception 'FAIL C1: customer sees % modules', v_cnt; end if;
  select current_price into v_num from public.course_current_prices where course_id = c1;
  if v_num is distinct from 150.00 then raise exception 'FAIL C1: customer price %', v_num; end if;
  select count(*) into v_cnt from public.course_promotions;
  if v_cnt <> 0 then raise exception 'FAIL C1: customer reads % promotion rows', v_cnt; end if;
  select count(*) into v_cnt from public.training_media where id in (other, draftc);
  if v_cnt <> 0 then raise exception 'FAIL C1: customer reads non-cover media'; end if;
  select count(*) into v_cnt from public.course_blocks;
  if v_cnt <> 0 then raise exception 'FAIL C1: customer reads lesson content'; end if;
  passed := passed || 'C1'::text;

  -- Viewer (staff) ---------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', vwr, 'role', 'authenticated')::text, true);

  -- V1: staff still read everything, the promotion label included -------------------
  select label into v_txt from public.course_promotions where course_id = c1;
  if v_txt is distinct from 'Interne rentrée' then raise exception 'FAIL V1: staff promotion label %', v_txt; end if;
  select count(*) into v_cnt from public.training_media where id in (cover, other, draftc);
  if v_cnt <> 3 then raise exception 'FAIL V1: staff see % media', v_cnt; end if;
  select count(*) into v_cnt from public.course_modules where course_id = c2;
  if v_cnt <> 1 then raise exception 'FAIL V1: staff do not see draft modules'; end if;
  select count(*) into v_cnt from storage.objects where bucket_id = 'training-media';
  if v_cnt <> 3 then raise exception 'FAIL V1: staff see % files', v_cnt; end if;
  passed := passed || 'V1'::text;

  -- U1: once withdrawn, the outline, cover and price disappear for visitors -----------
  perform set_config('request.jwt.claims', json_build_object('sub', mgr, 'role', 'authenticated')::text, true);
  update public.courses set status = 'unpublished' where id = c1;
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  select count(*) into v_cnt from public.course_modules where course_id = c1;
  if v_cnt <> 0 then raise exception 'FAIL U1: withdrawn outline visible'; end if;
  select count(*) into v_cnt from public.training_media where id = cover;
  if v_cnt <> 0 then raise exception 'FAIL U1: withdrawn cover row visible'; end if;
  select count(*) into v_cnt from storage.objects where bucket_id = 'training-media';
  if v_cnt <> 0 then raise exception 'FAIL U1: withdrawn cover file visible'; end if;
  select count(*) into v_cnt from public.course_current_prices where course_id = c1;
  if v_cnt <> 0 then raise exception 'FAIL U1: withdrawn price visible'; end if;
  passed := passed || 'U1'::text;

  reset role;
  raise exception 'ALL ITERATION 21 TESTS PASSED (%)', array_to_string(passed, ', ');
end;
$$;
