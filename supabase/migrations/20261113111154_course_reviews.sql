-- =============================================================================
-- Course reviews (decision 141)
-- =============================================================================
-- Reviews of Academy courses, in the same table, lifecycle, moderation,
-- reports, helpful votes and notes as product reviews (migration
-- 20260924061309_reviews, as amended by 20260924202324_staff_roles_permissions,
-- whose has_permission('moderate_reviews') / is_staff() checks are kept).
--
--   * A review targets a product OR a course (reviews_one_subject).
--   * Who may write a course review: the account is active, the course is
--     published, the author holds an active entitlement to it (bought,
--     granted by hand, opened by a pack — any source), and has validated at
--     least half of the course path (same rounding as webapp
--     lib/learning/path.ts) or completed it. Checked by the database on
--     insert, never by the browser.
--   * One review per learner and course; the author edits (back to
--     moderation) or deletes it, like a product review. Losing access later
--     (refund, revocation) does not remove a review already written.
--   * "Verified": a course review is verified by construction (the
--     entitlement was checked when it was written), so is_verified becomes
--     order_id is not null OR course_id is not null. The purchase order, when
--     the entitlement came from one, is recorded in order_id.
--   * Visitors read published reviews of published courses only.
--   * course_review_stats: published-review summary per course (RLS-aware).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Columns and constraints
-- -----------------------------------------------------------------------------
alter table public.reviews
  add column course_id uuid references public.courses (id) on delete cascade;

comment on column public.reviews.course_id is
  'Course reviewed (exclusive with product_id). Written by holders of an active entitlement, checked by the database.';

alter table public.reviews drop constraint reviews_one_subject;
alter table public.reviews
  add constraint reviews_one_subject check (num_nonnulls(product_id, course_id) = 1);

-- Tags: each subject keeps its own vocabulary.
alter table public.reviews drop constraint reviews_check;
alter table public.reviews
  add constraint reviews_tags_allowed check (
    cardinality(tags) <= 7
    and (product_id is null
         or tags <@ array['quality', 'result', 'easy', 'value', 'delivery']::text[])
    and (course_id is null
         or tags <@ array['beginner', 'followable', 'clear', 'techniques', 'informative',
                          'highQuality', 'skills']::text[])
  );

-- A course review is verified by its entitlement, checked at insert.
alter table public.reviews
  alter column is_verified set expression as (order_id is not null or course_id is not null);

create unique index reviews_one_per_customer_course_idx
  on public.reviews (user_id, course_id) where course_id is not null;
create index reviews_course_published_idx
  on public.reviews (course_id, published_at desc) where status = 'published' and course_id is not null;

-- -----------------------------------------------------------------------------
-- Eligibility
-- -----------------------------------------------------------------------------

-- Share of the course path the member has validated, rounded like
-- webapp/src/lib/learning/path.ts (round(done * 100 / total), 0 when empty).
create or replace function private.course_progress_pct(p_user_id uuid, p_course_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case when count(*) = 0 then 0
              else round(count(*) filter (where lp.done) * 100.0 / count(*))::integer end
    from private.learner_path(p_user_id, p_course_id) lp;
$$;

-- The member's active entitlement to a course, or null. Unlike
-- private.holds_course() it takes the member explicitly (it runs inside a
-- trigger, for new.user_id).
create or replace function private.active_course_entitlement(p_user_id uuid, p_course_id uuid)
returns public.course_entitlements
language sql
stable
security definer
set search_path = ''
as $$
  select e.*
    from public.course_entitlements e
   where e.user_id = p_user_id and e.course_id = p_course_id
     and e.revoked_at is null and e.starts_at <= now()
     and (e.expires_at is null or e.expires_at > now())
   order by e.created_at desc
   limit 1;
$$;

-- Why a member may not review a course, or null when they may.
--   'course_unavailable' | 'not_holder' | 'needs_progress'
create or replace function private.course_review_refusal(p_user_id uuid, p_course_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when not private.is_published_course(p_course_id) then 'course_unavailable'
    when not private.account_active(p_user_id)
      or (private.active_course_entitlement(p_user_id, p_course_id)).id is null then 'not_holder'
    when not exists (select 1 from public.course_completions cc
                      where cc.user_id = p_user_id and cc.course_id = p_course_id)
     and private.course_progress_pct(p_user_id, p_course_id) < 50 then 'needs_progress'
  end;
$$;

revoke all on function private.course_progress_pct(uuid, uuid) from public;
revoke all on function private.active_course_entitlement(uuid, uuid) from public;
revoke all on function private.course_review_refusal(uuid, uuid) from public;
grant execute on function private.course_progress_pct(uuid, uuid) to authenticated, service_role;
grant execute on function private.active_course_entitlement(uuid, uuid) to authenticated, service_role;
grant execute on function private.course_review_refusal(uuid, uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Insert: product or course branch; system fields forced as before.
-- -----------------------------------------------------------------------------
create or replace function private.prepare_review_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_refusal text;
begin
  new.title := btrim(new.title);
  new.body  := btrim(new.body);

  if private.is_trusted_backend() then          -- imports / backend
    new.author_name := coalesce(new.author_name, private.privacy_name(new.user_id));
    return new;
  end if;

  if new.user_id is distinct from auth.uid() then
    raise exception 'reviews: you can only review as yourself' using errcode = '42501';
  end if;

  if new.course_id is not null then
    v_refusal := private.course_review_refusal(new.user_id, new.course_id);
    if v_refusal = 'course_unavailable' then
      raise exception 'reviews: course not available' using errcode = 'P0002';
    elsif v_refusal = 'not_holder' then
      raise exception 'reviews: only learners holding this course can review it' using errcode = '42501';
    elsif v_refusal = 'needs_progress' then
      raise exception 'reviews: complete at least half of the course before reviewing it' using errcode = '42501';
    end if;
    -- The purchase behind the access, when there is one (a grant by hand has none).
    new.order_id := (private.active_course_entitlement(new.user_id, new.course_id)).order_id;
  else
    if not exists (select 1 from public.products p where p.id = new.product_id and p.status = 'active') then
      raise exception 'reviews: product not available' using errcode = 'P0002';
    end if;
    new.order_id := private.review_verifying_order(new.user_id, new.product_id);
    if new.order_id is null then
      raise exception 'reviews: only customers who received this product can review it'
        using errcode = '42501';
    end if;
  end if;

  new.author_name      := private.privacy_name(new.user_id);
  new.status           := 'pending';
  new.rejection_reason := null;
  new.changes_request  := null;
  new.is_flagged       := false;
  new.helpful_count    := 0;
  new.response_body    := null;
  new.response_at      := null;
  new.response_by      := null;
  new.submitted_at     := now();
  new.published_at     := null;
  new.edited_at        := null;
  new.created_at       := now();
  new.updated_at       := now();
  return new;
end;
$$;

revoke all on function private.prepare_review_insert() from public;

-- -----------------------------------------------------------------------------
-- Update: the subject is read-only too (live definition, course_id added).
-- -----------------------------------------------------------------------------
create or replace function private.guard_review_update()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_content_changed boolean;
  v_system_changed  boolean;
begin
  new.updated_at := now();
  new.title := btrim(new.title);
  new.body  := btrim(new.body);

  v_content_changed := new.rating   is distinct from old.rating
                    or new.title    is distinct from old.title
                    or new.body     is distinct from old.body
                    or new.tags     is distinct from old.tags
                    or new.language is distinct from old.language;

  v_system_changed := new.id           is distinct from old.id
                   or new.product_id   is distinct from old.product_id
                   or new.course_id    is distinct from old.course_id
                   or new.user_id      is distinct from old.user_id
                   or new.order_id     is distinct from old.order_id
                   or new.author_name  is distinct from old.author_name
                   or new.submitted_at is distinct from old.submitted_at
                   or new.created_at   is distinct from old.created_at;

  if private.is_trusted_backend() then
    return new;
  end if;

  if v_system_changed or new.helpful_count is distinct from old.helpful_count then
    raise exception 'reviews: identity, verification and counters are read-only' using errcode = '42501';
  end if;

  if private.has_permission('moderate_reviews') and old.user_id is distinct from auth.uid() then
    -- Staff: moderation only, never the customer's words.
    if v_content_changed or new.edited_at is distinct from old.edited_at then
      raise exception 'reviews: staff cannot edit a customer''s review' using errcode = '42501';
    end if;
    if new.status = 'published' and old.status <> 'published' then
      new.published_at := now();
    end if;
    if new.status <> 'rejected' then
      new.rejection_reason := null;
    end if;
    if new.status <> 'needs_changes' then
      new.changes_request := null;
    end if;
    if new.response_body is distinct from old.response_body then
      new.response_at := case when new.response_body is null then null else now() end;
      new.response_by := case when new.response_body is null then null else auth.uid() end;
    elsif new.response_at is distinct from old.response_at or new.response_by is distinct from old.response_by then
      raise exception 'reviews: response metadata is set automatically' using errcode = '42501';
    end if;
    return new;
  end if;

  -- The author: content only, and any edit goes back to moderation.
  if old.user_id is distinct from auth.uid() then
    raise exception 'reviews: not your review' using errcode = '42501';
  end if;
  if new.status           is distinct from old.status
  or new.rejection_reason is distinct from old.rejection_reason
  or new.changes_request  is distinct from old.changes_request
  or new.is_flagged       is distinct from old.is_flagged
  or new.response_body    is distinct from old.response_body
  or new.response_at      is distinct from old.response_at
  or new.response_by      is distinct from old.response_by
  or new.published_at     is distinct from old.published_at
  or new.edited_at        is distinct from old.edited_at then
    raise exception 'reviews: moderation fields are managed by the team' using errcode = '42501';
  end if;
  if v_content_changed then
    new.status           := 'pending';
    new.edited_at        := now();
    new.rejection_reason := null;
    new.changes_request  := null;
  end if;
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Reading: published reviews of published courses are public.
-- -----------------------------------------------------------------------------
drop policy "reviews: public reads published, authors read own, staff read " on public.reviews;
create policy "reviews: public reads published, authors read own, staff read"
  on public.reviews for select to anon, authenticated
  using (
    (status = 'published' and (
       exists (select 1 from public.products p where p.id = reviews.product_id and p.status = 'active')
       or (course_id is not null and (select private.is_published_course(reviews.course_id)))))
    or user_id = (select auth.uid())
    or (select private.is_staff())
  );

grant select (course_id) on public.reviews to anon;
grant execute on function private.is_published_course(uuid) to anon, authenticated;

-- Product figures stay product-only (course rows have no product_id).
create or replace view public.product_review_stats
with (security_invoker = true)
as
select r.product_id,
       count(*)::integer                                        as review_count,
       round(avg(r.rating)::numeric, 1)                         as average_rating,
       count(*) filter (where r.rating = 5)::integer            as five_star,
       count(*) filter (where r.rating = 4)::integer            as four_star,
       count(*) filter (where r.rating = 3)::integer            as three_star,
       count(*) filter (where r.rating = 2)::integer            as two_star,
       count(*) filter (where r.rating = 1)::integer            as one_star,
       count(*) filter (where r.is_verified)::integer           as verified_count,
       count(*) filter (where exists (select 1 from public.review_photos p where p.review_id = r.id))::integer
                                                                as with_photos_count
  from public.reviews r
 where r.status = 'published' and r.product_id is not null
 group by r.product_id;

-- -----------------------------------------------------------------------------
-- Aggregates for course pages, cards and structured data (published only)
-- -----------------------------------------------------------------------------
create view public.course_review_stats
with (security_invoker = true)
as
select r.course_id,
       count(*)::integer                             as review_count,
       round(avg(r.rating)::numeric, 1)              as average_rating,
       count(*) filter (where r.rating = 5)::integer as five_star,
       count(*) filter (where r.rating = 4)::integer as four_star,
       count(*) filter (where r.rating = 3)::integer as three_star,
       count(*) filter (where r.rating = 2)::integer as two_star,
       count(*) filter (where r.rating = 1)::integer as one_star
  from public.reviews r
 where r.status = 'published' and r.course_id is not null
 group by r.course_id;

comment on view public.course_review_stats is
  'Published-review summary per course (count, average, star buckets). Respects the reviews RLS.';

revoke all on public.course_review_stats from anon, authenticated;
grant select on public.course_review_stats to anon, authenticated;
