-- =============================================================================
-- Gift card staff functions: never hand the code back, refuse sub-cent amounts
-- =============================================================================
-- The back office now calls the staff gift card functions from the browser
-- (screens /admin/promotions?vue=cartes-cadeaux). Two defects of iteration 4
-- surface there:
--
--   * extend_gift_card() and cancel_gift_card() returned the whole
--     public.gift_cards row. They are SECURITY DEFINER, so the row carried the
--     `code` column, which no API role may read: any member holding
--     manage_promotions received the full bearer code of the card they
--     extended or cancelled. They now return the card id; the screen re-reads
--     gift_card_overview (code_last4 only).
--   * issue_gift_card() and adjust_gift_card() wrote amounts into
--     numeric(12,2) columns without checking them, so 10.005 was silently
--     rounded. Amounts must now have at most two decimals; an issued card must
--     be positive, at most 10 000 in the shop currency, with a future expiry
--     and a plausible recipient address.
--
-- Same names, arguments and permission (manage_promotions through
-- private.caller_is_staff_or_backend()); only the return type of the first two
-- changes, hence drop + create.
-- =============================================================================

drop function public.extend_gift_card(uuid, timestamptz, text);
drop function public.cancel_gift_card(uuid, text);

create function public.extend_gift_card(p_gift_card_id uuid, p_expires_at timestamptz, p_note text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_card public.gift_cards;
begin
  if not private.caller_is_staff_or_backend() then
    raise exception 'extend_gift_card: not allowed' using errcode = '42501';
  end if;
  select * into v_card from public.gift_cards where id = p_gift_card_id for update;
  if not found then
    raise exception 'extend_gift_card: unknown card' using errcode = 'P0002';
  end if;
  if v_card.state <> 'active' then
    raise exception 'extend_gift_card: only active cards can be extended' using errcode = '23514';
  end if;
  if v_card.expires_at is null then
    raise exception 'extend_gift_card: this card never expires' using errcode = '23514';
  end if;
  if p_expires_at is not null and (p_expires_at <= now() or p_expires_at <= v_card.expires_at) then
    raise exception 'extend_gift_card: new expiry must be later than the current one' using errcode = '22023';
  end if;
  update public.gift_cards set expires_at = p_expires_at where id = p_gift_card_id;
  insert into public.gift_card_transactions (gift_card_id, kind, amount, note)
  values (p_gift_card_id, 'extension', 0,
          left(coalesce(nullif(btrim(p_note), '') || ' — ', '')
               || coalesce('→ ' || to_char(p_expires_at, 'YYYY-MM-DD'), '→ sans expiration'), 500));
  return p_gift_card_id;
end;
$$;

create function public.cancel_gift_card(p_gift_card_id uuid, p_note text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_card public.gift_cards;
begin
  if not private.caller_is_staff_or_backend() then
    raise exception 'cancel_gift_card: not allowed' using errcode = '42501';
  end if;
  if nullif(btrim(p_note), '') is null then
    raise exception 'cancel_gift_card: a note is required' using errcode = '22023';
  end if;
  select * into v_card from public.gift_cards where id = p_gift_card_id for update;
  if not found then
    raise exception 'cancel_gift_card: unknown card' using errcode = 'P0002';
  end if;
  if v_card.state = 'cancelled' then
    return p_gift_card_id;
  end if;
  if v_card.state <> 'active' then
    raise exception 'cancel_gift_card: only active cards can be cancelled' using errcode = '23514';
  end if;
  insert into public.gift_card_transactions (gift_card_id, kind, amount, note)
  values (p_gift_card_id, 'cancellation', -v_card.balance, left(btrim(p_note), 500));
  update public.gift_cards set state = 'cancelled', cancelled_at = now() where id = p_gift_card_id;
  return p_gift_card_id;
end;
$$;

-- Goodwill / manual card (staff), with its input checked.
create or replace function public.issue_gift_card(
  p_amount          numeric,
  p_recipient_email text,
  p_recipient_name  text default null,
  p_message         text default null,
  p_expires_at      timestamptz default null,
  p_note            text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_settings public.gift_card_settings;
  v_email    text := lower(btrim(p_recipient_email));
  v_id       uuid;
begin
  if not private.caller_is_staff_or_backend() then
    raise exception 'issue_gift_card: not allowed' using errcode = '42501';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount <> round(p_amount, 2) or p_amount > 10000 then
    raise exception 'issue_gift_card: amount must be between 0.01 and 10000 with two decimals' using errcode = '22023';
  end if;
  if v_email is null or v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' or char_length(v_email) > 254 then
    raise exception 'issue_gift_card: invalid recipient email' using errcode = '22023';
  end if;
  if char_length(btrim(p_recipient_name)) > 100 or char_length(btrim(p_message)) > 1000 then
    raise exception 'issue_gift_card: recipient name or message too long' using errcode = '22023';
  end if;
  if p_expires_at is not null and p_expires_at <= now() then
    raise exception 'issue_gift_card: expiry must be in the future' using errcode = '22023';
  end if;
  select * into v_settings from public.gift_card_settings where id;
  insert into public.gift_cards
    (code, state, source, currency, initial_amount, recipient_name, recipient_email, message, design,
     issued_at, expires_at)
  values
    (private.generate_gift_card_code(), 'active', 'manual', coalesce(v_settings.currency, 'EUR'), p_amount,
     nullif(btrim(p_recipient_name), ''), v_email, nullif(btrim(p_message), ''),
     coalesce(v_settings.default_design, 'sparkle'), now(),
     coalesce(p_expires_at, case when v_settings.expiry_months is null then null
                                 else now() + make_interval(months => v_settings.expiry_months) end))
  returning id into v_id;
  insert into public.gift_card_transactions (gift_card_id, kind, amount, note)
  values (v_id, 'issue', p_amount, left(nullif(btrim(p_note), ''), 500));
  return v_id;
end;
$$;

create or replace function public.adjust_gift_card(p_gift_card_id uuid, p_delta numeric, p_note text)
returns public.gift_card_transactions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tx public.gift_card_transactions;
begin
  if not private.caller_is_staff_or_backend() then
    raise exception 'adjust_gift_card: not allowed' using errcode = '42501';
  end if;
  if nullif(btrim(p_note), '') is null then
    raise exception 'adjust_gift_card: a note is required' using errcode = '22023';
  end if;
  if p_delta is null or p_delta = 0 or p_delta <> round(p_delta, 2) or abs(p_delta) > 10000 then
    raise exception 'adjust_gift_card: amount must be non-zero, at most 10000, with two decimals' using errcode = '22023';
  end if;
  if not exists (select 1 from public.gift_cards where id = p_gift_card_id and state = 'active') then
    raise exception 'adjust_gift_card: only active cards can be adjusted' using errcode = '23514';
  end if;
  -- A debit larger than the balance is refused by the ledger trigger ('gift card balance insufficient').
  insert into public.gift_card_transactions (gift_card_id, kind, amount, note)
  values (p_gift_card_id, 'adjustment', p_delta, left(btrim(p_note), 500))
  returning * into v_tx;
  return v_tx;
end;
$$;

revoke all on function public.extend_gift_card(uuid, timestamptz, text) from public, anon;
revoke all on function public.cancel_gift_card(uuid, text) from public, anon;
grant execute on function public.extend_gift_card(uuid, timestamptz, text) to authenticated, service_role;
grant execute on function public.cancel_gift_card(uuid, text) to authenticated, service_role;
