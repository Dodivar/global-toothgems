-- =============================================================================
-- Gift card balance check (owner's request, 2026-11-13; decision 140)
-- =============================================================================
-- Whoever holds a gift card code can read what is left on it:
--   * members, from their loyalty page (/compte/fidelite) and on /carte-cadeau when signed in:
--       check_gift_card_balance(code)                       authenticated only, throttled per account
--   * visitors, on /carte-cadeau, through the Edge Function `gift-card-balance` (honeypot,
--     Cloudflare Turnstile, per-address limit):
--       gift_card_balance_ip_allowed(ip_hash)               service role only, 20 lookups / hour / address
--       check_gift_card_balance_for_visitor(code, ip_hash)  service role only, throttled per address
--
-- Both answer from one private function. The answer carries only what a holder needs:
-- status (active / used_up / expired / cancelled), the amount available, the currency, the
-- expiry and the code's last 4 characters — never the code, an id, the order, names or e-mails.
--
-- Anti-enumeration: an unknown code, a card waiting for its payment ('pending'), a card whose
-- order was never paid ('void') and a card not yet delivered (scheduled `deliver_at`) all give
-- the same `{ok: true, found: false}`; nobody legitimately holds those codes yet. Each of these
-- refusals is counted in `gift_card_code_attempts`, the same per-caller counter as the cart's
-- quote_gift_cards() (10 per 10 minutes): a member cannot double their guesses by alternating
-- between the cart and this check. Visitors are keyed by a SHA-256 hash of their address
-- ('iph:<hash>'), never the address itself. The codes' ~60 random bits already make blind
-- guessing impractical; the throttle and the captcha keep it that way.
--
-- "Available" is computed as in quote_gift_cards(): the balance plus what an order still waiting
-- for its payment holds (the checkout releases those holds), so a card left in an abandoned
-- checkout does not look spent. The existing gift_card_balance() (staff / backend) is unchanged.
-- =============================================================================

-- What unpaid orders hold on a card (same rule as quote_gift_cards()).
create function private.gift_card_held_amount(p_gift_card_id uuid)
returns numeric
language sql
stable
set search_path = ''
as $$
  select coalesce(sum(gp.amount), 0)::numeric(12, 2)
    from public.payments gp
    join public.orders o on o.id = gp.order_id
   where gp.gift_card_id = p_gift_card_id
     and gp.provider = 'gift_card' and gp.status = 'succeeded'
     and o.status = 'pending' and o.payment_status in ('pending', 'failed');
$$;

revoke all on function private.gift_card_held_amount(uuid) from public;

-- The one answer, for an already identified caller (`p_actor`: 'user:<id>' or 'iph:<sha256>').
create function private.gift_card_balance_answer(p_code text, p_actor text)
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

revoke all on function private.gift_card_balance_answer(text, text) from public;

-- Members: the account is the throttle key.
create function public.check_gift_card_balance(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'unavailable');
  end if;
  return private.gift_card_balance_answer(p_code, 'user:' || auth.uid());
end;
$$;

comment on function public.check_gift_card_balance(text) is
  'A member reads what is left on a gift card from its code: status, available amount, currency, expiry, last 4. Unknown / unpaid / undelivered codes all answer found=false and count against the per-account throttle shared with quote_gift_cards() (10 per 10 minutes).';

revoke all on function public.check_gift_card_balance(text) from public, anon;
grant execute on function public.check_gift_card_balance(text) to authenticated;

-- Visitors, through the Edge Function `gift-card-balance` only: keyed by the hash of their address.
create function public.check_gift_card_balance_for_visitor(p_code text, p_ip_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_ip_hash is null or p_ip_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok', false, 'error', 'unavailable');
  end if;
  return private.gift_card_balance_answer(p_code, 'iph:' || p_ip_hash);
end;
$$;

comment on function public.check_gift_card_balance_for_visitor(text, text) is
  'Visitor gift card balance check for the Edge Function gift-card-balance (captcha checked there): same answer as check_gift_card_balance(), throttled per caller address hash. Service role only.';

revoke all on function public.check_gift_card_balance_for_visitor(text, text) from public, anon, authenticated;
grant execute on function public.check_gift_card_balance_for_visitor(text, text) to service_role;

-- Every visitor lookup, found or not: 20 per hour per address (on top of the refusal throttle).
create function public.gift_card_balance_ip_allowed(p_ip_hash text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select private.hit_rate_limit('gift_card_balance_ip', p_ip_hash, 20, interval '1 hour');
$$;

comment on function public.gift_card_balance_ip_allowed(text) is
  'Throttle of the visitor gift card balance check by caller address (hash): 20 lookups per hour. Service role only.';

revoke all on function public.gift_card_balance_ip_allowed(text) from public, anon, authenticated;
grant execute on function public.gift_card_balance_ip_allowed(text) to service_role;
