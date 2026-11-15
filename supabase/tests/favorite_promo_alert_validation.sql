-- =============================================================================
-- Favourite promotion alert validation suite (migration 20261115180000_favorite_promo_alert_email)
-- =============================================================================
-- Proves (decision 148):
--
--   FP1 every switch off (the migration's default) → nothing pending;
--   FP2 consent decides: a member with marketing_opt_in, or a newsletter
--       subscription on their address, is listed; one without is not;
--   FP3 what is announced is the database's own reduction: price, reference
--       price (the lowest of the 30 days before) and percentage as
--       storefront_price_references() computes them;
--   FP4 only a favourite added BEFORE the reduction started, only a reduction
--       that started within the window, only a product that can be bought;
--   FP5 a series is announced once per member and product
--       (record_favorite_promo_alerts), idempotently; a new reduction later is
--       a new series;
--   FP6 an address that stopped the reminders gets nothing, and so does one
--       that already got a promotion e-mail in the last 7 days;
--   FP7 the API reaches none of it (functions and table).
--
-- Fabricated history is inserted as the database owner (the API cannot).
-- ONE transaction, ALWAYS rolled back by raising `ALL FAVORITE PROMO ALERT TESTS PASSED`
-- (or `FAIL: ...`).
-- =============================================================================

do $$
declare
  m1 uuid := '00000000-0000-4000-a000-000000480001'; -- marketing_opt_in, favourite before the cut
  m2 uuid := '00000000-0000-4000-a000-000000480002'; -- no consent
  m3 uuid := '00000000-0000-4000-a000-000000480003'; -- newsletter only
  m4 uuid := '00000000-0000-4000-a000-000000480004'; -- consent, favourite added after the cut
  m5 uuid := '00000000-0000-4000-a000-000000480005'; -- consent, stopped the reminders
  t  timestamptz := now();
  v_cat uuid;
  pa uuid; -- 25 % off since 2 days, in stock
  pb uuid; -- 25 % off since 10 days (outside the 7-day window)
  pc uuid; -- 25 % off since 2 days, out of stock
  pd uuid; -- a second, later reduction for the same member (series two)
  r record;
  v_cnt int;
  v_items jsonb;
  v_key text;
  v_state text;
  passed text[] := '{}';
begin
  select id into v_cat from public.categories order by position, slug limit 1;

  insert into auth.users (id, aud, role, email, created_at, updated_at)
  values (m1, 'authenticated', 'authenticated', 'fp-m1.test@example.invalid', now(), now()),
         (m2, 'authenticated', 'authenticated', 'fp-m2.test@example.invalid', now(), now()),
         (m3, 'authenticated', 'authenticated', 'fp-m3.test@example.invalid', now(), now()),
         (m4, 'authenticated', 'authenticated', 'fp-m4.test@example.invalid', now(), now()),
         (m5, 'authenticated', 'authenticated', 'fp-m5.test@example.invalid', now(), now());
  update public.profiles set marketing_opt_in = true, first_name = 'Camille' where id in (m1, m4, m5);
  insert into public.newsletter_subscriptions (email, locale, status, source, policy_version, confirmed_at, opt_in_method)
  values ('fp-m3.test@example.invalid', 'en', 'subscribed', 'home', 'test', now(), 'captcha');
  update public.profiles set preferred_locale = 'en' where id = m3;

  insert into public.products (category_id, name, slug, price, currency, status, product_type)
  values (v_cat, 'Promo A', 'fp-test-a', 20, 'EUR', 'active', 'physical') returning id into pa;
  insert into public.products (category_id, name, slug, price, currency, status, product_type)
  values (v_cat, 'Promo B', 'fp-test-b', 20, 'EUR', 'active', 'physical') returning id into pb;
  insert into public.products (category_id, name, slug, price, currency, status, product_type)
  values (v_cat, 'Promo C', 'fp-test-c', 20, 'EUR', 'active', 'physical') returning id into pc;
  insert into public.products (category_id, name, slug, price, currency, status, product_type)
  values (v_cat, 'Promo D', 'fp-test-d', 40, 'EUR', 'active', 'physical') returning id into pd;

  -- Stock: A, B and D on the shelf, C sold out.
  insert into public.inventory_items (product_id, quantity_on_hand)
  select x.id, x.qty from (values (pa, 50), (pb, 50), (pc, 0), (pd, 50)) as x(id, qty)
   where not exists (select 1 from public.inventory_items i where i.product_id = x.id);
  update public.inventory_items set quantity_on_hand = 50, quantity_reserved = 0 where product_id in (pa, pb, pd);
  update public.inventory_items set quantity_on_hand = 0, quantity_reserved = 0 where product_id = pc;

  -- List price history: 20 (D: 40) for 60 days, then a 25 % cut.
  delete from public.price_history where product_id in (pa, pb, pc, pd);
  insert into public.price_history (product_id, price, currency, valid_from)
  values (pa, 20, 'EUR', t - interval '60 days'), (pb, 20, 'EUR', t - interval '60 days'),
         (pc, 20, 'EUR', t - interval '60 days'), (pd, 40, 'EUR', t - interval '60 days');
  insert into public.price_cut_history (product_id, source, source_id, discount_type, discount_value, currency, valid_from)
  values (pa, 'promotion', gen_random_uuid(), 'percentage', 25, 'EUR', t - interval '2 days'),
         (pb, 'promotion', gen_random_uuid(), 'percentage', 25, 'EUR', t - interval '10 days'),
         (pc, 'promotion', gen_random_uuid(), 'percentage', 25, 'EUR', t - interval '2 days');

  -- Favourites, added 20 days ago (before every cut) unless said otherwise.
  insert into public.wishlist_items (user_id, product_id, created_at)
  values (m1, pa, t - interval '20 days'), (m1, pb, t - interval '20 days'), (m1, pc, t - interval '20 days'),
         (m2, pa, t - interval '20 days'),
         (m3, pa, t - interval '20 days'),
         (m4, pa, t - interval '1 day'),            -- added after the cut started
         (m5, pa, t - interval '20 days');

  insert into public.email_reminder_preferences (recipient_hash, opted_out_at)
  values (private.email_address_hash('fp-m5.test@example.invalid'), now());

  -- FP1 ---------------------------------------------------------------------------
  update private.email_reminder_settings set favorite_promo_enabled = false, favorite_promo_window_days = 7;
  select count(*) into v_cnt from public.pending_favorite_promo_emails(100) where user_id in (m1, m2, m3, m4, m5);
  if v_cnt <> 0 then raise exception 'FAIL FP1: % alerts pending while off', v_cnt; end if;
  update private.email_reminder_settings set favorite_promo_enabled = true;
  passed := passed || 'FP1'::text;

  -- FP2 ---------------------------------------------------------------------------
  select count(*) into v_cnt from public.pending_favorite_promo_emails(100) where user_id = m2;
  if v_cnt <> 0 then raise exception 'FAIL FP2: a member without consent is listed'; end if;
  select * into r from public.pending_favorite_promo_emails(100) where user_id = m1;
  if r.user_id is null then raise exception 'FAIL FP2: the consenting member is not listed'; end if;
  if r.email <> 'fp-m1.test@example.invalid' or r.first_name <> 'Camille' or r.locale <> 'fr' then
    raise exception 'FAIL FP2: wrong recipient fields %', row_to_json(r);
  end if;
  select * into r from public.pending_favorite_promo_emails(100) where user_id = m3;
  if r.user_id is null then raise exception 'FAIL FP2: the newsletter subscriber is not listed'; end if;
  if r.locale <> 'en' then raise exception 'FAIL FP2: the subscriber''s language was lost (%)', r.locale; end if;
  passed := passed || 'FP2'::text;

  -- FP3: only A is listed for m1 (B outside the window, C sold out), with the database's figures.
  select * into r from public.pending_favorite_promo_emails(100) where user_id = m1;
  if jsonb_array_length(r.items) <> 1 then raise exception 'FAIL FP3: % items for m1 (%)', jsonb_array_length(r.items), r.items; end if;
  if (r.items -> 0 ->> 'product_id')::uuid <> pa
     or (r.items -> 0 ->> 'price')::numeric <> 15
     or (r.items -> 0 ->> 'reference_price')::numeric <> 20
     or (r.items -> 0 ->> 'discount_percent')::int <> 25
     or (r.items -> 0 ->> 'currency') <> 'EUR'
     or (r.items -> 0 ->> 'slug') <> 'fp-test-a'
     or (r.items -> 0 ->> 'name') <> 'Promo A' then
    raise exception 'FAIL FP3: %', r.items;
  end if;
  if r.event_key not like 'favorite_promo:' || m1::text || ':%' then raise exception 'FAIL FP3: event key %', r.event_key; end if;
  v_items := r.items; v_key := r.event_key;
  passed := passed || 'FP3'::text;

  -- FP4: a favourite added after the cut (m4), the window, a sold-out product.
  select count(*) into v_cnt from public.pending_favorite_promo_emails(100) where user_id = m4;
  if v_cnt <> 0 then raise exception 'FAIL FP4: a favourite added after the reduction is announced'; end if;
  update private.email_reminder_settings set favorite_promo_window_days = 14;
  select * into r from public.pending_favorite_promo_emails(100) where user_id = m1;
  if jsonb_array_length(r.items) <> 2 then raise exception 'FAIL FP4: a wider window should list B too (%)', r.items; end if;
  update private.email_reminder_settings set favorite_promo_window_days = 7;
  if exists (select 1 from public.pending_favorite_promo_emails(100) p, jsonb_array_elements(p.items) i
              where (i ->> 'product_id')::uuid = pc) then
    raise exception 'FAIL FP4: a sold-out product is announced';
  end if;
  passed := passed || 'FP4'::text;

  -- FP5: record → never again; idempotent; a new reduction is a new series.
  if public.record_favorite_promo_alerts(m1, v_items) <> 1 then raise exception 'FAIL FP5: first record should write one row'; end if;
  if public.record_favorite_promo_alerts(m1, v_items) <> 0 then raise exception 'FAIL FP5: record is not idempotent'; end if;
  select count(*) into v_cnt from public.pending_favorite_promo_emails(100) where user_id = m1;
  if v_cnt <> 0 then raise exception 'FAIL FP5: an announced series is listed again'; end if;
  -- A fresh reduction on D (favourite older than it) is a new series for m1.
  insert into public.wishlist_items (user_id, product_id, created_at) values (m1, pd, t - interval '20 days');
  insert into public.price_cut_history (product_id, source, source_id, discount_type, discount_value, currency, valid_from)
  values (pd, 'promotion', gen_random_uuid(), 'percentage', 10, 'EUR', t - interval '1 day');
  select * into r from public.pending_favorite_promo_emails(100) where user_id = m1;
  if r.user_id is null or jsonb_array_length(r.items) <> 1 or (r.items -> 0 ->> 'product_id')::uuid <> pd then
    raise exception 'FAIL FP5: the new reduction on D is not announced alone (%)', r.items;
  end if;
  passed := passed || 'FP5'::text;

  -- FP6: opt-out and the weekly cap.
  select count(*) into v_cnt from public.pending_favorite_promo_emails(100) where user_id = m5;
  if v_cnt <> 0 then raise exception 'FAIL FP6: an address that stopped the reminders is listed'; end if;
  insert into public.email_log (event_key, template_key, locale, recipient_hash, status, sent_at)
  values ('favorite_promo:' || m1::text || ':earlier', 'favorite_promo', 'fr',
          private.email_address_hash('fp-m1.test@example.invalid'), 'sent', now() - interval '2 days');
  select count(*) into v_cnt from public.pending_favorite_promo_emails(100) where user_id = m1;
  if v_cnt <> 0 then raise exception 'FAIL FP6: a second promotion e-mail within a week'; end if;
  passed := passed || 'FP6'::text;

  -- FP7: the API reaches none of it.
  foreach v_state in array array['anon', 'authenticated'] loop
    perform set_config('role', v_state, true);
    perform set_config('request.jwt.claims', json_build_object('aal', 'aal2', 'sub', m1, 'role', v_state)::text, true);
    begin
      perform public.pending_favorite_promo_emails(1);
      raise exception 'FAIL FP7: pending_favorite_promo_emails callable as %', v_state;
    exception when insufficient_privilege then null;
    end;
    begin
      perform public.record_favorite_promo_alerts(m1, '[]'::jsonb);
      raise exception 'FAIL FP7: record_favorite_promo_alerts callable as %', v_state;
    exception when insufficient_privilege then null;
    end;
    begin
      perform 1 from public.favorite_promo_alerts;
      raise exception 'FAIL FP7: favorite_promo_alerts readable as %', v_state;
    exception when insufficient_privilege then null;
    end;
    execute 'reset role';
  end loop;
  passed := passed || 'FP7'::text;

  raise exception 'ALL FAVORITE PROMO ALERT TESTS PASSED: %', array_to_string(passed, ', ');
end;
$$;
