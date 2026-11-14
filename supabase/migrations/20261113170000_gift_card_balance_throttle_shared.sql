-- Gift card balance check hardening (owner's request, 2026-11-13, decision 140 follow-up)
-- 1. A spent, expired or cancelled card now counts against the refusal throttle (10 per 10 minutes), as in the
--    cart's quote_gift_cards(), where every unusable code is a refusal: before, such codes confirmed a guess for free.
-- 2. quote_gift_cards() keys anonymous callers by the same address hash as the visitors' balance check ('iph:<sha256>'),
--    so the cart and the balance form share one counter per address (members already share 'user:<id>').

create or replace function public.quote_gift_cards(
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
    -- Same key as the visitors' balance check (the Edge Function hashes the address the same way):
    -- one counter per address across the cart and the balance form.
    begin
      v_headers := current_setting('request.headers', true);
      v_actor := 'iph:' || encode(extensions.digest(lower(btrim(coalesce(
                   nullif(btrim((v_headers::jsonb) ->> 'sb-forwarded-for'), ''),
                   nullif(btrim((v_headers::jsonb) ->> 'cf-connecting-ip'), ''), 'unknown'))), 'sha256'), 'hex');
    exception when others then
      v_actor := 'iph:' || encode(extensions.digest('unknown', 'sha256'), 'hex');
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

create or replace function private.gift_card_balance_answer(p_code text, p_actor text)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_code      text;
  v_card      public.gift_cards;
  v_available numeric(12, 2);
  v_status    text;
begin
  if p_actor is null or btrim(p_actor) = '' then
    return jsonb_build_object('ok', false, 'error', 'unavailable');
  end if;

  if (select count(*) from public.gift_card_code_attempts a
       where a.actor = p_actor and a.created_at > now() - interval '10 minutes') >= 10 then
    return jsonb_build_object('ok', false, 'error', 'too_many_attempts');
  end if;

  -- Spaces and case do not matter; the dashes may be left out.
  v_code := upper(regexp_replace(coalesce(left(p_code, 64), ''), '\s', '', 'g'));
  if v_code ~ '^GT[A-Z2-9]{12}$' then
    v_code := 'GT-' || substr(v_code, 3, 4) || '-' || substr(v_code, 7, 4) || '-' || substr(v_code, 11, 4);
  end if;

  if v_code ~ '^GT-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$' then
    select * into v_card from public.gift_cards where code = v_code;
  end if;

  if v_card.id is null
     or v_card.state in ('pending', 'void')
     or (v_card.deliver_at is not null and v_card.deliver_at > now()) then
    insert into public.gift_card_code_attempts (actor) values (p_actor);
    delete from public.gift_card_code_attempts where created_at < now() - interval '1 day';
    return jsonb_build_object('ok', true, 'found', false);
  end if;

  v_available := v_card.balance + private.gift_card_held_amount(v_card.id);
  v_status := case
    when v_card.state = 'cancelled' then 'cancelled'
    when v_card.expires_at is not null and v_card.expires_at <= now() then 'expired'
    when v_available <= 0 then 'used_up'
    else 'active'
  end;

  -- Like the cart's quote_gift_cards(): a code that cannot be used (spent, expired, cancelled) counts as a
  -- refusal too, so reading such a card is no free way to confirm that a guessed code exists.
  if v_status <> 'active' then
    insert into public.gift_card_code_attempts (actor) values (p_actor);
    delete from public.gift_card_code_attempts where created_at < now() - interval '1 day';
  end if;

  return jsonb_build_object(
    'ok', true,
    'found', true,
    'card', jsonb_build_object(
      'status', v_status,
      'balance', case when v_status = 'cancelled' then 0 else v_available end,
      'currency', v_card.currency,
      'expires_at', v_card.expires_at,
      'last4', v_card.code_last4
    )
  );
end;
$$;

