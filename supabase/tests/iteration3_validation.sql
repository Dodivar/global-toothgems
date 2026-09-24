-- =============================================================================
-- Iteration 3 validation suite — shipments, reviews, refunds.
-- =============================================================================
-- Requires all migrations + seed.sql. ONE transaction, ALWAYS rolled back by
-- raising `ALL ITERATION 3 TESTS PASSED` (or `FAIL: ...`).
-- =============================================================================

do $$
declare
  alice uuid := '00000000-0000-4000-a000-00000000a11c';
  bob   uuid := '00000000-0000-4000-a000-000000000b0b';
  admin uuid := '00000000-0000-4000-a000-0000000ad814';
  fr jsonb := '{"first_name":"Alice","last_name":"Test","address_line1":"1 rue Fictive","postal_code":"75004","city":"Paris","country_code":"FR"}';
  p_gel uuid; p_kit uuid; inv_gel uuid; inv_kit uuid; r_std uuid;
  o public.orders; o_bob public.orders;
  i_gel uuid; i_kit uuid; i_bob uuid;
  s1 uuid; s2 uuid;
  rv public.reviews; v_review uuid;
  rf public.refunds; rf2 public.refunds;
  v_cnt int; v_txt text; v_num numeric; v_state text;
  passed text[] := '{}';
begin
  insert into auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at) values
    (alice, 'authenticated', 'authenticated', 'alice.test@example.invalid', '{"first_name":"Alice","last_name":"Test"}', now(), now()),
    (bob,   'authenticated', 'authenticated', 'bob.test@example.invalid',   '{"first_name":"Bob"}', now(), now()),
    (admin, 'authenticated', 'authenticated', 'admin.test@example.invalid', '{"first_name":"Ada"}', now(), now());
  update public.profiles set role = 'admin' where id = admin;

  select id into p_gel from public.products where slug = 'gel-de-suivi';
  select id into p_kit from public.products where slug = 'kit-application-premium';
  select id into inv_gel from public.inventory_items where product_id = p_gel;
  select id into inv_kit from public.inventory_items where product_id = p_kit;
  select r.id into r_std from public.shipping_rates r join public.shipping_zones z on z.id = r.zone_id
   where z.name = 'France' and r.kind = 'standard';

  -- Paid order for Alice (2 gel + 1 kit), unpaid order for Bob --------------
  o := public.create_order(alice, 'alice.test@example.invalid', jsonb_build_array(
         jsonb_build_object('product_id', p_gel, 'quantity', 2),
         jsonb_build_object('product_id', p_kit, 'quantity', 1)), fr, fr, r_std);
  o := public.mark_order_paid(o.id, o.total_amount, 'EUR', 'cs_it3', 'pi_it3', 'card', 'visa', '4242');
  o_bob := public.create_order(bob, 'bob.test@example.invalid', jsonb_build_array(
         jsonb_build_object('product_id', p_gel, 'quantity', 1)), fr, fr, r_std);
  select id into i_gel from public.order_items where order_id = o.id and product_id = p_gel;
  select id into i_kit from public.order_items where order_id = o.id and product_id = p_kit;
  select id into i_bob from public.order_items where order_id = o_bob.id;
  if o.total_amount <> 291.90 or o.status <> 'confirmed' then raise exception 'FAIL setup: %', row_to_json(o); end if;

  -- ===========================================================================
  -- ALICE: cannot review before the parcel leaves
  -- ===========================================================================
  perform set_config('request.jwt.claims', json_build_object('sub', alice, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  v_state := null;
  begin
    insert into public.reviews (product_id, user_id, rating, title, body, language)
    values (p_gel, alice, 5, 'Top', 'Un gel très doux, parfait après la pose, je recommande.', 'fr');
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL R1: review before shipment (%)', v_state; end if;
  passed := array_append(passed, 'R1 no review before the order has shipped');

  -- ===========================================================================
  -- ADMIN: shipments
  -- ===========================================================================
  perform set_config('request.jwt.claims', json_build_object('sub', admin, 'role', 'authenticated')::text, true);

  v_state := null;
  begin
    insert into public.shipments (order_id) values (o_bob.id);
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '23514' then raise exception 'FAIL S1: unpaid order shipped (%)', v_state; end if;

  insert into public.shipments (order_id) values (o.id) returning id into s1;
  select * into o from public.orders where id = o.id;
  if o.fulfillment_status <> 'preparing' or o.status <> 'processing' then
    raise exception 'FAIL S2: preparing sync %/%', o.fulfillment_status, o.status;
  end if;

  insert into public.shipment_items (shipment_id, order_item_id, quantity) values (s1, i_gel, 1);
  v_state := null;
  begin
    insert into public.shipment_items (shipment_id, order_item_id, quantity) values (s1, i_kit, 5);
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '23514' then raise exception 'FAIL S3: over-shipping accepted (%)', v_state; end if;
  v_state := null;
  begin
    insert into public.shipment_items (shipment_id, order_item_id, quantity) values (s1, i_bob, 1);
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '23514' then raise exception 'FAIL S3: other order line accepted (%)', v_state; end if;

  v_state := null;
  begin
    update public.shipments set status = 'shipped' where id = s1;
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '23514' then raise exception 'FAIL S4: shipped without tracking (%)', v_state; end if;
  update public.shipments set status = 'shipped', carrier = 'Colissimo', tracking_number = '6A12345678901',
         tracking_url = 'https://www.laposte.fr/outils/suivre-vos-envois?code=6A12345678901',
         estimated_delivery = current_date + 2 where id = s1;
  select * into o from public.orders where id = o.id;
  if o.fulfillment_status <> 'partially_fulfilled' or o.status <> 'processing' then
    raise exception 'FAIL S4: partial sync %/%', o.fulfillment_status, o.status;
  end if;

  insert into public.shipments (order_id, status, carrier, tracking_number)
  values (o.id, 'preparing', 'Colissimo', '6A12345678902') returning id into s2;
  insert into public.shipment_items (shipment_id, order_item_id, quantity) values (s2, i_gel, 1), (s2, i_kit, 1);
  update public.shipments set status = 'shipped' where id = s2;
  select * into o from public.orders where id = o.id;
  if o.fulfillment_status <> 'fulfilled' or o.status <> 'shipped' then
    raise exception 'FAIL S5: full sync %/%', o.fulfillment_status, o.status;
  end if;

  v_state := null;
  begin
    delete from public.shipments where id = s1;
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL S6: shipped parcel deleted (%)', v_state; end if;
  passed := array_append(passed, 'S1-S6 shipments: paid orders only, no over-shipping, tracking required, order fulfilment/status synced, no deleting shipped parcels');

  -- ===========================================================================
  -- Customers and shipments
  -- ===========================================================================
  perform set_config('request.jwt.claims', json_build_object('sub', alice, 'role', 'authenticated')::text, true);
  select count(*) into v_cnt from public.shipments where order_id = o.id and tracking_number is not null;
  if v_cnt <> 2 then raise exception 'FAIL S7: customer cannot track own parcels (%)', v_cnt; end if;
  select count(*) into v_cnt from public.shipment_items si join public.shipments s on s.id = si.shipment_id where s.order_id = o.id;
  if v_cnt <> 3 then raise exception 'FAIL S7: customer cannot read parcel contents'; end if;
  v_state := null;
  begin
    insert into public.shipments (order_id) values (o.id);
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL S7: customer created a shipment (%)', v_state; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', bob, 'role', 'authenticated')::text, true);
  select count(*) into v_cnt from public.shipments;
  if v_cnt <> 0 then raise exception 'FAIL S7: Bob sees Alice parcels'; end if;
  passed := array_append(passed, 'S7 customers track their own parcels only, cannot create shipments');

  -- Delivered ------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', admin, 'role', 'authenticated')::text, true);
  update public.shipments set status = 'delivered' where id in (s1, s2);
  select * into o from public.orders where id = o.id;
  if o.status <> 'delivered' then raise exception 'FAIL S8: delivered sync %', o.status; end if;
  select count(*) into v_cnt from public.audit_logs where table_name = 'shipments' and record_id = s1::text;
  if v_cnt < 3 then raise exception 'FAIL S8: shipment history not audited (%)', v_cnt; end if;
  passed := array_append(passed, 'S8 all parcels delivered -> order delivered; shipment history audited');

  -- ===========================================================================
  -- REVIEWS
  -- ===========================================================================
  perform set_config('request.jwt.claims', json_build_object('sub', alice, 'role', 'authenticated')::text, true);
  insert into public.reviews (product_id, user_id, rating, title, body, language, tags,
                              status, helpful_count, published_at, order_id, author_name)
  values (p_gel, alice, 5, '  Parfait après la pose  ', 'Un gel très doux, parfait les jours qui suivent la pose. Je recommande !',
          'fr', array['quality', 'result'], 'published', 99, now(), null, 'Fake Name')
  returning * into rv;
  if rv.status <> 'pending' or rv.helpful_count <> 0 or rv.published_at is not null or not rv.is_verified
     or rv.order_id <> o.id or rv.author_name <> 'Alice T.' or rv.title <> 'Parfait après la pose' then
    raise exception 'FAIL R2: forged fields kept %', row_to_json(rv);
  end if;
  v_review := rv.id;
  v_state := null;
  begin
    insert into public.reviews (product_id, user_id, rating, title, body, language)
    values (p_gel, alice, 4, 'Encore', 'Deuxième avis sur le même produit, ce qui ne doit pas passer.', 'fr');
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '23505' then raise exception 'FAIL R3: second review accepted (%)', v_state; end if;
  v_state := null;
  begin
    insert into public.reviews (product_id, user_id, rating, title, body, language, tags)
    values (p_kit, alice, 4, 'Kit', 'Le kit est complet et bien pensé pour une pose en cabine.', 'fr', array['beginner']);
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '23514' then raise exception 'FAIL R5: course tag on product review (%)', v_state; end if;
  v_state := null;
  begin
    insert into public.reviews (product_id, user_id, rating, title, body, language)
    values (p_kit, alice, 4, 'Kit', 'Trop court.', 'fr');
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '23514' then raise exception 'FAIL R5: body under 30 characters (%)', v_state; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', bob, 'role', 'authenticated')::text, true);
  v_state := null;
  begin
    insert into public.reviews (product_id, user_id, rating, title, body, language)
    values (p_gel, bob, 1, 'Bof', 'Je n''ai jamais reçu ce produit mais je donne mon avis quand même.', 'fr');
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL R4: unverified review accepted (%)', v_state; end if;
  v_state := null;
  begin
    insert into public.reviews (product_id, user_id, rating, title, body, language)
    values (p_kit, alice, 1, 'Faux', 'Avis déposé au nom de quelqu''un d''autre, ce qui est interdit.', 'fr');
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL R4: review as another user (%)', v_state; end if;
  passed := array_append(passed, 'R2-R5 verified-only, one per product, forged fields reset, privacy name, tag/length rules');

  -- R6 visibility of a pending review
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  perform set_config('role', 'anon', true);
  select count(*) into v_cnt from public.reviews where id = v_review;
  if v_cnt <> 0 then raise exception 'FAIL R6: anon sees pending review'; end if;
  v_state := null;
  begin
    select user_id::text into v_txt from public.reviews limit 1;
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL R6: anon can read author account id (%)', v_state; end if;
  passed := array_append(passed, 'R6 pending reviews hidden from visitors; visitors cannot read account ids');

  -- R7 moderation
  perform set_config('request.jwt.claims', json_build_object('sub', admin, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  v_state := null;
  begin
    update public.reviews set body = 'Texte réécrit par l''équipe, ce qui ne doit jamais arriver ici.' where id = v_review;
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL R7: staff edited customer text (%)', v_state; end if;
  v_state := null;
  begin
    update public.reviews set status = 'rejected' where id = v_review;
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '23514' then raise exception 'FAIL R7: rejection without reason (%)', v_state; end if;
  update public.reviews set status = 'published', response_body = 'Merci Alice !' where id = v_review returning * into rv;
  if rv.published_at is null or rv.response_at is null or rv.response_by <> admin then
    raise exception 'FAIL R7: moderation stamps %', row_to_json(rv);
  end if;
  insert into public.review_notes (review_id, body) values (v_review, 'Cliente fidèle, avis authentique.');
  passed := array_append(passed, 'R7 staff publish/reply (stamped), cannot edit text, rejection needs a reason');

  -- R8 public display + stats
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  perform set_config('role', 'anon', true);
  select author_name into v_txt from public.reviews where id = v_review;
  if v_txt is distinct from 'Alice T.' then raise exception 'FAIL R8: published review not public'; end if;
  select review_count, average_rating into v_cnt, v_num from public.product_review_stats where product_id = p_gel;
  if v_cnt <> 1 or v_num <> 5.0 then raise exception 'FAIL R8: stats % / %', v_cnt, v_num; end if;
  passed := array_append(passed, 'R8 published review public with privacy name; rating stats');

  -- R9 helpful votes
  perform set_config('request.jwt.claims', json_build_object('sub', bob, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  insert into public.review_helpful_votes (review_id, user_id) values (v_review, bob);
  select helpful_count into v_cnt from public.reviews where id = v_review;
  if v_cnt <> 1 then raise exception 'FAIL R9: helpful count %', v_cnt; end if;
  v_state := null;
  begin
    insert into public.review_helpful_votes (review_id, user_id) values (v_review, bob);
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '23505' then raise exception 'FAIL R9: double vote (%)', v_state; end if;
  delete from public.review_helpful_votes where review_id = v_review and user_id = bob;
  select helpful_count into v_cnt from public.reviews where id = v_review;
  if v_cnt <> 0 then raise exception 'FAIL R9: vote withdrawal count %', v_cnt; end if;
  select count(*) into v_cnt from public.review_notes;
  if v_cnt <> 0 then raise exception 'FAIL R13: customer reads internal notes'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', alice, 'role', 'authenticated')::text, true);
  v_state := null;
  begin
    insert into public.review_helpful_votes (review_id, user_id) values (v_review, alice);
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL R9: author voted own review (%)', v_state; end if;
  passed := array_append(passed, 'R9/R13 helpful votes (one each, not on own review, counter kept); internal notes team-only');

  -- R10 reports
  v_state := null;
  begin
    insert into public.review_reports (review_id, reason) values (v_review, 'spam');
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL R10: author reported own review (%)', v_state; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', bob, 'role', 'authenticated')::text, true);
  insert into public.review_reports (review_id, reason, source, resolution, resolved_at)
  values (v_review, 'fake', 'team', 'kept', now());
  select count(*) into v_cnt from public.review_reports
   where review_id = v_review and reporter_id = bob and source = 'customer' and resolution is null;
  if v_cnt <> 1 then raise exception 'FAIL R10: forged report fields kept'; end if;
  v_state := null;
  begin
    insert into public.review_reports (review_id, reason) values (v_review, 'spam');
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '23505' then raise exception 'FAIL R10: duplicate report (%)', v_state; end if;
  select status into v_txt from public.reviews where id = v_review;
  if v_txt <> 'published' then raise exception 'FAIL R10: report changed the review'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', admin, 'role', 'authenticated')::text, true);
  update public.review_reports set resolution = 'hidden' where review_id = v_review;
  select status into v_txt from public.reviews where id = v_review;
  if v_txt <> 'hidden' then raise exception 'FAIL R10: hidden resolution not applied (%)', v_txt; end if;
  passed := array_append(passed, 'R10 reports: not on own review, one per customer, never change the review until resolved; "hidden" resolution applied');

  -- R11 author edits -> pending, cannot self-publish
  perform set_config('request.jwt.claims', json_build_object('sub', alice, 'role', 'authenticated')::text, true);
  v_state := null;
  begin
    update public.reviews set status = 'published' where id = v_review;
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL R11: author self-published (%)', v_state; end if;
  update public.reviews set rating = 4, body = 'Un gel très doux. Après deux semaines, toujours ravie du résultat.'
   where id = v_review returning * into rv;
  if rv.status <> 'pending' or rv.edited_at is null then raise exception 'FAIL R11: edit not re-moderated'; end if;
  passed := array_append(passed, 'R11 author edits go back to moderation; author cannot change status');

  -- R12 photos: private until published; photo change re-moderates
  insert into storage.objects (bucket_id, name, owner) values ('review-photos', alice::text || '/gel-1.jpg', alice);
  insert into public.review_photos (review_id, storage_path, alt_text, position)
  values (v_review, alice::text || '/gel-1.jpg', 'Gel appliqué', 0);
  v_state := null;
  begin
    insert into public.review_photos (review_id, storage_path, position) values (v_review, bob::text || '/x.jpg', 1);
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '23514' then raise exception 'FAIL R12: photo outside author folder (%)', v_state; end if;
  insert into public.review_photos (review_id, storage_path, position) values
    (v_review, alice::text || '/gel-2.jpg', 1), (v_review, alice::text || '/gel-3.jpg', 2), (v_review, alice::text || '/gel-4.jpg', 3);
  v_state := null;
  begin
    insert into public.review_photos (review_id, storage_path, position) values (v_review, alice::text || '/gel-5.jpg', 0);
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '23514' and v_state is distinct from '23505' then
    raise exception 'FAIL R12: fifth photo accepted (%)', v_state;
  end if;

  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  perform set_config('role', 'anon', true);
  select count(*) into v_cnt from storage.objects where bucket_id = 'review-photos';
  if v_cnt <> 0 then raise exception 'FAIL R12: unmoderated photo public'; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', admin, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  update public.reviews set status = 'published' where id = v_review;

  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  perform set_config('role', 'anon', true);
  select count(*) into v_cnt from storage.objects where bucket_id = 'review-photos';
  if v_cnt <> 1 then raise exception 'FAIL R12: published photo not readable (%)', v_cnt; end if;
  select with_photos_count into v_cnt from public.product_review_stats where product_id = p_gel;
  if v_cnt <> 1 then raise exception 'FAIL R12: with-photos stat'; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', alice, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  delete from public.review_photos where review_id = v_review and position = 3;
  select status into v_txt from public.reviews where id = v_review;
  if v_txt <> 'pending' then raise exception 'FAIL R12: photo change not re-moderated (%)', v_txt; end if;
  passed := array_append(passed, 'R12 photos: max 4, own folder, private until published, photo change re-moderates');

  execute 'reset role';
  select count(*) into v_cnt from public.audit_logs
   where table_name = 'reviews' and record_id = v_review::text and changes ? 'status';
  if v_cnt < 4 then raise exception 'FAIL R: moderation history (% entries)', v_cnt; end if;
  passed := array_append(passed, 'R history: every status change recorded in audit_logs');

  -- ===========================================================================
  -- REFUNDS
  -- ===========================================================================
  perform set_config('request.jwt.claims', json_build_object('sub', alice, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  v_state := null;
  begin
    perform public.request_refund(o.id, 10, 'requested_by_customer');
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL F1: customer requested a refund (%)', v_state; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', admin, 'role', 'authenticated')::text, true);
  v_state := null;
  begin
    perform public.request_refund(o.id, 300.00, 'goodwill');
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '23514' then raise exception 'FAIL F2: over-refund accepted (%)', v_state; end if;

  rf := public.request_refund(o.id, 19.00, 'return', jsonb_build_array(jsonb_build_object('order_item_id', i_gel, 'quantity', 1)), true);
  if rf.status <> 'pending' or rf.requested_by <> admin then raise exception 'FAIL F3: %', row_to_json(rf); end if;
  v_state := null;
  begin
    perform public.request_refund(o.id, 272.91, 'goodwill');   -- 291.90 - 19.00 pending = 272.90 max
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '23514' then raise exception 'FAIL F3: pending refunds not counted (%)', v_state; end if;
  v_state := null;
  begin
    perform public.request_refund(o.id, 5.00, 'return', jsonb_build_array(jsonb_build_object('order_item_id', i_gel, 'quantity', 2)));
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '23514' then raise exception 'FAIL F4: refunded more units than ordered (%)', v_state; end if;

  v_state := null;
  begin
    update public.refunds set status = 'succeeded' where id = rf.id;
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL F5: staff confirmed a refund (%)', v_state; end if;
  rf2 := public.request_refund(o.id, 1.00, 'goodwill');
  update public.refunds set status = 'cancelled' where id = rf2.id returning * into rf2;
  if rf2.processed_at is null then raise exception 'FAIL F5: cancel not stamped'; end if;
  v_state := null;
  begin
    update public.refunds set status = 'pending' where id = rf2.id;
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL F5: cancelled refund reopened (%)', v_state; end if;
  v_state := null;
  begin
    perform public.mark_refund_succeeded(rf.id, 're_test_1');
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL F10: staff called webhook function (%)', v_state; end if;
  passed := array_append(passed, 'F1-F5/F10 refunds: staff only, balance incl. pending, per-line quantities, confirmation backend-only, cancel final');

  -- F6 provider confirmation (backend)
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  perform set_config('role', 'service_role', true);
  rf := public.mark_refund_succeeded(rf.id, 're_test_1');
  rf := public.mark_refund_succeeded(rf.id, 're_test_1');   -- duplicate webhook
  select * into o from public.orders where id = o.id;
  select amount_refunded into v_num from public.payments where order_id = o.id;
  select quantity_on_hand into v_cnt from public.inventory_items where id = inv_gel;
  if rf.status <> 'succeeded' or v_num <> 19.00 or o.payment_status <> 'partially_refunded'
     or o.status <> 'delivered' or v_cnt <> 10 then     -- 11 - 2 sold + 1 returned
    raise exception 'FAIL F6: refunded % order %/% stock %', v_num, o.payment_status, o.status, v_cnt;
  end if;
  select count(*) into v_cnt from public.inventory_movements
   where order_id = o.id and movement_type = 'return' and on_hand_delta = 1;
  if v_cnt <> 1 then raise exception 'FAIL F6: return movement'; end if;
  v_state := null;
  begin
    perform public.mark_refund_failed(rf.id, 'late failure');
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL F9: succeeded refund failed later (%)', v_state; end if;
  passed := array_append(passed, 'F6/F9 confirmed refund updates payment + order, restocks returned lines (ledger), idempotent, final');

  -- F7 customer visibility
  perform set_config('request.jwt.claims', json_build_object('sub', alice, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  select count(*) into v_cnt from public.refunds where order_id = o.id;
  if v_cnt <> 2 then raise exception 'FAIL F7: customer refund list (%)', v_cnt; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', bob, 'role', 'authenticated')::text, true);
  select count(*) into v_cnt from public.refunds;
  if v_cnt <> 0 then raise exception 'FAIL F7: Bob sees Alice refunds'; end if;
  passed := array_append(passed, 'F7 customers see refunds on their own orders only');

  -- F8 full refund of the remainder
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  perform set_config('role', 'service_role', true);
  rf := public.request_refund(o.id, 272.90, 'requested_by_customer');
  rf := public.mark_refund_succeeded(rf.id, 're_test_2');
  select * into o from public.orders where id = o.id;
  select status into v_txt from public.payments where order_id = o.id;
  if o.payment_status <> 'refunded' or o.status <> 'refunded' or v_txt <> 'refunded' then
    raise exception 'FAIL F8: full refund %/%/%', o.payment_status, o.status, v_txt;
  end if;
  v_state := null;
  begin
    perform public.request_refund(o.id, 0.01, 'goodwill');
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from 'P0002' then raise exception 'FAIL F8: refund beyond total (%)', v_state; end if;
  passed := array_append(passed, 'F8 full refund -> payment and order "refunded"; nothing left to refund');

  -- R14 GDPR: author deletes own review
  perform set_config('request.jwt.claims', json_build_object('sub', alice, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  delete from public.reviews where id = v_review;
  get diagnostics v_cnt = row_count;
  if v_cnt <> 1 then raise exception 'FAIL R14: author cannot delete own review'; end if;
  passed := array_append(passed, 'R14 authors can delete their review (photos/votes/reports cascade)');

  execute 'reset role';
  execute 'set constraints all immediate';
  raise exception 'ALL ITERATION 3 TESTS PASSED (% groups, rolled back): %',
    cardinality(passed), array_to_string(passed, ' | ');
end;
$$;
