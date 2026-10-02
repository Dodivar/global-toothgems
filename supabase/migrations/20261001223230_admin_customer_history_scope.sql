-- =============================================================================
-- admin_customer_status_history(): customer accounts only.
--
-- The first version answered for any account id, so any active staff member
-- could read a team member's suspensions and who made them — history that the
-- Users workspace does not expose (it needs manage_settings through
-- audit_logs). Scoped to accounts whose role is `customer`; anything else
-- returns no rows. Also records the `occurred_at, id` ordering (two changes in
-- one transaction share a timestamp), first applied in place on 2026-10-01 (outside a migration), now recorded here.
-- =============================================================================

create or replace function public.admin_customer_status_history(p_user_id uuid)
returns table (changed_at timestamptz, old_status text, new_status text, actor_name text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_staff() then
    raise exception 'admin_customer_status_history: permission denied' using errcode = '42501';
  end if;
  return query
    select a.occurred_at,
           a.changes -> 'status' ->> 'old',
           a.changes -> 'status' ->> 'new',
           coalesce(nullif(p.display_name, ''), nullif(trim(concat_ws(' ', p.first_name, p.last_name)), ''), p.email)
      from public.audit_logs a
      left join public.profiles p on p.id = a.actor_id
     where a.table_name = 'profiles'
       and a.action = 'update'
       and a.record_id = p_user_id::text
       and a.changes ? 'status'
       and exists (select 1 from public.profiles c where c.id = p_user_id and c.role = 'customer')
     order by a.occurred_at, a.id;
end;
$$;

comment on function public.admin_customer_status_history(uuid) is
  'Status changes of one customer account (date, old, new, who), for staff. Team accounts return nothing; audit_logs itself stays manage_settings-only.';
