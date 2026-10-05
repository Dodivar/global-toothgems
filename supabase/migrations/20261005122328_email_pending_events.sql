-- Business e-mails sent by a sweep (decision 79): shipping, course enrolment, refund.
--
-- The `send-pending-emails` Edge Function (pg_cron, every 5 minutes) asks these
-- service-role functions what still has to be e-mailed, then sends each through
-- the once-per-event claim in email_log:
--
--   shipping:<shipment id>          one e-mail per parcel that is `shipped`
--   course_enrolment:<entitlement>  one per `purchase` entitlement (paid order)
--   refund:<refund id>              one per `succeeded` refund
--
-- Nothing depends on the browser or on the back office calling something: the
-- source rows are the truth, email_log says what has gone out. Only the last 7
-- days are considered, so switching the sweep on never mails old history, and an
-- event the sweep missed for longer than a week stays unsent on purpose.
-- An event is "open" unless its log row is sent / delivered / opened / bounced /
-- complained, failed with the attempt cap reached (5, as email_log_claim), or
-- pending for less than 10 minutes (being sent right now).
-- Service role only; customer data leaves these functions only to the sender.

create or replace function private.email_event_open(p_event_key text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select not exists (
    select 1 from public.email_log e
     where e.event_key = p_event_key
       and (e.status in ('sent', 'delivered', 'opened', 'bounced', 'complained')
            or (e.status = 'failed' and e.attempt >= 5)
            or (e.status = 'pending' and e.updated_at >= now() - interval '10 minutes'))
  );
$$;

revoke all on function private.email_event_open(text) from public, anon, authenticated;

-- Parcels that left and whose customer has not been told. Per parcel, not per
-- order: each parcel has its own carrier and tracking number, and an order with
-- several parcels is `processing` until the last one leaves. A parcel already
-- `delivered` when the sweep sees it gets nothing ("on its way" would be stale).
create or replace function public.pending_shipping_emails(p_limit integer default 25)
returns table (
  shipment_id  uuid,
  order_id     uuid,
  user_id      uuid,
  order_number text,
  email        text,
  locale       text,
  first_name   text,
  tracking_url text
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, o.id, o.user_id, o.order_number, o.customer_email, o.locale,
         coalesce(o.billing_address ->> 'first_name', ''), s.tracking_url
    from public.shipments s
    join public.orders o on o.id = s.order_id
   where s.status = 'shipped'
     and coalesce(s.shipped_at, s.created_at) >= now() - interval '7 days'
     and o.payment_status in ('paid', 'partially_refunded')
     and private.email_event_open('shipping:' || s.id::text)
   order by coalesce(s.shipped_at, s.created_at)
   limit least(greatest(p_limit, 1), 100);
$$;

-- Course access granted by a paid order (`purchase` entitlements only: a manual
-- grant by staff, a bundle or a promotion sends nothing — the team talks to that
-- person itself). Optionally for one order (the payment hook), else all recent.
create or replace function public.pending_course_enrolment_emails(p_order_id uuid default null, p_limit integer default 25)
returns table (
  entitlement_id uuid,
  order_id       uuid,
  order_number   text,
  email          text,
  locale         text,
  first_name     text,
  course_name    text
)
language sql
stable
security definer
set search_path = ''
as $$
  select e.id, o.id, o.order_number, o.customer_email, o.locale,
         coalesce(o.billing_address ->> 'first_name', ''),
         coalesce((select ct.title from public.course_translations ct
                    where ct.course_id = c.id and ct.locale = o.locale and ct.status = 'published'), c.title)
    from public.course_entitlements e
    join public.orders o on o.id = e.order_id
    join public.courses c on c.id = e.course_id
   where e.source = 'purchase'
     and e.revoked_at is null
     and e.created_at >= now() - interval '7 days'
     and o.payment_status in ('paid', 'partially_refunded')
     and (p_order_id is null or e.order_id = p_order_id)
     and private.email_event_open('course_enrolment:' || e.id::text)
   order by e.created_at
   limit least(greatest(p_limit, 1), 100);
$$;

-- Card refunds confirmed by Stripe (the `refunds` table). A refund credited back
-- onto gift cards (refund_to_gift_cards) is not in that table and sends nothing:
-- the template speaks of the bank.
create or replace function public.pending_refund_emails(p_limit integer default 25)
returns table (
  refund_id    uuid,
  order_id     uuid,
  order_number text,
  email        text,
  locale       text,
  first_name   text,
  amount       numeric,
  currency     text
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, o.id, o.order_number, o.customer_email, o.locale,
         coalesce(o.billing_address ->> 'first_name', ''), r.amount, r.currency::text
    from public.refunds r
    join public.orders o on o.id = r.order_id
   where r.status = 'succeeded'
     and coalesce(r.processed_at, r.updated_at) >= now() - interval '7 days'
     and private.email_event_open('refund:' || r.id::text)
   order by coalesce(r.processed_at, r.updated_at)
   limit least(greatest(p_limit, 1), 100);
$$;

revoke all on function public.pending_shipping_emails(integer) from public, anon, authenticated;
revoke all on function public.pending_course_enrolment_emails(uuid, integer) from public, anon, authenticated;
revoke all on function public.pending_refund_emails(integer) from public, anon, authenticated;
grant execute on function public.pending_shipping_emails(integer) to service_role;
grant execute on function public.pending_course_enrolment_emails(uuid, integer) to service_role;
grant execute on function public.pending_refund_emails(integer) to service_role;
