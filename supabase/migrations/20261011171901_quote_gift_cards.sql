-- quote_gift_cards(): the checkout's preview of what the gift card codes typed in the cart would pay, so the summary
-- shows the deduction and the amount left to pay before the payment step (the payment form is on our own page).
--
-- Same rules as create_order(): codes de-duplicated (upper, trimmed), at most 5, a card is usable when it is active,
-- has money left, is not expired, is already delivered (deliver_at) and is in the order's currency; the cards pay
-- for the order but never for gift card lines (the caller passes that amount, `p_amount`). An amount held by an
-- order still waiting for its payment counts as available: the checkout releases those holds before the new order.
--
-- What it says: the total the cards would apply (capped at `p_amount`) and which of the codes cannot be used —
-- never a balance, an expiry or an order. Every refusal reads the same. Refused codes are throttled per caller
-- (10 per 10 minutes, `gift_card_code_attempts`), so the function is no way to guess codes. create_order() stays
-- the authority: the preview writes nothing but its throttle.

create table public.gift_card_code_attempts (
  id         bigint generated always as identity primary key,
  actor      text not null,                       -- 'user:<id>', else 'ip:<address>' as for promotion_code_attempts
  created_at timestamptz not null default now()
);
alter table public.gift_card_code_attempts enable row level security;
revoke all on table public.gift_card_code_attempts from anon, authenticated;
create index gift_card_code_attempts_actor_idx on public.gift_card_code_attempts (actor, created_at desc);
comment on table public.gift_card_code_attempts is
  'Gift card codes refused by quote_gift_cards(), per caller: the throttle against guessing codes. Kept one day. Never readable through the API.';

create function public.quote_gift_cards(
  p_codes    text[],
  p_amount   numeric,
  p_currency text default 'EUR'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user      uuid := auth.uid();
  v_actor     text;
  v_headers   text;
  v_code      text;
  v_card      public.gift_cards;
  v_available numeric(12, 2);
  v_applied   numeric(12, 2) := 0;
  v_refused   text[] := '{}';
  v_amount    numeric(12, 2);
begin
  p_currency := upper(coalesce(p_currency, 'EUR'));
  if p_codes is null or cardinality(p_codes) = 0 then
    return jsonb_build_object('ok', true, 'applied', 0, 'refused', '[]'::jsonb);
  end if;
  if cardinality(p_codes) > 5 or p_amount is null or p_amount < 0 or p_amount > 1000000 then
    return jsonb_build_object('ok', false, 'error', 'unavailable');
  end if;
  v_amount := round(p_amount, 2);

  -- Who is asking, for the throttle: the account, else the address the platform saw (never `x-forwarded-for`).
  if v_user is not null then
    v_actor := 'user:' || v_user;
  else
    begin
      v_headers := current_setting('request.headers', true);
      v_actor := 'ip:' || coalesce(nullif(btrim((v_headers::jsonb) ->> 'sb-forwarded-for'), ''),
                                   nullif(btrim((v_headers::jsonb) ->> 'cf-connecting-ip'), ''), 'unknown');
    exception when others then
      v_actor := 'ip:unknown';
    end;
  end if;
  if (select count(*) from public.gift_card_code_attempts a
       where a.actor = v_actor and a.created_at > now() - interval '10 minutes') >= 10 then
    return jsonb_build_object('ok', false, 'error', 'too_many_attempts');
  end if;

  for v_code in select distinct upper(btrim(c)) from unnest(p_codes) as c where c is not null
  loop
    select * into v_card from public.gift_cards where code = v_code;
    v_available := null;
    if found and v_card.state = 'active' and v_card.currency = p_currency
       and (v_card.expires_at is null or v_card.expires_at > now())
       and (v_card.deliver_at is null or v_card.deliver_at <= now()) then
      v_available := v_card.balance + coalesce((
        select sum(gp.amount) from public.payments gp
          join public.orders o on o.id = gp.order_id
         where gp.gift_card_id = v_card.id and gp.provider = 'gift_card' and gp.status = 'succeeded'
           and o.status = 'pending' and o.payment_status in ('pending', 'failed')), 0);
    end if;
    if v_available is null or v_available <= 0 then
      v_refused := v_refused || v_code;
      insert into public.gift_card_code_attempts (actor) values (v_actor);
    else
      v_applied := v_applied + v_available;
    end if;
  end loop;
  if cardinality(v_refused) > 0 then
    delete from public.gift_card_code_attempts where created_at < now() - interval '1 day';
  end if;

  return jsonb_build_object('ok', true, 'applied', least(v_applied, v_amount), 'refused', to_jsonb(v_refused));
end;
$$;

comment on function public.quote_gift_cards(text[], numeric, text) is
  'Checkout preview: the total the gift card codes would pay on an amount (capped at it, as create_order()), and the codes that cannot be used. Never returns a balance. Refused codes throttled per caller.';

revoke all on function public.quote_gift_cards(text[], numeric, text) from public;
grant execute on function public.quote_gift_cards(text[], numeric, text) to anon, authenticated, service_role;
