-- =============================================================================
-- Course reviews only once the course is completed (decision 141, owner 2026-11-13)
-- =============================================================================
-- The owner replaced the agent's "half of the path" rule: a learner reviews a
-- course only after completing it (a course_completions row, written by
-- private.refresh_course_completion() once every required node is done and
-- the average score is reached). Everything else stands: active account,
-- published course, active entitlement of any source (purchase, grant by
-- hand, pack — all "verified"), and a review already written stays after a
-- refund or a revocation.
--
-- Refusal codes: 'course_unavailable' | 'not_holder' | 'not_completed'.
-- private.course_progress_pct() is no longer used and is dropped.
-- =============================================================================

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
                      where cc.user_id = p_user_id and cc.course_id = p_course_id) then 'not_completed'
  end;
$$;

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
    elsif v_refusal = 'not_completed' then
      raise exception 'reviews: complete the course before reviewing it' using errcode = '42501';
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

drop function private.course_progress_pct(uuid, uuid);
