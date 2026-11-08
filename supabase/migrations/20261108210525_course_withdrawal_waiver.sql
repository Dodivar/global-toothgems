-- =============================================================================
-- Academy courses: express waiver of the right of withdrawal at the checkout
-- (decision 128, 2026-11-08)
--
-- A course is digital content supplied at once. Under the Code de la
-- consommation (L221-28 13°) the right of withdrawal ends when the buyer starts
-- following it, provided they asked beforehand for immediate access and
-- expressly waived the right. The cart shows that sentence as a checkbox when
-- the basket holds a course; `create-checkout-session` refuses a course without
-- it and records it here before create_order(). The wording accepted is
-- identified by `policy_version` (`course-withdrawal-2026-11`, text in
-- `supabase/functions/_shared/courseConsent.ts`). Until a lesson is opened the
-- 14 days still run (terms of sale).
--
--   consent_records                  new purpose `course_immediate_access`
--                                    (source `checkout`)
--   pending_course_enrolment_emails  also returns the buyer's waiver given
--                                    before the order, repeated word for word
--                                    in the enrolment e-mail: the confirmation
--                                    on a durable medium (L221-13)
--   erase_account                    keeps those proofs like the Studio's
--                                    (the account's id is cleared by the FK)
-- =============================================================================

alter table public.consent_records drop constraint consent_records_purpose_check;
alter table public.consent_records add constraint consent_records_purpose_check
  check (purpose in ('terms', 'privacy', 'marketing_email',
                     'cookies_preferences', 'cookies_analytics', 'cookies_marketing',
                     'studio_immediate_access', 'course_immediate_access'));

comment on column public.consent_records.user_id is
  'Null once the account is erased: only the immediate-access requests of the Studio (L221-25) and of courses (L221-28 13°) are kept then.';

-- The return type changes: dropped and created again, same grants.
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
  consented_at    timestamptz
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
         w.policy_version, w.created_at
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

-- ---------------------------------------------------------------------------
-- Erasing an account keeps the waivers of the right of withdrawal, like the
-- Studio's: they belong to paid contracts kept for accounting. Same function as
-- 20261106190000, one condition wider.
-- ---------------------------------------------------------------------------
create or replace function public.erase_account(p_user uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_email    text;
  v_blockers text[];
begin
  select u.email into v_email from auth.users u where u.id = p_user;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  v_blockers := private.account_erasure_blockers(p_user);
  if cardinality(v_blockers) > 0 then
    return jsonb_build_object('status', 'blocked', 'blockers', to_jsonb(v_blockers));
  end if;

  perform set_config('gt.account_erasure', 'on', true);

  -- Unsubscribed, not deleted: the row is the opposition list, and the contact
  -- sync removes the address from Resend.
  update public.newsletter_subscriptions n
     set status = 'unsubscribed',
         unsubscribed_at = coalesce(n.unsubscribed_at, now()),
         confirm_token_hash = null,
         confirm_expires_at = null
   where (n.user_id = p_user or (v_email is not null and lower(n.email) = lower(v_email)))
     and n.status in ('pending', 'subscribed');

  delete from public.consent_records c
   where c.user_id = p_user
     and c.purpose not in ('studio_immediate_access', 'course_immediate_access');

  insert into public.audit_logs (actor_id, actor_role, action, table_name, record_id, changes)
  values (null, 'service_role', 'delete', 'profiles', p_user::text, jsonb_build_object('reason', 'account_erasure'));

  -- Sessions, identities and factors go with the auth user; the profile and
  -- everything that cascades from it go with the profile.
  delete from auth.users u where u.id = p_user;

  perform set_config('gt.account_erasure', '', true);
  return jsonb_build_object('status', 'erased');
end;
$$;
