-- =============================================================================
-- VAT franchise validation suite (migrations 20261026185024_vat_franchise,
-- 20261026190347_order_vat_regime)
-- =============================================================================
-- Proves (decision 114, "franchise en base de TVA", art. 293 B du CGI):
--   F1  the store row is under the franchise by default and vat_rate_bp()
--       then returns 0 for every destination and category; switched off, the
--       configured rates apply again;
--   F2  end to end through create_order() under the franchise: no VAT on the
--       lines or the shipping, the order's tax is 0, and the invoice issued on
--       payment is frozen with seller.vat_franchise = true and a 0 % breakdown;
--   F3  a credit note follows the regime of the invoice it credits, even when
--       the switch has changed since;
--   F4  admin_save_store_details(): a manage_settings admin switches the
--       franchise, a missing key leaves it unchanged, a non-boolean is refused
--       (22023), a customer is refused (42501);
--   F5  an order keeps the regime it was created under: paid after the switch
--       changed, its invoice still follows the order (seller flag and shipping
--       rate), both ways; the order's flag cannot be updated.
--
-- ONE transaction, ALWAYS rolled back by raising `ALL VAT FRANCHISE TESTS PASSED`
-- (or `FAIL: ...`).
-- =============================================================================

do $$
declare
  m1      uuid := '00000000-0000-4000-a000-000000240001';
  adm     uuid := '00000000-0000-4000-a000-000000240002';
  addr    jsonb := '{"first_name":"Test","last_name":"Franchise","address_line1":"1 rue Fictive","postal_code":"75004","city":"Paris","country_code":"FR"}';
  p_gel   uuid;
  r_std   uuid;
  o       public.orders;
  o2      public.orders;
  pay     uuid;
  item    uuid;
  r1      uuid;
  inv     public.invoices;
  note    public.invoices;
  v_s     public.store_settings;
  v_det   jsonb;
  v_state text;
  passed  text[] := '{}';
begin
  -- F1 -------------------------------------------------------------------------
  if not (select vat_franchise from public.store_settings where id) then
    raise exception 'FAIL F1: the store is not under the franchise by default';
  end if;
  if public.vat_rate_bp('FR') <> 0 or public.vat_rate_bp('DE', 'training') <> 0 or public.vat_rate_bp('PL') <> 0 then
    raise exception 'FAIL F1: a VAT rate under the franchise';
  end if;
  update public.store_settings set vat_franchise = false where id;
  if public.vat_rate_bp('FR') <> 2000 or public.vat_rate_bp('PL') <> 2300 then
    raise exception 'FAIL F1: standard rates once the franchise is off (FR %)', public.vat_rate_bp('FR');
  end if;
  update public.store_settings set vat_franchise = true where id;
  passed := passed || 'F1'::text;

  -- F2 -------------------------------------------------------------------------
  insert into auth.users (id, aud, role, email, created_at, updated_at) values
    (m1, 'authenticated', 'authenticated', 'franchise-a.test@example.invalid', now(), now()),
    (adm, 'authenticated', 'authenticated', 'franchise-adm.test@example.invalid', now(), now());
  update public.profiles set role = 'admin' where id = adm;

  select id into p_gel from public.products where slug = 'gel-de-suivi';
  if p_gel is null then
    select id into p_gel from public.products where status = 'active' and stock_quantity > 0
     and not exists (select 1 from public.product_variants v where v.product_id = products.id and v.is_active)
     order by created_at limit 1;
  end if;
  select r.id into r_std from public.shipping_rates r join public.shipping_zones z on z.id = r.zone_id
   where z.name = 'France' and r.kind = 'standard';

  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  perform set_config('role', 'service_role', true);
  o := public.create_order(m1, 'franchise-a.test@example.invalid',
         jsonb_build_array(jsonb_build_object('product_id', p_gel, 'quantity', 1)), addr, addr, r_std);
  perform public.mark_order_paid(o.id, o.total_amount, o.currency, 'cs_test_franchise', 'pi_test_franchise');
  execute 'reset role';

  select * into o from public.orders where id = o.id;
  if o.tax_amount <> 0 or exists (select 1 from public.order_items i where i.order_id = o.id and i.tax_rate_bp <> 0) then
    raise exception 'FAIL F2: VAT on a franchise order (tax %)', o.tax_amount;
  end if;
  select * into inv from public.invoices where order_id = o.id and kind = 'invoice';
  if inv.id is null or inv.total_tax <> 0 or inv.total_incl_tax <> o.total_amount or inv.total_excl_tax <> o.total_amount
     or (inv.seller ->> 'vat_franchise')::boolean is not true
     or exists (select 1 from jsonb_array_elements(inv.lines) l where (l ->> 'vat_rate_bp')::integer <> 0)
     or exists (select 1 from jsonb_array_elements(inv.vat_breakdown) b where (b ->> 'vat_rate_bp')::integer <> 0) then
    raise exception 'FAIL F2: invoice %', to_jsonb(inv);
  end if;
  passed := passed || 'F2'::text;

  -- F3 -------------------------------------------------------------------------
  update public.store_settings set vat_franchise = false where id;
  select id into pay from public.payments where order_id = o.id order by created_at limit 1;
  select id into item from public.order_items where order_id = o.id limit 1;
  insert into public.refunds (order_id, payment_id, amount, currency, reason)
  values (o.id, pay, least(1.00, o.total_amount), o.currency, 'defective') returning id into r1;
  insert into public.refund_items (refund_id, order_item_id, quantity) values (r1, item, 1);
  update public.refunds set status = 'succeeded', provider_refund_id = 're_franchise_1' where id = r1;
  select * into note from public.invoices where refund_id = r1;
  if note.id is null or note.total_tax <> 0 or (note.seller ->> 'vat_franchise')::boolean is not true then
    raise exception 'FAIL F3: credit note %', to_jsonb(note);
  end if;
  update public.store_settings set vat_franchise = true where id;
  passed := passed || 'F3'::text;

  -- F4 -------------------------------------------------------------------------
  select * into v_s from public.store_settings where id;
  v_det := jsonb_build_object(
    'store_name', v_s.store_name, 'legal_name', coalesce(v_s.legal_name, ''), 'legal_form', coalesce(v_s.legal_form, ''),
    'share_capital', coalesce(v_s.share_capital, ''), 'registration_number', coalesce(v_s.registration_number, ''),
    'vat_number', coalesce(v_s.vat_number, ''), 'business_email', coalesce(v_s.business_email, ''),
    'support_email', coalesce(v_s.support_email, ''), 'phone', coalesce(v_s.phone, ''),
    'address_line1', coalesce(v_s.address_line1, ''), 'address_line2', coalesce(v_s.address_line2, ''),
    'postal_code', coalesce(v_s.postal_code, ''), 'city', coalesce(v_s.city, ''), 'region', coalesce(v_s.region, ''),
    'country_code', v_s.country_code, 'publication_director', coalesce(v_s.publication_director, ''),
    'publication_director_role', coalesce(v_s.publication_director_role, ''), 'host_name', coalesce(v_s.host_name, ''),
    'host_address', coalesce(v_s.host_address, ''), 'host_contact', coalesce(v_s.host_contact, ''),
    'show_email', v_s.show_email, 'show_phone', v_s.show_phone, 'show_address', v_s.show_address,
    'opening_hours', v_s.opening_hours, 'support_message', coalesce(v_s.support_message, ''));

  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', m1, 'role', 'authenticated')::text, true);
  begin
    perform public.admin_save_store_details(v_det || '{"vat_franchise": false}');
    raise exception 'FAIL F4: a customer switched the franchise';
  exception when insufficient_privilege then null;
  end;

  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  perform public.admin_save_store_details(v_det || '{"vat_franchise": false}');
  if (select vat_franchise from public.store_settings where id) then raise exception 'FAIL F4: switch off not saved'; end if;
  perform public.admin_save_store_details(v_det);
  if (select vat_franchise from public.store_settings where id) then raise exception 'FAIL F4: a missing key changed the switch'; end if;
  perform public.admin_save_store_details(v_det || '{"vat_franchise": true}');
  if not (select vat_franchise from public.store_settings where id) then raise exception 'FAIL F4: switch on not saved'; end if;
  begin
    perform public.admin_save_store_details(v_det || '{"vat_franchise": "yes"}');
    raise exception 'FAIL F4: a non-boolean switch was accepted';
  exception when sqlstate '22023' then null;
  end;
  execute 'reset role';
  passed := passed || 'F4'::text;

  -- F5 -------------------------------------------------------------------------
  -- Created under the franchise, paid once it is off.
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  perform set_config('role', 'service_role', true);
  o := public.create_order(m1, 'franchise-a.test@example.invalid',
         jsonb_build_array(jsonb_build_object('product_id', p_gel, 'quantity', 1)), addr, addr, r_std);
  execute 'reset role';
  update public.store_settings set vat_franchise = false where id;
  -- Created with VAT, paid once the franchise is on.
  perform set_config('role', 'service_role', true);
  o2 := public.create_order(m1, 'franchise-a.test@example.invalid',
          jsonb_build_array(jsonb_build_object('product_id', p_gel, 'quantity', 1)), addr, addr, r_std);
  execute 'reset role';
  update public.store_settings set vat_franchise = true where id;
  if not o.vat_franchise or o2.vat_franchise or o.tax_amount <> 0 or o2.tax_amount = 0 then
    raise exception 'FAIL F5: order snapshots % / %', to_jsonb(o), to_jsonb(o2);
  end if;
  update public.orders set vat_franchise = false where id = o.id;
  if not (select vat_franchise from public.orders where id = o.id) then raise exception 'FAIL F5: order flag updated'; end if;

  perform set_config('role', 'service_role', true);
  perform public.mark_order_paid(o.id, o.total_amount, o.currency, 'cs_test_franchise_5a', 'pi_test_franchise_5a');
  perform public.mark_order_paid(o2.id, o2.total_amount, o2.currency, 'cs_test_franchise_5b', 'pi_test_franchise_5b');
  execute 'reset role';
  select * into inv from public.invoices where order_id = o.id and kind = 'invoice';
  if (inv.seller ->> 'vat_franchise')::boolean is not true or inv.total_tax <> 0
     or exists (select 1 from jsonb_array_elements(inv.lines) l where (l ->> 'vat_rate_bp')::integer <> 0) then
    raise exception 'FAIL F5: franchise order paid under VAT: %', to_jsonb(inv);
  end if;
  select * into inv from public.invoices where order_id = o2.id and kind = 'invoice';
  if (inv.seller ->> 'vat_franchise')::boolean is not false or inv.total_tax <> o2.tax_amount
     or exists (select 1 from jsonb_array_elements(inv.lines) l where (l ->> 'vat_rate_bp')::integer <> 2000) then
    raise exception 'FAIL F5: VAT order paid under the franchise: %', to_jsonb(inv);
  end if;
  passed := passed || 'F5'::text;

  raise exception 'ALL VAT FRANCHISE TESTS PASSED: %', array_to_string(passed, ' ');
end;
$$;
