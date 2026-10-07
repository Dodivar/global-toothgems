-- =============================================================================
-- Iteration 22 validation suite — Academy learner access (migration `…_academy_learner_access`).
-- =============================================================================
-- Requires all migrations. ONE transaction, ALWAYS rolled back by raising
-- `ALL ITERATION 22 TESTS PASSED` (or `FAIL: ...`).
-- Covers: manual grants (permission, audit), content without answer keys,
-- another member refused (content, answers, media, progress), path rules
-- (locking, attempts, scoring, immediate feedback first answer stands),
-- completion and certificate, unpublished course greyed out, revocation.
-- =============================================================================

do $$
declare
  mgr   uuid := '00000000-0000-4000-a000-000000220001';  -- manager: manage_training
  cst   uuid := '00000000-0000-4000-a000-000000220002';  -- member who is granted the course
  oth   uuid := '00000000-0000-4000-a000-000000220003';  -- another member, never granted
  cs2   uuid := '00000000-0000-4000-a000-000000220004';  -- member used for the unlimited attempts
  c1    uuid := '00000000-0000-4000-a000-0000002200c1';  -- published, granted
  c2    uuid := '00000000-0000-4000-a000-0000002200c2';  -- draft
  m1    uuid := '00000000-0000-4000-a000-0000002200a1';
  m2    uuid := '00000000-0000-4000-a000-0000002200a2';
  s1    uuid := '00000000-0000-4000-a000-0000002200b1';
  s2    uuid := '00000000-0000-4000-a000-0000002200b2';
  s3    uuid := '00000000-0000-4000-a000-0000002200b3';
  b1    uuid := '00000000-0000-4000-a000-0000002200d1';
  qz1   uuid := '00000000-0000-4000-a000-0000002200e1';
  qz2   uuid := '00000000-0000-4000-a000-0000002200e2';
  q1    uuid := '00000000-0000-4000-a000-0000002200f1';
  q2    uuid := '00000000-0000-4000-a000-0000002200f2';
  q3    uuid := '00000000-0000-4000-a000-0000002200f3';
  a1    uuid := '00000000-0000-4000-a000-000000220101';  -- q1 correct
  a2    uuid := '00000000-0000-4000-a000-000000220102';
  a3    uuid := '00000000-0000-4000-a000-000000220103';  -- q2 correct
  a4    uuid := '00000000-0000-4000-a000-000000220104';
  a5    uuid := '00000000-0000-4000-a000-000000220105';  -- q3 correct
  a6    uuid := '00000000-0000-4000-a000-000000220106';
  cov   uuid := '00000000-0000-4000-a000-000000220201';  -- cover of c1
  img   uuid := '00000000-0000-4000-a000-000000220202';  -- lesson image of c1
  ent   uuid;
  v     jsonb;
  v_cnt int;
  v_txt text;
  passed text[] := '{}';
begin
  insert into auth.users (id, aud, role, email, created_at, updated_at) values
    (mgr, 'authenticated', 'authenticated', 'academy22mgr.test@example.invalid', now(), now()),
    (cst, 'authenticated', 'authenticated', 'academy22cst.test@example.invalid', now(), now()),
    (oth, 'authenticated', 'authenticated', 'academy22oth.test@example.invalid', now(), now()),
    (cs2, 'authenticated', 'authenticated', 'academy22cs2.test@example.invalid', now(), now());
  update public.profiles set role = 'manager' where id = mgr;

  insert into storage.objects (bucket_id, name) values
    ('training-media', 'media/' || cov || '/cover.jpg'),
    ('training-media', 'media/' || img || '/lesson.jpg');

  -- Build as the manager -------------------------------------------------------------
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', mgr, 'role', 'authenticated')::text, true);

  insert into public.training_media (id, kind, storage_path, mime_type, name, bytes) values
    (cov, 'image', 'media/' || cov || '/cover.jpg',  'image/jpeg', 'Couverture', 1000),
    (img, 'image', 'media/' || img || '/lesson.jpg', 'image/jpeg', 'Leçon', 1000);

  perform public.admin_save_course(jsonb_build_object(
    'id', c1, 'slug', 'pose-test-22', 'title', 'Pose test', 'cover_media_id', cov,
    'category', 'technique', 'level', 'beginner', 'price', '200.00', 'min_score', 70,
    'modules', jsonb_build_array(
      jsonb_build_object('id', m1, 'title', 'Préparer', 'steps', jsonb_build_array(
          jsonb_build_object('id', s1, 'title', 'Hygiène', 'duration_minutes', 10, 'blocks', jsonb_build_array(
            jsonb_build_object('id', b1, 'kind', 'image', 'media_id', img, 'alt_text', 'Poste'))),
          jsonb_build_object('id', s2, 'title', 'Matériel', 'duration_minutes', 5)),
        'quiz', jsonb_build_object('id', qz1, 'title', 'Contrôle 1', 'passing_score', 80,
          'immediate_feedback', false, 'show_answers', true,
          'questions', jsonb_build_array(
            jsonb_build_object('id', q1, 'text', 'Q1', 'correct_feedback', 'BRAVO-SECRET',
              'incorrect_feedback', 'RATE-SECRET', 'answers', jsonb_build_array(
                jsonb_build_object('id', a1, 'text', 'Un', 'is_correct', true, 'explanation', 'EXPLAIN-SECRET'),
                jsonb_build_object('id', a2, 'text', 'Deux', 'is_correct', false))),
            jsonb_build_object('id', q2, 'text', 'Q2', 'answers', jsonb_build_array(
                jsonb_build_object('id', a3, 'text', 'Trois', 'is_correct', true),
                jsonb_build_object('id', a4, 'text', 'Quatre', 'is_correct', false)))))),
      jsonb_build_object('id', m2, 'title', 'Poser', 'steps', jsonb_build_array(
          jsonb_build_object('id', s3, 'title', 'Pose', 'duration_minutes', 20)),
        'quiz', jsonb_build_object('id', qz2, 'title', 'Contrôle 2', 'passing_score', 50,
          'immediate_feedback', true, 'show_answers', false,
          'questions', jsonb_build_array(
            jsonb_build_object('id', q3, 'text', 'Q3', 'answers', jsonb_build_array(
                jsonb_build_object('id', a5, 'text', 'Cinq', 'is_correct', true),
                jsonb_build_object('id', a6, 'text', 'Six', 'is_correct', false)))))))));
  update public.courses set status = 'published' where id = c1;

  perform public.admin_save_course(jsonb_build_object(
    'id', c2, 'slug', 'brouillon-22', 'title', 'Brouillon', 'category', 'technique', 'level', 'beginner',
    'price', '100.00', 'modules', '[]'::jsonb));

  -- E1: grants are staff-only, by function --------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', cst, 'role', 'authenticated')::text, true);
  begin
    perform public.admin_grant_course('academy22cst.test@example.invalid', c1);
    raise exception 'FAIL E1: a customer granted a course';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.course_entitlements (user_id, course_id, source) values (cst, c1, 'manual_grant');
    raise exception 'FAIL E1: a customer inserted an entitlement';
  exception when insufficient_privilege then null;
  end;
  passed := passed || 'E1'::text;

  -- E2: the manager grants by e-mail; duplicates, drafts, unknown members refused -------
  perform set_config('request.jwt.claims', json_build_object('sub', mgr, 'role', 'authenticated')::text, true);
  ent := public.admin_grant_course(' Academy22CST.test@example.invalid ', c1, null, 'Offerte');
  perform public.admin_grant_course('academy22cs2.test@example.invalid', c1);
  begin
    perform public.admin_grant_course('academy22cst.test@example.invalid', c1);
    raise exception 'FAIL E2: granted twice';
  exception when unique_violation then null;
  end;
  begin
    perform public.admin_grant_course('academy22oth.test@example.invalid', c2);
    raise exception 'FAIL E2: granted a draft';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.admin_grant_course('nobody22.test@example.invalid', c1);
    raise exception 'FAIL E2: granted an unknown e-mail';
  exception when no_data_found then null;
  end;
  begin
    perform public.admin_grant_course('academy22oth.test@example.invalid', c1, now() - interval '1 day');
    raise exception 'FAIL E2: granted an expiry in the past';
  exception when invalid_parameter_value then null;
  end;
  select count(*) into v_cnt from public.admin_course_entitlements(c1) where revoked_at is null;
  if v_cnt <> 2 then raise exception 'FAIL E2: % holders listed', v_cnt; end if;
  passed := passed || 'E2'::text;

  -- O1: another member is refused everything ------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', oth, 'role', 'authenticated')::text, true);
  if public.learner_courses() <> '[]'::jsonb then raise exception 'FAIL O1: content returned to a non-holder'; end if;
  begin
    perform public.complete_course_step(s1);
    raise exception 'FAIL O1: non-holder completed a step';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.submit_quiz_answers(m1, jsonb_build_object(q1, a1));
    raise exception 'FAIL O1: non-holder submitted a check';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.answer_quiz_question(m2, q3, a5);
    raise exception 'FAIL O1: non-holder got a correction';
  exception when insufficient_privilege then null;
  end;
  select count(*) into v_cnt from public.course_blocks where step_id = s1;
  if v_cnt <> 0 then raise exception 'FAIL O1: non-holder reads lesson content'; end if;
  select count(*) into v_cnt from public.quiz_answers where question_id in (q1, q2, q3);
  if v_cnt <> 0 then raise exception 'FAIL O1: non-holder reads answers'; end if;
  if exists (select 1 from storage.objects where bucket_id = 'training-media' and name = 'media/' || img || '/lesson.jpg') then
    raise exception 'FAIL O1: non-holder reads the lesson image';
  end if;
  begin
    perform public.admin_course_entitlements(c1);
    raise exception 'FAIL O1: customer listed holders';
  exception when insufficient_privilege then null;
  end;
  select count(*) into v_cnt from public.course_entitlements;
  if v_cnt <> 0 then raise exception 'FAIL O1: non-holder reads % entitlements', v_cnt; end if;
  passed := passed || 'O1'::text;

  -- H1: the holder reads the course, without answer keys or feedback -------------------
  perform set_config('request.jwt.claims', json_build_object('sub', cst, 'role', 'authenticated')::text, true);
  v := public.learner_courses();
  if jsonb_array_length(v) <> 1 or v -> 0 ->> 'id' <> c1::text then raise exception 'FAIL H1: %', v; end if;
  if jsonb_array_length(v -> 0 -> 'modules') <> 2 then raise exception 'FAIL H1: modules missing'; end if;
  if v -> 0 -> 'modules' -> 0 -> 'steps' -> 0 -> 'blocks' -> 0 ->> 'media_id' <> img::text then
    raise exception 'FAIL H1: block media missing';
  end if;
  if v -> 0 -> 'media' -> img::text ->> 'path' <> 'media/' || img || '/lesson.jpg' then
    raise exception 'FAIL H1: media path missing';
  end if;
  v_txt := v::text;
  if v_txt like '%is_correct%' or v_txt like '%SECRET%' or v_txt like '%explanation%' then
    raise exception 'FAIL H1: answer keys or feedback in the content';
  end if;
  if v -> 0 -> 'entitlement' ->> 'source' <> 'manual_grant' then raise exception 'FAIL H1: entitlement'; end if;
  select count(*) into v_cnt from public.course_entitlements where user_id = cst;
  if v_cnt <> 1 then raise exception 'FAIL H1: holder reads % own entitlements', v_cnt; end if;
  select count(*) into v_cnt from public.quiz_answers;
  if v_cnt <> 0 then raise exception 'FAIL H1: holder reads quiz_answers directly'; end if;
  select count(*) into v_cnt from storage.objects
   where bucket_id = 'training-media' and name in ('media/' || img || '/lesson.jpg', 'media/' || cov || '/cover.jpg');
  if v_cnt <> 2 then raise exception 'FAIL H1: holder reads % of the course files', v_cnt; end if;
  passed := passed || 'H1'::text;

  -- P1: sequential unlocking; progress only through functions ---------------------------
  begin
    perform public.complete_course_step(s2);
    raise exception 'FAIL P1: completed a locked step';
  exception when invalid_parameter_value then null;
  end;
  v := public.complete_course_step(s1);
  if jsonb_array_length(v -> 'steps') <> 1 then raise exception 'FAIL P1: %', v; end if;
  perform public.complete_course_step(s1);  -- idempotent
  perform public.complete_course_step(s2);
  begin
    insert into public.lesson_progress (user_id, course_id, step_id) values (cst, c1, s3);
    raise exception 'FAIL P1: progress inserted directly';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.complete_course_step(s3);
    raise exception 'FAIL P1: step after an unpassed required check completed';
  exception when invalid_parameter_value then null;
  end;
  passed := passed || 'P1'::text;

  -- Q1: end-of-check scoring and corrections (show_answers on) --------------------------
  v := public.submit_quiz_answers(m1, jsonb_build_object(q1, a1, q2, a4));
  if (v ->> 'score')::int <> 50 or (v ->> 'passed')::boolean or (v ->> 'passing_score')::int <> 80 then
    raise exception 'FAIL Q1: %', v;
  end if;
  select c into v from jsonb_array_elements(v -> 'corrections') c where c ->> 'question_id' = q2::text;
  if (v ->> 'correct')::boolean or v ->> 'correct_answer_id' <> a3::text or v ->> 'feedback' is not null then
    raise exception 'FAIL Q1: correction %', v;
  end if;
  v := public.submit_quiz_answers(m1, jsonb_build_object(q1, a1, q2, a3));
  if (v ->> 'score')::int <> 100 or not (v ->> 'passed')::boolean then raise exception 'FAIL Q1: retry %', v; end if;
  select c into v from jsonb_array_elements(v -> 'corrections') c where c ->> 'question_id' = q1::text;
  if v ->> 'explanation' <> 'EXPLAIN-SECRET' or v ->> 'feedback' <> 'BRAVO-SECRET' then
    raise exception 'FAIL Q1: explanation after submission %', v;
  end if;
  begin
    perform public.submit_quiz_answers(m1, jsonb_build_object(q1, a1, q2, a3));
    raise exception 'FAIL Q1: passed check submitted again';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.submit_quiz_answers(m1, jsonb_build_object(q1, a3));
    raise exception 'FAIL Q1: answer of another question accepted';
  exception when invalid_parameter_value then null;
  end;
  passed := passed || 'Q1'::text;

  -- Q2: immediate feedback — the first answer stands, the key stays hidden -------------
  perform public.complete_course_step(s3);
  begin
    perform public.answer_quiz_question(m1, q1, a1);
    raise exception 'FAIL Q2: immediate feedback on an end-of-check quiz';
  exception when invalid_parameter_value then null;
  end;
  v := public.answer_quiz_question(m2, q3, a6);
  if (v ->> 'correct')::boolean or v ->> 'correct_answer_id' is not null or (v ->> 'locked')::boolean then
    raise exception 'FAIL Q2: first answer %', v;
  end if;
  v := public.answer_quiz_question(m2, q3, a5);
  if (v ->> 'correct')::boolean or not (v ->> 'locked')::boolean or v ->> 'answer_id' <> a6::text then
    raise exception 'FAIL Q2: re-answer changed the record %', v;
  end if;
  v := public.submit_quiz_answers(m2, jsonb_build_object(q3, a5));
  if (v ->> 'score')::int <> 0 or (v ->> 'passed')::boolean then raise exception 'FAIL Q2: submit used the payload %', v; end if;
  if exists (select 1 from public.course_completions where user_id = cst) then
    raise exception 'FAIL Q2: completed with a failed required check';
  end if;
  v := public.answer_quiz_question(m2, q3, a5);
  if not (v ->> 'correct')::boolean or v ->> 'correct_answer_id' <> a5::text then raise exception 'FAIL Q2: %', v; end if;
  v := public.submit_quiz_answers(m2, '{}'::jsonb);
  if (v ->> 'score')::int <> 100 or not (v ->> 'passed')::boolean then raise exception 'FAIL Q2: second attempt %', v; end if;
  passed := passed || 'Q2'::text;

  -- C1: completion recorded once, with its certificate ----------------------------------
  select count(*) into v_cnt from public.course_completions
   where user_id = cst and course_id = c1 and average_score = 100 and min_score = 70
     and certificate_code ~ '^GTC-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$';
  if v_cnt <> 1 then raise exception 'FAIL C1: completion row missing'; end if;
  v := public.learner_courses();
  if v -> 0 -> 'progress' -> 'completion' ->> 'certificate_code' is null then raise exception 'FAIL C1: %', v; end if;
  if jsonb_array_length(v -> 0 -> 'progress' -> 'attempts') <> 4 then raise exception 'FAIL C1: attempts %', v; end if;
  passed := passed || 'C1'::text;

  -- A1: attempts are not limited: a failing member retries until they pass -----------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', cs2, 'role', 'authenticated')::text, true);
  perform public.complete_course_step(s1);
  perform public.complete_course_step(s2);
  perform public.submit_quiz_answers(m1, jsonb_build_object(q1, a1, q2, a3));
  perform public.complete_course_step(s3);
  perform public.submit_quiz_answers(m2, jsonb_build_object(q3, a6));
  perform public.submit_quiz_answers(m2, jsonb_build_object(q3, a6));
  perform public.submit_quiz_answers(m2, jsonb_build_object(q3, a6));
  v := public.submit_quiz_answers(m2, jsonb_build_object(q3, a5));
  if not (v ->> 'passed')::boolean then raise exception 'FAIL A1: fourth attempt not scored as passed %', v; end if;
  begin
    perform public.submit_quiz_answers(m2, jsonb_build_object(q3, a5));
    raise exception 'FAIL A1: attempt accepted after the check was passed';
  exception when invalid_parameter_value then null;
  end;
  select count(*) into v_cnt from public.lesson_progress;
  if v_cnt <> 3 then raise exception 'FAIL A1: member reads % progress rows (own only)', v_cnt; end if;
  passed := passed || 'A1'::text;

  -- O2: the other member reads no one's progress -----------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', oth, 'role', 'authenticated')::text, true);
  select count(*) into v_cnt from public.lesson_progress;
  if v_cnt <> 0 then raise exception 'FAIL O2: % progress rows', v_cnt; end if;
  select count(*) into v_cnt from public.quiz_attempts;
  if v_cnt <> 0 then raise exception 'FAIL O2: % attempts', v_cnt; end if;
  select count(*) into v_cnt from public.course_completions;
  if v_cnt <> 0 then raise exception 'FAIL O2: % completions', v_cnt; end if;
  passed := passed || 'O2'::text;

  -- U1: withdrawn — greyed out for holders, closed to everyone ---------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', mgr, 'role', 'authenticated')::text, true);
  update public.courses set status = 'unpublished' where id = c1;
  perform set_config('request.jwt.claims', json_build_object('sub', cst, 'role', 'authenticated')::text, true);
  v := public.learner_courses();
  if v -> 0 ->> 'status' <> 'unpublished' or v -> 0 -> 'modules' <> 'null'::jsonb
     or v -> 0 -> 'media' ? img::text or not (v -> 0 -> 'media' ? cov::text) then
    raise exception 'FAIL U1: %', v;
  end if;
  begin
    perform public.complete_course_step(s1);
    raise exception 'FAIL U1: progress written on a withdrawn course';
  exception when insufficient_privilege then null;
  end;
  select count(*) into v_cnt from public.courses where id = c1;
  if v_cnt <> 1 then raise exception 'FAIL U1: holder cannot see the withdrawn course row'; end if;
  if not exists (select 1 from storage.objects where bucket_id = 'training-media' and name = 'media/' || cov || '/cover.jpg') then
    raise exception 'FAIL U1: holder cannot read the cover';
  end if;
  if exists (select 1 from storage.objects where bucket_id = 'training-media' and name = 'media/' || img || '/lesson.jpg') then
    raise exception 'FAIL U1: holder reads lesson media of a withdrawn course';
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', oth, 'role', 'authenticated')::text, true);
  select count(*) into v_cnt from public.courses where id = c1;
  if v_cnt <> 0 then raise exception 'FAIL U1: non-holder sees the withdrawn course'; end if;
  passed := passed || 'U1'::text;

  -- R1: revoked — nothing left but the certificate record ---------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', mgr, 'role', 'authenticated')::text, true);
  update public.courses set status = 'published' where id = c1;
  perform public.admin_revoke_course_entitlement(ent);
  perform set_config('request.jwt.claims', json_build_object('sub', cst, 'role', 'authenticated')::text, true);
  if public.learner_courses() <> '[]'::jsonb then raise exception 'FAIL R1: revoked member still reads the course'; end if;
  if exists (select 1 from storage.objects where bucket_id = 'training-media' and name = 'media/' || img || '/lesson.jpg') then
    raise exception 'FAIL R1: revoked member reads lesson media';
  end if;
  select count(*) into v_cnt from public.course_completions where user_id = cst;
  if v_cnt <> 1 then raise exception 'FAIL R1: completion lost on revocation'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', mgr, 'role', 'authenticated')::text, true);
  perform public.admin_grant_course('academy22cst.test@example.invalid', c1);  -- re-grant after revocation
  passed := passed || 'R1'::text;

  reset role;

  -- G1: grants and revocations are audited -----------------------------------------------
  select count(*) into v_cnt from public.audit_logs where table_name = 'course_entitlements' and record_id = ent::text;
  if v_cnt < 2 then raise exception 'FAIL G1: % audit rows for the entitlement', v_cnt; end if;
  passed := passed || 'G1'::text;

  raise exception 'ALL ITERATION 22 TESTS PASSED (%)', array_to_string(passed, ', ');
end;
$$;
