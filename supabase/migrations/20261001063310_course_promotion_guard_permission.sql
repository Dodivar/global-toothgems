-- =============================================================================
-- Iteration 20 fix — course promotion guard checks the permission first.
-- =============================================================================
-- BEFORE triggers run before the RLS WITH CHECK of an insert. A staff member
-- without `manage_training` (or anyone) inserting a promotion therefore got the
-- guard's "overlap" answer — which tells them about other promotions — instead
-- of a permission error. The guard now refuses such callers itself (42501).
-- =============================================================================

create or replace function private.guard_course_promotion()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_price numeric(12, 2);
begin
  if not private.caller_has_permission_or_backend('manage_training') then
    raise exception 'course_promotions: permission denied' using errcode = '42501';
  end if;

  -- Lock the course: two concurrent writes cannot both pass the overlap check.
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
