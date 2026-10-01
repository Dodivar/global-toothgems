-- =============================================================================
-- Iteration 20 fix — one SELECT policy per role on the three tables visitors
-- read (performance advisor: multiple permissive policies). Same rule as
-- before: staff read everything, everyone reads what is published.
-- =============================================================================

drop policy "courses: staff read" on public.courses;
drop policy "courses: anyone reads published" on public.courses;
create policy "courses: published or staff"
  on public.courses for select to anon, authenticated
  using (status = 'published' or (select private.is_staff()));

drop policy "course_translations: staff read" on public.course_translations;
drop policy "course_translations: anyone reads published" on public.course_translations;
create policy "course_translations: published or staff"
  on public.course_translations for select to anon, authenticated
  using ((select private.is_staff())
         or (status = 'published'
             and exists (select 1 from public.courses c where c.id = course_id and c.status = 'published')));

drop policy "course_promotions: staff read" on public.course_promotions;
drop policy "course_promotions: anyone reads running on published" on public.course_promotions;
create policy "course_promotions: running on published or staff"
  on public.course_promotions for select to anon, authenticated
  using ((select private.is_staff())
         or (is_active
             and exists (select 1 from public.courses c where c.id = course_id and c.status = 'published')));
