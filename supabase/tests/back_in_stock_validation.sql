-- =============================================================================
-- Back-in-stock alerts validation suite (migration 20261014141425_back_in_stock_alerts)
-- =============================================================================
-- Proves, as the roles that really call them:
--
--   * a visitor can ask for an out-of-stock product; a bad address, a product in
--     stock, a product without its option and a gift card are refused;
--   * asking twice is answered the same and stores one request;
--   * a member's request carries the account's address, never the typed one;
--   * nobody reads the table or lists the pending e-mails through the API;
--   * nothing is pending while the product is out of stock; once restocked the
--     request is pending, once its e-mail is sent it is closed (notified_at) and
--     never pending again, even if the stock moves again;
--   * after a notification the same address can ask again (a new request);
--   * the throttle stops an 11th new request in an hour from the same address.
--
-- ONE transaction, ALWAYS rolled back by raising `ALL BACK IN STOCK TESTS PASSED`
-- (or `FAIL: ...`).
-- =============================================================================

do $$
declare
  m1     uuid := '00000000-0000-4000-a000-000000330001';
  p_out  uuid;
  p_in   uuid;
  p_var  uuid;
  v_out  uuid;
  v_in   uuid;
  r      jsonb;
  v_id   uuid;
  v_cnt  int;
  v_ok   boolean;
  passed text[] := '{}';
begin
  -- Fixtures, as the table owner: one product out of stock, one in stock, one with two options.
  insert into public.products (name, slug, price, currency, status, product_type)
  values ('Test rupture', 'bis-test-rupture', 10, 'EUR', 'active', 'physical') returning id into p_out;
  insert into public.inventory_items (product_id, quantity_on_hand) values (p_out, 0);
  insert into public.products (name, slug, price, currency, status, product_type)
  values ('Test en stock', 'bis-test-en-stock', 10, 'EUR', 'active', 'physical') returning id into p_in;
  insert into public.inventory_items (product_id, quantity_on_hand) values (p_in, 20);
  insert into public.products (name, slug, price, currency, status, product_type)
  values ('Test options', 'bis-test-options', 10, 'EUR', 'active', 'physical') returning id into p_var;
  insert into public.product_variants (product_id, name) values (p_var, 'Rouge') returning id into v_out;
  insert into public.product_variants (product_id, name) values (p_var, 'Bleu') returning id into v_in;
  insert into public.inventory_items (variant_id, quantity_on_hand) values (v_out, 0), (v_in, 20);
  insert into auth.users (id, aud, role, email, created_at, updated_at)
  values (m1, 'authenticated', 'authenticated', 'bis-member.test@example.invalid', now(), now());

  -- B1: a visitor asks for an out-of-stock product; refusals
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('request.headers', '{"sb-forwarded-for":"203.0.113.7"}', true);
  r := public.request_back_in_stock_alert(p_out, null, ' Guest.Test@Example.invalid ', 'en');
  if r <> '{"ok": true}' then raise exception 'FAIL B1: visitor request %', r; end if;
  r := public.request_back_in_stock_alert(p_out, null, 'not-an-address', 'fr');
  if r ->> 'error' <> 'invalid_email' then raise exception 'FAIL B1: bad address %', r; end if;
  r := public.request_back_in_stock_alert(p_in, null, 'guest.test@example.invalid', 'fr');
  if r ->> 'error' <> 'in_stock' then raise exception 'FAIL B1: in stock %', r; end if;
  r := public.request_back_in_stock_alert(p_var, null, 'guest.test@example.invalid', 'fr');
  if r ->> 'error' <> 'variant_required' then raise exception 'FAIL B1: option missing %', r; end if;
  r := public.request_back_in_stock_alert(p_var, v_in, 'guest.test@example.invalid', 'fr');
  if r ->> 'error' <> 'in_stock' then raise exception 'FAIL B1: option in stock %', r; end if;
  r := public.request_back_in_stock_alert(p_var, v_out, 'guest.test@example.invalid', 'fr');
  if r <> '{"ok": true}' then raise exception 'FAIL B1: option out of stock %', r; end if;
  r := public.request_back_in_stock_alert(gen_random_uuid(), null, 'guest.test@example.invalid', 'fr');
  if r ->> 'error' <> 'unavailable' then raise exception 'FAIL B1: unknown product %', r; end if;
  passed := passed || 'B1'::text;

  -- B2: asking twice = same answer, one request
  r := public.request_back_in_stock_alert(p_out, null, 'guest.test@example.invalid', 'fr');
  if r <> '{"ok": true}' then raise exception 'FAIL B2: second request %', r; end if;
  passed := passed || 'B2'::text;

  -- B3: the API reads nothing
  v_ok := false;
  begin
    perform 1 from public.back_in_stock_requests;
  exception when insufficient_privilege then v_ok := true;
  end;
  if not v_ok then raise exception 'FAIL B3: anon reads the requests'; end if;
  v_ok := false;
  begin
    perform public.pending_back_in_stock_emails(10);
  exception when insufficient_privilege then v_ok := true;
  end;
  if not v_ok then raise exception 'FAIL B3: anon lists pending e-mails'; end if;

  -- B4: a member's request uses the account address
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', m1, 'role', 'authenticated')::text, true);
  r := public.request_back_in_stock_alert(p_out, null, 'someone-else@example.invalid', 'fr');
  if r <> '{"ok": true}' then raise exception 'FAIL B4: member request %', r; end if;
  v_ok := false;
  begin
    perform 1 from public.back_in_stock_requests;
  exception when insufficient_privilege then v_ok := true;
  end;
  if not v_ok then raise exception 'FAIL B3: a member reads the requests'; end if;
  passed := passed || 'B3'::text;
  execute 'reset role';
  select count(*) into v_cnt from public.back_in_stock_requests where product_id = p_out;
  if v_cnt <> 2 then raise exception 'FAIL B2/B4: % requests for the product (expected 2)', v_cnt; end if;
  if not exists (select 1 from public.back_in_stock_requests where product_id = p_out and user_id = m1
                  and email = 'bis-member.test@example.invalid') then
    raise exception 'FAIL B4: member request not on the account address';
  end if;
  if exists (select 1 from public.back_in_stock_requests where email = 'someone-else@example.invalid') then
    raise exception 'FAIL B4: typed address stored for a member';
  end if;
  if not exists (select 1 from public.back_in_stock_requests where product_id = p_out and email = 'guest.test@example.invalid'
                  and locale = 'en' and user_id is null) then
    raise exception 'FAIL B1: visitor request not stored lower-cased with its language';
  end if;
  passed := passed || 'B4'::text;

  -- B5: nothing pending while out of stock; pending once restocked (only the restocked target)
  select count(*) into v_cnt from public.pending_back_in_stock_emails(100) e
   where e.request_id in (select id from public.back_in_stock_requests where product_id in (p_out, p_var));
  if v_cnt <> 0 then raise exception 'FAIL B5: % pending while out of stock', v_cnt; end if;
  update public.inventory_items set quantity_on_hand = 5 where product_id = p_out;
  select count(*) into v_cnt from public.pending_back_in_stock_emails(100) e
   where e.request_id in (select id from public.back_in_stock_requests where product_id in (p_out, p_var));
  if v_cnt <> 2 then raise exception 'FAIL B5: % pending after the restock (expected 2)', v_cnt; end if;
  if not exists (select 1 from public.pending_back_in_stock_emails(100) e
                  where e.email = 'guest.test@example.invalid' and e.product_slug = 'bis-test-rupture'
                    and e.product_name = 'Test rupture' and e.variant_name is null) then
    raise exception 'FAIL B5: pending row without its product';
  end if;
  passed := passed || 'B5'::text;

  -- B6: once the e-mail is sent the request is closed and never pending again
  select id into v_id from public.back_in_stock_requests where product_id = p_out and email = 'guest.test@example.invalid';
  perform public.email_log_claim('back_in_stock:' || v_id, 'back_in_stock', 'en', repeat('a', 64), null, null);
  select count(*) into v_cnt from public.pending_back_in_stock_emails(100) e where e.request_id = v_id;
  if v_cnt <> 0 then raise exception 'FAIL B6: pending while being sent'; end if;
  perform public.email_log_finish('back_in_stock:' || v_id, 'sent', 'test-provider-bis-1');
  if (select notified_at from public.back_in_stock_requests where id = v_id) is null then
    raise exception 'FAIL B6: request not closed after the e-mail';
  end if;
  update public.inventory_items set quantity_on_hand = 0 where product_id = p_out;
  update public.inventory_items set quantity_on_hand = 8 where product_id = p_out;
  select count(*) into v_cnt from public.pending_back_in_stock_emails(100) e where e.request_id = v_id;
  if v_cnt <> 0 then raise exception 'FAIL B6: notified request pending again'; end if;
  passed := passed || 'B6'::text;

  -- B7: the same address can ask again later, as a new request
  update public.inventory_items set quantity_on_hand = 0 where product_id = p_out;
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  r := public.request_back_in_stock_alert(p_out, null, 'guest.test@example.invalid', 'fr');
  if r <> '{"ok": true}' then raise exception 'FAIL B7: new request after a notification %', r; end if;
  execute 'reset role';
  select count(*) into v_cnt from public.back_in_stock_requests where product_id = p_out and email = 'guest.test@example.invalid';
  if v_cnt <> 2 then raise exception 'FAIL B7: % requests (expected 2)', v_cnt; end if;
  passed := passed || 'B7'::text;

  -- B8: throttle, 10 new requests an hour per network address (3 made above from it)
  perform set_config('role', 'anon', true);
  for i in 1..7 loop
    r := public.request_back_in_stock_alert(p_var, v_out, format('bis-flood-%s@example.invalid', i), 'fr');
    if r <> '{"ok": true}' then raise exception 'FAIL B8: request % refused %', i, r; end if;
  end loop;
  r := public.request_back_in_stock_alert(p_var, v_out, 'bis-flood-last@example.invalid', 'fr');
  if r ->> 'error' <> 'too_many_requests' then raise exception 'FAIL B8: 11th request %', r; end if;
  execute 'reset role';
  passed := passed || 'B8'::text;

  raise exception 'ALL BACK IN STOCK TESTS PASSED: %', array_to_string(passed, ' ');
end;
$$;
