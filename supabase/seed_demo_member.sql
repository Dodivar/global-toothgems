-- =============================================================================
-- Seed — demo member account (fictional, development only)
-- =============================================================================
-- One authenticated member whose data mirrors the member-area prototype
-- (webapp/src/lib/auth.tsx DEMO_POSTAL, data/orders.ts, data/reviewSystem.ts
-- DEMO_CUSTOMER, data/loyalty.ts "collecting" state), built ONLY through the
-- real server paths: sign-up trigger, create_order(), mark_order_paid(),
-- cancel_order(), shipments. Totals, VAT, stock and loyalty stamps are
-- therefore computed by the database, not typed here.
--
--   Camille Bernard <camille.bernard@example.com>  (example.com: reserved, never delivered)
--   * profile: FR, artist, interested in everything, French, newsletter opt-in
--   * address book: default shipping + billing, Angers
--   * consents: terms + privacy + marketing at sign-up, cookie choices
--   * orders: delivered (April), cancelled unpaid (May), delivered (July),
--     shipped with tracking (September)  → 3 loyalty stamps out of 5
--   * reviews: published, needs changes, rejected; 2 products still to review
--   * an expired personal-data export; a CRM tag and an internal note
--
-- The account has NO password: nothing secret lives in Git. To sign in with it
-- on a development project, set one from the SQL editor:
--   update auth.users set encrypted_password = extensions.crypt('<your password>', extensions.gen_salt('bf'))
--    where id = 'c4a11e00-0000-4000-a000-000000000001';
--
-- Training (courses, enrolments, certificates) is intentionally absent.
-- Idempotent: does nothing when the demo member already exists.
-- Prerequisites: all migrations + seed.sql (catalogue, shipping, VAT).
-- Stock: uses products the validation suites do not assert on.
-- =============================================================================

do $$
declare
  v_user   uuid := 'c4a11e00-0000-4000-a000-000000000001';
  v_email  text := 'camille.bernard@example.com';
  v_addr   jsonb := '{"first_name":"Camille","last_name":"Bernard","address_line1":"18 rue des Lices","postal_code":"49100","city":"Angers","country_code":"FR","phone":"+33 6 12 34 56 78"}';
  v_rate   uuid;
  p_charm uuid; v_charm2 uuid;
  p_pince uuid;
  p_kit   uuid;
  p_caps  uuid; v_caps50 uuid;
  p_star  uuid; v_crystal uuid;
  o_apr public.orders; o_may public.orders; o_jul public.orders; o_sep public.orders;
  v_ship uuid;
begin
  if exists (select 1 from auth.users where id = v_user) then
    raise notice 'demo member already seeded, skipping';
    return;
  end if;

  select r.id into v_rate from public.shipping_rates r join public.shipping_zones z on z.id = r.zone_id
   where z.name = 'France' and r.kind = 'standard';
  select id into p_charm from public.products where slug = 'charm-etoile-or-18k';
  select id into v_charm2 from public.product_variants where sku = 'GEM-GOLD-004-2MM';
  select id into p_pince from public.products where slug = 'pince-de-depose';
  select id into p_kit   from public.products where slug = 'kit-application-premium';
  select id into p_caps  from public.products where slug = 'capsules-steriles';
  select id into v_caps50 from public.product_variants where sku = 'ACC-CAP-009-50';
  select id into p_star  from public.products where slug = 'etoile-cristal';
  select id into v_crystal from public.product_variants where sku = 'GEM-STAR-001-CRY';
  if v_rate is null or v_charm2 is null or p_pince is null or p_kit is null or v_caps50 is null or v_crystal is null then
    raise exception 'demo member seed: run seed.sql first (catalogue or shipping rate missing)';
  end if;

  -- ---------------------------------------------------------------------------
  -- Account: through auth.users so the sign-up trigger builds the profile and
  -- records the registration consents exactly as for a real sign-up.
  -- ---------------------------------------------------------------------------
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                          confirmation_token, recovery_token, email_change_token_new, email_change)
  values ('00000000-0000-0000-0000-000000000000', v_user, 'authenticated', 'authenticated', v_email, '',
          '2026-03-01 09:12:00+01',
          '{"provider":"email","providers":["email"]}',
          jsonb_build_object('first_name', 'Camille', 'last_name', 'Bernard', 'phone', '+33 6 12 34 56 78',
                             'country', 'FR', 'locale', 'fr', 'persona', 'artist', 'interest', 'all',
                             'terms_accepted', 'true', 'marketing', 'true', 'policy_version', '2026-03'),
          '2026-03-01 09:10:00+01', '2026-03-01 09:12:00+01', '', '', '', '');

  insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (v_user::text, v_user,
          jsonb_build_object('sub', v_user::text, 'email', v_email, 'email_verified', true),
          'email', null, '2026-03-01 09:10:00+01', '2026-03-01 09:10:00+01');

  update public.profiles
     set birth_date = '1994-05-22', created_at = '2026-03-01 09:10:00+01'
   where id = v_user;
  update public.consent_records set created_at = '2026-03-01 09:10:00+01' where user_id = v_user;

  -- Cookie banner choice made on the first visit after signing in.
  insert into public.consent_records (user_id, purpose, granted, policy_version, source, created_at) values
    (v_user, 'cookies_preferences', true,  'cookies-2026-03', 'cookie_banner', '2026-03-01 09:14:00+01'),
    (v_user, 'cookies_analytics',   false, 'cookies-2026-03', 'cookie_banner', '2026-03-01 09:14:00+01'),
    (v_user, 'cookies_marketing',   false, 'cookies-2026-03', 'cookie_banner', '2026-03-01 09:14:00+01');

  -- Address book (profile form: one delivery address; billing identical).
  insert into public.customer_addresses
    (user_id, address_type, is_default, label, first_name, last_name, address_line1, postal_code, city, country_code, phone, created_at)
  values
    (v_user, 'shipping', true, 'Studio', 'Camille', 'Bernard', '18 rue des Lices', '49100', 'Angers', 'FR', '+33 6 12 34 56 78', '2026-03-01 09:20:00+01'),
    (v_user, 'billing',  true, 'Studio', 'Camille', 'Bernard', '18 rue des Lices', '49100', 'Angers', 'FR', '+33 6 12 34 56 78', '2026-03-01 09:20:00+01');

  -- ---------------------------------------------------------------------------
  -- Orders, through the checkout functions (prices, VAT, stock computed there)
  -- ---------------------------------------------------------------------------
  -- April: 18k gold charm, delivered.
  o_apr := public.create_order(v_user, v_email,
             jsonb_build_array(jsonb_build_object('product_id', p_charm, 'variant_id', v_charm2, 'quantity', 1)),
             v_addr, v_addr, v_rate, 'EUR', 'fr');
  o_apr := public.mark_order_paid(o_apr.id, o_apr.total_amount, 'EUR', 'cs_demo_camille_0402', 'pi_demo_camille_0402',
                                  'card', 'visa', '4242');

  -- May: tweezers, abandoned at payment and cancelled (reservation released).
  o_may := public.create_order(v_user, v_email,
             jsonb_build_array(jsonb_build_object('product_id', p_pince, 'quantity', 1)),
             v_addr, v_addr, v_rate, 'EUR', 'fr');
  o_may := public.cancel_order(o_may.id, 'Paiement non finalisé par la cliente');

  -- July: premium kit + sterile capsules, delivered.
  o_jul := public.create_order(v_user, v_email,
             jsonb_build_array(jsonb_build_object('product_id', p_kit, 'quantity', 1),
                               jsonb_build_object('product_id', p_caps, 'variant_id', v_caps50, 'quantity', 1)),
             v_addr, v_addr, v_rate, 'EUR', 'fr');
  o_jul := public.mark_order_paid(o_jul.id, o_jul.total_amount, 'EUR', 'cs_demo_camille_0702', 'pi_demo_camille_0702',
                                  'card', 'mastercard', '5454');

  -- September: 2 crystal stars + tweezers, shipped, in transit.
  o_sep := public.create_order(v_user, v_email,
             jsonb_build_array(jsonb_build_object('product_id', p_star, 'variant_id', v_crystal, 'quantity', 2),
                               jsonb_build_object('product_id', p_pince, 'quantity', 1)),
             v_addr, v_addr, v_rate, 'EUR', 'fr');
  o_sep := public.mark_order_paid(o_sep.id, o_sep.total_amount, 'EUR', 'cs_demo_camille_0909', 'pi_demo_camille_0909',
                                  'card', 'visa', '4242');

  -- Parcels (order status/fulfilment follow automatically).
  insert into public.shipments (order_id, carrier, service, tracking_number, tracking_url, estimated_delivery, created_at)
  values (o_apr.id, 'Colissimo', 'Colissimo Domicile', '6A198830412FR',
          'https://www.laposte.fr/outils/suivre-vos-envois?code=6A198830412FR', '2026-04-06', '2026-04-03 10:00:00+02')
  returning id into v_ship;
  insert into public.shipment_items (shipment_id, order_item_id, quantity)
  select v_ship, i.id, i.quantity from public.order_items i where i.order_id = o_apr.id;
  update public.shipments set status = 'shipped', shipped_at = '2026-04-03 16:30:00+02' where id = v_ship;
  update public.shipments set status = 'delivered', delivered_at = '2026-04-06 11:05:00+02' where id = v_ship;

  insert into public.shipments (order_id, carrier, service, tracking_number, tracking_url, estimated_delivery, created_at)
  values (o_jul.id, 'Chronopost', 'Chrono 13', 'XY884170023FR',
          'https://www.chronopost.fr/tracking-no-cms/suivi-page?listeNumerosLT=XY884170023FR', '2026-07-04', '2026-07-02 14:00:00+02')
  returning id into v_ship;
  insert into public.shipment_items (shipment_id, order_item_id, quantity)
  select v_ship, i.id, i.quantity from public.order_items i where i.order_id = o_jul.id;
  update public.shipments set status = 'shipped', shipped_at = '2026-07-02 17:45:00+02' where id = v_ship;
  update public.shipments set status = 'delivered', delivered_at = '2026-07-03 12:20:00+02' where id = v_ship;

  insert into public.shipments (order_id, carrier, service, tracking_number, tracking_url, estimated_delivery, created_at)
  values (o_sep.id, 'Colissimo', 'Colissimo Domicile', '6A214930571FR',
          'https://www.laposte.fr/outils/suivre-vos-envois?code=6A214930571FR', '2026-09-17', '2026-09-10 09:30:00+02')
  returning id into v_ship;
  insert into public.shipment_items (shipment_id, order_item_id, quantity)
  select v_ship, i.id, i.quantity from public.order_items i where i.order_id = o_sep.id;
  update public.shipments set status = 'shipped', shipped_at = '2026-09-10 15:10:00+02' where id = v_ship;

  -- Back-date the history (the functions stamp "now"). Trusted backend only.
  update public.orders set created_at = '2026-04-02 18:24:00+02', paid_at = '2026-04-02 18:26:00+02', expires_at = null where id = o_apr.id;
  update public.orders set created_at = '2026-05-18 21:02:00+02', cancelled_at = '2026-05-18 22:02:00+02', expires_at = null where id = o_may.id;
  update public.orders set created_at = '2026-07-02 10:41:00+02', paid_at = '2026-07-02 10:43:00+02', expires_at = null where id = o_jul.id;
  update public.orders set created_at = '2026-09-09 20:15:00+02', paid_at = '2026-09-09 20:16:00+02', expires_at = null where id = o_sep.id;
  update public.payments set created_at = o.paid_at from public.orders o where o.id = payments.order_id and o.user_id = v_user;
  update public.loyalty_stamps s set earned_at = o.paid_at from public.orders o where o.id = s.order_id and s.user_id = v_user;
  update public.loyalty_cards set created_at = '2026-04-02 18:26:00+02' where user_id = v_user;

  -- ---------------------------------------------------------------------------
  -- Reviews (verified by the delivered orders)
  -- ---------------------------------------------------------------------------
  insert into public.reviews (product_id, user_id, order_id, rating, title, body, language, tags, status,
                              submitted_at, published_at, created_at)
  values (p_kit, v_user, private.review_verifying_order(v_user, p_kit), 5,
          'Parfait pour démarrer en cabine',
          'Tout est là : adhésif, mordançage, outils de pose et gems. J’ai fait mes six premières poses avec ce kit sans rien racheter. Les instructions sont claires et bien illustrées.',
          'fr', array['easy', 'quality', 'value'], 'published',
          '2026-07-10 18:40:00+02', '2026-07-11 09:15:00+02', '2026-07-10 18:40:00+02');

  insert into public.reviews (product_id, user_id, order_id, rating, title, body, language, tags, status,
                              changes_request, submitted_at, created_at)
  values (p_caps, v_user, private.review_verifying_order(v_user, p_caps), 4,
          'Pratiques et bien scellées',
          'Les capsules arrivent bien scellées et se rangent facilement. Ma cliente Léa Moreau a adoré voir que tout était stérile devant elle !',
          'fr', array['quality'], 'needs_changes',
          'Merci pour votre avis ! Pourriez-vous retirer le nom de votre cliente ? Nous publierons ensuite votre avis.',
          '2026-09-12 17:30:00+02', '2026-09-12 17:30:00+02');

  insert into public.reviews (product_id, user_id, order_id, rating, title, body, language, tags, status,
                              rejection_reason, submitted_at, created_at)
  values (p_charm, v_user, private.review_verifying_order(v_user, p_charm), 4,
          'Mes clientes adorent ce charm',
          'Très beau rendu sur l’incisive, mes clientes l’adorent. Pour une pose, écrivez-moi directement au 06 12 34 56 78, je me déplace aussi à domicile.',
          'fr', array['quality', 'result'], 'rejected', 'personal',
          '2026-09-18 10:22:00+02', '2026-09-18 10:22:00+02');

  -- ---------------------------------------------------------------------------
  -- Security & privacy: an old export whose download window has closed
  -- ---------------------------------------------------------------------------
  insert into public.data_export_requests (user_id, status, requested_at, ready_at, expires_at)
  values (v_user, 'expired', '2026-04-10 08:00:00+02', '2026-04-10 08:12:00+02', '2026-04-17 08:12:00+02');

  -- ---------------------------------------------------------------------------
  -- Back office (never visible to the member)
  -- ---------------------------------------------------------------------------
  insert into public.customer_tags (user_id, tag, created_at) values (v_user, 'repeat', '2026-07-03 09:00:00+02');
  insert into public.customer_notes (user_id, body, created_at)
  values (v_user, 'Artiste installée à Angers, commande pour son studio. Préfère Colissimo.', '2026-07-03 09:05:00+02');

  raise notice 'demo member seeded: % (orders %, %, %, %)', v_email,
    o_apr.order_number, o_may.order_number, o_jul.order_number, o_sep.order_number;
end;
$$;
