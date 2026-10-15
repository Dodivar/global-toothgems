-- Images per language in the course builder (user's request, 2026-10-15).
--
-- An image that carries text (a diagram, a slide, a consent form) needs its
-- own file in each language. French stays in the base columns; the English
-- file of an image slot lives in the node's English translation row, like the
-- English text. Empty = the French image is shown in English too.
--
--   course_block_translations.media_id         English image of an image block
--   course_block_translations.poster_media_id  English poster of a video block
--   quiz_question_translations.image_media_id  English image of a question
--
-- A question can now have an English row with an image and no English text
-- (the French text is shown): quiz_question_translations.text becomes
-- nullable. Readers already fall back to the French text on an empty one.
--
-- admin_save_course() writes the new slots (kind-checked like the French
-- ones), learner_courses() returns them with their files, and the learners'
-- storage policy lets a holder read them. Covers (course, module) and the
-- video files themselves stay single-language.

-- -----------------------------------------------------------------------------
-- 1. Columns
-- -----------------------------------------------------------------------------
alter table public.course_block_translations
  add column media_id        uuid references public.training_media (id) on delete restrict,
  add column poster_media_id uuid references public.training_media (id) on delete restrict;
create index course_block_translations_media_idx on public.course_block_translations (media_id);
create index course_block_translations_poster_media_idx on public.course_block_translations (poster_media_id);

comment on column public.course_block_translations.media_id is
  'Image of an image block in this language (empty = the French image). Never set on text or video blocks.';
comment on column public.course_block_translations.poster_media_id is
  'Poster of a video block in this language (empty = the French poster).';

alter table public.quiz_question_translations
  add column image_media_id uuid references public.training_media (id) on delete restrict,
  alter column text drop not null;
create index quiz_question_translations_image_media_idx on public.quiz_question_translations (image_media_id);

comment on column public.quiz_question_translations.image_media_id is
  'Image of the question in this language (empty = the French image).';

-- -----------------------------------------------------------------------------
-- 2. admin_save_course(): the English image slots
-- -----------------------------------------------------------------------------
-- Patched from its current definition (as 20261007072552 did), so the rest of
-- the function is untouched; the rewrite fails loudly if a pattern is missing.
do $patch$
declare
  v_def text;
  v_new text;
  v_old_block text := $old$        if coalesce(trim(v_block -> 'en' ->> 'body_html'), '') <> ''
           or coalesce(trim(v_block -> 'en' ->> 'alt_text'), '') <> ''
           or coalesce(trim(v_block -> 'en' ->> 'caption'), '') <> ''
           or coalesce(trim(v_block -> 'en' ->> 'title'), '') <> '' then
          insert into public.course_block_translations (block_id, locale, body_html, alt_text, caption, title)
          values (v_block_id, 'en', nullif(v_block -> 'en' ->> 'body_html', ''),
                  nullif(v_block -> 'en' ->> 'alt_text', ''), nullif(v_block -> 'en' ->> 'caption', ''),
                  nullif(v_block -> 'en' ->> 'title', ''))
          on conflict (block_id, locale) do update
             set body_html = excluded.body_html, alt_text = excluded.alt_text,
                 caption = excluded.caption, title = excluded.title;$old$;
  v_new_block text := $new$        -- English files: an image block's image, a video block's poster (kind-checked).
        v_en_media := case when v_block ->> 'kind' = 'image'
                           then nullif(v_block -> 'en' ->> 'media_id', '')::uuid end;
        v_en_poster := case when v_block ->> 'kind' = 'video'
                            then nullif(v_block -> 'en' ->> 'poster_media_id', '')::uuid end;
        perform private.check_training_media(v_en_media, 'image');
        perform private.check_training_media(v_en_poster, 'image');
        if coalesce(trim(v_block -> 'en' ->> 'body_html'), '') <> ''
           or coalesce(trim(v_block -> 'en' ->> 'alt_text'), '') <> ''
           or coalesce(trim(v_block -> 'en' ->> 'caption'), '') <> ''
           or coalesce(trim(v_block -> 'en' ->> 'title'), '') <> ''
           or v_en_media is not null or v_en_poster is not null then
          insert into public.course_block_translations
            (block_id, locale, body_html, alt_text, caption, title, media_id, poster_media_id)
          values (v_block_id, 'en', nullif(v_block -> 'en' ->> 'body_html', ''),
                  nullif(v_block -> 'en' ->> 'alt_text', ''), nullif(v_block -> 'en' ->> 'caption', ''),
                  nullif(v_block -> 'en' ->> 'title', ''), v_en_media, v_en_poster)
          on conflict (block_id, locale) do update
             set body_html = excluded.body_html, alt_text = excluded.alt_text,
                 caption = excluded.caption, title = excluded.title,
                 media_id = excluded.media_id, poster_media_id = excluded.poster_media_id;$new$;
  v_old_question text := $old$        if coalesce(trim(v_question -> 'en' ->> 'text'), '') <> '' then
          insert into public.quiz_question_translations
            (question_id, locale, text, correct_feedback, incorrect_feedback, learn_more)
          values (v_q_id, 'en', v_question -> 'en' ->> 'text',
                  nullif(v_question -> 'en' ->> 'correct_feedback', ''),
                  nullif(v_question -> 'en' ->> 'incorrect_feedback', ''),
                  nullif(v_question -> 'en' ->> 'learn_more', ''))
          on conflict (question_id, locale) do update
             set text = excluded.text, correct_feedback = excluded.correct_feedback,
                 incorrect_feedback = excluded.incorrect_feedback, learn_more = excluded.learn_more;$old$;
  v_new_question text := $new$        v_en_media := nullif(v_question -> 'en' ->> 'image_media_id', '')::uuid;
        perform private.check_training_media(v_en_media, 'image');
        if coalesce(trim(v_question -> 'en' ->> 'text'), '') <> '' or v_en_media is not null then
          insert into public.quiz_question_translations
            (question_id, locale, text, correct_feedback, incorrect_feedback, learn_more, image_media_id)
          values (v_q_id, 'en', nullif(trim(v_question -> 'en' ->> 'text'), ''),
                  nullif(v_question -> 'en' ->> 'correct_feedback', ''),
                  nullif(v_question -> 'en' ->> 'incorrect_feedback', ''),
                  nullif(v_question -> 'en' ->> 'learn_more', ''), v_en_media)
          on conflict (question_id, locale) do update
             set text = excluded.text, correct_feedback = excluded.correct_feedback,
                 incorrect_feedback = excluded.incorrect_feedback, learn_more = excluded.learn_more,
                 image_media_id = excluded.image_media_id;$new$;
begin
  select pg_get_functiondef('public.admin_save_course(jsonb)'::regprocedure) into v_def;
  if v_def like '%v_en_media%' then
    return; -- already patched
  end if;
  if position(v_old_block in v_def) = 0 or position(v_old_question in v_def) = 0 then
    raise exception 'admin_save_course: rewrite failed (unexpected definition)';
  end if;
  v_new := replace(v_def, v_old_block, v_new_block);
  v_new := replace(v_new, v_old_question, v_new_question);
  v_new := replace(v_new, E'  v_men       jsonb;\n',
                   E'  v_men       jsonb;\n  v_en_media  uuid;\n  v_en_poster uuid;\n');
  if v_new not like '%v_en_poster uuid;%' then
    raise exception 'admin_save_course: rewrite failed (declarations)';
  end if;
  execute v_new;
end
$patch$;

-- -----------------------------------------------------------------------------
-- 3. What a learner reads: the English files and their library entries
-- -----------------------------------------------------------------------------
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
        union all select bt.media_id from public.course_steps s join public.course_blocks b on b.step_id = s.id
                    join public.course_block_translations bt on bt.block_id = b.id
                   where s.module_id = m.id and bt.locale = 'en' and bt.status = 'published'
        union all select bt.poster_media_id from public.course_steps s join public.course_blocks b on b.step_id = s.id
                    join public.course_block_translations bt on bt.block_id = b.id
                   where s.module_id = m.id and bt.locale = 'en' and bt.status = 'published'
        union all select qq.image_media_id from public.course_quizzes q join public.quiz_questions qq on qq.quiz_id = q.id
                   where q.module_id = m.id
        union all select qt.image_media_id from public.course_quizzes q join public.quiz_questions qq on qq.quiz_id = q.id
                    join public.quiz_question_translations qt on qt.question_id = qq.id
                   where q.module_id = m.id and qt.locale = 'en' and qt.status = 'published'
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
                                                                      'caption', t.caption, 'title', t.title,
                                                                      'media_id', t.media_id,
                                                                      'poster_media_id', t.poster_media_id)
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
                                     'en', (select jsonb_build_object('text', t.text, 'image_media_id', t.image_media_id)
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

revoke all on function private.learner_course_json(uuid) from public;

-- -----------------------------------------------------------------------------
-- 4. Storage: a holder reads the English files of their published course
-- -----------------------------------------------------------------------------
create or replace function private.can_read_learner_media_path(p_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.training_media m
     where m.storage_path = p_path
       and (
         private.is_held_course_cover(m.id)
         or exists (
           select 1
             from public.course_modules cm
             join public.courses c on c.id = cm.course_id
            where c.status = 'published' and private.holds_course(c.id)
              and (cm.cover_media_id = m.id
                   or exists (select 1 from public.course_steps s
                                join public.course_blocks b on b.step_id = s.id
                               where s.module_id = cm.id and (b.media_id = m.id or b.poster_media_id = m.id))
                   or exists (select 1 from public.course_steps s
                                join public.course_blocks b on b.step_id = s.id
                                join public.course_block_translations bt on bt.block_id = b.id
                               where s.module_id = cm.id and bt.status = 'published'
                                 and (bt.media_id = m.id or bt.poster_media_id = m.id))
                   or exists (select 1 from public.course_quizzes q
                                join public.quiz_questions qq on qq.quiz_id = q.id
                               where q.module_id = cm.id and qq.image_media_id = m.id)
                   or exists (select 1 from public.course_quizzes q
                                join public.quiz_questions qq on qq.quiz_id = q.id
                                join public.quiz_question_translations qt on qt.question_id = qq.id
                               where q.module_id = cm.id and qt.status = 'published'
                                 and qt.image_media_id = m.id)))));
$$;

revoke all on function private.can_read_learner_media_path(text) from public;
grant execute on function private.can_read_learner_media_path(text) to authenticated, service_role;
