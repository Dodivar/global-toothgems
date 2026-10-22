-- =============================================================================
-- Low-stock digest validation suite (migration 20261022090133_low_stock_digest)
-- =============================================================================
-- Proves, as the roles that really call it:
--
--   * nobody but the service role runs pending_stock_digest();
--   * out-of-stock and low-stock sellable items are listed, an item above its
--     threshold, a draft product, a gift card, a digital product and an inactive
--     option are not; a product with options is reported option by option;
--   * the quantity shown is on hand minus reserved;
--   * before 08:00 Paris time nothing is due; from then on the digest is due
--     until today's e-mail (stock_digest:<Paris date>) is sent, then it is not;
--   * the template exists in French and English with its three variables.
--
-- ONE transaction, ALWAYS rolled back by raising `ALL STOCK DIGEST TESTS PASSED`
-- (or `FAIL: ...`).
-- =============================================================================

do $$
declare
  p_out    uuid;
  p_low    uuid;
  p_ok     uuid;
  p_draft  uuid;
  p_gift   uuid;
  p_dig    uuid;
  p_var    uuid;
  v_red    uuid;
  v_blue   uuid;
  v_off    uuid;
  v_hour   numeric := extract(hour from now() at time zone 'Europe/Paris');
  v_date   text := ((now() at time zone 'Europe/Paris')::date)::text;
  v_cnt    int;
  v_ok     boolean;
  passed   text[] := '{}';
begin
  insert into public.products (name, slug, price, currency, status, product_type)
  values ('SD rupture', 'sd-rupture', 10, 'EUR', 'active', 'physical') returning id into p_out;
  insert into public.inventory_items (product_id, quantity_on_hand) values (p_out, 0);
  insert into public.products (name, slug, price, currency, status, product_type)
  values ('SD bas', 'sd-bas', 10, 'EUR', 'active', 'physical') returning id into p_low;
  insert into public.inventory_items (product_id, quantity_on_hand, quantity_reserved, low_stock_threshold) values (p_low, 9, 4, 5);
  insert into public.products (name, slug, price, currency, status, product_type)
  values ('SD ok', 'sd-ok', 10, 'EUR', 'active', 'physical') returning id into p_ok;
  insert into public.inventory_items (product_id, quantity_on_hand) values (p_ok, 50);
  insert into public.products (name, slug, price, currency, status, product_type)
  values ('SD brouillon', 'sd-brouillon', 10, 'EUR', 'draft', 'physical') returning id into p_draft;
  insert into public.inventory_items (product_id, quantity_on_hand) values (p_draft, 0);
  insert into public.products (name, slug, price, currency, status, product_type)
  values ('SD carte', 'sd-carte', 10, 'EUR', 'active', 'gift_card') returning id into p_gift;
  insert into public.inventory_items (product_id, quantity_on_hand) values (p_gift, 0);
  insert into public.products (name, slug, price, currency, status, product_type)
  values ('SD numerique', 'sd-numerique', 10, 'EUR', 'active', 'digital') returning id into p_dig;
  insert into public.inventory_items (product_id, quantity_on_hand) values (p_dig, 0);
  insert into public.products (name, slug, price, currency, status, product_type)
  values ('SD options', 'sd-options', 10, 'EUR', 'active', 'physical') returning id into p_var;
  insert into public.product_variants (product_id, name) values (p_var, 'Rouge') returning id into v_red;
  insert into public.product_variants (product_id, name) values (p_var, 'Bleu') returning id into v_blue;
  insert into public.product_variants (product_id, name, is_active) values (p_var, 'Ancien', false) returning id into v_off;
  insert into public.inventory_items (variant_id, quantity_on_hand) values (v_red, 0), (v_blue, 40), (v_off, 0);
  -- Today's digest, not yet sent.
  delete from public.email_log where event_key = 'stock_digest:' || v_date;

  -- D1: only the service role runs it
  perform set_config('role', 'anon', true);
  begin
    perform * from public.pending_stock_digest();
    raise exception 'FAIL D1: anon ran pending_stock_digest';
  exception when insufficient_privilege then null;
  end;
  perform set_config('role', 'authenticated', true);
  begin
    perform * from public.pending_stock_digest();
    raise exception 'FAIL D1: authenticated ran pending_stock_digest';
  exception when insufficient_privilege then null;
  end;
  execute 'reset role';
  passed := passed || 'D1'::text;

  -- D2: what is listed (from 08:00 Paris time; before it nothing is due)
  perform set_config('role', 'service_role', true);
  select count(*) into v_cnt from public.pending_stock_digest()
   where product_id in (p_out, p_low, p_ok, p_draft, p_gift, p_dig, p_var);
  if v_hour < 8 then
    if v_cnt <> 0 then raise exception 'FAIL D2: % rows due before 08:00 Paris time', v_cnt; end if;
    passed := passed || 'D2(before-8h)'::text;
  else
    if v_cnt <> 3 then raise exception 'FAIL D2: % rows listed (expected 3: out, low, red option)', v_cnt; end if;
    if not exists (select 1 from public.pending_stock_digest() d
                    where d.product_id = p_out and d.variant_name is null and d.stock_status = 'out_of_stock' and d.available = 0) then
      raise exception 'FAIL D2: out-of-stock product missing';
    end if;
    if not exists (select 1 from public.pending_stock_digest() d
                    where d.product_id = p_low and d.stock_status = 'low_stock' and d.available = 5 and d.threshold = 5) then
      raise exception 'FAIL D2: low-stock product missing or wrong quantity (on hand 9 - reserved 4 = 5)';
    end if;
    if not exists (select 1 from public.pending_stock_digest() d
                    where d.product_id = p_var and d.variant_name = 'Rouge' and d.stock_status = 'out_of_stock') then
      raise exception 'FAIL D2: out-of-stock option missing';
    end if;
    if (select d.digest_date::text from public.pending_stock_digest() d limit 1) <> v_date then
      raise exception 'FAIL D2: wrong digest date';
    end if;
    if (select d.stock_status from public.pending_stock_digest() d limit 1) <> 'out_of_stock' then
      raise exception 'FAIL D2: out-of-stock items must come first';
    end if;
    passed := passed || 'D2'::text;
  end if;
  execute 'reset role';

  -- D3: a failed attempt is retried; once today's e-mail is sent, nothing is due
  if v_hour >= 8 then
    insert into public.email_log (event_key, template_key, locale, recipient_hash, status, attempt)
    values ('stock_digest:' || v_date, 'stock_digest', 'fr', repeat('a', 64), 'failed', 1);
    perform set_config('role', 'service_role', true);
    select count(*) into v_cnt from public.pending_stock_digest() where product_id = p_out;
    if v_cnt <> 1 then raise exception 'FAIL D3: a failed attempt must be retried (% rows)', v_cnt; end if;
    execute 'reset role';
    update public.email_log set status = 'sent', sent_at = now() where event_key = 'stock_digest:' || v_date;
    perform set_config('role', 'service_role', true);
    select count(*) into v_cnt from public.pending_stock_digest();
    if v_cnt <> 0 then raise exception 'FAIL D3: % rows due after the digest was sent', v_cnt; end if;
    execute 'reset role';
    passed := passed || 'D3'::text;
  end if;

  -- D4: the template
  select (t.variables @> array['date', 'out_count', 'low_count'])
         and exists (select 1 from public.email_template_translations x where x.template_id = t.id and x.locale = 'en')
    into v_ok from public.email_templates t where t.key = 'stock_digest';
  if v_ok is not true then raise exception 'FAIL D4: stock_digest template missing, variables or English translation'; end if;
  passed := passed || 'D4'::text;

  raise exception 'ALL STOCK DIGEST TESTS PASSED: %', array_to_string(passed, ' ');
end;
$$;
