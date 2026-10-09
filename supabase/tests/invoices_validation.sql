-- =============================================================================
-- Invoices validation suite (migration 20261009152941_invoices)
-- =============================================================================
-- Proves:
--   I1  paying an order issues one invoice, numbered FA-<year>-<next>, whose
--       lines, shipping, VAT breakdown and totals are the order's recorded ones;
--   I2  marking it paid again issues nothing; the next paid order takes the next
--       number, never an earlier date (continuous, chronological);
--   I3  invoices are immutable (update and delete refused, even for the owner
--       of the table);
--   I4  the order's owner reads its invoice, another member and staff-less
--       callers do not, a visitor is refused, nobody writes through the API;
--   I5  a confirmed refund of items issues a credit note AV-<year>-<next> for the
--       refunded amount at the items' VAT rate, linked to the invoice;
--   I6  a refund without items is credited over the invoice's rates; a pending
--       or failed refund issues nothing;
--   I7  a refund larger than the items credits the surplus as shipping;
--   I8  a refund of an order paid before invoicing existed issues nothing;
--   I9  end to end through create_order(): a gift card sold is invoiced without
--       VAT; an order paid in full by gift card is invoiced in the same call,
--       with the order's VAT and the gift card as the payment.
--
-- Orders and payments are written as the table owner (the trusted backend).
-- ONE transaction, ALWAYS rolled back by raising `ALL INVOICES TESTS PASSED`
-- (or `FAIL: ...`), so the counters are given back.
-- =============================================================================

do $$
declare
  m1     uuid := '00000000-0000-4000-a000-000000230001';
  m2     uuid := '00000000-0000-4000-a000-000000230002';
  addr   jsonb := '{"first_name":"Test","last_name":"Facture","address_line1":"1 rue Fictive","postal_code":"75004","city":"Paris","country_code":"FR"}';
  p      uuid;
  o1 uuid; o2 uuid; o3 uuid;
  a1 uuid; b1 uuid; c2 uuid; d3 uuid;
  pay1 uuid; pay3 uuid;
  p_gc uuid; p_gel uuid; r_std uuid; v_card uuid; v_code text;
  o      public.orders;
  r1 uuid; r2 uuid; r3 uuid; r4 uuid;
  year   text := to_char(clock_timestamp() at time zone 'Europe/Paris', 'YYYY');
  fa0    integer;
  av0    integer;
  inv1   public.invoices;
  inv2   public.invoices;
  note   public.invoices;
  v_cnt  integer;
  passed text[] := '{}';
begin
  select id into p from public.products where status = 'active' order by created_at limit 1;
  if p is null then raise exception 'FAIL setup: no active product'; end if;
  select coalesce(max(last_number), 0) into fa0 from public.invoice_sequences where series = 'FA-' || year;
  select coalesce(max(last_number), 0) into av0 from public.invoice_sequences where series = 'AV-' || year;

  insert into auth.users (id, aud, role, email, created_at, updated_at) values
    (m1, 'authenticated', 'authenticated', 'invoice-a.test@example.invalid', now(), now()),
    (m2, 'authenticated', 'authenticated', 'invoice-b.test@example.invalid', now(), now());

  -- o1: A 2 × 41.00 − 8.20, B 1 × 9.95 − 1.00, both at 20 %; shipping 6.90 (VAT 1.15).
  insert into public.orders (user_id, customer_email, billing_address, shipping_address, currency,
                             subtotal_amount, discount_amount, shipping_amount, tax_amount, total_amount,
                             tax_country_code, shipping_method_name, locale)
  values (m1, 'invoice-a.test@example.invalid', addr, addr, 'EUR', 91.95, 9.20, 6.90, 14.94, 89.65, 'FR', 'Colissimo', 'fr')
  returning id into o1;
  insert into public.order_items (order_id, product_id, product_name, variant_name, unit_price, quantity, discount_amount, tax_rate_bp, tax_amount)
  values (o1, p, 'A', 'Or', 41.00, 2, 8.20, 2000, 12.30) returning id into a1;
  insert into public.order_items (order_id, product_id, product_name, unit_price, quantity, discount_amount, tax_rate_bp, tax_amount)
  values (o1, p, 'B', 9.95, 1, 1.00, 2000, 1.49) returning id into b1;
  insert into public.payments (order_id, status, amount, currency, provider_payment_id)
  values (o1, 'succeeded', 89.65, 'EUR', 'pi_invoice_o1') returning id into pay1;

  -- o2: one line, no shipping.
  insert into public.orders (user_id, customer_email, billing_address, currency,
                             subtotal_amount, discount_amount, shipping_amount, tax_amount, total_amount, tax_country_code)
  values (m2, 'invoice-b.test@example.invalid', addr, 'EUR', 12.00, 0, 0, 2.00, 12.00, 'FR') returning id into o2;
  insert into public.order_items (order_id, product_id, product_name, unit_price, quantity, discount_amount, tax_rate_bp, tax_amount)
  values (o2, p, 'C', 12.00, 1, 0, 2000, 2.00) returning id into c2;

  -- I1 -----------------------------------------------------------------------------
  update public.orders set payment_status = 'paid', status = 'confirmed' where id = o1;
  select * into inv1 from public.invoices where order_id = o1 and kind = 'invoice';
  if inv1.id is null then raise exception 'FAIL I1: no invoice on payment'; end if;
  if inv1.invoice_number <> 'FA-' || year || '-' || lpad((fa0 + 1)::text, 6, '0') then
    raise exception 'FAIL I1: number %, expected FA-%-%', inv1.invoice_number, year, fa0 + 1;
  end if;
  if inv1.total_incl_tax <> 89.65 or inv1.total_tax <> 14.94 or inv1.total_excl_tax <> 74.71 then
    raise exception 'FAIL I1: totals % / % / %', inv1.total_excl_tax, inv1.total_tax, inv1.total_incl_tax;
  end if;
  -- Lines of one order share a timestamp: found by name, shipping last.
  if jsonb_array_length(inv1.lines) <> 3 or inv1.lines -> 2 ->> 'kind' <> 'shipping'
     or (inv1.lines -> 2 ->> 'vat_amount')::numeric <> 1.15
     or not (inv1.lines @> '[{"description": "A", "total_excl": 61.50, "unit_price_excl": 34.17, "vat_amount": 12.30}]')
     or not (inv1.lines @> '[{"description": "B", "total_excl": 7.46, "vat_amount": 1.49}]') then
    raise exception 'FAIL I1: lines %', inv1.lines;
  end if;
  if jsonb_array_length(inv1.vat_breakdown) <> 1 or (inv1.vat_breakdown -> 0 ->> 'vat_amount')::numeric <> 14.94 then
    raise exception 'FAIL I1: VAT breakdown %', inv1.vat_breakdown;
  end if;
  if inv1.buyer ->> 'order_number' is null or inv1.buyer -> 'address' ->> 'city' <> 'Paris' or not (inv1.seller ? 'legal_name') then
    raise exception 'FAIL I1: snapshots % / %', inv1.buyer, inv1.seller;
  end if;
  passed := passed || 'I1'::text;

  -- I2 -----------------------------------------------------------------------------
  update public.orders set status = 'processing' where id = o1;
  update public.orders set payment_status = 'paid', status = 'confirmed' where id = o2;
  select count(*) into v_cnt from public.invoices where order_id = o1;
  if v_cnt <> 1 then raise exception 'FAIL I2: % invoices on o1', v_cnt; end if;
  select * into inv2 from public.invoices where order_id = o2;
  if inv2.sequence_number <> fa0 + 2 or inv2.issued_at < inv1.issued_at then
    raise exception 'FAIL I2: second invoice % at % after % at %', inv2.sequence_number, inv2.issued_at, inv1.sequence_number, inv1.issued_at;
  end if;
  passed := passed || 'I2'::text;

  -- I3 -----------------------------------------------------------------------------
  begin
    update public.invoices set total_incl_tax = 0, total_excl_tax = 0, total_tax = 0 where id = inv1.id;
    raise exception 'FAIL I3: an invoice was updated';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.invoices where id = inv1.id;
    raise exception 'FAIL I3: an invoice was deleted';
  exception when insufficient_privilege then null;
  end;
  passed := passed || 'I3'::text;

  -- I4 -----------------------------------------------------------------------------
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', m1, 'role', 'authenticated')::text, true);
  select count(*) into v_cnt from public.invoices;
  if v_cnt <> 1 then raise exception 'FAIL I4: the owner reads % invoices', v_cnt; end if;
  begin
    insert into public.invoices (kind, series, sequence_number, invoice_number, order_id, issued_at, sale_date, locale,
                                 currency, total_excl_tax, total_tax, total_incl_tax, seller, buyer, lines, vat_breakdown)
    values ('invoice', 'FA-' || year, 999999, 'FA-FAKE', o1, now(), current_date, 'fr', 'EUR', 0, 0, 0, '{}', '{}', '[]', '[]');
    raise exception 'FAIL I4: a member inserted an invoice';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.invoice_sequences;
    raise exception 'FAIL I4: a member read the counters';
  exception when insufficient_privilege then null;
  end;
  perform set_config('request.jwt.claims', json_build_object('sub', m2, 'role', 'authenticated')::text, true);
  select count(*) into v_cnt from public.invoices where order_id = o1;
  if v_cnt <> 0 then raise exception 'FAIL I4: another member reads the invoice'; end if;
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{}', true);
  begin
    perform 1 from public.invoices;
    raise exception 'FAIL I4: a visitor read invoices';
  exception when insufficient_privilege then null;
  end;
  execute 'reset role';
  passed := passed || 'I4'::text;

  -- I5: B refunded (8.95 at 20 %) --------------------------------------------------------
  insert into public.refunds (order_id, payment_id, amount, currency, reason) values (o1, pay1, 8.95, 'EUR', 'defective') returning id into r1;
  insert into public.refund_items (refund_id, order_item_id, quantity) values (r1, b1, 1);
  select count(*) into v_cnt from public.invoices where refund_id = r1;
  if v_cnt <> 0 then raise exception 'FAIL I6: a pending refund issued a credit note'; end if;
  update public.refunds set status = 'succeeded', provider_refund_id = 're_invoice_1' where id = r1;
  select * into note from public.invoices where refund_id = r1;
  if note.id is null or note.kind <> 'credit_note' or note.credited_invoice_id <> inv1.id
     or note.invoice_number <> 'AV-' || year || '-' || lpad((av0 + 1)::text, 6, '0') then
    raise exception 'FAIL I5: credit note %', to_jsonb(note);
  end if;
  if note.total_incl_tax <> 8.95 or note.total_tax <> 1.49 or jsonb_array_length(note.lines) <> 1
     or note.lines -> 0 ->> 'description' <> 'B' or note.payment ->> 'credited_invoice_number' <> inv1.invoice_number then
    raise exception 'FAIL I5: amounts % / % lines %', note.total_incl_tax, note.total_tax, note.lines;
  end if;
  passed := passed || 'I5'::text;

  -- I6: 3.00 without items, spread over the invoice's single rate; a failed refund issues nothing
  insert into public.refunds (order_id, payment_id, amount, currency, reason) values (o1, pay1, 3.00, 'EUR', 'goodwill') returning id into r2;
  update public.refunds set status = 'succeeded', provider_refund_id = 're_invoice_2' where id = r2;
  select * into note from public.invoices where refund_id = r2;
  if note.total_incl_tax <> 3.00 or note.total_tax <> 0.50 or note.sequence_number <> av0 + 2
     or note.lines -> 0 ->> 'kind' <> 'adjustment' then
    raise exception 'FAIL I6: credit note % / % #% %', note.total_incl_tax, note.total_tax, note.sequence_number, note.lines;
  end if;
  insert into public.refunds (order_id, payment_id, amount, currency, reason) values (o1, pay1, 1.00, 'EUR', 'goodwill') returning id into r3;
  update public.refunds set status = 'failed', failure_reason = 'test' where id = r3;
  select count(*) into v_cnt from public.invoices where refund_id = r3;
  if v_cnt <> 0 then raise exception 'FAIL I6: a failed refund issued a credit note'; end if;
  passed := passed || 'I6'::text;

  -- I7: one unit of A (36.90) + 6.90 of shipping = 43.80
  insert into public.refunds (order_id, payment_id, amount, currency, reason) values (o1, pay1, 43.80, 'EUR', 'return') returning id into r4;
  insert into public.refund_items (refund_id, order_item_id, quantity) values (r4, a1, 1);
  update public.refunds set status = 'succeeded', provider_refund_id = 're_invoice_4' where id = r4;
  select * into note from public.invoices where refund_id = r4;
  if note.total_incl_tax <> 43.80 or jsonb_array_length(note.lines) <> 2
     or (note.lines -> 0 ->> 'total_incl')::numeric <> 36.90 or note.lines -> 1 ->> 'kind' <> 'shipping'
     or (note.lines -> 1 ->> 'total_incl')::numeric <> 6.90 then
    raise exception 'FAIL I7: %', note.lines;
  end if;
  passed := passed || 'I7'::text;

  -- I8: an order recorded as paid without going through the payment update (as before the migration)
  insert into public.orders (user_id, customer_email, billing_address, currency, payment_status, status, paid_at,
                             subtotal_amount, discount_amount, shipping_amount, tax_amount, total_amount, tax_country_code)
  values (m1, 'invoice-a.test@example.invalid', addr, 'EUR', 'paid', 'confirmed', now(), 10.00, 0, 0, 1.67, 10.00, 'FR') returning id into o3;
  insert into public.order_items (order_id, product_id, product_name, unit_price, quantity, discount_amount, tax_rate_bp, tax_amount)
  values (o3, p, 'D', 10.00, 1, 0, 2000, 1.67) returning id into d3;
  insert into public.payments (order_id, status, amount, currency, provider_payment_id)
  values (o3, 'succeeded', 10.00, 'EUR', 'pi_invoice_o3') returning id into pay3;
  insert into public.refunds (order_id, payment_id, amount, currency, reason) values (o3, pay3, 10.00, 'EUR', 'goodwill') returning id into r1;
  update public.refunds set status = 'succeeded', provider_refund_id = 're_invoice_3' where id = r1;
  select count(*) into v_cnt from public.invoices where order_id = o3;
  if v_cnt <> 0 then raise exception 'FAIL I8: % documents on an order paid before invoicing', v_cnt; end if;
  passed := passed || 'I8'::text;

  -- I9 ---------------------------------------------------------------------------
  select id into p_gc from public.products where slug = 'carte-cadeau';
  select id into p_gel from public.products where slug = 'gel-de-suivi';
  select r.id into r_std from public.shipping_rates r join public.shipping_zones z on z.id = r.zone_id
   where z.name = 'France' and r.kind = 'standard';
  update public.gift_card_settings set is_published = true where id;
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  perform set_config('role', 'service_role', true);
  o := public.create_order(m1, 'invoice-a.test@example.invalid',
         jsonb_build_array(jsonb_build_object('product_id', p_gc, 'quantity', 1, 'amount', 50,
           'gift_card', jsonb_build_object('recipient_name', 'Bob', 'recipient_email', 'bob.invoice@example.invalid',
                                           'sender_name', 'Test'))), addr);
  perform public.mark_order_paid(o.id, o.total_amount, o.currency, 'cs_test_invoice_suite', 'pi_test_invoice_suite');
  execute 'reset role';
  if not exists (select 1 from public.invoices i where i.order_id = o.id and i.total_incl_tax = 50 and i.total_tax = 0
                  and i.lines @> '[{"kind": "gift_card", "vat_rate_bp": 0}]') then
    raise exception 'FAIL I9: gift card purchase invoice %', (select to_jsonb(i) from public.invoices i where i.order_id = o.id);
  end if;
  perform set_config('role', 'service_role', true);
  v_card := public.issue_gift_card(100, 'invoice-c.test@example.invalid', 'Test', null, null, 'Test');
  select code into v_code from public.gift_cards where id = v_card;
  o := public.create_order(null, 'guest.invoice@example.invalid',
         jsonb_build_array(jsonb_build_object('product_id', p_gel, 'quantity', 1)), addr, addr, r_std,
         p_gift_card_codes => array[lower(v_code)]);
  execute 'reset role';
  if o.payment_status <> 'paid' or not exists (
       select 1 from public.invoices i where i.order_id = o.id and i.total_incl_tax = o.total_amount
          and i.total_tax = o.tax_amount and (i.payment ->> 'gift_card_amount')::numeric = o.total_amount
          and (i.payment ->> 'charged_amount')::numeric = 0) then
    raise exception 'FAIL I9: invoice of a gift-card-paid order % / %', o.payment_status,
      (select to_jsonb(i) from public.invoices i where i.order_id = o.id);
  end if;
  passed := passed || 'I9'::text;

  raise exception 'ALL INVOICES TESTS PASSED: %', array_to_string(passed, ' ');
end;
$$;
