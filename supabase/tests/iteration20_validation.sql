-- =============================================================================
-- Iteration 20 validation suite — Academy authoring (migration `…_academy_authoring`).
-- =============================================================================
-- Requires all migrations. ONE transaction, ALWAYS rolled back by raising
-- `ALL ITERATION 20 TESTS PASSED` (or `FAIL: ...`).
-- =============================================================================

do $$
declare
  mgr     uuid := '00000000-0000-4000-a000-000000200001';  -- manager: manage_training
  vwr     uuid := '00000000-0000-4000-a000-000000200002';  -- viewer: staff, read only
  cst     uuid := '00000000-0000-4000-a000-000000200003';  -- customer
  c1      uuid := '00000000-0000-4000-a000-0000002000c1';
  m1      uuid := '00000000-0000-4000-a000-0000002000a1';
  m2      uuid := '00000000-0000-4000-a000-0000002000a2';
  s1      uuid := '00000000-0000-4000-a000-0000002000b1';
  s2      uuid := '00000000-0000-4000-a000-0000002000b2';
  b1      uuid := '00000000-0000-4000-a000-0000002000d1';
  b2      uuid := '00000000-0000-4000-a000-0000002000d2';
  qz      uuid := '00000000-0000-4000-a000-0000002000e1';
  q1      uuid := '00000000-0000-4000-a000-0000002000f1';
  a1      uuid := '00000000-0000-4000-a000-000000200101';
  a2      uuid := '00000000-0000-4000-a000-000000200102';
  img     uuid := '00000000-0000-4000-a000-000000200201';
  vid     uuid := '00000000-0000-4000-a000-000000200202';
  v_doc   jsonb;
  v_res   jsonb;
  v_cnt   int;
  v_txt   text;
  v_num   numeric;
  passed  text[] := '{}';
begin
  insert into auth.users (id, aud, role, email, created_at, updated_at) values
    (mgr, 'authenticated', 'authenticated', 'academy20mgr.test@example.invalid', now(), now()),
    (vwr, 'authenticated', 'authenticated', 'academy20vwr.test@example.invalid', now(), now()),
    (cst, 'authenticated', 'authenticated', 'academy20cst.test@example.invalid', now(), now());
  update public.profiles set role = 'manager' where id = mgr;
  update public.profiles set role = 'viewer'  where id = vwr;

  -- Act as the manager ------------------------------------------------------------
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', mgr, 'role', 'authenticated')::text, true);

  -- A1: media rows; the path must sit under the media id, the MIME match the kind
  insert into public.training_media (id, kind, storage_path, mime_type, name, bytes, width, height)
  values (img, 'image', 'media/' || img || '/pose.jpg', 'image/jpeg', 'Pose', 1000, 800, 600);
  insert into public.training_media (id, kind, storage_path, mime_type, name, bytes, duration_seconds)
  values (vid, 'video', 'media/' || vid || '/pose.mp4', 'video/mp4', 'Pose vidéo', 4000000, 95);
  begin
    insert into public.training_media (kind, storage_path, mime_type, name, bytes)
    values ('image', 'media/' || gen_random_uuid() || '/x.mp4', 'video/mp4', 'Wrong', 10);
    raise exception 'FAIL A1: video MIME accepted for an image';
  exception when check_violation then null;
  end;
  passed := passed || 'A1'::text;

  -- A2: a whole course saves in one call, with its English translation --------------
  v_doc := jsonb_build_object(
    'id', c1, 'slug', 'pose-test-20', 'title', 'Pose test', 'short_description', 'Court',
    'cover_media_id', img, 'category', 'technique', 'level', 'beginner', 'duration_minutes', 90,
    'objectives', jsonb_build_array('Poser', ' '), 'requirements', '[]'::jsonb,
    'price', '349.00', 'currency', 'EUR',
    'en', jsonb_build_object('title', 'Placement test', 'slug', 'placement-test-20'),
    'modules', jsonb_build_array(
      jsonb_build_object('id', m1, 'title', 'Module 1', 'cover_media_id', img,
        'en', jsonb_build_object('title', 'Module 1 EN'),
        'steps', jsonb_build_array(
          jsonb_build_object('id', s1, 'title', 'Étape 1', 'duration_minutes', 5,
            'blocks', jsonb_build_array(
              jsonb_build_object('id', b1, 'kind', 'text', 'body_html', '<p>Bonjour</p>',
                'en', jsonb_build_object('body_html', '<p>Hello</p>')),
              jsonb_build_object('id', b2, 'kind', 'video', 'media_id', vid, 'poster_media_id', img,
                'title', 'Démo', 'duration_seconds', 95)))),
        'quiz', jsonb_build_object('id', qz, 'title', 'Quiz', 'passing_score', 80,
          'questions', jsonb_build_array(
            jsonb_build_object('id', q1, 'text', 'Combien ?',
              'answers', jsonb_build_array(
                jsonb_build_object('id', a1, 'text', 'Un', 'is_correct', true),
                jsonb_build_object('id', a2, 'text', 'Deux', 'is_correct', false)))))),
      jsonb_build_object('id', m2, 'title', 'Module 2', 'steps',
        jsonb_build_array(jsonb_build_object('id', s2, 'title', 'Étape 2')))));
  v_res := public.admin_save_course(v_doc);
  if v_res ->> 'slug' <> 'pose-test-20' then raise exception 'FAIL A2: slug %', v_res ->> 'slug'; end if;
  select count(*) into v_cnt from public.course_blocks b join public.course_steps s on s.id = b.step_id
   join public.course_modules m on m.id = s.module_id where m.course_id = c1;
  if v_cnt <> 2 then raise exception 'FAIL A2: % blocks', v_cnt; end if;
  select array_to_string(objectives, '|') into v_txt from public.courses where id = c1;
  if v_txt <> 'Poser' then raise exception 'FAIL A2: objectives %', v_txt; end if;
  select slug into v_txt from public.course_translations where course_id = c1 and locale = 'en';
  if v_txt <> 'placement-test-20' then raise exception 'FAIL A2: en slug %', v_txt; end if;
  select status into v_txt from public.courses where id = c1;
  if v_txt <> 'draft' then raise exception 'FAIL A2: created as %', v_txt; end if;
  passed := passed || 'A2'::text;

  -- A3: re-saving keeps node ids, reorders, deletes only what is omitted ------------
  v_doc := jsonb_set(v_doc, '{modules}', jsonb_build_array(v_doc -> 'modules' -> 1, v_doc -> 'modules' -> 0));
  v_doc := jsonb_set(v_doc, '{modules,1,steps,0,blocks}', jsonb_build_array(v_doc -> 'modules' -> 1 -> 'steps' -> 0 -> 'blocks' -> 1));
  v_doc := jsonb_set(v_doc, '{modules,1,en}', '{}'::jsonb);
  perform public.admin_save_course(v_doc);
  select position into v_cnt from public.course_modules where id = m1;
  if v_cnt <> 1 then raise exception 'FAIL A3: module 1 at position %', v_cnt; end if;
  if exists (select 1 from public.course_blocks where id = b1) then raise exception 'FAIL A3: omitted block kept'; end if;
  if not exists (select 1 from public.course_blocks where id = b2) then raise exception 'FAIL A3: block id lost'; end if;
  if not exists (select 1 from public.quiz_answers where id = a1 and is_correct) then raise exception 'FAIL A3: answer id lost'; end if;
  if exists (select 1 from public.course_module_translations where module_id = m1) then
    raise exception 'FAIL A3: emptied English translation kept';
  end if;
  passed := passed || 'A3'::text;

  -- A4: switching the correct answer goes through the one-correct index -------------
  v_doc := jsonb_set(v_doc, '{modules,1,quiz,questions,0,answers,0,is_correct}', 'false');
  v_doc := jsonb_set(v_doc, '{modules,1,quiz,questions,0,answers,1,is_correct}', 'true');
  perform public.admin_save_course(v_doc);
  if not exists (select 1 from public.quiz_answers where id = a2 and is_correct) then raise exception 'FAIL A4'; end if;
  begin
    v_doc := jsonb_set(v_doc, '{modules,1,quiz,questions,0,answers,0,is_correct}', 'true');
    perform public.admin_save_course(v_doc);
    raise exception 'FAIL A4: two correct answers accepted';
  exception when unique_violation then null;
  end;
  v_doc := jsonb_set(v_doc, '{modules,1,quiz,questions,0,answers,0,is_correct}', 'false');
  passed := passed || 'A4'::text;

  -- A5: a video slot refuses an image, an image slot a video -------------------------
  begin
    perform public.admin_save_course(jsonb_set(v_doc, '{modules,1,steps,0,blocks,0,media_id}', to_jsonb(img::text)));
    raise exception 'FAIL A5: image accepted as a video';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.admin_save_course(jsonb_set(v_doc, '{cover_media_id}', to_jsonb(vid::text)));
    raise exception 'FAIL A5: video accepted as a cover';
  exception when invalid_parameter_value then null;
  end;
  passed := passed || 'A5'::text;

  -- A6: a node of this course cannot be claimed by another course -------------------
  begin
    perform public.admin_save_course(jsonb_build_object('id', gen_random_uuid(), 'slug', 'thief-20', 'title', 'T',
      'category', 'technique', 'level', 'all', 'price', '1.00',
      'modules', jsonb_build_array(jsonb_build_object('id', m1, 'title', 'Stolen'))));
    raise exception 'FAIL A6: module of another course rewritten';
  exception when invalid_parameter_value then null;
  end;
  passed := passed || 'A6'::text;

  -- A7: a used media cannot be deleted ---------------------------------------------
  begin
    delete from public.training_media where id = vid;
    raise exception 'FAIL A7: used media deleted';
  exception when foreign_key_violation then null;
  end;
  passed := passed || 'A7'::text;

  -- A8: money: a malformed price is refused ----------------------------------------
  begin
    perform public.admin_save_course(jsonb_set(v_doc, '{price}', '"12.345"'));
    raise exception 'FAIL A8: price with 3 decimals accepted';
  exception when invalid_parameter_value then null;
  end;
  passed := passed || 'A8'::text;

  -- P1: publication checks readiness (module 2 = second position has a step; video
  --     block has its media) and stamps published_at -------------------------------
  update public.courses set status = 'published' where id = c1;
  select count(*) into v_cnt from public.courses where id = c1 and published_at is not null;
  if v_cnt <> 1 then raise exception 'FAIL P1: published_at not set'; end if;
  passed := passed || 'P1'::text;

  -- P2: a published course cannot go back to draft, change address or be deleted ----
  begin
    update public.courses set status = 'draft' where id = c1;
    raise exception 'FAIL P2: back to draft';
  exception when invalid_parameter_value then null;
  end;
  begin
    update public.courses set slug = 'other-20' where id = c1;
    raise exception 'FAIL P2: published slug changed';
  exception when invalid_parameter_value then null;
  end;
  delete from public.courses where id = c1;
  if not exists (select 1 from public.courses where id = c1) then raise exception 'FAIL P2: published course deleted'; end if;
  passed := passed || 'P2'::text;

  -- P3: an incomplete course cannot be published -----------------------------------
  perform public.admin_save_course(jsonb_build_object('id', '00000000-0000-4000-a000-0000002000c2', 'slug', 'empty-20',
    'title', 'Vide', 'category', 'technique', 'level', 'all', 'price', '0'));
  begin
    update public.courses set status = 'published' where id = '00000000-0000-4000-a000-0000002000c2';
    raise exception 'FAIL P3: empty course published';
  exception when invalid_parameter_value then null;
  end;
  -- ...and a never-published draft can be deleted.
  delete from public.courses where id = '00000000-0000-4000-a000-0000002000c2';
  if exists (select 1 from public.courses where id = '00000000-0000-4000-a000-0000002000c2') then
    raise exception 'FAIL P3: draft not deleted';
  end if;
  passed := passed || 'P3'::text;

  -- R1: promotions: current price, overlap refused, amount above price refused ------
  insert into public.course_promotions (course_id, label, discount_type, discount_value, starts_at, ends_at)
  values (c1, 'Rentrée', 'percentage', 20, now() - interval '1 day', now() + interval '1 day');
  select current_price into v_num from public.course_current_prices where course_id = c1;
  if v_num <> 279.20 then raise exception 'FAIL R1: current price %', v_num; end if;
  begin
    insert into public.course_promotions (course_id, label, discount_type, discount_value, starts_at)
    values (c1, 'Chevauche', 'amount', 50, now());
    raise exception 'FAIL R1: overlapping promotion accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    insert into public.course_promotions (course_id, label, discount_type, discount_value, starts_at)
    values (c1, 'Trop', 'amount', 349, now() + interval '2 days');
    raise exception 'FAIL R1: amount >= price accepted';
  exception when invalid_parameter_value then null;
  end;
  insert into public.course_promotions (course_id, label, discount_type, discount_value, starts_at)
  values (c1, 'Après', 'amount', 49.99, now() + interval '1 day');  -- starts when the first ends
  passed := passed || 'R1'::text;

  -- R2: a price cut below a coming amount promotion is refused (the course would be free)
  begin
    update public.courses set price = 40 where id = c1;
    raise exception 'FAIL R2: price cut below an amount promotion accepted';
  exception when invalid_parameter_value then null;
  end;
  update public.courses set price = 300 where id = c1;
  passed := passed || 'R2'::text;

  -- P4: saving a published course into an unpublishable state is refused at commit
  begin
    perform public.admin_save_course(jsonb_set(v_doc, '{modules,0,steps}', '[]'::jsonb));
    set constraints public.courses_published_ready immediate;
    raise exception 'FAIL P4: published course saved with an empty module';
  exception when invalid_parameter_value then null;
  end;
  set constraints public.courses_published_ready deferred;
  passed := passed || 'P4'::text;

  -- Act as the viewer (staff, read only) -------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', vwr, 'role', 'authenticated')::text, true);

  -- V1: reads everything, writes nothing --------------------------------------------
  select count(*) into v_cnt from public.quiz_answers where question_id = q1;
  if v_cnt <> 2 then raise exception 'FAIL V1: viewer reads % answers', v_cnt; end if;
  begin
    perform public.admin_save_course(v_doc);
    raise exception 'FAIL V1: viewer saved a course';
  exception when insufficient_privilege then null;
  end;
  update public.courses set title = 'Hijack' where id = c1;
  select title into v_txt from public.courses where id = c1;
  if v_txt <> 'Pose test' then raise exception 'FAIL V1: viewer renamed the course'; end if;
  begin
    insert into public.course_promotions (course_id, label, discount_type, discount_value, starts_at)
    values (c1, 'Viewer', 'percentage', 10, now() + interval '30 days');
    raise exception 'FAIL V1: viewer created a promotion';
  exception when insufficient_privilege then null;
  end;
  passed := passed || 'V1'::text;

  -- Act as a customer ---------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', cst, 'role', 'authenticated')::text, true);

  -- C1: a customer reads the published course and its price, none of the content ----
  select count(*) into v_cnt from public.courses where id = c1;
  if v_cnt <> 1 then raise exception 'FAIL C1: published course hidden'; end if;
  select current_price into v_num from public.course_current_prices where course_id = c1;
  if v_num <> 240.00 then raise exception 'FAIL C1: customer price %', v_num; end if;
  select count(*) into v_cnt from public.quiz_answers;
  if v_cnt <> 0 then raise exception 'FAIL C1: customer reads answer keys'; end if;
  select count(*) into v_cnt from public.course_blocks;
  if v_cnt <> 0 then raise exception 'FAIL C1: customer reads lesson content'; end if;
  select count(*) into v_cnt from public.training_media;
  if v_cnt <> 0 then raise exception 'FAIL C1: customer reads the media library'; end if;
  begin
    perform public.admin_save_course(v_doc);
    raise exception 'FAIL C1: customer saved a course';
  exception when insufficient_privilege then null;
  end;
  passed := passed || 'C1'::text;

  -- C2: an unpublished course disappears for customers -------------------------------
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', mgr, 'role', 'authenticated')::text, true);
  update public.courses set status = 'unpublished' where id = c1;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', cst, 'role', 'authenticated')::text, true);
  select count(*) into v_cnt from public.courses where id = c1;
  if v_cnt <> 0 then raise exception 'FAIL C2: unpublished course visible'; end if;
  passed := passed || 'C2'::text;

  -- Anonymous visitor ---------------------------------------------------------------
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  begin
    insert into public.courses (slug, title) values ('anon-20', 'Anon');
    raise exception 'FAIL N1: visitor created a course';
  exception when insufficient_privilege then null;
  end;
  passed := passed || 'N1'::text;

  reset role;

  -- Audit: publication and promotions are logged ------------------------------------
  select count(*) into v_cnt from public.audit_logs where table_name = 'courses' and record_id = c1::text;
  if v_cnt < 2 then raise exception 'FAIL U1: % course audit rows', v_cnt; end if;
  select count(*) into v_cnt from public.audit_logs where table_name = 'course_promotions';
  if v_cnt < 2 then raise exception 'FAIL U1: % promotion audit rows', v_cnt; end if;
  passed := passed || 'U1'::text;

  raise exception 'ALL ITERATION 20 TESTS PASSED (%)', array_to_string(passed, ', ');
end;
$$;
