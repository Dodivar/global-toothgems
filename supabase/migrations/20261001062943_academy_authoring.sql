-- =============================================================================
-- Iteration 20 — Academy authoring (phase A): courses, their content, quizzes,
-- the training media library, course price and course promotions.
-- =============================================================================
-- What the back-office course builder (`/admin/formations`) edits, stored for
-- real. Learner access, progress and quiz attempts are phase C; the public
-- Academy pages reading these tables are phase B.
--
-- Decisions taken by the owner (2026-10-01):
--   * A course is NOT a product: it never appears in the shop. Its price lives
--     on `courses` (numeric(12,2) + currency) and is edited with the
--     `manage_training` permission only. Consequence for checkout (phase D):
--     create_order and the Stripe Checkout functions will need a course line
--     type (VAT category `training`) — courses cannot ride on product lines.
--   * Course promotions are their own, simpler mechanism (`course_promotions`):
--     a dated percentage or amount off one course, at most one running at a
--     time. No codes, no segments — the shop's promotion engine works on
--     product lines only. Recorded as a decision to review.
--   * No instructor field: a single trainer authors every course.
--   * Lifecycle draft → published ⇄ unpublished. No "review" status (a draft is
--     already the not-yet-approved state). A published-then-withdrawn course is
--     `unpublished`: shown to its buyers greyed out ("back soon") with no access
--     to content (enforced in phase C); a course that was ever published cannot
--     be deleted, nor go back to draft.
--
-- Model (one translation table per level, base columns = French):
--   training_media (image | video, private bucket `training-media`)
--   courses ─* course_modules ─* course_steps ─* course_blocks (text | image | video)
--                     └─ course_quizzes (0..1) ─* quiz_questions ─* quiz_answers
--   courses ─* course_promotions
--   Media are referenced by id with ON DELETE RESTRICT: a file used by a lesson
--   cannot be deleted from the library. The save function also checks the kind
--   (an image slot takes an image, a video block a video).
--
-- Saving: the builder edits a whole course and saves it in one call,
-- admin_save_course(jsonb) — SECURITY INVOKER, so RLS still decides. Nodes are
-- upserted by their (client-generated) id and only omitted ids are deleted:
-- step, quiz and answer ids survive every save, which phase C's progress and
-- attempts rows will rely on.
--
-- Access in this phase: staff read everything (`is_staff`), `manage_training`
-- writes. Visitors read published courses, their translations, their running
-- promotions and their current price — nothing of the content.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. Helpers
-- -----------------------------------------------------------------------------

-- jsonb array of strings → text[] (null/absent → empty), blanks dropped.
create or replace function private.jsonb_text_array(p_value jsonb)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select coalesce(array(
    select trim(e)
      from jsonb_array_elements_text(
             case when jsonb_typeof(p_value) = 'array' then p_value else '[]'::jsonb end) with ordinality as t(e, n)
     where trim(e) <> ''
     order by n), '{}');
$$;

-- -----------------------------------------------------------------------------
-- 1. Training media library
-- -----------------------------------------------------------------------------
create table public.training_media (
  id               uuid primary key default gen_random_uuid(),
  kind             text not null check (kind in ('image', 'video')),
  -- Object path in the private `training-media` bucket: media/<id>/<file>.
  storage_path     text not null unique check (storage_path ~ '^media/[0-9a-f-]{36}/[A-Za-z0-9._-]{1,120}$'),
  mime_type        text not null,
  name             text not null check (char_length(name) between 1 and 200),
  -- Default description (French), offered to an image block when inserted.
  alt_text         text check (char_length(alt_text) <= 500),
  category         text not null default 'technique'
                   check (category in ('technique', 'hygiene', 'materials', 'results', 'studio')),
  tags             text[] not null default '{}' check (cardinality(tags) <= 30),
  width            integer check (width >= 0),
  height           integer check (height >= 0),
  bytes            bigint not null check (bytes > 0),
  duration_seconds integer check (duration_seconds >= 0),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid default auth.uid() references public.profiles (id) on delete set null,
  constraint training_media_kind_mime check (
    (kind = 'image' and mime_type in ('image/jpeg', 'image/png', 'image/webp', 'image/avif'))
    or (kind = 'video' and mime_type in ('video/mp4', 'video/webm', 'video/quicktime'))),
  constraint training_media_path_matches_id check (storage_path like 'media/' || id::text || '/%')
);

comment on table public.training_media is
  'Course editor media (images, videos) in the private training-media bucket. Never product media.';

create index training_media_created_by_idx on public.training_media (created_by);

create table public.training_media_translations (
  media_id   uuid not null references public.training_media (id) on delete cascade,
  locale     text not null references public.languages (code) on update cascade,
  alt_text   text not null check (char_length(alt_text) between 1 and 500),
  status     text not null default 'published' check (status in ('draft', 'published')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (media_id, locale)
);
create index training_media_translations_locale_idx on public.training_media_translations (locale);

-- -----------------------------------------------------------------------------
-- 2. Courses
-- -----------------------------------------------------------------------------
create table public.courses (
  id                   uuid primary key default gen_random_uuid(),
  slug                 text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 120),
  title                text not null check (char_length(title) between 1 and 200),
  short_description    text check (char_length(short_description) <= 500),
  description          text check (char_length(description) <= 20000),
  cover_media_id       uuid references public.training_media (id) on delete restrict,
  category             text not null default 'technique'
                       check (category in ('technique', 'hygiene', 'business', 'creative')),
  level                text not null default 'beginner'
                       check (level in ('beginner', 'intermediate', 'advanced', 'all')),
  -- Advertised length, authored (not the sum of the steps).
  duration_minutes     integer not null default 0 check (duration_minutes between 0 and 100000),
  objectives           text[] not null default '{}' check (cardinality(objectives) <= 30),
  requirements         text[] not null default '{}' check (cardinality(requirements) <= 30),
  -- Completion rules (enforced server-side in phase C).
  complete_all_steps   boolean not null default true,
  complete_all_quizzes boolean not null default true,
  min_score            smallint not null default 70 check (min_score between 0 and 100),
  issues_certificate   boolean not null default true,
  price                numeric(12, 2) not null default 0 check (price >= 0),
  currency             char(3) not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  status               text not null default 'draft' check (status in ('draft', 'published', 'unpublished')),
  -- First publication; set by trigger, never by clients.
  published_at         timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  created_by           uuid default auth.uid() references public.profiles (id) on delete set null,
  updated_by           uuid references public.profiles (id) on delete set null
);

comment on table public.courses is
  'Academy courses. Not products: never listed in the shop. Price edited under manage_training.';

create index courses_cover_media_idx on public.courses (cover_media_id);
create index courses_status_idx on public.courses (status);
create index courses_created_by_idx on public.courses (created_by);
create index courses_updated_by_idx on public.courses (updated_by);

create table public.course_translations (
  course_id         uuid not null references public.courses (id) on delete cascade,
  locale            text not null references public.languages (code) on update cascade,
  title             text not null check (char_length(title) between 1 and 200),
  slug              text check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 120),
  short_description text check (char_length(short_description) <= 500),
  description       text check (char_length(description) <= 20000),
  objectives        text[] not null default '{}' check (cardinality(objectives) <= 30),
  requirements      text[] not null default '{}' check (cardinality(requirements) <= 30),
  status            text not null default 'published' check (status in ('draft', 'published')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  primary key (course_id, locale),
  constraint course_translations_slug_unique unique (locale, slug)
);
create index course_translations_locale_idx on public.course_translations (locale);

-- -----------------------------------------------------------------------------
-- 3. Modules, steps, blocks
-- Positions are unique per parent, checked at commit (a save reorders freely).
-- -----------------------------------------------------------------------------
create table public.course_modules (
  id             uuid primary key default gen_random_uuid(),
  course_id      uuid not null references public.courses (id) on delete cascade,
  position       integer not null check (position >= 0),
  title          text not null check (char_length(title) between 1 and 200),
  description    text check (char_length(description) <= 5000),
  cover_media_id uuid references public.training_media (id) on delete restrict,
  objectives     text[] not null default '{}' check (cardinality(objectives) <= 30),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint course_modules_position_unique unique (course_id, position) deferrable initially deferred
);
create index course_modules_cover_media_idx on public.course_modules (cover_media_id);

create table public.course_module_translations (
  module_id   uuid not null references public.course_modules (id) on delete cascade,
  locale      text not null references public.languages (code) on update cascade,
  title       text not null check (char_length(title) between 1 and 200),
  description text check (char_length(description) <= 5000),
  objectives  text[] not null default '{}' check (cardinality(objectives) <= 30),
  status      text not null default 'published' check (status in ('draft', 'published')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (module_id, locale)
);
create index course_module_translations_locale_idx on public.course_module_translations (locale);

create table public.course_steps (
  id               uuid primary key default gen_random_uuid(),
  module_id        uuid not null references public.course_modules (id) on delete cascade,
  position         integer not null check (position >= 0),
  title            text not null check (char_length(title) between 1 and 200),
  summary          text check (char_length(summary) <= 500),
  duration_minutes integer not null default 0 check (duration_minutes between 0 and 10000),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint course_steps_position_unique unique (module_id, position) deferrable initially deferred
);

create table public.course_step_translations (
  step_id    uuid not null references public.course_steps (id) on delete cascade,
  locale     text not null references public.languages (code) on update cascade,
  title      text not null check (char_length(title) between 1 and 200),
  summary    text check (char_length(summary) <= 500),
  status     text not null default 'published' check (status in ('draft', 'published')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (step_id, locale)
);
create index course_step_translations_locale_idx on public.course_step_translations (locale);

-- One row per content block. Columns used depend on `kind`:
--   text  → body_html (the editor's small HTML subset, sanitised when rendered)
--   image → media_id (image), alt_text, caption, align
--   video → media_id (video), poster_media_id (image), title, caption, duration_seconds
-- media_id may be empty while drafting; publication requires it.
create table public.course_blocks (
  id               uuid primary key default gen_random_uuid(),
  step_id          uuid not null references public.course_steps (id) on delete cascade,
  position         integer not null check (position >= 0),
  kind             text not null check (kind in ('text', 'image', 'video')),
  body_html        text check (char_length(body_html) <= 100000),
  media_id         uuid references public.training_media (id) on delete restrict,
  poster_media_id  uuid references public.training_media (id) on delete restrict,
  alt_text         text check (char_length(alt_text) <= 500),
  caption          text check (char_length(caption) <= 1000),
  align            text check (align in ('left', 'center', 'full')),
  title            text check (char_length(title) <= 200),
  duration_seconds integer check (duration_seconds between 0 and 86400),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint course_blocks_position_unique unique (step_id, position) deferrable initially deferred,
  constraint course_blocks_kind_columns check (
    (kind = 'text' and media_id is null and poster_media_id is null)
    or (kind = 'image' and poster_media_id is null)
    or kind = 'video')
);
create index course_blocks_media_idx on public.course_blocks (media_id);
create index course_blocks_poster_media_idx on public.course_blocks (poster_media_id);

create table public.course_block_translations (
  block_id   uuid not null references public.course_blocks (id) on delete cascade,
  locale     text not null references public.languages (code) on update cascade,
  body_html  text check (char_length(body_html) <= 100000),
  alt_text   text check (char_length(alt_text) <= 500),
  caption    text check (char_length(caption) <= 1000),
  title      text check (char_length(title) <= 200),
  status     text not null default 'published' check (status in ('draft', 'published')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (block_id, locale)
);
create index course_block_translations_locale_idx on public.course_block_translations (locale);

-- -----------------------------------------------------------------------------
-- 4. Knowledge checks: at most one per module
-- -----------------------------------------------------------------------------
create table public.course_quizzes (
  id                 uuid primary key default gen_random_uuid(),
  module_id          uuid not null unique references public.course_modules (id) on delete cascade,
  title              text not null check (char_length(title) between 1 and 200),
  intro              text check (char_length(intro) <= 2000),
  passing_score      smallint not null default 70 check (passing_score between 0 and 100),
  allow_retry        boolean not null default true,
  max_attempts       smallint not null default 3 check (max_attempts between 1 and 100),
  shuffle_answers    boolean not null default true,
  immediate_feedback boolean not null default true,
  show_answers       boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table public.course_quiz_translations (
  quiz_id    uuid not null references public.course_quizzes (id) on delete cascade,
  locale     text not null references public.languages (code) on update cascade,
  title      text not null check (char_length(title) between 1 and 200),
  intro      text check (char_length(intro) <= 2000),
  status     text not null default 'published' check (status in ('draft', 'published')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (quiz_id, locale)
);
create index course_quiz_translations_locale_idx on public.course_quiz_translations (locale);

create table public.quiz_questions (
  id                 uuid primary key default gen_random_uuid(),
  quiz_id            uuid not null references public.course_quizzes (id) on delete cascade,
  position           integer not null check (position >= 0),
  text               text not null check (char_length(text) between 1 and 1000),
  image_media_id     uuid references public.training_media (id) on delete restrict,
  correct_feedback   text check (char_length(correct_feedback) <= 2000),
  incorrect_feedback text check (char_length(incorrect_feedback) <= 2000),
  learn_more         text check (char_length(learn_more) <= 2000),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint quiz_questions_position_unique unique (quiz_id, position) deferrable initially deferred
);
create index quiz_questions_image_media_idx on public.quiz_questions (image_media_id);

create table public.quiz_question_translations (
  question_id        uuid not null references public.quiz_questions (id) on delete cascade,
  locale             text not null references public.languages (code) on update cascade,
  text               text not null check (char_length(text) between 1 and 1000),
  correct_feedback   text check (char_length(correct_feedback) <= 2000),
  incorrect_feedback text check (char_length(incorrect_feedback) <= 2000),
  learn_more         text check (char_length(learn_more) <= 2000),
  status             text not null default 'published' check (status in ('draft', 'published')),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  primary key (question_id, locale)
);
create index quiz_question_translations_locale_idx on public.quiz_question_translations (locale);

-- `is_correct` and `explanation` are answer keys: never readable by learners
-- (phase C serves them through a function, after an answer is submitted).
create table public.quiz_answers (
  id          uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.quiz_questions (id) on delete cascade,
  position    integer not null check (position >= 0),
  text        text not null check (char_length(text) between 1 and 500),
  is_correct  boolean not null default false,
  explanation text check (char_length(explanation) <= 2000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint quiz_answers_position_unique unique (question_id, position) deferrable initially deferred
);
-- Exactly one correct answer per question (at least one is checked at publication).
create unique index quiz_answers_one_correct_idx on public.quiz_answers (question_id) where is_correct;

create table public.quiz_answer_translations (
  answer_id   uuid not null references public.quiz_answers (id) on delete cascade,
  locale      text not null references public.languages (code) on update cascade,
  text        text not null check (char_length(text) between 1 and 500),
  explanation text check (char_length(explanation) <= 2000),
  status      text not null default 'published' check (status in ('draft', 'published')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (answer_id, locale)
);
create index quiz_answer_translations_locale_idx on public.quiz_answer_translations (locale);

-- -----------------------------------------------------------------------------
-- 5. Course promotions
-- -----------------------------------------------------------------------------
create table public.course_promotions (
  id             uuid primary key default gen_random_uuid(),
  course_id      uuid not null references public.courses (id) on delete cascade,
  -- Internal label shown in the back office (e.g. "Black Friday").
  label          text not null check (char_length(label) between 1 and 120),
  discount_type  text not null check (discount_type in ('percentage', 'amount')),
  -- Percentage: 1–99 (whole or decimal percent). Amount: in the course currency.
  discount_value numeric(12, 2) not null check (discount_value > 0),
  starts_at      timestamptz not null,
  ends_at        timestamptz,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  created_by     uuid default auth.uid() references public.profiles (id) on delete set null,
  constraint course_promotions_percentage_range check (discount_type <> 'percentage' or discount_value < 100),
  constraint course_promotions_period check (ends_at is null or ends_at > starts_at)
);

comment on table public.course_promotions is
  'Dated discount on one course (percentage or amount off). At most one active promotion per course at any instant.';

create index course_promotions_course_idx on public.course_promotions (course_id, starts_at);
create index course_promotions_created_by_idx on public.course_promotions (created_by);

-- Overlap and amount guard. The course row is locked first so two concurrent
-- writes on the same course cannot both pass the overlap check.
create or replace function private.guard_course_promotion()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_price numeric(12, 2);
begin
  select c.price into v_price from public.courses c where c.id = new.course_id for update;

  if new.discount_type = 'amount' and new.discount_value >= v_price then
    raise exception 'course_promotions: amount_exceeds_price' using errcode = '22023';
  end if;

  if new.is_active and exists (
    select 1
      from public.course_promotions p
     where p.course_id = new.course_id
       and p.id <> new.id
       and p.is_active
       and tstzrange(p.starts_at, p.ends_at, '[)') && tstzrange(new.starts_at, new.ends_at, '[)')
  ) then
    raise exception 'course_promotions: overlap' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger course_promotions_guard
  before insert or update on public.course_promotions
  for each row execute function private.guard_course_promotion();

-- Current price of each course (visitors see only published courses — RLS).
create view public.course_current_prices
with (security_invoker = true) as
select c.id as course_id,
       c.price,
       c.currency,
       p.id as promotion_id,
       p.discount_type,
       p.discount_value,
       p.ends_at as promotion_ends_at,
       case
         when p.id is null then c.price
         when p.discount_type = 'percentage' then round(c.price * (100 - p.discount_value) / 100, 2)
         else greatest(c.price - p.discount_value, 0)
       end::numeric(12, 2) as current_price
  from public.courses c
  left join lateral (
    select pr.*
      from public.course_promotions pr
     where pr.course_id = c.id
       and pr.is_active
       and pr.starts_at <= now()
       and (pr.ends_at is null or pr.ends_at > now())
     order by pr.starts_at desc
     limit 1
  ) p on true;

comment on view public.course_current_prices is
  'Price of each course now, after its running promotion (if any). Rounded half away from zero to the cent.';

-- -----------------------------------------------------------------------------
-- 6. Lifecycle guard and publication readiness
-- -----------------------------------------------------------------------------

-- What prevents a course from being published, as stable codes (empty = ready).
create or replace function public.course_publication_problems(p_course_id uuid)
returns text[]
language sql
stable
set search_path = ''
as $$
  select array_remove(array[
    case when not exists (select 1 from public.course_modules m where m.course_id = p_course_id)
         then 'no_modules' end,
    case when exists (
           select 1 from public.course_modules m
            where m.course_id = p_course_id
              and not exists (select 1 from public.course_steps s where s.module_id = m.id))
         then 'empty_module' end,
    case when exists (
           select 1 from public.course_blocks b
             join public.course_steps s on s.id = b.step_id
             join public.course_modules m on m.id = s.module_id
            where m.course_id = p_course_id and b.kind in ('image', 'video') and b.media_id is null)
         then 'block_without_media' end,
    case when exists (
           select 1 from public.course_quizzes q
             join public.course_modules m on m.id = q.module_id
            where m.course_id = p_course_id
              and not exists (select 1 from public.quiz_questions qq where qq.quiz_id = q.id))
         then 'empty_quiz' end,
    case when exists (
           select 1 from public.quiz_questions qq
             join public.course_quizzes q on q.id = qq.quiz_id
             join public.course_modules m on m.id = q.module_id
            where m.course_id = p_course_id
              and ((select count(*) from public.quiz_answers a where a.question_id = qq.id) < 2
                   or not exists (select 1 from public.quiz_answers a where a.question_id = qq.id and a.is_correct)))
         then 'question_incomplete' end
  ], null);
$$;

create or replace function private.guard_course()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_problems text[];
begin
  if tg_op = 'INSERT' then
    if new.status <> 'draft' then
      raise exception 'courses: a course is created as a draft' using errcode = '22023';
    end if;
    new.published_at := null;
    return new;
  end if;

  -- published_at is lifecycle data: only this trigger writes it.
  new.published_at := old.published_at;
  new.updated_by := auth.uid();

  if new.slug <> old.slug and old.published_at is not null then
    raise exception 'courses: the address of a published course cannot change' using errcode = '22023';
  end if;

  if new.status is distinct from old.status then
    if new.status = 'draft' then
      raise exception 'courses: a published course cannot go back to draft' using errcode = '22023';
    end if;
    if new.status = 'published' then
      v_problems := public.course_publication_problems(new.id);
      if cardinality(v_problems) > 0 then
        raise exception 'courses: not ready (%)', array_to_string(v_problems, ',') using errcode = '22023';
      end if;
      new.published_at := coalesce(old.published_at, now());
    end if;
    if new.status = 'unpublished' and old.status <> 'published' then
      raise exception 'courses: only a published course can be unpublished' using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;

create trigger courses_guard
  before insert or update on public.courses
  for each row execute function private.guard_course();

-- -----------------------------------------------------------------------------
-- 7. updated_at, default-locale guard, audit
-- -----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'training_media', 'training_media_translations', 'courses', 'course_translations',
    'course_modules', 'course_module_translations', 'course_steps', 'course_step_translations',
    'course_blocks', 'course_block_translations', 'course_quizzes', 'course_quiz_translations',
    'quiz_questions', 'quiz_question_translations', 'quiz_answers', 'quiz_answer_translations',
    'course_promotions']
  loop
    execute format(
      'create trigger %1$s_set_updated_at before update on public.%1$I
         for each row execute function private.set_updated_at()', t);
  end loop;

  foreach t in array array[
    'training_media_translations', 'course_translations', 'course_module_translations',
    'course_step_translations', 'course_block_translations', 'course_quiz_translations',
    'quiz_question_translations', 'quiz_answer_translations']
  loop
    execute format(
      'create trigger %1$s_not_default_locale before insert or update on public.%1$I
         for each row execute function private.reject_default_locale_translation()', t);
  end loop;
end;
$$;

-- Publication, address and price changes; creations and deletions.
create trigger courses_audit_log
  after insert or delete on public.courses
  for each row execute function private.audit_changes();
create trigger courses_audit_log_update
  after update on public.courses
  for each row execute function private.audit_changes('status', 'published_at', 'slug', 'price', 'currency');
create trigger course_promotions_audit_log
  after insert or update or delete on public.course_promotions
  for each row execute function private.audit_changes();
create trigger training_media_audit_log
  after delete on public.training_media
  for each row execute function private.audit_changes();

-- -----------------------------------------------------------------------------
-- 8. Row level security
-- -----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'training_media', 'training_media_translations', 'courses', 'course_translations',
    'course_modules', 'course_module_translations', 'course_steps', 'course_step_translations',
    'course_blocks', 'course_block_translations', 'course_quizzes', 'course_quiz_translations',
    'quiz_questions', 'quiz_question_translations', 'quiz_answers', 'quiz_answer_translations',
    'course_promotions']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke truncate, references, trigger on public.%I from anon, authenticated', t);
    -- Staff read the whole back office; manage_training writes.
    execute format(
      'create policy "%1$s: staff read" on public.%1$I for select to authenticated
         using ((select private.is_staff()))', t);
    execute format(
      'create policy "%1$s: training managers insert" on public.%1$I for insert to authenticated
         with check ((select private.has_permission(''manage_training'')))', t);
    execute format(
      'create policy "%1$s: training managers update" on public.%1$I for update to authenticated
         using ((select private.has_permission(''manage_training'')))
         with check ((select private.has_permission(''manage_training'')))', t);
    if t <> 'courses' then
      execute format(
        'create policy "%1$s: training managers delete" on public.%1$I for delete to authenticated
           using ((select private.has_permission(''manage_training'')))', t);
    end if;
  end loop;
end;
$$;

-- A course that was ever published has buyers: it is withdrawn, never deleted.
create policy "courses: training managers delete never-published"
  on public.courses for delete to authenticated
  using ((select private.has_permission('manage_training')) and published_at is null);

-- Visitors: published courses, their translations and running promotions.
create policy "courses: anyone reads published"
  on public.courses for select to anon, authenticated
  using (status = 'published');
create policy "course_translations: anyone reads published"
  on public.course_translations for select to anon, authenticated
  using (status = 'published'
         and exists (select 1 from public.courses c where c.id = course_id and c.status = 'published'));
create policy "course_promotions: anyone reads running on published"
  on public.course_promotions for select to anon, authenticated
  using (is_active
         and exists (select 1 from public.courses c where c.id = course_id and c.status = 'published'));

-- Visitors never write; learners get content access in phase C.
do $$
declare
  t text;
begin
  foreach t in array array[
    'training_media', 'training_media_translations', 'courses', 'course_translations',
    'course_modules', 'course_module_translations', 'course_steps', 'course_step_translations',
    'course_blocks', 'course_block_translations', 'course_quizzes', 'course_quiz_translations',
    'quiz_questions', 'quiz_question_translations', 'quiz_answers', 'quiz_answer_translations',
    'course_promotions']
  loop
    execute format('revoke insert, update, delete on public.%I from anon', t);
  end loop;
end;
$$;

grant select on public.course_current_prices to anon, authenticated;

revoke all on function private.jsonb_text_array(jsonb) from public;
grant execute on function private.jsonb_text_array(jsonb) to authenticated, service_role;
revoke all on function public.course_publication_problems(uuid) from public, anon;
grant execute on function public.course_publication_problems(uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 9. Storage: private training media
-- -----------------------------------------------------------------------------
-- No bucket size limit: the project's global upload limit applies (50 MB on the
-- free plan, raised in the dashboard on Pro). Videos upload resumably (TUS).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('training-media', 'training-media', false, null,
        array['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'video/mp4', 'video/webm', 'video/quicktime'])
on conflict (id) do nothing;

create policy "training-media: staff read"
  on storage.objects for select to authenticated
  using (bucket_id = 'training-media' and (select private.is_staff()));
create policy "training-media: training managers upload"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'training-media' and (storage.foldername(name))[1] = 'media'
              and (select private.has_permission('manage_training')));
create policy "training-media: training managers replace"
  on storage.objects for update to authenticated
  using (bucket_id = 'training-media' and (select private.has_permission('manage_training')))
  with check (bucket_id = 'training-media' and (storage.foldername(name))[1] = 'media'
              and (select private.has_permission('manage_training')));
create policy "training-media: training managers delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'training-media' and (select private.has_permission('manage_training')));

-- -----------------------------------------------------------------------------
-- 10. Save a whole course
-- -----------------------------------------------------------------------------
-- Payload (every id client-generated, so a new node keeps its id from the
-- first save; ids already stored under ANOTHER course are refused):
--   id, slug (create only: base, made unique), title, short_description,
--   description, cover_media_id, category, level, duration_minutes,
--   objectives[], requirements[], complete_all_steps, complete_all_quizzes,
--   min_score, issues_certificate, price (decimal string), currency,
--   en { title, slug, short_description, description, objectives[], requirements[] }
--   modules[ { id, title, description, cover_media_id, objectives[], en{title,description,objectives},
--     steps[ { id, title, summary, duration_minutes, en{title,summary},
--       blocks[ { id, kind, body_html, media_id, poster_media_id, alt_text, caption, align,
--                 title, duration_seconds, en{body_html,alt_text,caption,title} } ] } ],
--     quiz: null | { id, title, intro, passing_score, allow_retry, max_attempts,
--       shuffle_answers, immediate_feedback, show_answers, en{title,intro},
--       questions[ { id, text, image_media_id, correct_feedback, incorrect_feedback, learn_more,
--         en{text,correct_feedback,incorrect_feedback,learn_more},
--         answers[ { id, text, is_correct, explanation, en{text,explanation} } ] } ] } } ]
-- The status is NOT part of the payload (publication is an update of
-- courses.status, checked by trigger). An English field left empty means "no
-- English translation" for that node: the French text is shown.
-- Returns { id, slug }.
-- -----------------------------------------------------------------------------

create or replace function private.check_training_media(p_id uuid, p_kind text)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_id is not null and not exists (
    select 1 from public.training_media m where m.id = p_id and m.kind = p_kind) then
    raise exception 'admin_save_course: media % is not an existing %', p_id, p_kind using errcode = '22023';
  end if;
end;
$$;

revoke all on function private.check_training_media(uuid, text) from public;
grant execute on function private.check_training_media(uuid, text) to authenticated, service_role;

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
        (id, module_id, title, intro, passing_score, allow_retry, max_attempts, shuffle_answers,
         immediate_feedback, show_answers)
      values
        (v_quiz_id, v_module_id, v_quiz ->> 'title', nullif(v_quiz ->> 'intro', ''),
         coalesce((v_quiz ->> 'passing_score')::smallint, 70), coalesce((v_quiz ->> 'allow_retry')::boolean, true),
         coalesce((v_quiz ->> 'max_attempts')::smallint, 3), coalesce((v_quiz ->> 'shuffle_answers')::boolean, true),
         coalesce((v_quiz ->> 'immediate_feedback')::boolean, true), coalesce((v_quiz ->> 'show_answers')::boolean, true))
      on conflict (id) do update
         set module_id          = excluded.module_id,
             title              = excluded.title,
             intro              = excluded.intro,
             passing_score      = excluded.passing_score,
             allow_retry        = excluded.allow_retry,
             max_attempts       = excluded.max_attempts,
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

revoke all on function public.admin_save_course(jsonb) from public, anon;
grant execute on function public.admin_save_course(jsonb) to authenticated, service_role;
