-- Knowledge checks are no longer limited in attempts: a learner who bought a
-- course can retake a check as often as needed until they pass it (and earn
-- the certificate), re-reading the lessons in between.
--   * private.open_quiz_attempt(): no more 'no_attempts_left' refusal.
--   * course_quizzes.allow_retry / max_attempts dropped (with their CHECK).
--   * admin_save_course() and private.learner_course_json() no longer carry them.

create or replace function private.open_quiz_attempt(p_module_id uuid, p_create boolean)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_quiz    public.course_quizzes%rowtype;
  v_course  uuid;
  v_attempt uuid;
begin
  select q.* into v_quiz from public.course_quizzes q where q.module_id = p_module_id;
  select m.course_id into v_course from public.course_modules m where m.id = p_module_id;
  if v_quiz.id is null then
    raise exception 'learning: no_access' using errcode = '42501';
  end if;

  select a.id into v_attempt from public.quiz_attempts a
   where a.user_id = v_uid and a.module_id = p_module_id and a.status = 'open';
  if v_attempt is not null then
    return v_attempt;
  end if;
  if not p_create then
    return null;
  end if;

  if not private.learner_node_unlocked(v_uid, v_course, v_quiz.id) then
    raise exception 'learning: locked' using errcode = '22023';
  end if;
  if exists (select 1 from public.quiz_attempts a where a.user_id = v_uid and a.module_id = p_module_id and a.passed) then
    raise exception 'learning: already_passed' using errcode = '22023';
  end if;

  insert into public.quiz_attempts (user_id, course_id, module_id, quiz_id, passing_score)
  values (v_uid, v_course, p_module_id, v_quiz.id, v_quiz.passing_score)
  returning id into v_attempt;
  return v_attempt;
end;
$$;
create or replace function public.admin_save_course(p_course jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id        uuid := (p_course ->> 'id')::uuid;
  v_price     text := p_course ->> 'price';
  v_en        jsonb := p_course -> 'en';
  v_modules   jsonb := coalesce(p_course -> 'modules', '[]'::jsonb);
  v_slug      text;
  v_base      text;
  v_n         integer;
  v_module    jsonb;
  v_step      jsonb;
  v_block     jsonb;
  v_quiz      jsonb;
  v_question  jsonb;
  v_answer    jsonb;
  v_mpos      bigint;
  v_spos      bigint;
  v_bpos      bigint;
  v_qpos      bigint;
  v_apos      bigint;
  v_module_id uuid;
  v_step_id   uuid;
  v_block_id  uuid;
  v_quiz_id   uuid;
  v_q_id      uuid;
  v_a_id      uuid;
  v_ids       uuid[];
  v_men       jsonb;
begin
  if not private.has_permission('manage_training') then
    raise exception 'admin_save_course: permission denied' using errcode = '42501';
  end if;
  if v_id is null then
    raise exception 'admin_save_course: id is required' using errcode = '22023';
  end if;
  if v_price is null or v_price !~ '^\d{1,10}(\.\d{1,2})?$' then
    raise exception 'admin_save_course: invalid price' using errcode = '22023';
  end if;
  if jsonb_typeof(v_modules) <> 'array' then
    raise exception 'admin_save_course: modules must be an array' using errcode = '22023';
  end if;
  perform private.check_training_media(nullif(p_course ->> 'cover_media_id', '')::uuid, 'image');

  -- Ids of this payload that already belong to another course are refused.
  if exists (
       select 1 from jsonb_array_elements(v_modules) m
         join public.course_modules cm on cm.id = (m ->> 'id')::uuid
        where cm.course_id <> v_id)
     or exists (
       select 1 from jsonb_array_elements(v_modules) m, jsonb_array_elements(coalesce(m -> 'steps', '[]')) s
         join public.course_steps cs on cs.id = (s ->> 'id')::uuid
         join public.course_modules cm on cm.id = cs.module_id
        where cm.course_id <> v_id)
     or exists (
       select 1 from jsonb_array_elements(v_modules) m, jsonb_array_elements(coalesce(m -> 'steps', '[]')) s,
                     jsonb_array_elements(coalesce(s -> 'blocks', '[]')) b
         join public.course_blocks cb on cb.id = (b ->> 'id')::uuid
         join public.course_steps cs on cs.id = cb.step_id
         join public.course_modules cm on cm.id = cs.module_id
        where cm.course_id <> v_id)
     or exists (
       select 1 from jsonb_array_elements(v_modules) m
         join public.course_quizzes cq on cq.id = (m -> 'quiz' ->> 'id')::uuid
         join public.course_modules cm on cm.id = cq.module_id
        where cm.course_id <> v_id)
     or exists (
       select 1 from jsonb_array_elements(v_modules) m,
                     jsonb_array_elements(coalesce(m -> 'quiz' -> 'questions', '[]')) q
         join public.quiz_questions qq on qq.id = (q ->> 'id')::uuid
         join public.course_quizzes cq on cq.id = qq.quiz_id
         join public.course_modules cm on cm.id = cq.module_id
        where cm.course_id <> v_id)
     or exists (
       select 1 from jsonb_array_elements(v_modules) m,
                     jsonb_array_elements(coalesce(m -> 'quiz' -> 'questions', '[]')) q,
                     jsonb_array_elements(coalesce(q -> 'answers', '[]')) a
         join public.quiz_answers qa on qa.id = (a ->> 'id')::uuid
         join public.quiz_questions qq on qq.id = qa.question_id
         join public.course_quizzes cq on cq.id = qq.quiz_id
         join public.course_modules cm on cm.id = cq.module_id
        where cm.course_id <> v_id)
  then
    raise exception 'admin_save_course: a node belongs to another course' using errcode = '22023';
  end if;

  -- 1. Course ----------------------------------------------------------------
  if exists (select 1 from public.courses where id = v_id) then
    update public.courses
       set title                = p_course ->> 'title',
           short_description    = nullif(p_course ->> 'short_description', ''),
           description          = nullif(p_course ->> 'description', ''),
           cover_media_id       = nullif(p_course ->> 'cover_media_id', '')::uuid,
           category             = p_course ->> 'category',
           level                = p_course ->> 'level',
           duration_minutes     = coalesce((p_course ->> 'duration_minutes')::integer, 0),
           objectives           = private.jsonb_text_array(p_course -> 'objectives'),
           requirements         = private.jsonb_text_array(p_course -> 'requirements'),
           complete_all_steps   = coalesce((p_course ->> 'complete_all_steps')::boolean, true),
           complete_all_quizzes = coalesce((p_course ->> 'complete_all_quizzes')::boolean, true),
           min_score            = coalesce((p_course ->> 'min_score')::smallint, 70),
           issues_certificate   = coalesce((p_course ->> 'issues_certificate')::boolean, true),
           price                = v_price::numeric(12, 2),
           currency             = coalesce(nullif(p_course ->> 'currency', ''), 'EUR')
     where id = v_id
    returning slug into v_slug;
  else
    v_base := p_course ->> 'slug';
    if v_base is null or v_base !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
      raise exception 'admin_save_course: invalid slug' using errcode = '22023';
    end if;
    v_base := left(v_base, 110);
    v_slug := v_base;
    v_n := 1;
    while exists (select 1 from public.courses where slug = v_slug) loop
      v_n := v_n + 1;
      v_slug := v_base || '-' || v_n;
    end loop;

    insert into public.courses
      (id, slug, title, short_description, description, cover_media_id, category, level,
       duration_minutes, objectives, requirements, complete_all_steps, complete_all_quizzes,
       min_score, issues_certificate, price, currency, updated_by)
    values
      (v_id, v_slug, p_course ->> 'title', nullif(p_course ->> 'short_description', ''),
       nullif(p_course ->> 'description', ''), nullif(p_course ->> 'cover_media_id', '')::uuid,
       p_course ->> 'category', p_course ->> 'level',
       coalesce((p_course ->> 'duration_minutes')::integer, 0),
       private.jsonb_text_array(p_course -> 'objectives'), private.jsonb_text_array(p_course -> 'requirements'),
       coalesce((p_course ->> 'complete_all_steps')::boolean, true),
       coalesce((p_course ->> 'complete_all_quizzes')::boolean, true),
       coalesce((p_course ->> 'min_score')::smallint, 70),
       coalesce((p_course ->> 'issues_certificate')::boolean, true),
       v_price::numeric(12, 2), coalesce(nullif(p_course ->> 'currency', ''), 'EUR'), auth.uid());
  end if;

  -- English course translation; its slug is set once, made unique.
  if coalesce(trim(v_en ->> 'title'), '') <> '' then
    if not exists (select 1 from public.course_translations where course_id = v_id and locale = 'en') then
      v_base := nullif(v_en ->> 'slug', '');
      if v_base is not null and v_base !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
        raise exception 'admin_save_course: invalid English slug' using errcode = '22023';
      end if;
      v_base := left(v_base, 110);
      v_base := coalesce(v_base, v_slug);
      v_slug := v_base;
      v_n := 1;
      while exists (select 1 from public.course_translations where locale = 'en' and slug = v_slug) loop
        v_n := v_n + 1;
        v_slug := v_base || '-' || v_n;
      end loop;
    else
      v_slug := null;
    end if;
    insert into public.course_translations
      (course_id, locale, title, slug, short_description, description, objectives, requirements, status)
    values
      (v_id, 'en', v_en ->> 'title', v_slug, nullif(v_en ->> 'short_description', ''),
       nullif(v_en ->> 'description', ''), private.jsonb_text_array(v_en -> 'objectives'),
       private.jsonb_text_array(v_en -> 'requirements'), 'published')
    on conflict (course_id, locale) do update
       set title             = excluded.title,
           short_description = excluded.short_description,
           description       = excluded.description,
           objectives        = excluded.objectives,
           requirements      = excluded.requirements,
           status            = 'published';
  else
    delete from public.course_translations where course_id = v_id and locale = 'en';
  end if;

  -- 2. Remove what the payload no longer contains (cascades downwards) --------
  v_ids := array(select (m ->> 'id')::uuid from jsonb_array_elements(v_modules) m);
  delete from public.course_modules where course_id = v_id and not (id = any (v_ids));

  v_ids := array(
    select (s ->> 'id')::uuid
      from jsonb_array_elements(v_modules) m, jsonb_array_elements(coalesce(m -> 'steps', '[]')) s);
  delete from public.course_steps cs
   using public.course_modules cm
   where cm.id = cs.module_id and cm.course_id = v_id and not (cs.id = any (v_ids));

  v_ids := array(
    select (b ->> 'id')::uuid
      from jsonb_array_elements(v_modules) m, jsonb_array_elements(coalesce(m -> 'steps', '[]')) s,
           jsonb_array_elements(coalesce(s -> 'blocks', '[]')) b);
  delete from public.course_blocks cb
   using public.course_steps cs, public.course_modules cm
   where cs.id = cb.step_id and cm.id = cs.module_id and cm.course_id = v_id and not (cb.id = any (v_ids));

  v_ids := array(
    select (m -> 'quiz' ->> 'id')::uuid
      from jsonb_array_elements(v_modules) m
     where jsonb_typeof(m -> 'quiz') = 'object');
  delete from public.course_quizzes cq
   using public.course_modules cm
   where cm.id = cq.module_id and cm.course_id = v_id and not (cq.id = any (v_ids));

  v_ids := array(
    select (q ->> 'id')::uuid
      from jsonb_array_elements(v_modules) m,
           jsonb_array_elements(coalesce(m -> 'quiz' -> 'questions', '[]')) q);
  delete from public.quiz_questions qq
   using public.course_quizzes cq, public.course_modules cm
   where cq.id = qq.quiz_id and cm.id = cq.module_id and cm.course_id = v_id and not (qq.id = any (v_ids));

  v_ids := array(
    select (a ->> 'id')::uuid
      from jsonb_array_elements(v_modules) m,
           jsonb_array_elements(coalesce(m -> 'quiz' -> 'questions', '[]')) q,
           jsonb_array_elements(coalesce(q -> 'answers', '[]')) a);
  delete from public.quiz_answers qa
   using public.quiz_questions qq, public.course_quizzes cq, public.course_modules cm
   where qq.id = qa.question_id and cq.id = qq.quiz_id and cm.id = cq.module_id
     and cm.course_id = v_id and not (qa.id = any (v_ids));

  -- 3. Upsert the tree, in order ---------------------------------------------
  for v_module, v_mpos in select e, n - 1 from jsonb_array_elements(v_modules) with ordinality as t(e, n) loop
    v_module_id := (v_module ->> 'id')::uuid;
    perform private.check_training_media(nullif(v_module ->> 'cover_media_id', '')::uuid, 'image');
    insert into public.course_modules (id, course_id, position, title, description, cover_media_id, objectives)
    values (v_module_id, v_id, v_mpos, v_module ->> 'title', nullif(v_module ->> 'description', ''),
            nullif(v_module ->> 'cover_media_id', '')::uuid, private.jsonb_text_array(v_module -> 'objectives'))
    on conflict (id) do update
       set position       = excluded.position,
           title          = excluded.title,
           description    = excluded.description,
           cover_media_id = excluded.cover_media_id,
           objectives     = excluded.objectives;

    v_men := v_module -> 'en';
    if coalesce(trim(v_men ->> 'title'), '') <> '' then
      insert into public.course_module_translations (module_id, locale, title, description, objectives)
      values (v_module_id, 'en', v_men ->> 'title', nullif(v_men ->> 'description', ''),
              private.jsonb_text_array(v_men -> 'objectives'))
      on conflict (module_id, locale) do update
         set title = excluded.title, description = excluded.description, objectives = excluded.objectives;
    else
      delete from public.course_module_translations where module_id = v_module_id and locale = 'en';
    end if;

    for v_step, v_spos in
      select e, n - 1 from jsonb_array_elements(coalesce(v_module -> 'steps', '[]')) with ordinality as t(e, n)
    loop
      v_step_id := (v_step ->> 'id')::uuid;
      insert into public.course_steps (id, module_id, position, title, summary, duration_minutes)
      values (v_step_id, v_module_id, v_spos, v_step ->> 'title', nullif(v_step ->> 'summary', ''),
              coalesce((v_step ->> 'duration_minutes')::integer, 0))
      on conflict (id) do update
         set module_id        = excluded.module_id,
             position         = excluded.position,
             title            = excluded.title,
             summary          = excluded.summary,
             duration_minutes = excluded.duration_minutes;

      if coalesce(trim(v_step -> 'en' ->> 'title'), '') <> '' then
        insert into public.course_step_translations (step_id, locale, title, summary)
        values (v_step_id, 'en', v_step -> 'en' ->> 'title', nullif(v_step -> 'en' ->> 'summary', ''))
        on conflict (step_id, locale) do update set title = excluded.title, summary = excluded.summary;
      else
        delete from public.course_step_translations where step_id = v_step_id and locale = 'en';
      end if;

      for v_block, v_bpos in
        select e, n - 1 from jsonb_array_elements(coalesce(v_step -> 'blocks', '[]')) with ordinality as t(e, n)
      loop
        v_block_id := (v_block ->> 'id')::uuid;
        if v_block ->> 'kind' = 'image' then
          perform private.check_training_media(nullif(v_block ->> 'media_id', '')::uuid, 'image');
        elsif v_block ->> 'kind' = 'video' then
          perform private.check_training_media(nullif(v_block ->> 'media_id', '')::uuid, 'video');
          perform private.check_training_media(nullif(v_block ->> 'poster_media_id', '')::uuid, 'image');
        end if;
        insert into public.course_blocks
          (id, step_id, position, kind, body_html, media_id, poster_media_id, alt_text, caption, align,
           title, duration_seconds)
        values
          (v_block_id, v_step_id, v_bpos, v_block ->> 'kind', nullif(v_block ->> 'body_html', ''),
           nullif(v_block ->> 'media_id', '')::uuid, nullif(v_block ->> 'poster_media_id', '')::uuid,
           nullif(v_block ->> 'alt_text', ''), nullif(v_block ->> 'caption', ''), nullif(v_block ->> 'align', ''),
           nullif(v_block ->> 'title', ''), (v_block ->> 'duration_seconds')::integer)
        on conflict (id) do update
           set step_id          = excluded.step_id,
               position         = excluded.position,
               kind             = excluded.kind,
               body_html        = excluded.body_html,
               media_id         = excluded.media_id,
               poster_media_id  = excluded.poster_media_id,
               alt_text         = excluded.alt_text,
               caption          = excluded.caption,
               align            = excluded.align,
               title            = excluded.title,
               duration_seconds = excluded.duration_seconds;

        if coalesce(trim(v_block -> 'en' ->> 'body_html'), '') <> ''
           or coalesce(trim(v_block -> 'en' ->> 'alt_text'), '') <> ''
           or coalesce(trim(v_block -> 'en' ->> 'caption'), '') <> ''
           or coalesce(trim(v_block -> 'en' ->> 'title'), '') <> '' then
          insert into public.course_block_translations (block_id, locale, body_html, alt_text, caption, title)
          values (v_block_id, 'en', nullif(v_block -> 'en' ->> 'body_html', ''),
                  nullif(v_block -> 'en' ->> 'alt_text', ''), nullif(v_block -> 'en' ->> 'caption', ''),
                  nullif(v_block -> 'en' ->> 'title', ''))
          on conflict (block_id, locale) do update
             set body_html = excluded.body_html, alt_text = excluded.alt_text,
                 caption = excluded.caption, title = excluded.title;
        else
          delete from public.course_block_translations where block_id = v_block_id and locale = 'en';
        end if;
      end loop;
    end loop;

    -- Knowledge check
    v_quiz := v_module -> 'quiz';
    if jsonb_typeof(v_quiz) = 'object' then
      v_quiz_id := (v_quiz ->> 'id')::uuid;
      -- A module's quiz replaced by a new one: the old row goes first (unique module_id).
      delete from public.course_quizzes where module_id = v_module_id and id <> v_quiz_id;
      insert into public.course_quizzes
        (id, module_id, title, intro, passing_score, shuffle_answers,
         immediate_feedback, show_answers)
      values
        (v_quiz_id, v_module_id, v_quiz ->> 'title', nullif(v_quiz ->> 'intro', ''),
         coalesce((v_quiz ->> 'passing_score')::smallint, 70), coalesce((v_quiz ->> 'shuffle_answers')::boolean, true),
         coalesce((v_quiz ->> 'immediate_feedback')::boolean, true), coalesce((v_quiz ->> 'show_answers')::boolean, true))
      on conflict (id) do update
         set module_id          = excluded.module_id,
             title              = excluded.title,
             intro              = excluded.intro,
             passing_score      = excluded.passing_score,
             shuffle_answers    = excluded.shuffle_answers,
             immediate_feedback = excluded.immediate_feedback,
             show_answers       = excluded.show_answers;

      if coalesce(trim(v_quiz -> 'en' ->> 'title'), '') <> '' then
        insert into public.course_quiz_translations (quiz_id, locale, title, intro)
        values (v_quiz_id, 'en', v_quiz -> 'en' ->> 'title', nullif(v_quiz -> 'en' ->> 'intro', ''))
        on conflict (quiz_id, locale) do update set title = excluded.title, intro = excluded.intro;
      else
        delete from public.course_quiz_translations where quiz_id = v_quiz_id and locale = 'en';
      end if;

      for v_question, v_qpos in
        select e, n - 1 from jsonb_array_elements(coalesce(v_quiz -> 'questions', '[]')) with ordinality as t(e, n)
      loop
        v_q_id := (v_question ->> 'id')::uuid;
        perform private.check_training_media(nullif(v_question ->> 'image_media_id', '')::uuid, 'image');
        insert into public.quiz_questions
          (id, quiz_id, position, text, image_media_id, correct_feedback, incorrect_feedback, learn_more)
        values
          (v_q_id, v_quiz_id, v_qpos, v_question ->> 'text', nullif(v_question ->> 'image_media_id', '')::uuid,
           nullif(v_question ->> 'correct_feedback', ''), nullif(v_question ->> 'incorrect_feedback', ''),
           nullif(v_question ->> 'learn_more', ''))
        on conflict (id) do update
           set quiz_id            = excluded.quiz_id,
               position           = excluded.position,
               text               = excluded.text,
               image_media_id     = excluded.image_media_id,
               correct_feedback   = excluded.correct_feedback,
               incorrect_feedback = excluded.incorrect_feedback,
               learn_more         = excluded.learn_more;

        if coalesce(trim(v_question -> 'en' ->> 'text'), '') <> '' then
          insert into public.quiz_question_translations
            (question_id, locale, text, correct_feedback, incorrect_feedback, learn_more)
          values (v_q_id, 'en', v_question -> 'en' ->> 'text',
                  nullif(v_question -> 'en' ->> 'correct_feedback', ''),
                  nullif(v_question -> 'en' ->> 'incorrect_feedback', ''),
                  nullif(v_question -> 'en' ->> 'learn_more', ''))
          on conflict (question_id, locale) do update
             set text = excluded.text, correct_feedback = excluded.correct_feedback,
                 incorrect_feedback = excluded.incorrect_feedback, learn_more = excluded.learn_more;
        else
          delete from public.quiz_question_translations where question_id = v_q_id and locale = 'en';
        end if;

        -- One correct answer per question (partial unique index): clear first.
        update public.quiz_answers set is_correct = false where question_id = v_q_id and is_correct;

        for v_answer, v_apos in
          select e, n - 1 from jsonb_array_elements(coalesce(v_question -> 'answers', '[]')) with ordinality as t(e, n)
        loop
          v_a_id := (v_answer ->> 'id')::uuid;
          insert into public.quiz_answers (id, question_id, position, text, is_correct, explanation)
          values (v_a_id, v_q_id, v_apos, v_answer ->> 'text', coalesce((v_answer ->> 'is_correct')::boolean, false),
                  nullif(v_answer ->> 'explanation', ''))
          on conflict (id) do update
             set question_id = excluded.question_id,
                 position    = excluded.position,
                 text        = excluded.text,
                 is_correct  = excluded.is_correct,
                 explanation = excluded.explanation;

          if coalesce(trim(v_answer -> 'en' ->> 'text'), '') <> '' then
            insert into public.quiz_answer_translations (answer_id, locale, text, explanation)
            values (v_a_id, 'en', v_answer -> 'en' ->> 'text', nullif(v_answer -> 'en' ->> 'explanation', ''))
            on conflict (answer_id, locale) do update set text = excluded.text, explanation = excluded.explanation;
          else
            delete from public.quiz_answer_translations where answer_id = v_a_id and locale = 'en';
          end if;
        end loop;
      end loop;
    end if;
  end loop;

  -- Touch the course so updated_at / updated_by reflect any content edit.
  update public.courses set updated_at = now() where id = v_id returning slug into v_slug;

  return jsonb_build_object('id', v_id, 'slug', v_slug);
end;
$$;
create or replace function private.learner_course_json(p_course_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with course as (
    select * from public.courses c where c.id = p_course_id and c.status in ('published', 'unpublished')
  ), media_ids as (
    select c.cover_media_id as id from course c
    union
    select x.id
      from course c
      join public.course_modules m on m.course_id = c.id
      cross join lateral (
        select m.cover_media_id
        union all select b.media_id from public.course_steps s join public.course_blocks b on b.step_id = s.id
                   where s.module_id = m.id
        union all select b.poster_media_id from public.course_steps s join public.course_blocks b on b.step_id = s.id
                   where s.module_id = m.id
        union all select qq.image_media_id from public.course_quizzes q join public.quiz_questions qq on qq.quiz_id = q.id
                   where q.module_id = m.id
      ) as x(id)
     where c.status = 'published'
  )
  select jsonb_build_object(
    'id', c.id,
    'slug', c.slug,
    'status', c.status,
    'title', c.title,
    'short_description', c.short_description,
    'cover_media_id', c.cover_media_id,
    'category', c.category,
    'level', c.level,
    'duration_minutes', c.duration_minutes,
    'objectives', to_jsonb(c.objectives),
    'complete_all_steps', c.complete_all_steps,
    'complete_all_quizzes', c.complete_all_quizzes,
    'min_score', c.min_score,
    'issues_certificate', c.issues_certificate,
    'en', (select jsonb_build_object('title', t.title, 'slug', t.slug, 'short_description', t.short_description,
                                     'objectives', to_jsonb(t.objectives))
             from public.course_translations t
            where t.course_id = c.id and t.locale = 'en' and t.status = 'published'),
    'media', coalesce((
      select jsonb_object_agg(tm.id, jsonb_build_object(
               'path', tm.storage_path, 'kind', tm.kind, 'mime_type', tm.mime_type, 'alt_text', tm.alt_text,
               'alt_text_en', (select mt.alt_text from public.training_media_translations mt
                                where mt.media_id = tm.id and mt.locale = 'en' and mt.status = 'published'),
               'width', tm.width, 'height', tm.height))
        from public.training_media tm
       where tm.id in (select id from media_ids where id is not null)), '{}'::jsonb),
    'modules', case when c.status <> 'published' then null else coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', m.id,
               'position', m.position,
               'title', m.title,
               'description', m.description,
               'cover_media_id', m.cover_media_id,
               'objectives', to_jsonb(m.objectives),
               'en', (select jsonb_build_object('title', t.title, 'description', t.description,
                                                'objectives', to_jsonb(t.objectives))
                        from public.course_module_translations t
                       where t.module_id = m.id and t.locale = 'en' and t.status = 'published'),
               'steps', coalesce((
                 select jsonb_agg(jsonb_build_object(
                          'id', s.id,
                          'position', s.position,
                          'title', s.title,
                          'summary', s.summary,
                          'duration_minutes', s.duration_minutes,
                          'en', (select jsonb_build_object('title', t.title, 'summary', t.summary)
                                   from public.course_step_translations t
                                  where t.step_id = s.id and t.locale = 'en' and t.status = 'published'),
                          'blocks', coalesce((
                            select jsonb_agg(jsonb_build_object(
                                     'id', b.id, 'position', b.position, 'kind', b.kind, 'body_html', b.body_html,
                                     'media_id', b.media_id, 'poster_media_id', b.poster_media_id,
                                     'alt_text', b.alt_text, 'caption', b.caption, 'align', b.align,
                                     'title', b.title, 'duration_seconds', b.duration_seconds,
                                     'en', (select jsonb_build_object('body_html', t.body_html, 'alt_text', t.alt_text,
                                                                      'caption', t.caption, 'title', t.title)
                                              from public.course_block_translations t
                                             where t.block_id = b.id and t.locale = 'en' and t.status = 'published'))
                                   order by b.position)
                              from public.course_blocks b where b.step_id = s.id), '[]'::jsonb))
                        order by s.position)
                   from public.course_steps s where s.module_id = m.id), '[]'::jsonb),
               'quiz', (
                 select jsonb_build_object(
                          'id', q.id,
                          'title', q.title,
                          'intro', q.intro,
                          'passing_score', q.passing_score,
                          'shuffle_answers', q.shuffle_answers,
                          'immediate_feedback', q.immediate_feedback,
                          'show_answers', q.show_answers,
                          'en', (select jsonb_build_object('title', t.title, 'intro', t.intro)
                                   from public.course_quiz_translations t
                                  where t.quiz_id = q.id and t.locale = 'en' and t.status = 'published'),
                          'questions', coalesce((
                            select jsonb_agg(jsonb_build_object(
                                     'id', qq.id,
                                     'position', qq.position,
                                     'text', qq.text,
                                     'image_media_id', qq.image_media_id,
                                     'en', (select jsonb_build_object('text', t.text)
                                              from public.quiz_question_translations t
                                             where t.question_id = qq.id and t.locale = 'en' and t.status = 'published'),
                                     -- Answer texts only: no is_correct, no explanation.
                                     'answers', coalesce((
                                       select jsonb_agg(jsonb_build_object(
                                                'id', a.id, 'position', a.position, 'text', a.text,
                                                'en', (select jsonb_build_object('text', t.text)
                                                         from public.quiz_answer_translations t
                                                        where t.answer_id = a.id and t.locale = 'en'
                                                          and t.status = 'published'))
                                              order by a.position)
                                         from public.quiz_answers a where a.question_id = qq.id), '[]'::jsonb))
                                   order by qq.position)
                              from public.quiz_questions qq where qq.quiz_id = q.id), '[]'::jsonb))
                   from public.course_quizzes q where q.module_id = m.id))
             order by m.position)
        from public.course_modules m where m.course_id = c.id), '[]'::jsonb) end)
    from course c;
$$;

alter table public.course_quizzes drop column allow_retry, drop column max_attempts;
