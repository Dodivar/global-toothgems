-- =============================================================================
-- Iteration 2 validation suite — checkout, stock, audit, i18n, shipping/VAT,
-- avatars, webhook idempotency.
-- =============================================================================
-- Requires all migrations + seed.sql. Runs in ONE transaction and ALWAYS rolls
-- back by raising `ALL ITERATION 2 TESTS PASSED` (or `FAIL: ...`).
-- Roles are impersonated like PostgREST does (role + request.jwt.claims).
-- =============================================================================

do $$
declare
  alice uuid := '00000000-0000-4000-a000-00000000a11c';
  bob   uuid := '00000000-0000-4000-a000-000000000b0b';
  admin uuid := '00000000-0000-4000-a000-0000000ad814';
  fr_addr jsonb := '{"first_name":"Alice","last_name":"Test","address_line1":"1 rue Fictive","postal_code":"75004","city":"Paris","country_code":"FR"}';
  de_addr jsonb := '{"first_name":"Alice","last_name":"Test","address_line1":"1 Beispielstraße","postal_code":"10115","city":"Berlin","country_code":"DE"}';
  p_star uuid; v_saphir uuid; inv_saphir uuid;
  p_gel uuid; inv_gel uuid;
  p_kit uuid; inv_kit uuid;
  p_opal uuid;
  p_draft uuid; p_archived uuid;
  r_fr_std uuid; r_fr_free uuid; r_fr_exp uuid; r_eu_std uuid; r_eu_exp uuid;
  o_a public.orders; o_c public.orders; o_d public.orders; o_e public.orders; o_f public.orders; o_g public.orders;
  v_inv public.inventory_items;
  v_cnt int; v_txt text; v_num numeric; v_state text; v_ok boolean;
  v_kit_on_hand int;   -- kit stock at start (the demo member seed may have sold some)
  passed text[] := '{}';
begin
  -- ---------------------------------------------------------------------------
  -- Fixtures
  -- ---------------------------------------------------------------------------
  insert into auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at) values
    (alice, 'authenticated', 'authenticated', 'alice.test@example.invalid', '{"first_name":"Alice"}', now(), now()),
    (bob,   'authenticated', 'authenticated', 'bob.test@example.invalid',   '{"first_name":"Bob"}',   now(), now()),
    (admin, 'authenticated', 'authenticated', 'admin.test@example.invalid', '{"first_name":"Ada"}',   now(), now());
  update public.profiles set role = 'admin' where id = admin;

  select id into p_star from public.products where slug = 'etoile-cristal';
  select id into v_saphir from public.product_variants where sku = 'GEM-STAR-001-SAP';
  select id into inv_saphir from public.inventory_items where variant_id = v_saphir;
  select id into p_gel from public.products where slug = 'gel-de-suivi';
  select id into inv_gel from public.inventory_items where product_id = p_gel;
  select id into p_kit from public.products where slug = 'kit-application-premium';
  select id, quantity_on_hand into inv_kit, v_kit_on_hand from public.inventory_items where product_id = p_kit;
  select id into p_opal from public.products where slug = 'goutte-opale';
  select id into p_draft from public.products where slug = 'kit-decouverte';
  select id into p_archived from public.products where slug = 'coffret-glitter-2025';
  select r.id into r_fr_std from public.shipping_rates r join public.shipping_zones z on z.id = r.zone_id
   where z.name = 'France' and r.kind = 'standard';
  select r.id into r_fr_free from public.shipping_rates r join public.shipping_zones z on z.id = r.zone_id
   where z.name = 'France' and r.kind = 'free';
  select r.id into r_fr_exp from public.shipping_rates r join public.shipping_zones z on z.id = r.zone_id
   where z.name = 'France' and r.kind = 'express';
  select r.id into r_eu_std from public.shipping_rates r join public.shipping_zones z on z.id = r.zone_id
   where z.name = 'Union européenne' and r.kind = 'standard';
  select r.id into r_eu_exp from public.shipping_rates r join public.shipping_zones z on z.id = r.zone_id
   where z.name = 'Union européenne' and r.kind = 'express';

  -- ---------------------------------------------------------------------------
  -- M. Shipping / VAT resolution
  -- ---------------------------------------------------------------------------
  if public.vat_rate_bp('FR') <> 2000 or public.vat_rate_bp('fr', 'books') <> 550
     or public.vat_rate_bp('FR', 'hygiene') <> 2000 or public.vat_rate_bp('US') <> 0
     or public.vat_rate_bp('IE') <> 0 then
    raise exception 'FAIL M: VAT resolution';
  end if;
  if public.vat_included(120.00, 2000) <> 20.00 or public.vat_included(19.00, 2000) <> 3.17 then
    raise exception 'FAIL M: vat_included rounding';
  end if;
  if public.shipping_zone_for_country('MC') <> (select id from public.shipping_zones where name = 'France')
     or public.shipping_zone_for_country('JP') is not null then
    raise exception 'FAIL M: zone resolution (MC -> France, JP -> none while rest-of-world inactive)';
  end if;
  passed := array_append(passed, 'M VAT (standard/reduced/fallback/inactive) and zone resolution');

  -- ===========================================================================
  -- SERVICE ROLE: checkout
  -- ===========================================================================
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  perform set_config('role', 'service_role', true);

  -- A. FR order: 2 × Étoile Saphir (32.00) + 1 × Gel (19.00), standard shipping 4.90
  o_a := public.create_order(alice, ' Alice.Test@Example.invalid ',
    jsonb_build_array(
      jsonb_build_object('product_id', p_star, 'variant_id', v_saphir, 'quantity', 2),
      jsonb_build_object('product_id', p_gel, 'quantity', 1)),
    fr_addr, fr_addr, r_fr_std, 'EUR', 'fr', '  Merci !  ');
  if o_a.subtotal_amount <> 83.00 or o_a.shipping_amount <> 4.90 or o_a.total_amount <> 87.90
     or o_a.tax_amount <> 14.66 or o_a.stock_state <> 'reserved' or o_a.status <> 'pending'
     or o_a.customer_email <> 'alice.test@example.invalid' or o_a.customer_note <> 'Merci !'
     or o_a.shipping_method_name <> 'Livraison standard' or o_a.tax_country_code <> 'FR'
     or o_a.expires_at is null then
    raise exception 'FAIL A: order A computed %', row_to_json(o_a);
  end if;
  select string_agg(product_name || coalesce('/' || variant_name, '') || ':' || unit_price || 'x' || quantity
                    || ':vat' || tax_amount, ', ' order by sku)
    into v_txt from public.order_items where order_id = o_a.id;
  if v_txt <> 'Gel de Suivi:19.00x1:vat3.17, Étoile Cristal/Saphir:32.00x2:vat10.67' then
    raise exception 'FAIL A: items %', v_txt;
  end if;
  select * into v_inv from public.inventory_items where id = inv_saphir;
  if v_inv.quantity_reserved <> 2 or v_inv.quantity_on_hand <> 4 or v_inv.stock_status <> 'low_stock' then
    raise exception 'FAIL A: saphir reservation %', row_to_json(v_inv);
  end if;
  select count(*) into v_cnt from public.inventory_movements
   where order_id = o_a.id and movement_type = 'reservation';
  if v_cnt <> 2 then raise exception 'FAIL A: % reservation movements', v_cnt; end if;
  passed := array_append(passed, 'A create_order: server prices, shipping, per-line VAT, snapshots, reservation + ledger');

  -- B. Rejections ---------------------------------------------------------------
  -- product with variants but no variant
  v_state := null;
  begin
    perform public.create_order(alice, 'a@b.fr', jsonb_build_array(jsonb_build_object('product_id', p_star, 'quantity', 1)),
                                fr_addr, fr_addr, r_fr_std);
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '22023' then raise exception 'FAIL B1: variant required (%)', v_state; end if;
  -- draft and archived products
  foreach v_txt in array array[p_draft::text, p_archived::text] loop
    v_state := null;
    begin
      perform public.create_order(alice, 'a@b.fr', jsonb_build_array(jsonb_build_object('product_id', v_txt, 'quantity', 1)),
                                  fr_addr, fr_addr, r_fr_std);
    exception when others then v_state := sqlstate;
    end;
    if v_state is distinct from 'P0002' then raise exception 'FAIL B2: non-active product sold (%)', v_state; end if;
  end loop;
  -- insufficient stock: 2 Saphir left available after order A
  v_state := null;
  begin
    perform public.create_order(bob, 'b@b.fr', jsonb_build_array(
      jsonb_build_object('product_id', p_star, 'variant_id', v_saphir, 'quantity', 3)), fr_addr, fr_addr, r_fr_std);
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from 'P0001' then raise exception 'FAIL B3: oversold reserved stock (%)', v_state; end if;
  -- French rate for a German address
  v_state := null;
  begin
    perform public.create_order(alice, 'a@b.fr', jsonb_build_array(jsonb_build_object('product_id', p_gel, 'quantity', 1)),
                                de_addr, de_addr, r_fr_std);
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from 'P0002' then raise exception 'FAIL B4: foreign-zone rate accepted (%)', v_state; end if;
  -- free shipping below its 75 € minimum
  v_state := null;
  begin
    perform public.create_order(alice, 'a@b.fr', jsonb_build_array(jsonb_build_object('product_id', p_gel, 'quantity', 1)),
                                fr_addr, fr_addr, r_fr_free);
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '22023' then raise exception 'FAIL B5: free rate below minimum (%)', v_state; end if;
  -- EU express max 2 kg: 3 kits = 2550 g
  v_state := null;
  begin
    perform public.create_order(alice, 'a@b.fr', jsonb_build_array(jsonb_build_object('product_id', p_kit, 'quantity', 3)),
                                de_addr, de_addr, r_eu_exp);
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '22023' then raise exception 'FAIL B6: weight bound ignored (%)', v_state; end if;
  -- wrong currency, disabled locale, missing shipping, duplicate line, bad quantity
  v_state := null;
  begin
    perform public.create_order(alice, 'a@b.fr', jsonb_build_array(jsonb_build_object('product_id', p_gel, 'quantity', 1)),
                                fr_addr, fr_addr, r_fr_std, 'GBP');
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '22023' then raise exception 'FAIL B7: currency mismatch (%)', v_state; end if;
  v_state := null;
  begin
    perform public.create_order(alice, 'a@b.fr', jsonb_build_array(jsonb_build_object('product_id', p_gel, 'quantity', 1)),
                                fr_addr, fr_addr, r_fr_std, 'EUR', 'it');
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '22023' then raise exception 'FAIL B8: disabled locale (%)', v_state; end if;
  v_state := null;
  begin
    perform public.create_order(alice, 'a@b.fr', jsonb_build_array(jsonb_build_object('product_id', p_gel, 'quantity', 1)),
                                fr_addr);
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '22023' then raise exception 'FAIL B9: physical order without shipping (%)', v_state; end if;
  v_state := null;
  begin
    perform public.create_order(alice, 'a@b.fr', jsonb_build_array(
      jsonb_build_object('product_id', p_gel, 'quantity', 1), jsonb_build_object('product_id', p_gel, 'quantity', 1)),
      fr_addr, fr_addr, r_fr_std);
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '22023' then raise exception 'FAIL B10: duplicate line (%)', v_state; end if;
  v_state := null;
  begin
    perform public.create_order(alice, 'a@b.fr', jsonb_build_array(jsonb_build_object('product_id', p_gel, 'quantity', 0)),
                                fr_addr, fr_addr, r_fr_std);
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '22023' then raise exception 'FAIL B11: zero quantity (%)', v_state; end if;
  passed := array_append(passed, 'B create_order rejects: missing variant, draft/archived, oversell, wrong zone, min order, weight, currency, locale, no shipping, duplicates, bad qty');

  -- C. DE order: 1 kit (249) — EU standard free over 120, DE VAT 19 %
  o_c := public.create_order(alice, 'alice.test@example.invalid',
    jsonb_build_array(jsonb_build_object('product_id', p_kit, 'quantity', 1)), de_addr, de_addr, r_eu_std, 'EUR', 'en');
  if o_c.shipping_amount <> 0 or o_c.total_amount <> 249.00 or o_c.tax_amount <> 39.76
     or o_c.tax_country_code <> 'DE' or o_c.locale <> 'en' then
    raise exception 'FAIL C: %', row_to_json(o_c);
  end if;
  passed := array_append(passed, 'C free-over threshold, destination VAT (DE 19 %), order locale');

  -- D. untracked made-to-order product: no reservation
  o_d := public.create_order(bob, 'bob.test@example.invalid',
    jsonb_build_array(jsonb_build_object('product_id', p_opal, 'quantity', 1)), fr_addr, fr_addr, r_fr_exp);
  if o_d.stock_state <> 'none' or o_d.total_amount <> 73.90 then
    raise exception 'FAIL D: %', row_to_json(o_d);
  end if;
  passed := array_append(passed, 'D untracked (preorder) product: accepted without reservation');

  -- E. Payment ------------------------------------------------------------------
  v_state := null;
  begin
    perform public.mark_order_paid(o_a.id, 80.00, 'EUR', 'cs_test_a');
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '22023' then raise exception 'FAIL E: wrong amount accepted (%)', v_state; end if;
  o_a := public.mark_order_paid(o_a.id, 87.90, 'eur', 'cs_test_a', 'pi_test_a', 'card', 'visa', '4242');
  select * into v_inv from public.inventory_items where id = inv_saphir;
  if o_a.payment_status <> 'paid' or o_a.status <> 'confirmed' or o_a.stock_state <> 'committed'
     or o_a.paid_at is null or v_inv.quantity_on_hand <> 2 or v_inv.quantity_reserved <> 0 then
    raise exception 'FAIL E: after payment order=% inv=%', row_to_json(o_a), row_to_json(v_inv);
  end if;
  o_a := public.mark_order_paid(o_a.id, 87.90, 'EUR', 'cs_test_a', 'pi_test_a');   -- duplicate webhook
  select count(*) into v_cnt from public.payments where order_id = o_a.id;
  if v_cnt <> 1 then raise exception 'FAIL E: duplicate webhook created % payments', v_cnt; end if;
  select count(*) into v_cnt from public.inventory_movements where order_id = o_a.id and movement_type = 'sale';
  if v_cnt <> 2 then raise exception 'FAIL E: % sale movements', v_cnt; end if;
  passed := array_append(passed, 'E mark_order_paid: amount check, stock committed, idempotent, payment recorded');

  -- O. Webhook idempotency table
  insert into public.stripe_webhook_events (id, type, object_id, order_id)
  values ('evt_test_1', 'checkout.session.completed', 'cs_test_a', o_a.id);
  insert into public.stripe_webhook_events (id, type) values ('evt_test_1', 'checkout.session.completed')
  on conflict (id) do update set attempts = public.stripe_webhook_events.attempts + 1;
  select attempts into v_cnt from public.stripe_webhook_events where id = 'evt_test_1';
  if v_cnt <> 2 then raise exception 'FAIL O: webhook dedup'; end if;
  passed := array_append(passed, 'O Stripe event dedup (one row per event id, attempts counted)');

  -- ===========================================================================
  -- Customers
  -- ===========================================================================
  perform set_config('request.jwt.claims', json_build_object('sub', alice, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);

  v_state := null;
  begin
    perform public.create_order(alice, 'a@b.fr', jsonb_build_array(jsonb_build_object('product_id', p_gel, 'quantity', 1)),
                                fr_addr, fr_addr, r_fr_std);
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL F: customer called create_order (%)', v_state; end if;
  v_state := null;
  begin
    perform public.cancel_order(o_c.id, 'je change d''avis');
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL F: customer cancelled via RPC (%)', v_state; end if;
  v_state := null;
  begin
    perform public.mark_order_paid(o_c.id, 249.00, 'EUR', 'cs_fake');
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL F: customer marked order paid (%)', v_state; end if;
  v_state := null;
  begin
    insert into public.stripe_webhook_events (id, type) values ('evt_forged', 'x');
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL F: customer wrote webhook events (%)', v_state; end if;
  select count(*) into v_cnt from public.inventory_movements;
  if v_cnt <> 0 then raise exception 'FAIL F: customer reads stock ledger'; end if;
  select count(*) into v_cnt from public.audit_logs;
  if v_cnt <> 0 then raise exception 'FAIL F: customer reads audit log'; end if;
  select count(*) into v_cnt from public.order_items where order_id = o_a.id and tax_amount > 0;
  if v_cnt <> 2 then raise exception 'FAIL F: customer cannot read own VAT lines'; end if;
  passed := array_append(passed, 'F customers cannot create/cancel/pay orders, forge webhooks, read ledger or audit log');

  -- N. Avatars storage policies
  insert into storage.objects (bucket_id, name, owner) values ('avatars', alice::text || '/avatar.png', alice);
  v_state := null;
  begin
    insert into storage.objects (bucket_id, name, owner) values ('avatars', bob::text || '/avatar.png', alice);
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL N: wrote into another user folder (%)', v_state; end if;
  v_state := null;
  begin
    insert into storage.objects (bucket_id, name, owner) values ('product-media', 'products/hack.jpg', alice);
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL N: customer uploaded product media (%)', v_state; end if;
  update public.profiles set avatar_path = alice::text || '/avatar.png' where id = alice;
  v_state := null;
  begin
    update public.profiles set avatar_path = bob::text || '/avatar.png' where id = alice;
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '23514' then raise exception 'FAIL N: avatar_path outside own folder (%)', v_state; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', bob, 'role', 'authenticated')::text, true);
  select count(*) into v_cnt from storage.objects where bucket_id = 'avatars';
  if v_cnt <> 0 then raise exception 'FAIL N: Bob reads Alice avatar'; end if;
  passed := array_append(passed, 'N avatars: own folder only, private to owner, product-media admin-only, path constraint');

  -- ===========================================================================
  -- Visitors: translations and shipping config
  -- ===========================================================================
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  perform set_config('role', 'anon', true);
  select name into v_txt from public.product_translations
   where product_id = p_star and locale = 'en';
  if v_txt is distinct from 'Crystal Star Tooth Gem' then raise exception 'FAIL L: anon cannot read EN translation'; end if;
  select count(*) into v_cnt from public.product_translations where product_id in (p_draft, p_archived);
  if v_cnt <> 0 then raise exception 'FAIL L: anon reads translations of non-active products'; end if;
  select count(*) into v_cnt from public.languages where code = 'it';
  if v_cnt <> 0 then raise exception 'FAIL L: anon sees disabled language'; end if;
  select count(*) into v_cnt from public.shipping_rates r join public.shipping_zones z on z.id = r.zone_id
   where z.is_rest_of_world;
  if v_cnt <> 0 then raise exception 'FAIL M: anon sees rates of inactive zone'; end if;
  select count(*) into v_cnt from public.shipping_rates where not is_active;
  if v_cnt <> 0 then raise exception 'FAIL M: anon sees inactive rates'; end if;
  select count(*) into v_cnt from public.tax_rates where country_code = 'IE';
  if v_cnt <> 0 then raise exception 'FAIL M: anon sees inactive VAT rate'; end if;
  passed := array_append(passed, 'L/M visitors read published translations and active shipping/VAT only');

  -- ===========================================================================
  -- Admin
  -- ===========================================================================
  perform set_config('request.jwt.claims', json_build_object('sub', admin, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);

  -- L. translation workflow
  insert into public.product_translations (product_id, locale, name, slug, status)
  values (p_star, 'de', 'Kristallstern', 'kristallstern', 'draft');
  v_state := null;
  begin
    insert into public.product_translations (product_id, locale, name) values (p_gel, 'fr', 'Doublon');
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '23514' then raise exception 'FAIL L: default-locale translation accepted (%)', v_state; end if;
  v_state := null;
  begin
    insert into public.product_translations (product_id, locale, name, slug)
    values (p_gel, 'en', 'x', 'crystal-star-tooth-gem');
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '23505' then raise exception 'FAIL L: duplicate localized slug (%)', v_state; end if;

  -- F. cancellation
  v_state := null;
  begin
    perform public.cancel_order(o_a.id, 'test');
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL G: paid order cancelled (%)', v_state; end if;
  o_c := public.cancel_order(o_c.id, 'Client injoignable');
  select * into v_inv from public.inventory_items where id = inv_kit;
  if o_c.status <> 'cancelled' or o_c.stock_state <> 'released' or o_c.cancelled_at is null
     or v_inv.quantity_reserved <> 0 or v_inv.quantity_on_hand <> v_kit_on_hand then
    raise exception 'FAIL G: cancel % inv %', row_to_json(o_c), row_to_json(v_inv);
  end if;
  o_c := public.cancel_order(o_c.id);   -- idempotent
  passed := array_append(passed, 'G admin cancel releases reservation; paid orders cannot be cancelled; idempotent');

  -- I. admin marks a bank transfer as received: stock committed by trigger
  perform set_config('role', 'service_role', true);
  o_e := public.create_order(bob, 'bob.test@example.invalid',
    jsonb_build_array(jsonb_build_object('product_id', p_gel, 'quantity', 2)), fr_addr, fr_addr, r_fr_std);
  perform set_config('role', 'authenticated', true);
  update public.orders set payment_status = 'paid' where id = o_e.id returning * into o_e;
  select * into v_inv from public.inventory_items where id = inv_gel;
  if o_e.stock_state <> 'committed' or o_e.status <> 'confirmed'
     or v_inv.quantity_on_hand <> 8 or v_inv.quantity_reserved <> 0 then   -- 11 - 1 (A) - 2 (E)
    raise exception 'FAIL I: manual payment % inv %', row_to_json(o_e), row_to_json(v_inv);
  end if;
  v_state := null;
  begin
    update public.orders set stock_state = 'released' where id = o_e.id;
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL I: admin edited stock_state (%)', v_state; end if;
  passed := array_append(passed, 'I admin-marked payment commits stock via trigger; lifecycle columns immutable');

  -- K. manual stock adjustment is ledgered with its author
  update public.inventory_items set quantity_on_hand = quantity_on_hand + 10 where id = inv_kit;
  select count(*) into v_cnt from public.inventory_movements
   where inventory_item_id = inv_kit and movement_type = 'adjustment' and on_hand_delta = 10 and actor_id = admin;
  if v_cnt <> 1 then raise exception 'FAIL K: adjustment not ledgered'; end if;
  passed := array_append(passed, 'K manual stock adjustment recorded in ledger with actor');

  -- J. audit log
  update public.profiles set status = 'suspended' where id = bob;
  update public.products set price = 21.00 where id = p_gel;
  update public.orders set fulfillment_status = 'preparing', status = 'processing' where id = o_a.id;
  select count(*) into v_cnt from public.audit_logs
   where actor_id = admin and table_name = 'profiles' and record_id = bob::text
     and changes -> 'status' ->> 'new' = 'suspended';
  if v_cnt <> 1 then raise exception 'FAIL J: account moderation not audited'; end if;
  select count(*) into v_cnt from public.audit_logs
   where table_name = 'products' and record_id = p_gel::text and changes -> 'price' ->> 'old' = '19.00';
  if v_cnt <> 1 then raise exception 'FAIL J: price change not audited'; end if;
  select count(*) into v_cnt from public.audit_logs
   where table_name = 'orders' and record_id = o_a.id::text and changes ? 'fulfillment_status';
  if v_cnt <> 1 then raise exception 'FAIL J: order change not audited'; end if;
  select count(*) into v_cnt from public.audit_logs
   where table_name = 'orders' and record_id = o_c.id::text and changes -> 'status' ->> 'new' = 'cancelled' and actor_id = admin;
  if v_cnt <> 1 then raise exception 'FAIL J: cancellation not audited'; end if;
  v_state := null;
  begin
    delete from public.audit_logs;
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL J: admin deleted audit log (%)', v_state; end if;
  passed := array_append(passed, 'J audit log: moderation, price, order state, cancellation; append-only even for admins');

  -- ===========================================================================
  -- H. Expiry and late payment (backend)
  -- ===========================================================================
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  o_f := public.create_order(alice, 'alice.test@example.invalid',
    jsonb_build_array(jsonb_build_object('product_id', p_kit, 'quantity', 2)), fr_addr, fr_addr, r_fr_std);
  o_g := public.create_order(alice, 'alice.test@example.invalid',
    jsonb_build_array(jsonb_build_object('product_id', p_star, 'variant_id', v_saphir, 'quantity', 2)), fr_addr, fr_addr, r_fr_std);
  update public.orders set expires_at = now() - interval '1 minute' where id in (o_f.id, o_g.id);
  v_cnt := public.expire_stale_orders();
  if v_cnt <> 2 then raise exception 'FAIL H: expired % orders', v_cnt; end if;
  select * into o_f from public.orders where id = o_f.id;
  select * into v_inv from public.inventory_items where id = inv_kit;
  if o_f.status <> 'cancelled' or o_f.stock_state <> 'released' or o_f.cancellation_reason <> 'expired'
     or v_inv.quantity_reserved <> 0 then
    raise exception 'FAIL H: expiry % inv %', row_to_json(o_f), row_to_json(v_inv);
  end if;
  -- late payment with stock still available -> order revived and stock taken
  o_f := public.mark_order_paid(o_f.id, o_f.total_amount, 'EUR', 'cs_late_ok');
  select * into v_inv from public.inventory_items where id = inv_kit;
  if o_f.status <> 'confirmed' or o_f.stock_state <> 'committed' or o_f.cancelled_at is not null
     or v_inv.quantity_on_hand <> v_kit_on_hand + 10 - 2 then
    raise exception 'FAIL H: late payment % inv %', row_to_json(o_f), row_to_json(v_inv);
  end if;
  -- late payment when the stock is gone -> flagged, never oversold
  update public.inventory_items set quantity_on_hand = 0 where id = inv_saphir;
  o_g := public.mark_order_paid(o_g.id, o_g.total_amount, 'EUR', 'cs_late_short');
  select * into v_inv from public.inventory_items where id = inv_saphir;
  if o_g.payment_status <> 'paid' or o_g.status <> 'pending' or o_g.stock_state <> 'released'
     or o_g.admin_note not like '[auto]%' or v_inv.quantity_on_hand <> 0 then
    raise exception 'FAIL H: short late payment % inv %', row_to_json(o_g), row_to_json(v_inv);
  end if;
  passed := array_append(passed, 'H expiry releases stock; late payment re-takes stock or flags the order (no oversell)');

  execute 'set constraints all immediate';   -- all deferred subtotal checks hold

  raise exception 'ALL ITERATION 2 TESTS PASSED (% groups, rolled back): %',
    cardinality(passed), array_to_string(passed, ' | ');
end;
$$;
