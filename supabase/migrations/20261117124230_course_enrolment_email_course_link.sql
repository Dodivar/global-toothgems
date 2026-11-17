-- =============================================================================
-- The course enrolment e-mail opens the course (decision 154 addendum)
-- =============================================================================
-- The welcome e-mail sent once a course is paid said "start the first lesson
-- whenever you like" with no way to it (owner, 2026-11-17). It now carries a
-- "Start my course" button to the learner page, whose address is the course's
-- French slug (`/academy/mes-formations/<courses.slug>`): the sweep's function
-- returns that slug too. Same function as 20261108210525_course_withdrawal_waiver,
-- one more column; the rows chosen and the grants are unchanged.
-- =============================================================================

drop function public.pending_course_enrolment_emails(uuid, integer);

create function public.pending_course_enrolment_emails(p_order_id uuid default null, p_limit integer default 25)
returns table (
  entitlement_id  uuid,
  order_id        uuid,
  order_number    text,
  email           text,
  locale          text,
  first_name      text,
  course_name     text,
  consent_version text,
  consented_at    timestamptz,
  course_slug     text
)
language sql
stable
security definer
set search_path = ''
as $$
  select e.id, o.id, o.order_number, o.customer_email, o.locale,
         coalesce(o.billing_address ->> 'first_name', ''),
         coalesce((select ct.title from public.course_translations ct
                    where ct.course_id = c.id and ct.locale = o.locale and ct.status = 'published'), c.title),
         w.policy_version, w.created_at,
         c.slug
    from public.course_entitlements e
    join public.orders o on o.id = e.order_id
    join public.courses c on c.id = e.course_id
    -- The buyer's latest waiver given before this order (recorded just before it).
    left join lateral (
      select cr.policy_version, cr.created_at
        from public.consent_records cr
       where cr.user_id = e.user_id
         and cr.purpose = 'course_immediate_access'
         and cr.granted
         and cr.created_at <= o.created_at
       order by cr.created_at desc
       limit 1
    ) w on true
   where e.source = 'purchase'
     and e.revoked_at is null
     and e.created_at >= now() - interval '7 days'
     and o.payment_status in ('paid', 'partially_refunded')
     and (p_order_id is null or e.order_id = p_order_id)
     and private.email_event_open('course_enrolment:' || e.id::text)
   order by e.created_at
   limit least(greatest(p_limit, 1), 100);
$$;
revoke all on function public.pending_course_enrolment_emails(uuid, integer) from public, anon, authenticated;
grant execute on function public.pending_course_enrolment_emails(uuid, integer) to service_role;
