-- =============================================================================
-- 3D Studio legal invoices and credit notes validation suite
-- (migration 20261026211240_studio_invoices, decision 115)
-- =============================================================================
-- Proves, as the roles that really call them:
--
--   S1  a paid Studio invoice with its Stripe lines issues one FA- invoice:
--       one `subscription` line per Stripe line (plan from the price, period),
--       VAT 0 and seller.vat_franchise under the franchise, buyer = the member;
--   S2  a replay issues nothing more (same number);
--   S3  a failed attempt issues nothing; paid later, it issues one invoice;
--   S4  lines that do not add up fall back to one line of the subscription's plan;
--   S5  a plan change (negative proration line) outside the franchise: two
--       lines, the configured rate, totals add up; a zero total gets no document;
--   S6  the owner reads their Studio documents, another member none;
--       nobody updates or deletes one (immutability, any role);
--   S7  a withdrawal refund confirmed issues one AV- credit note against the
--       first invoice, for the refunded amount; a replay changes nothing;
--   S8  the e-mail sweeps: the renewal invoice is pending once; the credit note
--       issued after the acknowledgement went out is pending; the confirmation
--       names its first invoice.
--
-- ONE transaction, ALWAYS rolled back by raising `ALL STUDIO INVOICE TESTS PASSED`
-- (or `FAIL: ...`).
-- =============================================================================

do $$
declare
  m1      uuid := '00000000-0000-4000-a000-000000390001';
  m2      uuid := '00000000-0000-4000-a000-000000390002';
  m3      uuid := '00000000-0000-4000-a000-000000390003';
  d       public.invoices;
  n       public.invoices;
  r       jsonb;
  w       public.studio_withdrawals;
  v_cnt   int;
  v_num   text;
  v_rate  int;
  v_state text;
  passed  text[] := '{}';
begin
  insert into auth.users (id, aud, role, email, created_at, updated_at) values
    (m1, 'authenticated', 'authenticated', 'studio-inv-1.test@example.invalid', now(), now()),
    (m2, 'authenticated', 'authenticated', 'studio-inv-2.test@example.invalid', now(), now()),
    (m3, 'authenticated', 'authenticated', 'studio-inv-3.test@example.invalid', now(), now());
  update public.profiles set first_name = 'Inès', last_name = 'Martin', preferred_locale = 'fr' where id = m1;

  update public.studio_plan_prices set active = false where active;
  insert into public.studio_plan_prices (plan, billing_interval, amount, currency, stripe_price_id, active) values
    ('artist', 'month', 19.90, 'EUR', 'price_testInvArtistM', true),
    ('atelier', 'month', 39.90, 'EUR', 'price_testInvAtelierM', true),
    ('essential', 'month', 9.90, 'EUR', 'price_testInvOldEssM', false);
  update public.store_settings set vat_franchise = true where id;

  perform set_config('role', 'service_role', true);
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  perform public.apply_studio_subscription('sub_testInv01', 'cus_testInv01', m1, 'price_testInvArtistM',
                                           'active', now() + interval '30 days', false, null, false);
  perform public.apply_studio_subscription('sub_testInv03', 'cus_testInv03', m3, 'price_testInvArtistM',
                                           'active', now() + interval '28 days', false, null, false);

  -- S1: first payment with its line.
  perform public.record_studio_invoice('in_testInv0001', 'sub_testInv01', 'subscription_create', 'paid', 19.90, 'EUR',
    now() - interval '1 hour', 19.90,
    jsonb_build_array(jsonb_build_object('amount', '19.90', 'price_id', 'price_testInvArtistM', 'quantity', 1,
      'period_start', '2026-10-26T10:00:00.000Z', 'period_end', '2026-11-26T10:00:00.000Z', 'proration', false)));
  select * into d from public.invoices where studio_invoice_id = 'in_testInv0001' and kind = 'invoice';
  if d.id is null or d.invoice_number !~ '^FA-[0-9]{4}-[0-9]{6}$' or d.order_id is not null then
    raise exception 'FAIL S1: invoice %', to_jsonb(d);
  end if;
  if d.total_incl_tax <> 19.90 or d.total_tax <> 0 or (d.seller ->> 'vat_franchise')::boolean is not true
     or jsonb_array_length(d.lines) <> 1 or d.lines -> 0 ->> 'kind' <> 'subscription' or d.lines -> 0 ->> 'plan' <> 'artist'
     or d.lines -> 0 ->> 'interval' <> 'month' or d.lines -> 0 ->> 'description' <> 'Artiste'
     or (d.lines -> 0 ->> 'vat_rate_bp')::int <> 0 or d.lines -> 0 ->> 'period_end' not like '2026-11-26%' then
    raise exception 'FAIL S1: content %', to_jsonb(d);
  end if;
  if d.buyer ->> 'email' <> 'studio-inv-1.test@example.invalid' or d.buyer -> 'address' ->> 'last_name' <> 'Martin'
     or (d.payment ->> 'charged_amount')::numeric <> 19.90 then
    raise exception 'FAIL S1: buyer/payment % %', d.buyer, d.payment;
  end if;
  passed := passed || 'S1'::text;

  -- S2: a replay issues nothing more.
  v_num := d.invoice_number;
  perform public.record_studio_invoice('in_testInv0001', 'sub_testInv01', 'subscription_create', 'paid', 19.90, 'EUR',
    now(), 19.90, d.lines);
  select count(*) into v_cnt from public.invoices where studio_invoice_id = 'in_testInv0001';
  if v_cnt <> 1 or (select invoice_number from public.invoices where studio_invoice_id = 'in_testInv0001') <> v_num then
    raise exception 'FAIL S2: % documents after replay', v_cnt;
  end if;
  passed := passed || 'S2'::text;

  -- S3: failed, then paid.
  perform public.record_studio_invoice('in_testInv0002', 'sub_testInv01', 'subscription_cycle', 'payment_failed', 19.90, 'EUR',
    now(), 19.90, jsonb_build_array(jsonb_build_object('amount', '19.90', 'price_id', 'price_testInvArtistM', 'quantity', 1,
      'period_start', '2026-11-26T10:00:00.000Z', 'period_end', '2026-12-26T10:00:00.000Z', 'proration', false)));
  select count(*) into v_cnt from public.invoices where studio_invoice_id = 'in_testInv0002';
  if v_cnt <> 0 then raise exception 'FAIL S3: a failed payment was invoiced'; end if;
  perform public.record_studio_invoice('in_testInv0002', 'sub_testInv01', 'subscription_cycle', 'paid', 19.90, 'EUR',
    now(), 19.90, null);
  select count(*) into v_cnt from public.invoices where studio_invoice_id = 'in_testInv0002' and kind = 'invoice';
  if v_cnt <> 1 then raise exception 'FAIL S3: % invoices once paid', v_cnt; end if;
  if (select lines -> 0 ->> 'period_start' from public.invoices where studio_invoice_id = 'in_testInv0002') not like '2026-11-26%' then
    raise exception 'FAIL S3: the lines of the failed attempt were lost';
  end if;
  if (select invoice_number from public.invoices where studio_invoice_id = 'in_testInv0002') <= v_num then
    raise exception 'FAIL S3: numbers not increasing';
  end if;
  passed := passed || 'S3'::text;

  -- S4: lines that do not add up (or an unknown price): one line of the plan, the total.
  perform public.record_studio_invoice('in_testInv0003', 'sub_testInv01', 'manual', 'paid', 25.00, 'EUR', now(), 25.00,
    jsonb_build_array(jsonb_build_object('amount', '19.90', 'price_id', 'price_unknownXYZ', 'quantity', 1)));
  select * into d from public.invoices where studio_invoice_id = 'in_testInv0003';
  if jsonb_array_length(d.lines) <> 1 or (d.lines -> 0 ->> 'total_incl')::numeric <> 25.00 or d.lines -> 0 ->> 'plan' <> 'artist'
     or d.total_incl_tax <> 25.00 then
    raise exception 'FAIL S4: fallback %', d.lines;
  end if;
  passed := passed || 'S4'::text;

  -- S5: a plan change outside the franchise — the former plan credited (inactive price), the new one charged.
  update public.store_settings set vat_franchise = false where id;
  v_rate := coalesce(private.configured_vat_rate_bp(
              coalesce(nullif((select country_code from public.store_settings where id), ''), 'FR'), 'standard'), 0);
  perform public.record_studio_invoice('in_testInv0004', 'sub_testInv01', 'subscription_update', 'paid', 15.00, 'EUR', now(), 20.00,
    jsonb_build_array(
      jsonb_build_object('amount', '-4.95', 'price_id', 'price_testInvOldEssM', 'quantity', 1, 'proration', true),
      jsonb_build_object('amount', '24.95', 'price_id', 'price_testInvAtelierM', 'quantity', 1, 'proration', true)));
  select * into d from public.invoices where studio_invoice_id = 'in_testInv0004';
  if jsonb_array_length(d.lines) <> 2 or d.lines -> 0 ->> 'plan' <> 'essential' or (d.lines -> 0 ->> 'total_incl')::numeric <> -4.95
     or (d.lines -> 1 ->> 'proration')::boolean is not true or (d.lines -> 1 ->> 'vat_rate_bp')::int <> v_rate
     or d.total_incl_tax <> 20.00 or d.total_incl_tax <> d.total_excl_tax + d.total_tax
     or d.total_tax <> public.vat_included(-4.95, v_rate) + public.vat_included(24.95, v_rate)
     or (d.seller ->> 'vat_franchise')::boolean is not false
     or (d.payment ->> 'charged_amount')::numeric <> 15.00 or (d.payment ->> 'balance_amount')::numeric <> 5.00 then
    raise exception 'FAIL S5: proration %', to_jsonb(d);
  end if;
  update public.store_settings set vat_franchise = true where id;
  perform public.record_studio_invoice('in_testInv0005', 'sub_testInv01', 'subscription_update', 'paid', 0, 'EUR', now(), -3.00, '[]'::jsonb);
  select count(*) into v_cnt from public.invoices where studio_invoice_id = 'in_testInv0005';
  if v_cnt <> 0 then raise exception 'FAIL S5: a negative invoice got a document'; end if;
  passed := passed || 'S5'::text;

  -- S6: the owner reads, another member does not; nobody changes a document.
  v_state := null;
  begin
    update public.invoices set total_tax = 0 where studio_invoice_id = 'in_testInv0001';
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL S6: the service role changed an invoice (%)', v_state; end if;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', m1, 'role', 'authenticated')::text, true);
  select count(*) into v_cnt from public.invoices where studio_invoice_id like 'in_testInv%';
  if v_cnt <> 4 then raise exception 'FAIL S6: the owner reads % documents', v_cnt; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', m2, 'role', 'authenticated')::text, true);
  select count(*) into v_cnt from public.invoices where studio_invoice_id like 'in_testInv%';
  if v_cnt <> 0 then raise exception 'FAIL S6: another member reads % documents', v_cnt; end if;
  v_state := null;
  begin
    delete from public.invoices where studio_invoice_id = 'in_testInv0001';
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL S6: a member deleted a document (%)', v_state; end if;
  passed := passed || 'S6'::text;

  -- S7: a withdrawal refund confirmed → one credit note against the first invoice.
  perform set_config('role', 'service_role', true);
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  perform public.record_studio_invoice('in_testInv0301', 'sub_testInv03', 'subscription_create', 'paid', 19.90, 'EUR',
    now() - interval '2 days', 19.90,
    jsonb_build_array(jsonb_build_object('amount', '19.90', 'price_id', 'price_testInvArtistM', 'quantity', 1,
      'period_start', to_char(now() - interval '2 days', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), 'proration', false)));
  r := public.request_studio_withdrawal(m3, now() - interval '2 days', now() + interval '28 days');
  select * into w from public.studio_withdrawals where id = (r ->> 'id')::uuid;
  perform public.record_studio_withdrawal_step(w.id, 'canceled');
  perform public.record_studio_withdrawal_step(w.id, 'refund_sent', 're_testInv0301');
  select count(*) into v_cnt from public.invoices where studio_withdrawal_id = w.id;
  if v_cnt <> 0 then raise exception 'FAIL S7: credit note before the refund was confirmed'; end if;
  -- The acknowledgement went out before the refund was confirmed.
  insert into public.email_log (event_key, template_key, locale, recipient_hash, status, created_at, sent_at)
  values ('studio_withdrawal:' || w.id, 'studio_withdrawal_confirmation', 'fr', repeat('a', 64), 'sent',
          now() - interval '1 minute', now() - interval '1 minute');
  perform public.settle_studio_withdrawal_refund(w.id, 're_testInv0301', 'succeeded');
  perform public.settle_studio_withdrawal_refund(w.id, 're_testInv0301', 'succeeded');
  select * into n from public.invoices where studio_withdrawal_id = w.id;
  select * into d from public.invoices where studio_invoice_id = 'in_testInv0301' and kind = 'invoice';
  if n.id is null or n.kind <> 'credit_note' or n.invoice_number !~ '^AV-' or n.credited_invoice_id <> d.id
     or n.total_incl_tax <> w.refund_amount or n.studio_invoice_id <> 'in_testInv0301'
     or n.payment ->> 'credited_invoice_number' <> d.invoice_number or (n.lines -> 0 ->> 'withdrawal')::boolean is not true then
    raise exception 'FAIL S7: credit note % (withdrawal %)', to_jsonb(n), to_jsonb(w);
  end if;
  select count(*) into v_cnt from public.invoices where studio_withdrawal_id = w.id;
  if v_cnt <> 1 then raise exception 'FAIL S7: % credit notes after a replay', v_cnt; end if;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', m3, 'role', 'authenticated')::text, true);
  select count(*) into v_cnt from public.invoices where studio_invoice_id = 'in_testInv0301';
  if v_cnt <> 2 then raise exception 'FAIL S7: the member reads % of their documents', v_cnt; end if;
  passed := passed || 'S7'::text;

  -- S8: e-mail sweeps.
  perform set_config('role', 'service_role', true);
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  select count(*) into v_cnt from public.pending_studio_invoice_emails(100) p where p.stripe_invoice_id = 'in_testInv0002';
  if v_cnt <> 1 then raise exception 'FAIL S8: renewal invoice e-mail pending % times', v_cnt; end if;
  select count(*) into v_cnt from public.pending_studio_invoice_emails(100) p where p.stripe_invoice_id = 'in_testInv0001';
  if v_cnt <> 0 then raise exception 'FAIL S8: the first invoice is mailed as a renewal'; end if;
  select count(*) into v_cnt from public.pending_studio_credit_note_emails(100) p where p.withdrawal_id = w.id;
  if v_cnt <> 1 then raise exception 'FAIL S8: credit note e-mail pending % times', v_cnt; end if;
  insert into public.consent_records (user_id, purpose, granted, policy_version, source, created_at)
  values (m1, 'studio_immediate_access', true, 'test-v1', 'checkout', now() - interval '1 day');
  update public.studio_subscriptions set created_at = now() where stripe_subscription_id = 'sub_testInv01';
  select p.stripe_invoice_id into v_num from public.pending_studio_subscription_emails(100) p
    join public.studio_subscriptions s on s.id = p.subscription_id where s.stripe_subscription_id = 'sub_testInv01';
  if v_num is distinct from 'in_testInv0001' then raise exception 'FAIL S8: confirmation names %', v_num; end if;
  passed := passed || 'S8'::text;

  raise exception 'ALL STUDIO INVOICE TESTS PASSED: %', array_to_string(passed, ', ');
end;
$$;
