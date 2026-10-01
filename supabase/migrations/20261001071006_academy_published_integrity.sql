-- =============================================================================
-- Iteration 20 fix — a published course stays publishable, a price cut cannot
-- make a course free through an existing promotion.
-- =============================================================================
-- 1. The promotion guard only ran when a promotion was written. Lowering a
--    course's price below an amount promotion that is active and not over
--    would make `course_current_prices` clamp to 0 — the course free. The
--    course guard now refuses such a price change ('amount_exceeds_price').
-- 2. Readiness was checked only when the status changed. Saving an already
--    published course could leave it unpublishable (emptied module, a video
--    block without its file) while it stays published. A deferred constraint
--    trigger on courses now re-checks a published course when the transaction
--    commits (every save touches the course row), and refuses it with the same
--    'courses: not ready (...)' message.
-- =============================================================================

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

  if new.price < old.price and exists (
    select 1
      from public.course_promotions p
     where p.course_id = new.id
       and p.is_active
       and p.discount_type = 'amount'
       and (p.ends_at is null or p.ends_at > now())
       and p.discount_value >= new.price
  ) then
    raise exception 'courses: amount_exceeds_price' using errcode = '22023';
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

create or replace function private.assert_published_course_ready(p_course_id uuid)
returns void
language plpgsql
stable
set search_path = ''
as $$
declare
  v_problems text[];
begin
  if exists (select 1 from public.courses where id = p_course_id and status = 'published') then
    v_problems := public.course_publication_problems(p_course_id);
    if cardinality(v_problems) > 0 then
      raise exception 'courses: not ready (%)', array_to_string(v_problems, ',') using errcode = '22023';
    end if;
  end if;
end;
$$;

revoke all on function private.assert_published_course_ready(uuid) from public;
grant execute on function private.assert_published_course_ready(uuid) to authenticated, service_role;

-- Deferred to the commit: by then every node of the saved tree is written.
create or replace function private.check_published_course_ready()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform private.assert_published_course_ready(new.id);
  return null;
end;
$$;

create constraint trigger courses_published_ready
  after update on public.courses
  deferrable initially deferred
  for each row
  when (new.status = 'published')
  execute function private.check_published_course_ready();
