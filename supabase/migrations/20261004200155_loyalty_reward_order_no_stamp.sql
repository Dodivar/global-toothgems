-- Loyalty: an order paid with the loyalty reward earns no stamp.
--
-- Before: paying an order that spent the completed card (10 % off) still
-- awarded a stamp, which opened a new card at 1/5 straight away. The card must
-- fall back to 0 after the reward is spent, so an order carrying the loyalty
-- discount (order_discounts.source = 'loyalty') is skipped by the award.
-- Void on cancellation / refund is unchanged.

create or replace function private.apply_loyalty_on_order()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  s        public.loyalty_settings;
  v_amount numeric(12, 2);
  v_card   uuid;
  v_stamp  public.loyalty_stamps;
begin
  if new.user_id is null then
    return new;
  end if;

  if (new.status in ('cancelled', 'refunded') and old.status is distinct from new.status)
     or (new.payment_status = 'refunded' and old.payment_status is distinct from 'refunded') then
    select * into v_stamp from public.loyalty_stamps where order_id = new.id and voided_at is null;
    if found and exists (select 1 from public.loyalty_cards where id = v_stamp.card_id and status = 'collecting') then
      update public.loyalty_stamps
         set voided_at = now(),
             void_reason = case when new.status = 'cancelled' then 'order_cancelled' else 'order_refunded' end
       where id = v_stamp.id;
      perform private.refresh_loyalty_card(v_stamp.card_id);
    end if;
    return new;
  end if;

  if not (new.payment_status = 'paid' and old.payment_status is distinct from 'paid') then
    return new;
  end if;

  -- The order that spends a completed card does not earn a stamp.
  if exists (select 1 from public.order_discounts d where d.order_id = new.id and d.source = 'loyalty') then
    return new;
  end if;

  select * into s from public.loyalty_settings where id;
  if not found or not s.is_active or new.currency <> s.currency then
    return new;
  end if;

  select coalesce(sum(i.subtotal_amount), 0) - new.discount_amount
    into v_amount
    from public.order_items i
    join public.products p on p.id = i.product_id
   where i.order_id = new.id and p.product_type <> 'gift_card';
  if v_amount < s.qualifying_amount then
    return new;
  end if;

  select id into v_card from public.loyalty_cards where user_id = new.user_id and status = 'collecting';
  if v_card is null then
    insert into public.loyalty_cards (user_id, stamps_required, reward_percent)
    values (new.user_id, s.stamps_per_card, s.reward_percent)
    returning id into v_card;
  end if;

  insert into public.loyalty_stamps (card_id, user_id, order_id, order_amount, currency)
  values (v_card, new.user_id, new.id, v_amount, new.currency)
  on conflict (order_id) do nothing;

  perform private.refresh_loyalty_card(v_card);
  return new;
end;
$$;

revoke all on function private.apply_loyalty_on_order() from public;
