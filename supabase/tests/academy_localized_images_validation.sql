-- =============================================================================
-- Academy localized images validation suite (migration `…_academy_localized_images`).
-- =============================================================================
-- Requires all migrations. ONE transaction, ALWAYS rolled back by raising
-- `ALL LOCALIZED IMAGES TESTS PASSED` (or `FAIL: ...`).
-- Covers: English image / poster / question image saved and kind-checked,
-- an English image without English text, clearing it, the learner's JSON and
-- media map, the storage policy (holder reads, another member refused), and
-- the library refusing to delete a file used only as an English image.
-- =============================================================================

do $$
declare
  mgr   uuid := '00000000-0000-4000-a000-000000250001';  -- manager: manage_training
  cst   uuid := '00000000-0000-4000-a000-000000250002';  -- member granted the course
  oth   uuid := '00000000-0000-4000-a000-000000250003';  -- another member
  c1    uuid := '00000000-0000-4000-a000-0000002500c1';
  m1    uuid := '00000000-0000-4000-a000-0000002500a1';
  s1    uuid := '00000000-0000-4000-a000-0000002500b1';
  b1    uuid := '00000000-0000-4000-a000-0000002500d1';  -- image block
  b2    uuid := '00000000-0000-4000-a000-0000002500d2';  -- video block
  qz    uuid := '00000000-0000-4000-a000-0000002500e1';
  q1    uuid := '00000000-0000-4000-a000-0000002500f1';
  a1    uuid := '00000000-0000-4000-a000-000000250101';
  a2    uuid := '00000000-0000-4000-a000-000000250102';
  fr    uuid := '00000000-0000-4000-a000-000000250201';  -- French image
  en    uuid := '00000000-0000-4000-a000-000000250202';  -- English image
  enp   uuid := '00000000-0000-4000-a000-000000250203';  -- English poster
  enq   uuid := '00000000-0000-4000-a000-000000250204';  -- English question image
  vid   uuid := '00000000-0000-4000-a000-000000250205';  -- video
  v_doc jsonb;
  v     jsonb;
  passed text[] := '{}';
begin
  insert into auth.users (id, aud, role, email, created_at, updated_at) values
    (mgr, 'authenticated', 'authenticated', 'academy25mgr.test@example.invalid', now(), now()),
    (cst, 'authenticated', 'authenticated', 'academy25cst.test@example.invalid', now(), now()),
    (oth, 'authenticated', 'authenticated', 'academy25oth.test@example.invalid', now(), now());
  update public.profiles set role = 'manager' where id = mgr;

  insert into storage.objects (bucket_id, name) values
    ('training-media', 'media/' || fr  || '/fr.jpg'),
    ('training-media', 'media/' || en  || '/en.jpg'),
    ('training-media', 'media/' || enp || '/poster-en.jpg'),
    ('training-media', 'media/' || enq || '/question-en.jpg');

  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', mgr, 'role', 'authenticated')::text, true);

  insert into public.training_media (id, kind, storage_path, mime_type, name, bytes) values
    (fr,  'image', 'media/' || fr  || '/fr.jpg',          'image/jpeg', 'Schéma FR', 1000),
    (en,  'image', 'media/' || en  || '/en.jpg',          'image/jpeg', 'Diagram EN', 1000),
    (enp, 'image', 'media/' || enp || '/poster-en.jpg',   'image/jpeg', 'Poster EN', 1000),
    (enq, 'image', 'media/' || enq || '/question-en.jpg', 'image/jpeg', 'Question EN', 1000),
    (vid, 'video', 'media/' || vid || '/pose.mp4',        'video/mp4',  'Vidéo', 4000000);

  v_doc := jsonb_build_object(
    'id', c1, 'slug', 'images-langues-25', 'title', 'Images', 'category', 'technique', 'level', 'beginner',
    'price', '100.00',
    'modules', jsonb_build_array(jsonb_build_object('id', m1, 'title', 'Module',
      'steps', jsonb_build_array(jsonb_build_object('id', s1, 'title', 'Étape', 'blocks', jsonb_build_array(
        -- English image with no English text at all
        jsonb_build_object('id', b1, 'kind', 'image', 'media_id', fr, 'alt_text', 'Schéma',
                           'en', jsonb_build_object('media_id', en)),
        jsonb_build_object('id', b2, 'kind', 'video', 'media_id', vid, 'poster_media_id', fr,
                           'en', jsonb_build_object('poster_media_id', enp, 'media_id', en))))),
      'quiz', jsonb_build_object('id', qz, 'title', 'Contrôle', 'questions', jsonb_build_array(
        jsonb_build_object('id', q1, 'text', 'Question', 'image_media_id', fr,
                           'en', jsonb_build_object('image_media_id', enq),
                           'answers', jsonb_build_array(
                             jsonb_build_object('id', a1, 'text', 'Oui', 'is_correct', true),
                             jsonb_build_object('id', a2, 'text', 'Non', 'is_correct', false))))))));

  -- L1: the English slots are saved, without English text --------------------------------
  perform public.admin_save_course(v_doc);
  if (select media_id from public.course_block_translations where block_id = b1 and locale = 'en') is distinct from en then
    raise exception 'FAIL L1: English image of the image block not saved';
  end if;
  if (select poster_media_id from public.course_block_translations where block_id = b2 and locale = 'en') is distinct from enp then
    raise exception 'FAIL L1: English poster not saved';
  end if;
  -- A video block never takes an English media_id (videos stay single-language).
  if (select media_id from public.course_block_translations where block_id = b2 and locale = 'en') is not null then
    raise exception 'FAIL L1: a video block stored an English media_id';
  end if;
  if (select image_media_id from public.quiz_question_translations where question_id = q1 and locale = 'en') is distinct from enq
     or (select text from public.quiz_question_translations where question_id = q1 and locale = 'en') is not null then
    raise exception 'FAIL L1: English question image not saved alone';
  end if;
  passed := passed || 'L1'::text;

  -- L2: a slot takes an image only ---------------------------------------------------------
  begin
    perform public.admin_save_course(jsonb_set(v_doc, '{modules,0,steps,0,blocks,0,en,media_id}', to_jsonb(vid::text)));
    raise exception 'FAIL L2: a video accepted as an English image';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.admin_save_course(jsonb_set(v_doc, '{modules,0,quiz,questions,0,en,image_media_id}', to_jsonb(vid::text)));
    raise exception 'FAIL L2: a video accepted as an English question image';
  exception when invalid_parameter_value then null;
  end;
  passed := passed || 'L2'::text;

  -- L3: a file used only as an English image cannot leave the library -------------------
  begin
    delete from public.training_media where id = en;
    raise exception 'FAIL L3: an English image in use was deleted';
  exception when foreign_key_violation then null;
  end;
  passed := passed || 'L3'::text;

  -- Publish and grant the course.
  update public.courses set status = 'published' where id = c1;
  perform public.admin_grant_course('academy25cst.test@example.invalid', c1);

  -- L4: the holder reads the English files and their library entries -----------------------
  perform set_config('request.jwt.claims', json_build_object('sub', cst, 'role', 'authenticated')::text, true);
  v := public.learner_courses() -> 0;
  if v -> 'modules' -> 0 -> 'steps' -> 0 -> 'blocks' -> 0 -> 'en' ->> 'media_id' is distinct from en::text
     or v -> 'modules' -> 0 -> 'steps' -> 0 -> 'blocks' -> 1 -> 'en' ->> 'poster_media_id' is distinct from enp::text
     or v -> 'modules' -> 0 -> 'quiz' -> 'questions' -> 0 -> 'en' ->> 'image_media_id' is distinct from enq::text then
    raise exception 'FAIL L4: English files missing from learner_courses(): %', v -> 'modules';
  end if;
  if not (v -> 'media' ? en::text and v -> 'media' ? enp::text and v -> 'media' ? enq::text) then
    raise exception 'FAIL L4: English files missing from the media map';
  end if;
  if (select count(*) from storage.objects where bucket_id = 'training-media'
       and name in ('media/' || en || '/en.jpg', 'media/' || enp || '/poster-en.jpg',
                    'media/' || enq || '/question-en.jpg')) <> 3 then
    raise exception 'FAIL L4: the holder cannot read the English files';
  end if;
  passed := passed || 'L4'::text;

  -- L5: another member reads none of them --------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', oth, 'role', 'authenticated')::text, true);
  if exists (select 1 from storage.objects where bucket_id = 'training-media'
              and name in ('media/' || en || '/en.jpg', 'media/' || enq || '/question-en.jpg')) then
    raise exception 'FAIL L5: a non-holder reads an English file';
  end if;
  if exists (select 1 from public.course_block_translations where block_id = b1)
     or exists (select 1 from public.quiz_question_translations where question_id = q1) then
    raise exception 'FAIL L5: a non-holder reads the content translations';
  end if;
  passed := passed || 'L5'::text;

  -- L6: clearing the English image removes the row (no English text left) -----------------
  perform set_config('request.jwt.claims', json_build_object('sub', mgr, 'role', 'authenticated')::text, true);
  v_doc := jsonb_set(v_doc, '{modules,0,steps,0,blocks,0,en}', '{}'::jsonb);
  v_doc := jsonb_set(v_doc, '{modules,0,quiz,questions,0,en}', '{}'::jsonb);
  perform public.admin_save_course(v_doc);
  if exists (select 1 from public.course_block_translations where block_id = b1)
     or exists (select 1 from public.quiz_question_translations where question_id = q1) then
    raise exception 'FAIL L6: an emptied English slot left its row';
  end if;
  passed := passed || 'L6'::text;

  reset role;
  raise exception 'ALL LOCALIZED IMAGES TESTS PASSED (%)', array_to_string(passed, ', ');
end;
$$;
