-- Retrying a payment with the same gift card (decision: released on retry).
--
-- create_order() debits a gift card as soon as the order exists, and the order stays
-- `pending` until Stripe's session expires (60 min). A customer who cancels on
-- Stripe and comes back therefore finds the card empty ("cannot be used").
-- `unpaid_orders_holding_gift_cards(codes)` lists the unpaid orders that hold
-- those cards, with their Stripe Checkout session ids, so create-checkout-session can
-- expire the sessions and cancel the orders (cancel_order() credits the cards
-- back) before it creates the new order. Service role only: the code is a bearer
-- credential, whoever presents it may release what it holds. Paid orders are never listed.

create or replace function public.unpaid_orders_holding_gift_cards(p_codes text[])
returns table (order_id uuid, checkout_session_ids text[])
language sql
stable
security definer
set search_path = ''
as $$
  select o.id,
         coalesce(array_agg(sp.provider_checkout_id) filter (where sp.provider_checkout_id is not null), '{}')
    from public.orders o
    join public.payments gp on gp.order_id = o.id and gp.provider = 'gift_card' and gp.status = 'succeeded'
    join public.gift_cards c on c.id = gp.gift_card_id
    left join public.payments sp on sp.order_id = o.id and sp.provider = 'stripe' and sp.status = 'pending'
   where c.code = any (select upper(btrim(x)) from unnest(p_codes) as x)
     and o.status = 'pending'
     and o.payment_status in ('pending', 'failed')
   group by o.id;
$$;

revoke all on function public.unpaid_orders_holding_gift_cards(text[]) from public, anon, authenticated;
grant execute on function public.unpaid_orders_holding_gift_cards(text[]) to service_role;
