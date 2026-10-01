-- =============================================================================
-- Iteration 19 — Stripe Checkout wiring (Edge Functions `create-checkout-session`
-- and `stripe-webhook`).
--
--   * pg_cron job `expire-stale-orders`: every 5 minutes, cancels unpaid orders
--     whose reservation is over (the function existed since iteration 2; nothing
--     ran it). The migration owner runs the job, a trusted backend for the guards.
--   * record_stripe_webhook_event(): the idempotency step of the webhook as ONE
--     statement (insert or count the retry, return the stored status), so two
--     concurrent deliveries of an event cannot both read "new". Service role only.
--     An order id the database does not know is stored as null instead of failing
--     the foreign key (a session created elsewhere on the same Stripe account).
--   * checkout_session_status(): what the payment return page may show — the order
--     number and a coarse state — to whoever holds the Checkout Session id (cs_…,
--     unguessable, only in Stripe's redirect). Guests have no other way to read
--     their order. Nothing personal is returned. SECURITY DEFINER on purpose
--     (accepted advisor warning, like decision 25): it reads orders past RLS for
--     that single session id.
--
-- No change to create_order / mark_order_paid / cancel_order.
-- =============================================================================

create extension if not exists pg_cron with schema pg_catalog;

-- Re-running the migration replaces the job rather than adding a second one.
select cron.schedule('expire-stale-orders', '*/5 * * * *', 'select public.expire_stale_orders();');

-- -----------------------------------------------------------------------------
-- Webhook idempotency
-- -----------------------------------------------------------------------------
create or replace function public.record_stripe_webhook_event(
  p_event_id  text,
  p_type      text,
  p_livemode  boolean,
  p_object_id text default null,
  p_order_id  uuid default null
)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_status text;
begin
  insert into public.stripe_webhook_events (id, type, livemode, object_id, order_id)
  values (p_event_id, p_type, coalesce(p_livemode, false), p_object_id,
          (select o.id from public.orders o where o.id = p_order_id))
  on conflict (id) do update
     set attempts = public.stripe_webhook_events.attempts + 1
  returning status into v_status;
  return v_status;
end;
$$;

comment on function public.record_stripe_webhook_event(text, text, boolean, text, uuid) is
  'Stripe webhook step 1: records the delivery (or counts a retry) and returns the event status; the handler skips processed / ignored events. Service role only.';

-- -----------------------------------------------------------------------------
-- Payment return page
-- -----------------------------------------------------------------------------
create or replace function public.checkout_session_status(p_session_id text)
returns table (order_number text, state text)
language sql
stable
security definer
set search_path = ''
as $$
  select o.order_number::text,
         case
           when o.payment_status in ('paid', 'partially_refunded', 'refunded') then 'paid'
           when o.status = 'cancelled' then 'cancelled'
           when p.status = 'failed' then 'failed'
           else 'pending'
         end
    from public.payments p
    join public.orders o on o.id = p.order_id
   where p_session_id ~ '^cs_(test|live)_[A-Za-z0-9]{10,250}$'
     and p.provider = 'stripe'
     and p.provider_checkout_id = p_session_id
   limit 1;
$$;

comment on function public.checkout_session_status(text) is
  'Order number and state (pending / paid / cancelled / failed) for the holder of a Stripe Checkout Session id. Read-only; grants nothing.';

revoke all on function public.record_stripe_webhook_event(text, text, boolean, text, uuid) from public, anon, authenticated;
grant execute on function public.record_stripe_webhook_event(text, text, boolean, text, uuid) to service_role;

revoke all on function public.checkout_session_status(text) from public;
grant execute on function public.checkout_session_status(text) to anon, authenticated, service_role;
