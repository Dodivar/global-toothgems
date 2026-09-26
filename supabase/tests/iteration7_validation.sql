-- =============================================================================
-- Iteration 7 validation suite — public pages and customer service.
-- =============================================================================
-- C*: contact requests (tickets), N*: newsletter, E*: e-mail templates,
-- P*: content pages, S*: store settings / maintenance.
-- Requires all migrations + seed.sql. ONE transaction, ALWAYS rolled back by
-- raising `ALL ITERATION 7 TESTS PASSED` (or `FAIL: ...`).
-- =============================================================================

do $$
declare
  adm   uuid := '00000000-0000-4000-a000-00000007ad81';
  mgr   uuid := '00000000-0000-4000-a000-000000070001';
  vwr   uuid := '00000000-0000-4000-a000-000000070003';
  alice uuid := '00000000-0000-4000-a000-00000007a11c';
  bob   uuid := '00000000-0000-4000-a000-000000070b0b';
  carol uuid := '00000000-0000-4000-a000-00000007ca01';
  fr jsonb := '{"first_name":"Alice","last_name":"Test","address_line1":"1 rue Fictive","postal_code":"75004","city":"Paris","country_code":"FR"}';
  p_gel uuid; r_std uuid;
  o_alice public.orders; o_bob public.orders;
  v_ticket text; v_req public.contact_requests; v_res jsonb; v_token text; v_page uuid; v_tpl uuid;
  v_cnt int; v_bool boolean; v_txt text; v_state text; v_ts timestamptz;
  passed text[] := '{}';
begin
  -- ===========================================================================
  -- Fixtures
  -- ===========================================================================
  insert into auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at) values
    (adm,   'authenticated', 'authenticated', 'adm7.test@example.invalid',   '{"first_name":"Ada"}',   now(), now()),
    (mgr,   'authenticated', 'authenticated', 'mgr7.test@example.invalid',   '{"first_name":"Mia"}',   now(), now()),
    (vwr,   'authenticated', 'authenticated', 'vwr7.test@example.invalid',   '{"first_name":"Val"}',   now(), now()),
    (alice, 'authenticated', 'authenticated', 'alice7.test@example.invalid', '{"first_name":"Alice"}', now(), now()),
    (bob,   'authenticated', 'authenticated', 'bob7.test@example.invalid',   '{"first_name":"Bob"}',   now(), now());
  update public.profiles set role = 'admin'   where id = adm;
  update public.profiles set role = 'manager' where id = mgr;
  update public.profiles set role = 'viewer'  where id = vwr;
  select id into p_gel from public.products where slug = 'gel-de-suivi';
  select r.id into r_std from public.shipping_rates r join public.shipping_zones z on z.id = r.zone_id
   where z.name = 'France' and r.kind = 'standard';
  o_alice := public.create_order(alice, 'alice7.test@example.invalid',
               jsonb_build_array(jsonb_build_object('product_id', p_gel, 'quantity', 1)), fr, fr, r_std);
  o_bob := public.create_order(bob, 'bob7.test@example.invalid',
             jsonb_build_array(jsonb_build_object('product_id', p_gel, 'quantity', 1)), fr, fr, r_std);
  insert into storage.objects (bucket_id, name, owner) values
    ('contact-attachments', bob::text || '/photo.jpg', bob),
    ('contact-attachments', 'guest/ticket.pdf', null);

  -- ===========================================================================
  -- C1 who may submit
  -- ===========================================================================
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  v_state := null;
  begin
    perform public.submit_contact_request('Eve', 'eve@example.invalid', 'other', 'Hello', 'A message long enough to pass.');
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL C1: visitors call the RPC directly (%)', v_state; end if;
  passed := array_append(passed, 'C1 visitors go through the server route (no direct RPC)');

  -- ===========================================================================
  -- C2 members: own order linked, fields validated, throttled
  -- ===========================================================================
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', alice, 'role', 'authenticated')::text, true);
  v_ticket := public.submit_contact_request('Alice Test', ' ALICE7.test@example.invalid ', 'order', 'Changer mon adresse',
                'Bonjour, puis-je changer l''adresse de livraison ?', lower(o_alice.order_number), 'en');
  select * into v_req from public.contact_requests where ticket_number = v_ticket;
  if v_ticket !~ '^SUP-[0-9]+$' or v_req.user_id <> alice or v_req.order_id <> o_alice.id or v_req.status <> 'new'
     or v_req.email <> 'alice7.test@example.invalid' or v_req.locale <> 'en' or v_req.priority <> 'normal' then
    raise exception 'FAIL C2: %', row_to_json(v_req);
  end if;
  v_ticket := public.submit_contact_request('Alice Test', 'alice7.test@example.invalid', 'order', 'Commande de Bob',
                'Je tape le numéro de commande de quelqu''un d''autre.', o_bob.order_number);
  select order_id, order_reference into v_txt, v_state from public.contact_requests where ticket_number = v_ticket;
  if v_txt is not null or v_state <> o_bob.order_number then raise exception 'FAIL C2: someone else''s order linked'; end if;
  foreach v_txt in array array['short', 'category'] loop
    v_state := null;
    begin
      perform public.submit_contact_request('Alice', 'alice7.test@example.invalid',
                case when v_txt = 'category' then 'complaint' else 'other' end, 'Sujet',
                case when v_txt = 'short' then 'Trop court' else 'Un message suffisamment long pour passer.' end);
    exception when others then v_state := sqlstate;
    end;
    if v_state is distinct from '22023' then raise exception 'FAIL C2: invalid % accepted (%)', v_txt, v_state; end if;
  end loop;
  v_ticket := public.submit_contact_request('Alice', 'alice7.test@example.invalid', 'privacy', 'Mes données',
                'Je souhaite connaître les données que vous détenez sur moi.');
  select priority into v_txt from public.contact_requests where ticket_number = v_ticket;
  if v_txt <> 'high' then raise exception 'FAIL C2: privacy requests should be high priority'; end if;
  v_state := null;
  begin
    perform public.submit_contact_request('Alice', 'alice7.test@example.invalid', 'other', 'Encore',
              'Un quatrième message en moins de dix minutes.');
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from 'PT429' then raise exception 'FAIL C2: not throttled (%)', v_state; end if;
  passed := array_append(passed, 'C2 members: e-mail normalised, own order linked (never someone else''s), fields validated, privacy = high, 3 per 10 min');

  -- ===========================================================================
  -- C3 attachments
  -- ===========================================================================
  perform set_config('request.jwt.claims', json_build_object('sub', bob, 'role', 'authenticated')::text, true);
  foreach v_txt in array array[alice::text || '/x.pdf', 'guest/ticket.pdf', bob::text || '/missing.jpg'] loop
    v_state := null;
    begin
      perform public.submit_contact_request('Bob', 'bob7.test@example.invalid', 'product', 'Photo',
                'Voici une photo du produit reçu abîmé.', null, 'fr', v_txt);
    exception when others then v_state := sqlstate;
    end;
    if v_state is distinct from '42501' then raise exception 'FAIL C3: attachment % accepted (%)', v_txt, v_state; end if;
  end loop;
  v_ticket := public.submit_contact_request('Bob', 'bob7.test@example.invalid', 'product', 'Photo',
                'Voici une photo du produit reçu abîmé.', null, 'fr', bob::text || '/photo.jpg');
  passed := array_append(passed, 'C3 attachments: own uploaded file only');

  -- ===========================================================================
  -- C4 guests through the server (service role)
  -- ===========================================================================
  perform set_config('role', 'service_role', true);
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  v_ticket := public.submit_contact_request('Bob invité', 'Bob7.Test@example.invalid', 'delivery', 'Colis',
                'Mon colis n''est pas arrivé, pouvez-vous vérifier ?', o_bob.order_number, 'fr', 'guest/ticket.pdf');
  select * into v_req from public.contact_requests where ticket_number = v_ticket;
  if v_req.user_id is not null or v_req.order_id <> o_bob.id then raise exception 'FAIL C4: guest order match %', row_to_json(v_req); end if;
  v_ticket := public.submit_contact_request('Eve', 'eve7@example.invalid', 'delivery', 'Colis',
                'Je devine un numéro de commande qui n''est pas à moi.', o_bob.order_number);
  select order_id into v_txt from public.contact_requests where ticket_number = v_ticket;
  if v_txt is not null then raise exception 'FAIL C4: guest linked to a stranger''s order'; end if;
  v_state := null;
  begin
    perform public.submit_contact_request('Eve', 'eve7@example.invalid', 'other', 'Pièce jointe',
              'Je joins le fichier d''un membre.', null, 'fr', bob::text || '/photo.jpg');
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL C4: guest used a member file (%)', v_state; end if;
  passed := array_append(passed, 'C4 guests: order linked only with the same e-mail, guest/ attachments only');

  -- ===========================================================================
  -- C5 visibility and triage
  -- ===========================================================================
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', alice, 'role', 'authenticated')::text, true);
  select count(*) into v_cnt from public.contact_requests;
  if v_cnt <> 3 then raise exception 'FAIL C5: alice sees % tickets', v_cnt; end if;
  update public.contact_requests set status = 'closed';
  get diagnostics v_cnt = row_count;
  if v_cnt <> 0 then raise exception 'FAIL C5: customer changed a ticket'; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', vwr, 'role', 'authenticated')::text, true);
  select count(*) into v_cnt from public.contact_requests where email like '%7%';
  if v_cnt < 6 then raise exception 'FAIL C5: read-only staff sees % tickets', v_cnt; end if;
  update public.contact_requests set status = 'open' where user_id = alice;
  get diagnostics v_cnt = row_count;
  if v_cnt <> 0 then raise exception 'FAIL C5: read-only staff triaged'; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', mgr, 'role', 'authenticated')::text, true);
  select * into v_req from public.contact_requests where user_id = alice and category = 'privacy';
  update public.contact_requests set status = 'open', assigned_to = vwr where id = v_req.id returning * into v_req;
  if v_req.first_response_at is null or v_req.assigned_to <> vwr then raise exception 'FAIL C5: triage %', row_to_json(v_req); end if;
  foreach v_txt in array array[
    format('update public.contact_requests set message = %L where id = %L', 'Réécrit par l''équipe du support.', v_req.id),
    format('update public.contact_requests set assigned_to = %L where id = %L', alice, v_req.id)] loop
    v_state := null;
    begin
      execute v_txt;
    exception when others then v_state := sqlstate;
    end;
    if v_state not in ('42501', '23514') or v_state is null then raise exception 'FAIL C5: accepted % (%)', v_txt, v_state; end if;
  end loop;
  update public.contact_requests set status = 'resolved' where id = v_req.id returning * into v_req;
  if v_req.resolved_at is null then raise exception 'FAIL C5: resolution not stamped'; end if;
  insert into public.contact_request_notes (request_id, author_id, body) values (v_req.id, adm, 'Export envoyé.');
  select author_id::text into v_txt from public.contact_request_notes where request_id = v_req.id;
  if v_txt <> mgr::text then raise exception 'FAIL C5: note author forged'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', alice, 'role', 'authenticated')::text, true);
  select count(*) into v_cnt from public.contact_request_notes;
  if v_cnt <> 0 then raise exception 'FAIL C5: customer reads internal notes'; end if;
  execute 'reset role';
  select count(*) into v_cnt from public.audit_logs where table_name = 'contact_requests' and record_id = v_req.id::text;
  if v_cnt <> 2 then raise exception 'FAIL C5: triage not audited (%)', v_cnt; end if;
  passed := array_append(passed, 'C5 customers read their own tickets; read-only staff read all; support triages (stamped, audited), never rewrites; notes internal');

  -- ===========================================================================
  -- N1 newsletter: server-only subscribe, double opt-in, unsubscribe
  -- ===========================================================================
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', bob, 'role', 'authenticated')::text, true);
  v_state := null;
  begin
    perform public.newsletter_subscribe('x7@example.invalid', 'fr', 'footer', '2026-09');
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL N1: browser subscribed directly (%)', v_state; end if;

  perform set_config('role', 'service_role', true);
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  foreach v_txt in array array['not-an-email', ''] loop
    v_state := null;
    begin
      perform public.newsletter_subscribe(nullif(v_txt, ''), 'fr', 'footer', case when v_txt = '' then null else '2026-09' end);
    exception when others then v_state := sqlstate;
    end;
    if v_state is distinct from '22023' then raise exception 'FAIL N1: invalid subscribe accepted (%)', v_state; end if;
  end loop;
  v_res := public.newsletter_subscribe(' Guest7@Example.invalid ', 'en', 'home', '2026-09');
  v_token := v_res ->> 'confirm_token';
  if v_res ->> 'status' <> 'pending' or v_token !~ '^[0-9a-f]{48}$' then raise exception 'FAIL N1: %', v_res; end if;

  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  if public.newsletter_confirm(repeat('0', 48)) then raise exception 'FAIL N1: wrong token confirmed'; end if;
  if not public.newsletter_confirm(v_token) then raise exception 'FAIL N1: confirmation failed'; end if;
  if public.newsletter_confirm(v_token) then raise exception 'FAIL N1: token reused'; end if;
  execute 'reset role';
  select status, unsubscribe_token into v_txt, v_token from public.newsletter_subscriptions where email = 'guest7@example.invalid';
  if v_txt <> 'subscribed' then raise exception 'FAIL N1: status %', v_txt; end if;

  perform set_config('role', 'service_role', true);
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  v_res := public.newsletter_subscribe('guest7@example.invalid', 'en', 'home', '2026-09');
  if v_res <> '{"status": "subscribed"}'::jsonb then raise exception 'FAIL N1: resubscribe %', v_res; end if;
  perform public.newsletter_subscribe('guest7@example.invalid', 'en', 'home', '2026-09');
  v_state := null;
  begin
    perform public.newsletter_subscribe('guest7@example.invalid', 'en', 'home', '2026-09');
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from 'PT429' then raise exception 'FAIL N1: not throttled (%)', v_state; end if;

  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  if not public.newsletter_unsubscribe(v_token) then raise exception 'FAIL N1: unsubscribe failed'; end if;
  execute 'reset role';
  select status into v_txt from public.newsletter_subscriptions where email = 'guest7@example.invalid';
  if v_txt <> 'unsubscribed' then raise exception 'FAIL N1: unsubscribe status %', v_txt; end if;
  passed := array_append(passed, 'N1 subscribe server-only (validated, throttled, no enumeration), double opt-in token single use, one-click unsubscribe');

  -- ===========================================================================
  -- N2 members: consent records and the list stay in step
  -- ===========================================================================
  perform set_config('role', 'service_role', true);
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  v_token := public.newsletter_subscribe('alice7.test@example.invalid', 'fr', 'footer', '2026-09') ->> 'confirm_token';
  perform public.newsletter_confirm(v_token);
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  select marketing_opt_in into v_bool from public.profiles where id = alice;
  select count(*) into v_cnt from public.consent_records where user_id = alice and source = 'newsletter' and granted;
  select user_id::text into v_txt from public.newsletter_subscriptions where email = 'alice7.test@example.invalid';
  if not v_bool or v_cnt <> 1 or v_txt <> alice::text then
    raise exception 'FAIL N2: confirmed member e-mail (opt-in %, consents %, linked %)', v_bool, v_cnt, v_txt;
  end if;

  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', alice, 'role', 'authenticated')::text, true);
  insert into public.consent_records (user_id, purpose, granted, policy_version, source)
  values (alice, 'marketing_email', false, '2026-09', 'account');
  select status into v_txt from public.newsletter_subscriptions where user_id = alice;
  if v_txt <> 'unsubscribed' then raise exception 'FAIL N2: account withdrawal not applied (%)', v_txt; end if;
  select count(*) into v_cnt from public.newsletter_subscriptions;
  if v_cnt <> 1 then raise exception 'FAIL N2: member sees % list rows', v_cnt; end if;
  v_state := null;
  begin
    select unsubscribe_token into v_txt from public.newsletter_subscriptions where user_id = alice;
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL N2: token readable (%)', v_state; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', bob, 'role', 'authenticated')::text, true);
  insert into public.consent_records (user_id, purpose, granted, policy_version, source)
  values (bob, 'marketing_email', true, '2026-09', 'account');
  execute 'reset role';
  select status into v_txt from public.newsletter_subscriptions where user_id = bob;
  if v_txt <> 'subscribed' then raise exception 'FAIL N2: account opt-in not listed (%)', v_txt; end if;

  -- a visitor who confirmed, then creates an account with the same e-mail
  perform set_config('role', 'service_role', true);
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  perform public.newsletter_confirm(public.newsletter_subscribe('carol7.test@example.invalid', 'fr', 'home', '2026-09') ->> 'confirm_token');
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  insert into auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values (carol, 'authenticated', 'authenticated', 'carol7.test@example.invalid', '{"first_name":"Carol"}', now(), now());
  select marketing_opt_in into v_bool from public.profiles where id = carol;
  select user_id::text into v_txt from public.newsletter_subscriptions where email = 'carol7.test@example.invalid';
  if not v_bool or v_txt <> carol::text then raise exception 'FAIL N2: sign-up not linked (%, %)', v_bool, v_txt; end if;
  passed := array_append(passed, 'N2 member e-mail confirmed -> consent recorded; account opt-in/out moves the list; sign-up links a confirmed visitor; tokens never readable');

  -- ===========================================================================
  -- E1 e-mail templates and translations
  -- ===========================================================================
  select id into v_tpl from public.email_templates where key = 'order_confirmation';
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', mgr, 'role', 'authenticated')::text, true);
  v_state := null;
  begin
    insert into public.email_template_translations (template_id, locale, subject, body)
    values (v_tpl, 'de', 'Bestellung {{order_number}} von {{shop_owner}}', 'Hallo {{first_name}}');
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '23514' then raise exception 'FAIL E1: unknown placeholder accepted (%)', v_state; end if;
  insert into public.email_template_translations (template_id, locale, subject, body)
  values (v_tpl, 'de', 'Ihre Bestellung {{order_number}} ist bestätigt', 'Hallo {{first_name}}, danke für Ihre Bestellung.');
  select state into v_txt from public.translation_status where item_id = v_tpl and locale = 'de';
  if v_txt <> 'draft' then raise exception 'FAIL E1: de state %', v_txt; end if;
  select state into v_txt from public.translation_status where item_id = v_tpl and locale = 'en';
  if v_txt <> 'published' then raise exception 'FAIL E1: en state %', v_txt; end if;
  update public.email_templates set body = body || E'\n\nÀ très vite !' where id = v_tpl;
  select state into v_txt from public.translation_status where item_id = v_tpl and locale = 'en';
  if v_txt <> 'outdated' then raise exception 'FAIL E1: en should be outdated, is %', v_txt; end if;
  foreach v_txt in array array[
    format('update public.email_templates set key = ''order_ok'' where id = %L', v_tpl),
    format('update public.email_templates set subject = ''Commande {{order_total}}'' where id = %L', v_tpl)] loop
    v_state := null;
    begin
      execute v_txt;
    exception when others then v_state := sqlstate;
    end;
    if v_state not in ('42501', '23514') or v_state is null then raise exception 'FAIL E1: accepted % (%)', v_txt, v_state; end if;
  end loop;

  perform set_config('request.jwt.claims', json_build_object('sub', vwr, 'role', 'authenticated')::text, true);
  update public.email_templates set is_active = false;
  get diagnostics v_cnt = row_count;
  if v_cnt <> 0 then raise exception 'FAIL E1: read-only staff edited templates'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', alice, 'role', 'authenticated')::text, true);
  select count(*) into v_cnt from public.email_templates;
  if v_cnt <> 0 then raise exception 'FAIL E1: customer reads templates'; end if;

  perform set_config('role', 'service_role', true);
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  select locale, outdated into v_txt, v_bool from public.email_template_for('order_confirmation', 'en');
  if v_txt <> 'en' or not v_bool then raise exception 'FAIL E1: en render % %', v_txt, v_bool; end if;
  select locale into v_txt from public.email_template_for('order_confirmation', 'de');
  if v_txt <> 'fr' then raise exception 'FAIL E1: draft translation used (%)', v_txt; end if;
  passed := array_append(passed, 'E1 templates: placeholders checked, key frozen, outdated/draft/published tracked, sending falls back to the default language; content managers only');

  -- ===========================================================================
  -- P1 content pages
  -- ===========================================================================
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', mgr, 'role', 'authenticated')::text, true);
  insert into public.content_pages (slug, kind, title, body) values ('guide-entretien', 'guide', 'Guide d''entretien',
    'Pendant les 24 premières heures, évitez les boissons très chaudes.') returning id into v_page;
  insert into public.content_page_translations (page_id, locale, slug, title, body, status)
  values (v_page, 'en', 'aftercare-guide', 'Aftercare guide', 'For the first 24 hours, avoid very hot drinks.', 'published');
  foreach v_txt in array array[
    format('insert into public.content_page_translations (page_id, locale, title) values (%L, ''fr'', ''Doublon'')', v_page),
    'insert into public.content_pages (slug, kind, title, status) values (''cgv-test'', ''legal'', ''CGV'', ''published'')'] loop
    v_state := null;
    begin
      execute v_txt;
    exception when others then v_state := sqlstate;
    end;
    if v_state is distinct from '23514' then raise exception 'FAIL P1: accepted % (%)', v_txt, v_state; end if;
  end loop;

  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  select count(*) into v_cnt from public.content_pages where id = v_page;
  select v_cnt + count(*) into v_cnt from public.content_page_translations where page_id = v_page;
  if v_cnt <> 0 then raise exception 'FAIL P1: draft page public'; end if;

  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', mgr, 'role', 'authenticated')::text, true);
  update public.content_pages set status = 'published' where id = v_page returning published_at into v_ts;
  if v_ts is null then raise exception 'FAIL P1: publication not dated'; end if;
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  select title into v_txt from public.content_page_translations where page_id = v_page and locale = 'en';
  if v_txt is distinct from 'Aftercare guide' then raise exception 'FAIL P1: published translation not public'; end if;
  passed := array_append(passed, 'P1 content pages: public once published (with published translations), default-locale translation refused, legal pages need a policy version');

  -- ===========================================================================
  -- S1 maintenance
  -- ===========================================================================
  select maintenance_enabled into v_bool from public.store_settings;
  if v_bool is distinct from false then raise exception 'FAIL S1: visitors cannot read the maintenance flag'; end if;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', mgr, 'role', 'authenticated')::text, true);
  update public.store_settings set maintenance_enabled = true;
  get diagnostics v_cnt = row_count;
  if v_cnt <> 0 then raise exception 'FAIL S1: manager switched maintenance'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  update public.store_settings set maintenance_enabled = true, maintenance_started_at = '2000-01-01'
  returning maintenance_started_at into v_ts;
  if v_ts < now() - interval '1 minute' then raise exception 'FAIL S1: start time not stamped (%)', v_ts; end if;
  update public.store_settings set maintenance_enabled = false returning maintenance_started_at into v_ts;
  if v_ts is not null then raise exception 'FAIL S1: start time not cleared'; end if;
  execute 'reset role';
  select count(*) into v_cnt from public.audit_logs where table_name = 'store_settings' and actor_id = adm;
  if v_cnt <> 2 then raise exception 'FAIL S1: maintenance switches not audited (%)', v_cnt; end if;
  passed := array_append(passed, 'S1 maintenance: public flag, administrators only (manage_settings), stamped and audited');

  execute 'set constraints all immediate';
  raise exception 'ALL ITERATION 7 TESTS PASSED (% groups, rolled back): %',
    cardinality(passed), array_to_string(passed, ' | ');
end;
$$;
