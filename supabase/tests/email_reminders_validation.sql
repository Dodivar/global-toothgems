-- =============================================================================
-- Reminder e-mails validation suite (migration 20261113111250_email_reminders, decision 141)
-- =============================================================================
-- Proves:
--
--   R1  nothing is pending while a reminder is switched off;
--   R2  abandoned cart: a member with marketing consent whose payment was
--       abandoned 4 hours ago is pending, with the product (no price); a guest
--       without consent is not; a guest subscribed to the newsletter is;
--   R3  abandoned cart: too recent, a checkout failure, a later order by the
--       same address, a cart of gift cards only, or an abandoned cart e-mail
--       already sent to the address in the last 30 days — never pending;
--   R4  the opt-out: one stable 48-hex token per address; a visitor stops the
--       reminders with it (twice is fine, a bad token is refused) and nothing
--       is pending for that address afterwards;
--   R5  review request: a paid member order whose parcels are all delivered
--       6 days ago is pending with the delivered product not reviewed yet
--       (not the reviewed one, not the one in no parcel yet); delivered
--       2 days ago, one parcel still on its way, the product already reviewed,
--       a partial refund, a withdrawal or a recent review request — not;
--   R6  loyalty reward: a card full for 8 days is pending once per member
--       (oldest card); 3 days, an inactive programme or a recent reminder — not;
--   R7  the event key closes it: once its e-mail is sent, a row is not pending;
--   R8  the API: visitors and members cannot list pending reminders, read the
--       preferences or mint a token.
--
-- ONE transaction, ALWAYS rolled back by raising `ALL EMAIL REMINDER TESTS PASSED`
-- (or `FAIL: ...`).
-- =============================================================================

do $$
declare
  m1      uuid := '00000000-0000-4000-a000-000000440001';
  m2      uuid := '00000000-0000-4000-a000-000000440002';
  m3      uuid := '00000000-0000-4000-a000-000000440003';
  addr    jsonb := '{"first_name":"Camille","last_name":"Test","address_line1":"1 rue","postal_code":"67000","city":"Strasbourg","country_code":"FR"}';
  p1      uuid;
  p2      uuid;
  p3      uuid;
  p_gift  uuid;
  o_ab    uuid;
  o_guest uuid;
  o_news  uuid;
  o_x     uuid;
  o_rev   uuid;
  o_rev2  uuid;
  i1      uuid;
  i2      uuid;
  i3      uuid;
  c1      uuid;
  c2      uuid;
  v_tok   text;
  v_tok2  text;
  v_cnt   int;
  v_ok    boolean;
  r       record;
  passed  text[] := '{}';
begin
  -- Fixtures, as the table owner.
  insert into public.products (name, slug, price, currency, status, product_type)
  values ('Rappel strass', 'rem-test-strass', 10, 'EUR', 'active', 'physical') returning id into p1;
  insert into public.products (name, slug, price, currency, status, product_type)
  values ('Rappel kit', 'rem-test-kit', 30, 'EUR', 'active', 'physical') returning id into p2;
  insert into public.products (name, slug, price, currency, status, product_type)
  values ('Rappel pince', 'rem-test-pince', 5, 'EUR', 'active', 'physical') returning id into p3;
  insert into public.products (name, slug, price, currency, status, product_type)
  values ('Rappel carte', 'rem-test-carte', 0, 'EUR', 'active', 'gift_card') returning id into p_gift;
  insert into auth.users (id, aud, role, email, created_at, updated_at)
  values (m1, 'authenticated', 'authenticated', 'rem-m1.test@example.invalid', now(), now()),
         (m2, 'authenticated', 'authenticated', 'rem-m2.test@example.invalid', now(), now()),
         (m3, 'authenticated', 'authenticated', 'rem-m3.test@example.invalid', now(), now());
  update public.profiles set marketing_opt_in = true, first_name = 'Camille' where id = m1;

  -- An abandoned cart per case; the cancellation is written as the backend writes it.
  -- o_ab: m1 (consent), left the payment step 4 hours ago.
  insert into public.orders (user_id, customer_email, billing_address, currency, subtotal_amount, total_amount, locale, created_at)
  values (m1, 'rem-m1.test@example.invalid', addr, 'EUR', 10, 10, 'fr', now() - interval '5 hours') returning id into o_ab;
  insert into public.order_items (order_id, product_id, product_name, unit_price, quantity) values (o_ab, p1, 'Rappel strass', 10, 1);
  insert into public.order_items (order_id, product_id, product_name, unit_price, quantity) values (o_ab, p_gift, 'Carte', 20, 1);
  update public.orders set status = 'cancelled', cancellation_reason = 'payment_step_left', cancelled_at = now() - interval '4 hours'
   where id = o_ab;
  -- o_guest: a guest without consent, expired 4 hours ago.
  insert into public.orders (customer_email, billing_address, currency, subtotal_amount, total_amount, locale, created_at)
  values ('rem-guest.test@example.invalid', addr, 'EUR', 10, 10, 'en', now() - interval '5 hours') returning id into o_guest;
  insert into public.order_items (order_id, product_id, product_name, unit_price, quantity) values (o_guest, p1, 'Rappel strass', 10, 1);
  update public.orders set status = 'cancelled', cancellation_reason = 'expired', cancelled_at = now() - interval '4 hours'
   where id = o_guest;
  -- o_news: a guest subscribed to the newsletter, expired 4 hours ago.
  insert into public.orders (customer_email, billing_address, currency, subtotal_amount, total_amount, locale, created_at)
  values ('Rem-News.test@example.invalid', addr, 'EUR', 10, 10, 'en', now() - interval '5 hours') returning id into o_news;
  insert into public.order_items (order_id, product_id, product_name, unit_price, quantity) values (o_news, p2, 'Rappel kit', 30, 1);
  update public.orders set status = 'cancelled', cancellation_reason = 'expired', cancelled_at = now() - interval '4 hours'
   where id = o_news;
  insert into public.newsletter_subscriptions (email, locale, status, source, policy_version, confirmed_at, opt_in_method)
  values ('rem-news.test@example.invalid', 'en', 'subscribed', 'home', 'test', now(), 'captcha');

  -- R1: every switch off (the migration's default) → nothing
  update private.email_reminder_settings
     set abandoned_cart_enabled = false, review_request_enabled = false, loyalty_reward_enabled = false;
  select count(*) into v_cnt from public.pending_abandoned_cart_emails(100) where order_id in (o_ab, o_guest, o_news);
  if v_cnt <> 0 then raise exception 'FAIL R1: % abandoned carts pending while off', v_cnt; end if;
  update private.email_reminder_settings
     set abandoned_cart_enabled = true, review_request_enabled = true, loyalty_reward_enabled = true,
         abandoned_cart_delay_hours = 3, review_request_delay_days = 5, loyalty_reward_delay_days = 7;
  passed := passed || 'R1'::text;

  -- R2: consent decides
  select * into r from public.pending_abandoned_cart_emails(100) where order_id = o_ab;
  if r.order_id is null then raise exception 'FAIL R2: the member''s abandoned cart is not pending'; end if;
  if r.email <> 'rem-m1.test@example.invalid' or r.first_name <> 'Camille' or r.locale <> 'fr' then
    raise exception 'FAIL R2: wrong recipient %', row_to_json(r);
  end if;
  if jsonb_array_length(r.items) <> 1 or r.items -> 0 ->> 'slug' <> 'rem-test-strass' or (r.items -> 0) ? 'price'
     or (r.items -> 0) ? 'unit_price' then
    raise exception 'FAIL R2: items must be the product on sale only, without price: %', r.items;
  end if;
  if exists (select 1 from public.pending_abandoned_cart_emails(100) where order_id = o_guest) then
    raise exception 'FAIL R2: a guest without marketing consent is pending';
  end if;
  if not exists (select 1 from public.pending_abandoned_cart_emails(100) where order_id = o_news and email = 'rem-news.test@example.invalid') then
    raise exception 'FAIL R2: a newsletter subscriber''s abandoned cart is not pending';
  end if;
  passed := passed || 'R2'::text;

  -- R3: the exclusions
  update public.orders set cancelled_at = now() - interval '1 hour' where id = o_news;
  if exists (select 1 from public.pending_abandoned_cart_emails(100) where order_id = o_news) then
    raise exception 'FAIL R3: abandoned 1 hour ago is pending';
  end if;
  update public.orders set cancelled_at = now() - interval '3 days' where id = o_news;
  if exists (select 1 from public.pending_abandoned_cart_emails(100) where order_id = o_news) then
    raise exception 'FAIL R3: abandoned 3 days ago is pending';
  end if;
  update public.orders set cancelled_at = now() - interval '4 hours', cancellation_reason = 'checkout_failed' where id = o_news;
  if exists (select 1 from public.pending_abandoned_cart_emails(100) where order_id = o_news) then
    raise exception 'FAIL R3: a checkout failure is pending';
  end if;
  update public.orders set cancellation_reason = 'payment_failed' where id = o_news;
  if exists (select 1 from public.pending_abandoned_cart_emails(100) where order_id = o_news) then
    raise exception 'FAIL R3: a declined payment is pending';
  end if;
  update public.orders set cancellation_reason = 'expired' where id = o_news;
  -- A later order by the same address (any status) means they came back.
  insert into public.orders (customer_email, billing_address, currency, subtotal_amount, total_amount, locale)
  values ('REM-news.test@example.invalid', addr, 'EUR', 30, 30, 'en') returning id into o_x;
  if exists (select 1 from public.pending_abandoned_cart_emails(100) where order_id = o_news) then
    raise exception 'FAIL R3: an abandoned cart followed by a later order is pending';
  end if;
  delete from public.orders where id = o_x;
  -- Gift cards only: nothing to show.
  delete from public.order_items where order_id = o_news;
  insert into public.order_items (order_id, product_id, product_name, unit_price, quantity) values (o_news, p_gift, 'Carte', 20, 1);
  if exists (select 1 from public.pending_abandoned_cart_emails(100) where order_id = o_news) then
    raise exception 'FAIL R3: a gift-card-only cart is pending';
  end if;
  delete from public.order_items where order_id = o_news;
  insert into public.order_items (order_id, product_id, product_name, unit_price, quantity) values (o_news, p2, 'Rappel kit', 30, 1);
  -- 30-day cap per address.
  insert into public.email_log (event_key, template_key, locale, recipient_hash, status, sent_at)
  values ('abandoned_cart:' || gen_random_uuid(), 'abandoned_cart', 'en',
          encode(extensions.digest('rem-news.test@example.invalid', 'sha256'), 'hex'), 'sent', now() - interval '10 days');
  if exists (select 1 from public.pending_abandoned_cart_emails(100) where order_id = o_news) then
    raise exception 'FAIL R3: a second abandoned cart e-mail within 30 days is pending';
  end if;
  passed := passed || 'R3'::text;

  -- R4: the opt-out
  v_tok := public.email_reminder_token(' REM-M1.test@example.invalid ');
  v_tok2 := public.email_reminder_token('rem-m1.test@example.invalid');
  if v_tok !~ '^[0-9a-f]{48}$' or v_tok <> v_tok2 then raise exception 'FAIL R4: token % / %', v_tok, v_tok2; end if;
  if not exists (select 1 from public.email_reminder_preferences
                  where recipient_hash = encode(extensions.digest('rem-m1.test@example.invalid', 'sha256'), 'hex')) then
    raise exception 'FAIL R4: the preference is not keyed by the hash the sender uses';
  end if;
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  if public.unsubscribe_email_reminders(repeat('0', 48)) then raise exception 'FAIL R4: unknown token accepted'; end if;
  if public.unsubscribe_email_reminders('not-a-token') then raise exception 'FAIL R4: malformed token accepted'; end if;
  if not public.unsubscribe_email_reminders(v_tok) then raise exception 'FAIL R4: the token did not stop the reminders'; end if;
  if not public.unsubscribe_email_reminders(v_tok) then raise exception 'FAIL R4: a second click must still answer true'; end if;
  execute 'reset role';
  if exists (select 1 from public.pending_abandoned_cart_emails(100) where order_id = o_ab) then
    raise exception 'FAIL R4: an opted-out address is still pending';
  end if;
  update public.email_reminder_preferences set opted_out_at = null
   where recipient_hash = encode(extensions.digest('rem-m1.test@example.invalid', 'sha256'), 'hex');
  passed := passed || 'R4'::text;

  -- R5: review request. o_rev: m2, paid, two parcels delivered 6 and 8 days ago.
  insert into public.orders (user_id, customer_email, billing_address, currency, subtotal_amount, total_amount, locale, order_number)
  values (m2, 'rem-m2.test@example.invalid', addr, 'EUR', 40, 40, 'en', 'GT-REM-1') returning id into o_rev;
  insert into public.order_items (order_id, product_id, product_name, unit_price, quantity) values (o_rev, p1, 'Rappel strass', 10, 1) returning id into i1;
  insert into public.order_items (order_id, product_id, product_name, unit_price, quantity) values (o_rev, p2, 'Rappel kit', 30, 1) returning id into i2;
  insert into public.order_items (order_id, product_id, product_name, unit_price, quantity) values (o_rev, p3, 'Rappel pince', 5, 1) returning id into i3;
  update public.orders set payment_status = 'paid', paid_at = now() - interval '12 days' where id = o_rev;
  -- Two parcels delivered (strass, kit); the tweezers (i3) are in no parcel yet.
  with sh as (insert into public.shipments (order_id, status, carrier, tracking_number, shipped_at, delivered_at)
              values (o_rev, 'delivered', 'Colissimo', 'REM1', now() - interval '10 days', now() - interval '8 days') returning id)
  insert into public.shipment_items (shipment_id, order_item_id, quantity) select sh.id, i2, 1 from sh;
  with sh as (insert into public.shipments (order_id, status, carrier, tracking_number, shipped_at, delivered_at)
              values (o_rev, 'delivered', 'Colissimo', 'REM2', now() - interval '9 days', now() - interval '6 days') returning id)
  insert into public.shipment_items (shipment_id, order_item_id, quantity) select sh.id, i1, 1 from sh;
  update public.orders set status = 'delivered' where id = o_rev;
  insert into public.reviews (user_id, product_id, order_id, rating, title, body, language)
  values (m2, p2, o_rev, 5, 'Super', 'Très bien, je recommande ce produit à tout le monde.', 'fr');
  select * into r from public.pending_review_request_emails(100) where order_id = o_rev;
  if r.order_id is null then raise exception 'FAIL R5: the delivered order is not pending'; end if;
  if r.email <> 'rem-m2.test@example.invalid' or r.order_number <> 'GT-REM-1'
     or jsonb_array_length(r.items) <> 1 or r.items -> 0 ->> 'slug' <> 'rem-test-strass' then
    raise exception 'FAIL R5: only the delivered product not reviewed yet must be listed: %', row_to_json(r);
  end if;
  -- Delivered too recently.
  update public.shipments set delivered_at = now() - interval '2 days' where order_id = o_rev and tracking_number = 'REM2';
  if exists (select 1 from public.pending_review_request_emails(100) where order_id = o_rev) then
    raise exception 'FAIL R5: delivered 2 days ago is pending';
  end if;
  update public.shipments set delivered_at = now() - interval '6 days' where order_id = o_rev and tracking_number = 'REM2';
  -- One parcel still on its way.
  with sh as (insert into public.shipments (order_id, status, carrier, tracking_number, shipped_at)
              values (o_rev, 'shipped', 'Colissimo', 'REM3', now() - interval '3 days') returning id)
  insert into public.shipment_items (shipment_id, order_item_id, quantity) select sh.id, i3, 1 from sh;
  if exists (select 1 from public.pending_review_request_emails(100) where order_id = o_rev) then
    raise exception 'FAIL R5: an order with a parcel on its way is pending';
  end if;
  update public.shipments set status = 'cancelled' where order_id = o_rev and tracking_number = 'REM3';
  if not exists (select 1 from public.pending_review_request_emails(100) where order_id = o_rev) then
    raise exception 'FAIL R5: a cancelled parcel must not block the request';
  end if;
  -- A partial refund.
  update public.orders set payment_status = 'partially_refunded' where id = o_rev;
  if exists (select 1 from public.pending_review_request_emails(100) where order_id = o_rev) then
    raise exception 'FAIL R5: a partially refunded order is pending';
  end if;
  update public.orders set payment_status = 'paid' where id = o_rev;
  -- Everything reviewed.
  insert into public.reviews (user_id, product_id, order_id, rating, title, body, language)
  values (m2, p1, o_rev, 4, 'Bien', 'Joli strass, bien collé et brillant pendant des semaines.', 'fr');
  if exists (select 1 from public.pending_review_request_emails(100) where order_id = o_rev) then
    raise exception 'FAIL R5: an order whose products are all reviewed is pending';
  end if;
  delete from public.reviews where user_id = m2 and product_id = p1;
  -- A recent review request to the same member (another order).
  insert into public.email_log (event_key, template_key, locale, recipient_hash, status, sent_at)
  values ('review_request:' || gen_random_uuid(), 'review_request', 'en',
          encode(extensions.digest('rem-m2.test@example.invalid', 'sha256'), 'hex'), 'delivered', now() - interval '5 days');
  if exists (select 1 from public.pending_review_request_emails(100) where order_id = o_rev) then
    raise exception 'FAIL R5: a second review request within 30 days is pending';
  end if;
  delete from public.email_log where template_key = 'review_request'
     and recipient_hash = encode(extensions.digest('rem-m2.test@example.invalid', 'sha256'), 'hex');
  -- A guest's delivered order never gets one.
  insert into public.orders (customer_email, billing_address, currency, subtotal_amount, total_amount, locale)
  values ('rem-guest.test@example.invalid', addr, 'EUR', 10, 10, 'fr') returning id into o_rev2;
  insert into public.order_items (order_id, product_id, product_name, unit_price, quantity) values (o_rev2, p1, 'Rappel strass', 10, 1);
  update public.orders set payment_status = 'paid', paid_at = now() - interval '12 days' where id = o_rev2;
  with sh as (insert into public.shipments (order_id, status, carrier, tracking_number, shipped_at, delivered_at)
              values (o_rev2, 'delivered', 'Colissimo', 'REM4', now() - interval '10 days', now() - interval '7 days') returning id)
  insert into public.shipment_items (shipment_id, order_item_id, quantity)
  select sh.id, i.id, 1 from sh, public.order_items i where i.order_id = o_rev2;
  update public.orders set status = 'delivered' where id = o_rev2;
  if exists (select 1 from public.pending_review_request_emails(100) where order_id = o_rev2) then
    raise exception 'FAIL R5: a guest order is pending';
  end if;
  passed := passed || 'R5'::text;

  -- R6: loyalty reward
  insert into public.loyalty_settings (id, is_active) values (true, true) on conflict (id) do update set is_active = true;
  insert into public.loyalty_cards (user_id, status, stamps_required, reward_percent, stamps_count, completed_at)
  values (m3, 'completed', 5, 10, 5, now() - interval '20 days') returning id into c1;
  insert into public.loyalty_cards (user_id, status, stamps_required, reward_percent, stamps_count, completed_at)
  values (m3, 'completed', 5, 15, 5, now() - interval '8 days') returning id into c2;
  select count(*) into v_cnt from public.pending_loyalty_reward_emails(100) where user_id = m3;
  if v_cnt <> 1 then raise exception 'FAIL R6: % loyalty reminders for one member (expected 1)', v_cnt; end if;
  select * into r from public.pending_loyalty_reward_emails(100) where user_id = m3;
  if r.card_id <> c1 or r.reward_percent <> 10 or r.email <> 'rem-m3.test@example.invalid' then
    raise exception 'FAIL R6: expected the oldest card: %', row_to_json(r);
  end if;
  update public.loyalty_cards set completed_at = now() - interval '3 days' where user_id = m3;
  if exists (select 1 from public.pending_loyalty_reward_emails(100) where user_id = m3) then
    raise exception 'FAIL R6: a card full for 3 days is pending';
  end if;
  update public.loyalty_cards set completed_at = now() - interval '8 days' where user_id = m3;
  update public.loyalty_settings set is_active = false;
  if exists (select 1 from public.pending_loyalty_reward_emails(100) where user_id = m3) then
    raise exception 'FAIL R6: pending while the programme is off';
  end if;
  update public.loyalty_settings set is_active = true;
  insert into public.email_log (event_key, template_key, locale, recipient_hash, status, sent_at)
  values ('loyalty_reward:' || gen_random_uuid(), 'loyalty_reward', 'fr',
          encode(extensions.digest('rem-m3.test@example.invalid', 'sha256'), 'hex'), 'sent', now() - interval '40 days');
  if exists (select 1 from public.pending_loyalty_reward_emails(100) where user_id = m3) then
    raise exception 'FAIL R6: a second loyalty reminder within 60 days is pending';
  end if;
  passed := passed || 'R6'::text;

  -- R7: the event key closes a row for good
  insert into public.email_log (event_key, template_key, locale, recipient_hash, status, sent_at, order_id)
  values ('abandoned_cart:' || o_ab, 'abandoned_cart', 'fr',
          encode(extensions.digest('someone-else@example.invalid', 'sha256'), 'hex'), 'sent', now(), o_ab);
  if exists (select 1 from public.pending_abandoned_cart_emails(100) where order_id = o_ab) then
    raise exception 'FAIL R7: an abandoned cart already e-mailed is pending';
  end if;
  insert into public.email_log (event_key, template_key, locale, recipient_hash, status, sent_at, order_id)
  values ('review_request:' || o_rev, 'review_request', 'en',
          encode(extensions.digest('someone-else@example.invalid', 'sha256'), 'hex'), 'failed', now(), o_rev);
  if not exists (select 1 from public.pending_review_request_emails(100) where order_id = o_rev) then
    raise exception 'FAIL R7: a failed attempt must be retried';
  end if;
  update public.email_log set status = 'sent' where event_key = 'review_request:' || o_rev;
  if exists (select 1 from public.pending_review_request_emails(100) where order_id = o_rev) then
    raise exception 'FAIL R7: a review request already e-mailed is pending';
  end if;
  passed := passed || 'R7'::text;

  -- R8: the API
  foreach v_ok in array array[false, true] loop
    if v_ok then
      perform set_config('role', 'authenticated', true);
      perform set_config('request.jwt.claims', json_build_object('aal', 'aal2', 'sub', m1, 'role', 'authenticated')::text, true);
    else
      perform set_config('role', 'anon', true);
      perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    end if;
    begin
      perform public.pending_abandoned_cart_emails(1);
      raise exception 'FAIL R8: pending_abandoned_cart_emails callable by the API';
    exception when insufficient_privilege then null;
    end;
    begin
      perform public.pending_review_request_emails(1);
      raise exception 'FAIL R8: pending_review_request_emails callable by the API';
    exception when insufficient_privilege then null;
    end;
    begin
      perform public.pending_loyalty_reward_emails(1);
      raise exception 'FAIL R8: pending_loyalty_reward_emails callable by the API';
    exception when insufficient_privilege then null;
    end;
    begin
      perform public.email_reminder_token('rem-m1.test@example.invalid');
      raise exception 'FAIL R8: email_reminder_token callable by the API';
    exception when insufficient_privilege then null;
    end;
    begin
      perform 1 from public.email_reminder_preferences;
      raise exception 'FAIL R8: the preferences are readable by the API';
    exception when insufficient_privilege then null;
    end;
    execute 'reset role';
  end loop;
  passed := passed || 'R8'::text;

  raise exception 'ALL EMAIL REMINDER TESTS PASSED: %', array_to_string(passed, ', ');
end;
$$;
