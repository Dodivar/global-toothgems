-- =============================================================================
-- Iteration 17 validation suite — member wishlist (migration `…_wishlist`).
-- =============================================================================
-- Requires all migrations + seed.sql (at least one active product). ONE
-- transaction, ALWAYS rolled back by raising `ALL ITERATION 17 TESTS PASSED`
-- (or `FAIL: ...`).
-- =============================================================================

do $$
declare
  m1      uuid := '00000000-0000-4000-a000-000000170001';
  m2      uuid := '00000000-0000-4000-a000-000000170002';
  p_live  uuid;
  p_draft uuid := '00000000-0000-4000-a000-0000001700d1';
  v_cnt   int;
  v_owner uuid;
  passed  text[] := '{}';
begin
  select id into p_live from public.products where status = 'active' order by created_at limit 1;
  if p_live is null then raise exception 'FAIL setup: no active product (run seed.sql)'; end if;

  insert into public.products (id, name, slug, price, status)
  values (p_draft, 'Wishlist draft test', 'wishlist-draft-test-17', 10, 'draft');

  insert into auth.users (id, aud, role, email, created_at, updated_at) values
    (m1, 'authenticated', 'authenticated', 'wishlist17a.test@example.invalid', now(), now()),
    (m2, 'authenticated', 'authenticated', 'wishlist17b.test@example.invalid', now(), now());
  -- m2 keeps a favourite, added as the database owner, for the isolation checks.
  insert into public.wishlist_items (user_id, product_id) values (m2, p_live);

  -- Act as m1 --------------------------------------------------------------------
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', m1, 'role', 'authenticated')::text, true);

  -- W1: a member adds a shop product; the owner comes from the session ----------
  insert into public.wishlist_items (product_id) values (p_live);
  select user_id into v_owner from public.wishlist_items where product_id = p_live;
  if v_owner is distinct from m1 then raise exception 'FAIL W1: owner is %, expected m1', v_owner; end if;
  passed := passed || 'W1'::text;

  -- W2: adding the same product twice is refused by the key --------------------
  begin
    insert into public.wishlist_items (product_id) values (p_live);
    raise exception 'FAIL W2: duplicate favourite accepted';
  exception when unique_violation then null;
  end;
  passed := passed || 'W2'::text;

  -- W3: the owner cannot be chosen by the client --------------------------------
  begin
    insert into public.wishlist_items (user_id, product_id) values (m2, p_live);
    raise exception 'FAIL W3: user_id written by the client';
  exception when insufficient_privilege then null;
  end;
  passed := passed || 'W3'::text;

  -- W4: a product that is not active in the shop cannot be added ----------------
  begin
    insert into public.wishlist_items (product_id) values (p_draft);
    raise exception 'FAIL W4: draft product added';
  exception when insufficient_privilege then null;
  end;
  passed := passed || 'W4'::text;

  -- W5: a member only reads their own favourites --------------------------------
  select count(*) into v_cnt from public.wishlist_items;
  if v_cnt <> 1 then raise exception 'FAIL W5: member reads % rows, expected 1', v_cnt; end if;
  passed := passed || 'W5'::text;

  -- W6: a member cannot remove someone else's favourite, and no row is editable --
  delete from public.wishlist_items where user_id = m2;
  reset role;
  select count(*) into v_cnt from public.wishlist_items where user_id = m2;
  if v_cnt <> 1 then raise exception 'FAIL W6: another member''s favourite was removed'; end if;
  perform set_config('role', 'authenticated', true);
  begin
    update public.wishlist_items set created_at = now() where product_id = p_live;
    raise exception 'FAIL W6: favourite updated';
  exception when insufficient_privilege then null;
  end;
  passed := passed || 'W6'::text;

  -- W7: a member removes their own favourite --------------------------------------
  delete from public.wishlist_items where product_id = p_live;
  select count(*) into v_cnt from public.wishlist_items;
  if v_cnt <> 0 then raise exception 'FAIL W7: own favourite not removed'; end if;
  passed := passed || 'W7'::text;

  -- W8: a suspended account cannot add ----------------------------------------------
  reset role;   -- the database owner is a trusted backend for the profile guard
  update public.profiles set status = 'suspended' where id = m1;
  perform set_config('role', 'authenticated', true);
  begin
    insert into public.wishlist_items (product_id) values (p_live);
    raise exception 'FAIL W8: suspended account added a favourite';
  exception when insufficient_privilege then null;
  end;
  passed := passed || 'W8'::text;

  -- W9: visitors have no access -----------------------------------------------------
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  begin
    perform 1 from public.wishlist_items limit 1;
    raise exception 'FAIL W9: visitors read the wishlist';
  exception when insufficient_privilege then null;
  end;
  passed := passed || 'W9'::text;

  -- W10: deleting the account deletes its favourites ----------------------------------
  reset role;
  delete from auth.users where id = m2;
  select count(*) into v_cnt from public.wishlist_items where user_id = m2;
  if v_cnt <> 0 then raise exception 'FAIL W10: favourites survived account deletion'; end if;
  passed := passed || 'W10'::text;

  raise exception 'ALL ITERATION 17 TESTS PASSED: %', array_to_string(passed, ', ');
end;
$$;
