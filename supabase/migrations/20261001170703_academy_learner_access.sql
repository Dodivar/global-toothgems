-- =============================================================================
-- Iteration 22 — Academy learner access (phase C): entitlements, lesson content
-- for entitled members, progress, quiz attempts scored by the server, course
-- completions and certificates.
-- =============================================================================
-- Access = an active `course_entitlements` row (not revoked, started, not
-- expired). Phase C grants them by hand (staff with `manage_training`, audited);
-- phase D adds `purchase` rows from the verified Stripe webhook.
--
-- What an entitled member reads, and how:
--   * `learner_courses()` (SECURITY DEFINER) returns the courses they hold, each
--     with its whole tree (modules, steps, blocks, knowledge checks, questions,
--     answers) when the course is published, the storage paths of the media it
--     uses, and their own progress. Never `quiz_answers.is_correct`, never an
--     answer's `explanation`, never a question's feedback: those come back with
--     the correction, after an answer is submitted. The Academy content tables
--     keep their staff-only RLS for blocks, questions and answers.
--   * An UNPUBLISHED course (owner, 2026-10-01) is returned to its holders as a
--     header only (title, cover, level): the member area shows it greyed out,
--     "back soon"; no content, no progress write, no media but its cover.
--   * Media files: storage policy `private.can_read_learner_media_path()` — the
--     cover of a course they hold, and the files a published course they hold
--     uses (block media and posters, module covers, question images). The
--     browser signs them with its own session.
--
-- Progress is written only by functions, which re-check access and the path
-- rules of `webapp/src/lib/learning/path.ts` (sequential unlocking: every node
-- up to the first required one not done is open; attempts per check; average
-- of the best scores; sticky completion):
--   * `complete_course_step(step)` — a step is validated only when unlocked.
--   * `answer_quiz_question(module, question, answer)` — immediate-feedback
--     checks: opens an attempt (counted against the allowed attempts, pass mark
--     snapshotted), records the FIRST answer to each question and returns its
--     correction; a second answer to the same question is refused.
--   * `submit_quiz_answers(module, answers)` — scores deterministically
--     (round(correct × 100 / questions)), closes the attempt, returns the
--     corrections. With `show_answers` off, the correct answer is never named
--     (only right/wrong).
--   * Completion (all required nodes done, average of the best scores ≥
--     `courses.min_score`, non-empty path) inserts `course_completions` once —
--     sticky, with the average and pass mark snapshotted, and a certificate
--     code when the course issues certificates.
--
-- References to the authored tree are SOFT (plain uuids, no foreign key):
-- `lesson_progress.step_id`, `quiz_attempts.module_id` / `quiz_id` and the
-- answers snapshot. Deleting a step, a check, a question or an answer of a
-- published course therefore neither blocks the author's save (RESTRICT) nor
-- erases what members did (CASCADE); the path rules ignore keys the course no
-- longer has, and completions/certificates only reference the course. A check
-- is keyed by its MODULE: `admin_save_course` recreates a module's quiz row when
-- the check is replaced, the module stays.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Entitlements
-- -----------------------------------------------------------------------------
create table public.course_entitlements (
  id         uuid primary key default gen_random_uuid(),
  -- CASCADE: erasing an account erases its access (the order keeps the sale).
  user_id    uuid not null references public.profiles (id) on delete cascade,
  course_id  uuid not null references public.courses (id) on delete restrict,
  source     text not null check (source in ('purchase', 'manual_grant', 'bundle', 'promotion')),
  order_id   uuid references public.orders (id) on delete restrict,
  granted_by uuid references public.profiles (id) on delete set null,
  note       text check (char_length(note) <= 500),
  starts_at  timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint course_entitlements_period check (expires_at is null or expires_at > starts_at),
  constraint course_entitlements_purchase_order check (source <> 'purchase' or order_id is not null)
);

comment on table public.course_entitlements is
  'Access to a course. Active = not revoked, started, not expired. Written by functions only (manual grants, phase D webhook).';

-- One unrevoked entitlement per member and course (an expired one is closed
-- by revoking it when access is granted again).
create unique index course_entitlements_one_open_idx
  on public.course_entitlements (user_id, course_id) where revoked_at is null;
create index course_entitlements_course_idx on public.course_entitlements (course_id);
create index course_entitlements_order_idx on public.course_entitlements (order_id);
create index course_entitlements_granted_by_idx on public.course_entitlements (granted_by);
create index course_entitlements_revoked_by_idx on public.course_entitlements (revoked_by);

create trigger course_entitlements_set_updated_at
  before update on public.course_entitlements
  for each row execute function private.set_updated_at();
create trigger course_entitlements_audit_log
  after insert or update or delete on public.course_entitlements
  for each row execute function private.audit_changes();

alter table public.course_entitlements enable row level security;
revoke all on public.course_entitlements from anon;
revoke insert, update, delete, truncate, references, trigger on public.course_entitlements from authenticated;
create policy "course_entitlements: own or staff"
  on public.course_entitlements for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_staff()));

-- -----------------------------------------------------------------------------
-- 2. Progress, attempts, completions
-- -----------------------------------------------------------------------------
create table public.lesson_progress (
  user_id      uuid not null references public.profiles (id) on delete cascade,
  course_id    uuid not null references public.courses (id) on delete restrict,
  -- Soft reference to course_steps (see header).
  step_id      uuid not null,
  completed_at timestamptz not null default now(),
  primary key (user_id, step_id)
);
create index lesson_progress_course_idx on public.lesson_progress (course_id);
create index lesson_progress_user_course_idx on public.lesson_progress (user_id, course_id);

create table public.quiz_attempts (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles (id) on delete cascade,
  course_id      uuid not null references public.courses (id) on delete restrict,
  -- Soft references: the module's check (key), and the quiz row scored.
  module_id      uuid not null,
  quiz_id        uuid not null,
  status         text not null default 'open' check (status in ('open', 'submitted')),
  -- { "<question id>": { "answer_id": "<uuid>", "correct": bool } } — the
  -- learner's own answers and whether each was right; never the answer key.
  answers        jsonb not null default '{}'::jsonb check (jsonb_typeof(answers) = 'object'),
  question_count integer check (question_count >= 0),
  correct_count  integer check (correct_count >= 0),
  score          smallint check (score between 0 and 100),
  -- Pass mark of the check when the attempt started.
  passing_score  smallint not null check (passing_score between 0 and 100),
  passed         boolean not null default false,
  started_at     timestamptz not null default now(),
  submitted_at   timestamptz,
  constraint quiz_attempts_submitted_scored check (
    (status = 'open' and submitted_at is null and score is null and not passed)
    or (status = 'submitted' and submitted_at is not null and score is not null
        and question_count is not null and correct_count is not null))
);
create unique index quiz_attempts_one_open_idx on public.quiz_attempts (user_id, module_id) where status = 'open';
create index quiz_attempts_user_course_idx on public.quiz_attempts (user_id, course_id);
create index quiz_attempts_course_idx on public.quiz_attempts (course_id);

create table public.course_completions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles (id) on delete cascade,
  course_id        uuid not null references public.courses (id) on delete restrict,
  completed_at     timestamptz not null default now(),
  -- Average of the best check scores at completion (null: no check attempted).
  average_score    smallint check (average_score between 0 and 100),
  min_score        smallint not null check (min_score between 0 and 100),
  -- Verification code of the certificate; null when the course issues none.
  certificate_code text unique check (certificate_code ~ '^GTC-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$'),
  constraint course_completions_once unique (user_id, course_id)
);
create index course_completions_course_idx on public.course_completions (course_id);

comment on table public.course_completions is
  'A course completed by a member, recorded once by the server (sticky). Holds the certificate when the course issues one.';

do $$
declare
  t text;
begin
  foreach t in array array['lesson_progress', 'quiz_attempts', 'course_completions'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('revoke insert, update, delete, truncate, references, trigger on public.%I from authenticated', t);
    execute format(
      'create policy "%1$s: own or staff" on public.%1$I for select to authenticated
         using (user_id = (select auth.uid()) or (select private.is_staff()))', t);
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- 3. Access helpers (SECURITY DEFINER: policies and functions call them without
--    re-entering RLS). They only ever look at the caller (auth.uid()).
-- -----------------------------------------------------------------------------

-- The caller holds the course now.
create or replace function private.holds_course(p_course_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.course_entitlements e
     where e.user_id = (select auth.uid())
       and e.course_id = p_course_id
       and e.revoked_at is null
       and e.starts_at <= now()
       and (e.expires_at is null or e.expires_at > now()));
$$;

-- A course the caller may see listed: published, or unpublished and held.
create or replace function private.can_see_course(p_course_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.courses c
     where c.id = p_course_id
       and (c.status = 'published' or (c.status = 'unpublished' and private.holds_course(c.id))));
$$;

-- The cover of a course the caller holds (published or withdrawn).
create or replace function private.is_held_course_cover(p_media_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.courses c
     where c.cover_media_id = p_media_id
       and c.status in ('published', 'unpublished')
       and private.holds_course(c.id));
$$;

-- A file of the training-media bucket the caller may read as a learner.
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
                   or exists (select 1 from public.course_quizzes q
                                join public.quiz_questions qq on qq.quiz_id = q.id
                               where q.module_id = cm.id and qq.image_media_id = m.id)))));
$$;

revoke all on function private.holds_course(uuid) from public;
revoke all on function private.can_see_course(uuid) from public;
revoke all on function private.is_held_course_cover(uuid) from public;
revoke all on function private.can_read_learner_media_path(text) from public;
-- anon too: the courses and cover policies apply to visitors (always false for them).
grant execute on function private.holds_course(uuid) to anon, authenticated, service_role;
grant execute on function private.can_see_course(uuid) to anon, authenticated, service_role;
grant execute on function private.is_held_course_cover(uuid) to anon, authenticated, service_role;
grant execute on function private.can_read_learner_media_path(text) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 4. Holders see their withdrawn course (row, translations, cover) — greyed out
-- -----------------------------------------------------------------------------
drop policy "courses: published or staff" on public.courses;
create policy "courses: published, held or staff"
  on public.courses for select to anon, authenticated
  using (status = 'published' or (select private.is_staff())
         or (status = 'unpublished' and private.holds_course(id)));

drop policy "course_translations: published or staff" on public.course_translations;
create policy "course_translations: published, held or staff"
  on public.course_translations for select to anon, authenticated
  using ((select private.is_staff()) or (status = 'published' and private.can_see_course(course_id)));

alter policy "training_media: published course covers or staff" on public.training_media
  using ((select private.is_staff()) or private.is_public_course_cover(id) or private.is_held_course_cover(id));
alter policy "training_media_translations: published covers or staff" on public.training_media_translations
  using ((select private.is_staff())
         or (status = 'published' and (private.is_public_course_cover(media_id) or private.is_held_course_cover(media_id))));

create policy "training-media: learners read their courses' media"
  on storage.objects for select to authenticated
  using (bucket_id = 'training-media' and private.can_read_learner_media_path(name));

-- -----------------------------------------------------------------------------
-- 5. The learner's path (port of lib/learning/path.ts) and progress JSON
-- -----------------------------------------------------------------------------

-- Every node of a course in learner order — each module's steps, then its
-- check — with whether it is required and done for one member, and the
-- member's attempts at each check. Internal: not granted to clients.
create or replace function private.learner_path(p_user_id uuid, p_course_id uuid)
returns table (ord bigint, kind text, node_id uuid, module_id uuid, required boolean, done boolean,
               best_score integer, attempts integer)
language sql
stable
security definer
set search_path = ''
as $$
  with course as (
    select c.complete_all_steps, c.complete_all_quizzes from public.courses c where c.id = p_course_id
  ), nodes as (
    select m.position as mpos, 0 as part, s.position as spos, 'step'::text as kind, s.id as node_id, m.id as module_id
      from public.course_modules m
      join public.course_steps s on s.module_id = m.id
     where m.course_id = p_course_id
    union all
    select m.position, 1, 0, 'quiz', q.id, m.id
      from public.course_modules m
      join public.course_quizzes q on q.module_id = m.id
     where m.course_id = p_course_id
  )
  select row_number() over (order by n.mpos, n.part, n.spos) as ord,
         n.kind,
         n.node_id,
         n.module_id,
         case when n.kind = 'step' then course.complete_all_steps else course.complete_all_quizzes end as required,
         case when n.kind = 'step'
              then exists (select 1 from public.lesson_progress lp
                            where lp.user_id = p_user_id and lp.step_id = n.node_id)
              else exists (select 1 from public.quiz_attempts a
                            where a.user_id = p_user_id and a.module_id = n.module_id and a.passed)
         end as done,
         case when n.kind = 'quiz'
              then (select max(a.score)::integer from public.quiz_attempts a
                     where a.user_id = p_user_id and a.module_id = n.module_id and a.status = 'submitted')
         end as best_score,
         case when n.kind = 'quiz'
              then (select count(*)::integer from public.quiz_attempts a
                     where a.user_id = p_user_id and a.module_id = n.module_id and a.status = 'submitted')
         end as attempts
    from nodes n
   cross join course;
$$;

-- Whether a node is open: at or before the first required node not done, or done.
create or replace function private.learner_node_unlocked(p_user_id uuid, p_course_id uuid, p_node_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with path as (select * from private.learner_path(p_user_id, p_course_id)),
       frontier as (
         select coalesce(min(ord) filter (where required and not done), (select count(*) + 1 from path)) as idx
           from path)
  select coalesce((select p.ord <= f.idx or p.done from path p, frontier f where p.node_id = p_node_id), false);
$$;

-- Records the completion once, when every required node is done and the
-- average of the best check scores reaches the course minimum.
create or replace function private.refresh_course_completion(p_user_id uuid, p_course_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total   integer;
  v_missing integer;
  v_average numeric;
  v_min     smallint;
  v_cert    boolean;
  v_hex     text;
begin
  if exists (select 1 from public.course_completions where user_id = p_user_id and course_id = p_course_id) then
    return;
  end if;

  select count(*), count(*) filter (where required and not done),
         round(avg(best_score) filter (where kind = 'quiz' and best_score is not null))
    into v_total, v_missing, v_average
    from private.learner_path(p_user_id, p_course_id);

  if v_total = 0 or v_missing > 0 then
    return;
  end if;

  select c.min_score, c.issues_certificate into v_min, v_cert from public.courses c where c.id = p_course_id;
  if v_average is not null and v_average < v_min then
    return;
  end if;

  v_hex := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
  insert into public.course_completions (user_id, course_id, average_score, min_score, certificate_code)
  values (p_user_id, p_course_id, v_average, v_min,
          case when v_cert
               then 'GTC-' || substr(v_hex, 1, 4) || '-' || substr(v_hex, 5, 4) || '-' || substr(v_hex, 9, 4) end)
  on conflict (user_id, course_id) do nothing;
end;
$$;

-- One member's progress in one course, as the learner pages read it.
create or replace function private.learner_progress_json(p_user_id uuid, p_course_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'steps', coalesce((
      select jsonb_agg(jsonb_build_object('step_id', lp.step_id, 'completed_at', lp.completed_at)
                       order by lp.completed_at)
        from public.lesson_progress lp
       where lp.user_id = p_user_id and lp.course_id = p_course_id), '[]'::jsonb),
    'attempts', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', a.id, 'module_id', a.module_id, 'status', a.status, 'score', a.score,
               'passed', a.passed, 'passing_score', a.passing_score, 'answers', a.answers,
               'started_at', a.started_at, 'submitted_at', a.submitted_at)
             order by a.started_at)
        from public.quiz_attempts a
       where a.user_id = p_user_id and a.course_id = p_course_id), '[]'::jsonb),
    'completion', (
      select jsonb_build_object('completed_at', cc.completed_at, 'average_score', cc.average_score,
                                'min_score', cc.min_score, 'certificate_code', cc.certificate_code)
        from public.course_completions cc
       where cc.user_id = p_user_id and cc.course_id = p_course_id));
$$;

revoke all on function private.learner_path(uuid, uuid) from public;
revoke all on function private.learner_node_unlocked(uuid, uuid, uuid) from public;
revoke all on function private.refresh_course_completion(uuid, uuid) from public;
revoke all on function private.learner_progress_json(uuid, uuid) from public;

-- -----------------------------------------------------------------------------
-- 6. What a learner reads: learner_courses()
-- -----------------------------------------------------------------------------

-- A course as its holder reads it. Published: the whole tree without answer
-- keys or feedback, and the media it uses. Unpublished: the header and cover.
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
                          'allow_retry', q.allow_retry,
                          'max_attempts', q.max_attempts,
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

revoke all on function private.learner_course_json(uuid) from public;

-- Every course the caller holds now, newest entitlement first, each with its
-- content (when published) and the caller's progress.
create or replace function public.learner_courses()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'learning: sign in' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(
             private.learner_course_json(e.course_id)
             || jsonb_build_object(
                  'entitlement', jsonb_build_object('source', e.source, 'starts_at', e.starts_at,
                                                    'expires_at', e.expires_at),
                  'progress', private.learner_progress_json(v_uid, e.course_id))
             order by e.starts_at desc)
      from public.course_entitlements e
      join public.courses c on c.id = e.course_id
     where e.user_id = v_uid
       and e.revoked_at is null
       and e.starts_at <= now()
       and (e.expires_at is null or e.expires_at > now())
       and c.status in ('published', 'unpublished')), '[]'::jsonb);
end;
$$;

revoke all on function public.learner_courses() from public, anon;
grant execute on function public.learner_courses() to authenticated;

-- -----------------------------------------------------------------------------
-- 7. Progress writes
-- -----------------------------------------------------------------------------

-- The course the caller may study now (held and published), locked so two
-- concurrent writes by the same member are serialised. Raises otherwise.
create or replace function private.lock_learner_course(p_course_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  if auth.uid() is null then
    raise exception 'learning: sign in' using errcode = '42501';
  end if;
  perform 1
     from public.course_entitlements e
    where e.user_id = auth.uid()
      and e.course_id = p_course_id
      and e.revoked_at is null
      and e.starts_at <= now()
      and (e.expires_at is null or e.expires_at > now())
      for update;
  if not found then
    raise exception 'learning: no_access' using errcode = '42501';
  end if;
  select c.status into v_status from public.courses c where c.id = p_course_id;
  if v_status is distinct from 'published' then
    raise exception 'learning: unavailable' using errcode = '42501';
  end if;
end;
$$;

revoke all on function private.lock_learner_course(uuid) from public;

-- Validates one step. Idempotent; refused when the step is locked.
create or replace function public.complete_course_step(p_step_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_course uuid;
begin
  select m.course_id into v_course
    from public.course_steps s join public.course_modules m on m.id = s.module_id
   where s.id = p_step_id;
  if v_course is null then
    raise exception 'learning: no_access' using errcode = '42501';
  end if;
  perform private.lock_learner_course(v_course);

  if not exists (select 1 from public.lesson_progress where user_id = v_uid and step_id = p_step_id) then
    if not private.learner_node_unlocked(v_uid, v_course, p_step_id) then
      raise exception 'learning: locked' using errcode = '22023';
    end if;
    insert into public.lesson_progress (user_id, course_id, step_id) values (v_uid, v_course, p_step_id);
    perform private.refresh_course_completion(v_uid, v_course);
  end if;

  return private.learner_progress_json(v_uid, v_course);
end;
$$;

-- The correction of one answered question: right or wrong, the chosen answer's
-- explanation, the question's feedback, and the correct answer's id only when
-- the check reveals answers (or the learner found it).
create or replace function private.quiz_correction(p_question_id uuid, p_answer_id uuid, p_show_answers boolean)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'question_id', qq.id,
    'answer_id', p_answer_id,
    'correct', coalesce(chosen.is_correct, false),
    'correct_answer_id', case when p_show_answers or coalesce(chosen.is_correct, false) then right_one.id end,
    'explanation', chosen.explanation,
    'explanation_en', (select t.explanation from public.quiz_answer_translations t
                        where t.answer_id = chosen.id and t.locale = 'en' and t.status = 'published'),
    'feedback', case when coalesce(chosen.is_correct, false) then qq.correct_feedback else qq.incorrect_feedback end,
    'feedback_en', (select case when coalesce(chosen.is_correct, false) then t.correct_feedback else t.incorrect_feedback end
                      from public.quiz_question_translations t
                     where t.question_id = qq.id and t.locale = 'en' and t.status = 'published'),
    'learn_more', qq.learn_more,
    'learn_more_en', (select t.learn_more from public.quiz_question_translations t
                       where t.question_id = qq.id and t.locale = 'en' and t.status = 'published'))
    from public.quiz_questions qq
    left join public.quiz_answers chosen on chosen.id = p_answer_id and chosen.question_id = qq.id
    left join public.quiz_answers right_one on right_one.question_id = qq.id and right_one.is_correct
   where qq.id = p_question_id;
$$;

revoke all on function private.quiz_correction(uuid, uuid, boolean) from public;

-- The module's check, checked open for the caller (unlocked, not passed, an
-- attempt left), and the caller's open attempt on it, created if needed.
-- Returns the attempt id. Caller must hold the course lock.
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
  v_used    integer;
  v_allowed integer;
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
  select count(*) into v_used from public.quiz_attempts a
   where a.user_id = v_uid and a.module_id = p_module_id and a.status = 'submitted';
  v_allowed := case when v_quiz.allow_retry then greatest(1, v_quiz.max_attempts) else 1 end;
  if v_used >= v_allowed then
    raise exception 'learning: no_attempts_left' using errcode = '22023';
  end if;

  insert into public.quiz_attempts (user_id, course_id, module_id, quiz_id, passing_score)
  values (v_uid, v_course, p_module_id, v_quiz.id, v_quiz.passing_score)
  returning id into v_attempt;
  return v_attempt;
end;
$$;

revoke all on function private.open_quiz_attempt(uuid, boolean) from public;

-- Immediate feedback: records the first answer to one question and returns its
-- correction. Answering a question again returns the recorded correction.
create or replace function public.answer_quiz_question(p_module_id uuid, p_question_id uuid, p_answer_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_course  uuid;
  v_quiz    public.course_quizzes%rowtype;
  v_attempt uuid;
  v_answers jsonb;
  v_correct boolean;
begin
  select m.course_id into v_course from public.course_modules m where m.id = p_module_id;
  if v_course is null then
    raise exception 'learning: no_access' using errcode = '42501';
  end if;
  perform private.lock_learner_course(v_course);

  select q.* into v_quiz from public.course_quizzes q where q.module_id = p_module_id;
  if v_quiz.id is null then
    raise exception 'learning: no_access' using errcode = '42501';
  end if;
  if not v_quiz.immediate_feedback then
    raise exception 'learning: no_immediate_feedback' using errcode = '22023';
  end if;
  if not exists (select 1 from public.quiz_questions qq where qq.id = p_question_id and qq.quiz_id = v_quiz.id)
     or not exists (select 1 from public.quiz_answers a where a.id = p_answer_id and a.question_id = p_question_id) then
    raise exception 'learning: invalid_answer' using errcode = '22023';
  end if;

  v_attempt := private.open_quiz_attempt(p_module_id, true);
  select a.answers into v_answers from public.quiz_attempts a where a.id = v_attempt;

  if v_answers ? p_question_id::text then
    -- Already answered in this attempt: the first answer stands.
    return private.quiz_correction(p_question_id, (v_answers -> p_question_id::text ->> 'answer_id')::uuid,
                                   v_quiz.show_answers)
           || jsonb_build_object('attempt_id', v_attempt, 'locked', true);
  end if;

  select a.is_correct into v_correct from public.quiz_answers a where a.id = p_answer_id;
  update public.quiz_attempts
     set answers = answers || jsonb_build_object(p_question_id::text,
                                jsonb_build_object('answer_id', p_answer_id, 'correct', v_correct))
   where id = v_attempt;

  return private.quiz_correction(p_question_id, p_answer_id, v_quiz.show_answers)
         || jsonb_build_object('attempt_id', v_attempt, 'locked', false);
end;
$$;

-- Scores one attempt at a module's check: the answers recorded during the
-- attempt (immediate feedback) stand; the payload { "<question id>":
-- "<answer id>" } fills the others. Unanswered = wrong. Returns the score and
-- every question's correction.
create or replace function public.submit_quiz_answers(p_module_id uuid, p_answers jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := auth.uid();
  v_course   uuid;
  v_quiz     public.course_quizzes%rowtype;
  v_attempt  uuid;
  v_recorded jsonb;
  v_final    jsonb := '{}'::jsonb;
  v_question record;
  v_answer   uuid;
  v_correct  boolean;
  v_total    integer := 0;
  v_right    integer := 0;
  v_score    smallint;
  v_passing  smallint;
  v_passed   boolean;
  v_fixes    jsonb := '[]'::jsonb;
begin
  if p_answers is null or jsonb_typeof(p_answers) <> 'object' then
    raise exception 'learning: invalid_answer' using errcode = '22023';
  end if;
  select m.course_id into v_course from public.course_modules m where m.id = p_module_id;
  if v_course is null then
    raise exception 'learning: no_access' using errcode = '42501';
  end if;
  perform private.lock_learner_course(v_course);

  select q.* into v_quiz from public.course_quizzes q where q.module_id = p_module_id;
  if v_quiz.id is null then
    raise exception 'learning: no_access' using errcode = '42501';
  end if;

  v_attempt := private.open_quiz_attempt(p_module_id, true);
  select a.answers, a.passing_score into v_recorded, v_passing from public.quiz_attempts a where a.id = v_attempt;

  for v_question in
    select qq.id from public.quiz_questions qq where qq.quiz_id = v_quiz.id order by qq.position
  loop
    v_total := v_total + 1;
    if v_recorded ? v_question.id::text then
      v_answer := (v_recorded -> v_question.id::text ->> 'answer_id')::uuid;
    else
      begin
        v_answer := nullif(p_answers ->> v_question.id::text, '')::uuid;
      exception when invalid_text_representation then
        raise exception 'learning: invalid_answer' using errcode = '22023';
      end;
      if v_answer is not null
         and not exists (select 1 from public.quiz_answers a where a.id = v_answer and a.question_id = v_question.id) then
        raise exception 'learning: invalid_answer' using errcode = '22023';
      end if;
    end if;

    select coalesce(bool_or(a.is_correct), false) into v_correct
      from public.quiz_answers a where a.id = v_answer and a.question_id = v_question.id;
    if v_correct then
      v_right := v_right + 1;
    end if;
    if v_answer is not null then
      v_final := v_final || jsonb_build_object(v_question.id::text,
                                               jsonb_build_object('answer_id', v_answer, 'correct', v_correct));
    end if;
    v_fixes := v_fixes || jsonb_build_array(private.quiz_correction(v_question.id, v_answer, v_quiz.show_answers));
  end loop;

  v_score := case when v_total = 0 then 0 else round(v_right * 100.0 / v_total) end;
  v_passed := v_total > 0 and v_score >= v_passing;

  update public.quiz_attempts
     set status = 'submitted', answers = v_final, question_count = v_total, correct_count = v_right,
         score = v_score, passed = v_passed, submitted_at = now()
   where id = v_attempt;

  perform private.refresh_course_completion(v_uid, v_course);

  return jsonb_build_object(
    'attempt_id', v_attempt,
    'score', v_score,
    'correct', v_right,
    'total', v_total,
    'passing_score', v_passing,
    'passed', v_passed,
    'corrections', v_fixes,
    'progress', private.learner_progress_json(v_uid, v_course));
end;
$$;

revoke all on function public.complete_course_step(uuid) from public, anon;
revoke all on function public.answer_quiz_question(uuid, uuid, uuid) from public, anon;
revoke all on function public.submit_quiz_answers(uuid, jsonb) from public, anon;
grant execute on function public.complete_course_step(uuid) to authenticated;
grant execute on function public.answer_quiz_question(uuid, uuid, uuid) to authenticated;
grant execute on function public.submit_quiz_answers(uuid, jsonb) to authenticated;

-- -----------------------------------------------------------------------------
-- 8. Back office: grant, revoke, list a course's holders (manage_training)
-- -----------------------------------------------------------------------------

-- Gives a member (found by exact e-mail) access to a course ever published.
-- An expired, unrevoked entitlement is closed first; an active one is refused.
create or replace function public.admin_grant_course(
  p_email text, p_course_id uuid, p_expires_at timestamptz default null, p_note text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user  uuid;
  v_open  public.course_entitlements%rowtype;
  v_id    uuid;
begin
  if not private.has_permission('manage_training') then
    raise exception 'admin_grant_course: permission denied' using errcode = '42501';
  end if;
  select p.id into v_user from public.profiles p where lower(p.email) = lower(trim(p_email));
  if v_user is null then
    raise exception 'admin_grant_course: member_not_found' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.courses c where c.id = p_course_id and c.published_at is not null) then
    raise exception 'admin_grant_course: course_not_published' using errcode = '22023';
  end if;
  if p_expires_at is not null and p_expires_at <= now() then
    raise exception 'admin_grant_course: invalid_expiry' using errcode = '22023';
  end if;
  if p_note is not null and char_length(p_note) > 500 then
    raise exception 'admin_grant_course: invalid_note' using errcode = '22023';
  end if;

  select e.* into v_open from public.course_entitlements e
   where e.user_id = v_user and e.course_id = p_course_id and e.revoked_at is null
   for update;
  if v_open.id is not null then
    if v_open.expires_at is null or v_open.expires_at > now() then
      raise exception 'admin_grant_course: already_held' using errcode = '23505';
    end if;
    update public.course_entitlements set revoked_at = now(), revoked_by = auth.uid() where id = v_open.id;
  end if;

  insert into public.course_entitlements (user_id, course_id, source, granted_by, note, expires_at)
  values (v_user, p_course_id, 'manual_grant', auth.uid(), nullif(trim(p_note), ''), p_expires_at)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.admin_revoke_course_entitlement(p_entitlement_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.has_permission('manage_training') then
    raise exception 'admin_revoke_course_entitlement: permission denied' using errcode = '42501';
  end if;
  update public.course_entitlements
     set revoked_at = now(), revoked_by = auth.uid()
   where id = p_entitlement_id and revoked_at is null;
  if not found then
    raise exception 'admin_revoke_course_entitlement: not_found' using errcode = 'P0002';
  end if;
end;
$$;

-- A course's entitlements (newest first) with the member's name and e-mail and
-- how far they are: what the course access screen lists.
create or replace function public.admin_course_entitlements(p_course_id uuid)
returns table (
  id uuid, user_id uuid, email text, display_name text, source text, note text,
  starts_at timestamptz, expires_at timestamptz, revoked_at timestamptz, granted_by_name text,
  steps_done integer, completed_at timestamptz, certificate_code text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.has_permission('manage_training') then
    raise exception 'admin_course_entitlements: permission denied' using errcode = '42501';
  end if;
  return query
    select e.id, e.user_id, p.email,
           coalesce(nullif(p.display_name, ''), nullif(trim(concat_ws(' ', p.first_name, p.last_name)), '')),
           e.source, e.note, e.starts_at, e.expires_at, e.revoked_at,
           coalesce(nullif(g.display_name, ''), g.email),
           (select count(*)::integer from public.lesson_progress lp
             where lp.user_id = e.user_id and lp.course_id = e.course_id),
           cc.completed_at, cc.certificate_code
      from public.course_entitlements e
      join public.profiles p on p.id = e.user_id
      left join public.profiles g on g.id = e.granted_by
      left join public.course_completions cc on cc.user_id = e.user_id and cc.course_id = e.course_id
     where e.course_id = p_course_id
     order by (e.revoked_at is null) desc, e.starts_at desc;
end;
$$;

revoke all on function public.admin_grant_course(text, uuid, timestamptz, text) from public, anon;
revoke all on function public.admin_revoke_course_entitlement(uuid) from public, anon;
revoke all on function public.admin_course_entitlements(uuid) from public, anon;
grant execute on function public.admin_grant_course(text, uuid, timestamptz, text) to authenticated, service_role;
grant execute on function public.admin_revoke_course_entitlement(uuid) to authenticated, service_role;
grant execute on function public.admin_course_entitlements(uuid) to authenticated, service_role;
