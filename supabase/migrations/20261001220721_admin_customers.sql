-- =============================================================================
-- Back-office customers workspace (/admin/clients) on Supabase.
--
-- Everything else the workspace needs is already readable by active staff
-- (profiles, customer_addresses, customer_tags, customer_notes, orders,
-- course_entitlements) and writable under manage_customers. Two reads were
-- missing:
--
--   * admin_customer_status_history(user): who suspended / reactivated an
--     account and when. The trail lives in audit_logs, which stays
--     manage_settings-only: this function exposes the status changes of one
--     customer to staff, never the raw audit rows.
--   * admin_customer_courses(user | null): each customer's course seats with
--     the learner's own progress rule (steps validated + checks passed over
--     steps + checks of the course), so the back office never shows a figure
--     the learner's page contradicts. Null = every customer (the table's
--     training filter and segment).
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
     order by a.occurred_at;
end;
$$;

comment on function public.admin_customer_status_history(uuid) is
  'Status changes of one account (date, old, new, who), for staff. audit_logs itself stays manage_settings-only.';

create or replace function public.admin_customer_courses(p_user_id uuid default null)
returns table (
  user_id        uuid,
  course_id      uuid,
  title          text,
  title_en       text,
  course_status  text,
  source         text,
  starts_at      timestamptz,
  expires_at     timestamptz,
  nodes_total    integer,
  nodes_done     integer,
  last_activity  timestamptz,
  completed_at   timestamptz,
  average_score  smallint,
  certificate_code text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_staff() then
    raise exception 'admin_customer_courses: permission denied' using errcode = '42501';
  end if;
  return query
    select e.user_id, e.course_id, c.title,
           (select t.title from public.course_translations t
             where t.course_id = c.id and t.locale = 'en' and t.status = 'published'),
           c.status, e.source, e.starts_at, e.expires_at,
           -- The learner's path: every step, plus one node per module check.
           ((select count(*) from public.course_steps s
               join public.course_modules m on m.id = s.module_id where m.course_id = c.id)
            + (select count(*) from public.course_quizzes q
                 join public.course_modules m on m.id = q.module_id where m.course_id = c.id))::integer,
           -- Done: validated steps that still exist, checks passed at least once.
           ((select count(*) from public.lesson_progress lp
               join public.course_steps s on s.id = lp.step_id
               join public.course_modules m on m.id = s.module_id
              where lp.user_id = e.user_id and lp.course_id = c.id and m.course_id = c.id)
            + (select count(distinct q.id) from public.course_quizzes q
                 join public.course_modules m on m.id = q.module_id
                 join public.quiz_attempts a on a.quiz_id = q.id
                where m.course_id = c.id and a.user_id = e.user_id and a.passed))::integer,
           greatest(
             (select max(lp.completed_at) from public.lesson_progress lp
               where lp.user_id = e.user_id and lp.course_id = c.id),
             (select max(a.submitted_at) from public.quiz_attempts a
               where a.user_id = e.user_id and a.course_id = c.id)),
           cc.completed_at, cc.average_score, cc.certificate_code
      from public.course_entitlements e
      join public.courses c on c.id = e.course_id
      left join public.course_completions cc on cc.user_id = e.user_id and cc.course_id = e.course_id
     where e.revoked_at is null
       and (p_user_id is null or e.user_id = p_user_id)
     order by e.user_id, e.starts_at desc;
end;
$$;

comment on function public.admin_customer_courses(uuid) is
  'Course seats (not revoked) of one customer, or of everyone when null, with the learner''s progress rule. Staff only.';

revoke all on function public.admin_customer_status_history(uuid) from public, anon;
revoke all on function public.admin_customer_courses(uuid) from public, anon;
grant execute on function public.admin_customer_status_history(uuid) to authenticated;
grant execute on function public.admin_customer_courses(uuid) to authenticated;
