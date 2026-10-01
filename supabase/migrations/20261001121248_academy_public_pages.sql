-- =============================================================================
-- Iteration 21 — Academy public pages (phase B)
-- =============================================================================
-- What the public Academy pages (catalogue, course sales pages, home, header
-- and footer) read, as an anonymous visitor or any signed-in account:
--   * published courses and their published translations (already readable),
--     without the staff columns `created_by` / `updated_by` for `anon`;
--   * the OUTLINE of a published course: modules, steps and the module
--     knowledge checks' titles and pass marks, with their published
--     translations. Never the content: blocks, questions and answers stay
--     staff-only until phase C gates them on entitlements;
--   * the cover image of a published course: its `training_media` row (no
--     internal name, tags or author for `anon`), its published translations
--     and its file in the private `training-media` bucket. No other media;
--   * the current price (`course_current_prices`). Course promotions
--     themselves become staff-only: the view reads the running promotion
--     through a SECURITY DEFINER helper, so visitors and customers see the
--     discount and its end date, never the internal `label` or `created_by`.
-- Staff keep reading everything (unchanged).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Helpers
-- -----------------------------------------------------------------------------

-- A published course: the one rule every public outline policy shares. SECURITY
-- DEFINER so a policy does not re-enter the RLS of `courses` for every row.
create or replace function private.is_published_course(p_course_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.courses c where c.id = p_course_id and c.status = 'published');
$$;

-- A training media file that is the cover of a published course (by row id or
-- by storage path).
create or replace function private.is_public_course_cover(p_media_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.courses c where c.cover_media_id = p_media_id and c.status = 'published');
$$;

create or replace function private.is_public_course_cover_path(p_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.training_media m
      join public.courses c on c.cover_media_id = m.id
     where m.storage_path = p_path
       and c.status = 'published');
$$;

-- The promotion running now on a course (at most one, guarded on write).
create or replace function private.course_running_promotion(p_course_id uuid)
returns table (id uuid, discount_type text, discount_value numeric, ends_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select pr.id, pr.discount_type, pr.discount_value, pr.ends_at
    from public.course_promotions pr
   where pr.course_id = p_course_id
     and pr.is_active
     and pr.starts_at <= now()
     and (pr.ends_at is null or pr.ends_at > now())
   order by pr.starts_at desc
   limit 1;
$$;

revoke all on function private.is_published_course(uuid) from public;
revoke all on function private.is_public_course_cover(uuid) from public;
revoke all on function private.is_public_course_cover_path(text) from public;
revoke all on function private.course_running_promotion(uuid) from public;
grant execute on function private.is_published_course(uuid) to anon, authenticated, service_role;
grant execute on function private.is_public_course_cover(uuid) to anon, authenticated, service_role;
grant execute on function private.is_public_course_cover_path(text) to anon, authenticated, service_role;
grant execute on function private.course_running_promotion(uuid) to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 2. Course outline: one SELECT policy per table (staff, or published course).
--    The staff-read policies of iteration 20 are widened in place (ALTER POLICY).
-- -----------------------------------------------------------------------------
alter policy "course_modules: staff read" on public.course_modules
  to anon, authenticated
  using ((select private.is_staff()) or private.is_published_course(course_id));
alter policy "course_modules: staff read" on public.course_modules rename to "course_modules: published course or staff";

alter policy "course_module_translations: staff read" on public.course_module_translations
  to anon, authenticated
  using ((select private.is_staff())
         or (status = 'published'
             and exists (select 1 from public.course_modules m
                          where m.id = module_id and private.is_published_course(m.course_id))));
alter policy "course_module_translations: staff read" on public.course_module_translations rename to "course_module_translations: published or staff";

alter policy "course_steps: staff read" on public.course_steps
  to anon, authenticated
  using ((select private.is_staff())
         or exists (select 1 from public.course_modules m
                     where m.id = module_id and private.is_published_course(m.course_id)));
alter policy "course_steps: staff read" on public.course_steps rename to "course_steps: published course or staff";

alter policy "course_step_translations: staff read" on public.course_step_translations
  to anon, authenticated
  using ((select private.is_staff())
         or (status = 'published'
             and exists (select 1 from public.course_steps s
                           join public.course_modules m on m.id = s.module_id
                          where s.id = step_id and private.is_published_course(m.course_id))));
alter policy "course_step_translations: staff read" on public.course_step_translations rename to "course_step_translations: published or staff";

alter policy "course_quizzes: staff read" on public.course_quizzes
  to anon, authenticated
  using ((select private.is_staff())
         or exists (select 1 from public.course_modules m
                     where m.id = module_id and private.is_published_course(m.course_id)));
alter policy "course_quizzes: staff read" on public.course_quizzes rename to "course_quizzes: published course or staff";

alter policy "course_quiz_translations: staff read" on public.course_quiz_translations
  to anon, authenticated
  using ((select private.is_staff())
         or (status = 'published'
             and exists (select 1 from public.course_quizzes q
                           join public.course_modules m on m.id = q.module_id
                          where q.id = quiz_id and private.is_published_course(m.course_id))));
alter policy "course_quiz_translations: staff read" on public.course_quiz_translations rename to "course_quiz_translations: published or staff";

-- -----------------------------------------------------------------------------
-- 3. Cover images of published courses
-- -----------------------------------------------------------------------------
alter policy "training_media: staff read" on public.training_media
  to anon, authenticated
  using ((select private.is_staff()) or private.is_public_course_cover(id));
alter policy "training_media: staff read" on public.training_media rename to "training_media: published course covers or staff";

alter policy "training_media_translations: staff read" on public.training_media_translations
  to anon, authenticated
  using ((select private.is_staff()) or (status = 'published' and private.is_public_course_cover(media_id)));
alter policy "training_media_translations: staff read" on public.training_media_translations rename to "training_media_translations: published covers or staff";

create policy "training-media: anyone reads published course covers"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'training-media' and private.is_public_course_cover_path(name));

-- -----------------------------------------------------------------------------
-- 4. Course promotions: staff only; the current price stays public
-- -----------------------------------------------------------------------------
alter policy "course_promotions: running on published or staff" on public.course_promotions
  to authenticated
  using ((select private.is_staff()));
alter policy "course_promotions: running on published or staff" on public.course_promotions rename to "course_promotions: staff read";
revoke select on public.course_promotions from anon;

create or replace view public.course_current_prices
with (security_invoker = true) as
select c.id as course_id,
       c.price,
       c.currency,
       p.id as promotion_id,
       p.discount_type,
       p.discount_value::numeric(12, 2) as discount_value,
       p.ends_at as promotion_ends_at,
       case
         when p.id is null then c.price
         when p.discount_type = 'percentage' then round(c.price * (100 - p.discount_value) / 100, 2)
         else greatest(c.price - p.discount_value, 0)
       end::numeric(12, 2) as current_price
  from public.courses c
  left join lateral private.course_running_promotion(c.id) p on true;

comment on view public.course_current_prices is
  'Price of each course now, after its running promotion (if any). Rounded half away from zero to the cent. '
  'Rows follow the RLS of courses (visitors: published only); the promotion is read by a definer helper.';

-- -----------------------------------------------------------------------------
-- 5. Column grants: visitors never read who wrote a course or a media file
-- -----------------------------------------------------------------------------
revoke select on public.courses from anon;
grant select (id, slug, title, short_description, description, cover_media_id, category, level,
              duration_minutes, objectives, requirements, complete_all_steps, complete_all_quizzes,
              min_score, issues_certificate, price, currency, status, published_at, created_at, updated_at)
  on public.courses to anon;

revoke select on public.training_media from anon;
grant select (id, kind, storage_path, mime_type, alt_text, width, height, updated_at)
  on public.training_media to anon;
