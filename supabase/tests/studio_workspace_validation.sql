-- =============================================================================
-- 3D Studio workspace validation suite (Gem Group renders,
-- migration `…_studio_gem_group_thumbnails`; shop gems and scene format 2,
-- migration `…_studio_shop_gems`).
-- =============================================================================
-- Requires all migrations. ONE transaction, ALWAYS rolled back by raising
-- `ALL STUDIO WORKSPACE TESTS PASSED` (or `FAIL: ...`).
-- Covers: an owner creates a group with its render path and updates it; a
-- path outside the owner's folder is refused; another member neither sees
-- nor changes the group; a visitor reads nothing; format-1 scenes and groups
-- are refused; visitors read how the shop's active gems are drawn, not an
-- archived one's; a member cannot write those rows; a variant row must
-- belong to its product and carries no shape.
-- =============================================================================

do $$
declare
  ma   uuid := '00000000-0000-4000-a000-0000000e0001';
  mb   uuid := '00000000-0000-4000-a000-0000000e0002';
  v_id    uuid;
  v_cnt   int;
  v_txt   text;
  v_state text;
  v_piece jsonb := '{"productId":"solitaire","ss":5,"look":{"shape":"round","material":"crystal","color":"#ffffff","effect":"none"},"rotation":0,"at":{"x":0,"y":0,"z":0},"facing":{"x":0,"y":0,"z":1}}';
  v_data  jsonb;
  v_active   uuid;
  v_archived uuid;
  v_other_variant uuid;
  passed  text[] := '{}';
begin
  v_data := jsonb_build_object('version', 2, 'anchorToothId', '11', 'pieces', jsonb_build_array(v_piece, v_piece));
  insert into auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at) values
    (ma, 'authenticated', 'authenticated', 'studio.a.test@example.invalid', '{"first_name":"Ana"}', now(), now()),
    (mb, 'authenticated', 'authenticated', 'studio.b.test@example.invalid', '{"first_name":"Ben"}', now(), now());

  -- T1: the owner writes the render path with the group, then changes it.
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', ma, 'role', 'authenticated')::text, true);
  insert into public.gem_groups (name, group_data, thumbnail_path)
    values ('Papillon', v_data, ma::text || '/groups/first.jpg')
    returning id into v_id;
  update public.gem_groups set thumbnail_path = ma::text || '/groups/' || v_id::text || '.jpg' where id = v_id;
  select thumbnail_path into v_txt from public.gem_groups where id = v_id;
  if v_txt is distinct from ma::text || '/groups/' || v_id::text || '.jpg' then raise exception 'FAIL T1: path %', v_txt; end if;
  passed := array_append(passed, 'T1 owner writes the group render path');

  -- T2: a path in another member's folder is refused.
  v_state := null;
  begin
    update public.gem_groups set thumbnail_path = mb::text || '/groups/x.jpg' where id = v_id;
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '23514' then raise exception 'FAIL T2: foreign folder accepted (%)', v_state; end if;
  passed := array_append(passed, 'T2 render path outside the owner folder refused');

  -- T3: another member neither sees nor changes the group.
  perform set_config('request.jwt.claims', json_build_object('sub', mb, 'role', 'authenticated')::text, true);
  select count(*) into v_cnt from public.gem_groups where id = v_id;
  if v_cnt <> 0 then raise exception 'FAIL T3: other member sees the group'; end if;
  update public.gem_groups set thumbnail_path = null where id = v_id;
  get diagnostics v_cnt = row_count;
  if v_cnt <> 0 then raise exception 'FAIL T3: other member updated the group'; end if;
  passed := array_append(passed, 'T3 another member neither reads nor updates the group');

  -- T4: a visitor reads nothing.
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{"role": "anon"}', true);
  v_state := null;
  begin
    select count(*) into v_cnt from public.gem_groups;
    if v_cnt <> 0 then v_state := 'READ'; end if;
  exception when others then v_state := sqlstate;
  end;
  if v_state = 'READ' then raise exception 'FAIL T4: visitor read groups'; end if;
  passed := array_append(passed, 'T4 visitors read no group');

  -- T5: designs of the former built-in library (format 1) are refused.
  execute 'reset role';
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', ma, 'role', 'authenticated')::text, true);
  v_state := null;
  begin
    insert into public.creations (name, scene_data) values ('Old', '{"version":1,"pieces":[]}');
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '23514' then raise exception 'FAIL T5: format-1 scene accepted (%)', v_state; end if;
  v_state := null;
  begin
    insert into public.gem_groups (name, group_data) values ('Old', jsonb_set(v_data, '{version}', '1'));
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '23514' then raise exception 'FAIL T5: format-1 group accepted (%)', v_state; end if;
  insert into public.creations (name, scene_data) values ('New', '{"version":2,"model":"dentition","pieces":[]}');
  passed := array_append(passed, 'T5 only format-2 scenes and groups are stored');

  -- T6: visitors read the drawing rows of active gems only.
  execute 'reset role';
  select p.id into v_active from public.products p
    join public.studio_gem_appearances a on a.product_id = p.id and a.variant_id is null
   where p.status = 'active' limit 1;
  select p.id into v_archived from public.products p
   where p.status = 'archived'
     and not exists (select 1 from public.studio_gem_appearances a where a.product_id = p.id)
   limit 1;
  if v_archived is null then raise exception 'FAIL T6: no archived product to test with'; end if;
  insert into public.studio_gem_appearances (product_id, shape, material, color) values (v_archived, 'round', 'crystal', '#ffffff');
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{"role": "anon"}', true);
  select count(*) into v_cnt from public.studio_gem_appearances where product_id = v_active;
  if v_active is null or v_cnt <> 1 then raise exception 'FAIL T6: visitor cannot read an active gem (%)', v_cnt; end if;
  select count(*) into v_cnt from public.studio_gem_appearances where product_id = v_archived;
  if v_cnt <> 0 then raise exception 'FAIL T6: visitor reads an archived gem'; end if;
  passed := array_append(passed, 'T6 visitors read active gems only');

  -- T7: a member cannot write the drawing rows.
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', ma, 'role', 'authenticated')::text, true);
  v_state := null;
  begin
    insert into public.studio_gem_appearances (product_id, shape, material, color) values (v_archived, 'heart', 'crystal', '#000000');
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL T7: member inserted a drawing row (%)', v_state; end if;
  update public.studio_gem_appearances set color = '#000000' where product_id = v_active;
  get diagnostics v_cnt = row_count;
  if v_cnt <> 0 then raise exception 'FAIL T7: member updated a drawing row'; end if;
  delete from public.studio_gem_appearances where product_id = v_active;
  get diagnostics v_cnt = row_count;
  if v_cnt <> 0 then raise exception 'FAIL T7: member deleted a drawing row'; end if;
  passed := array_append(passed, 'T7 members cannot write drawing rows');

  -- T8: a variant row belongs to its own product and carries no shape.
  execute 'reset role';
  select v.id into v_other_variant from public.product_variants v where v.product_id <> v_archived limit 1;
  v_state := null;
  begin
    insert into public.studio_gem_appearances (product_id, variant_id, material, color) values (v_archived, v_other_variant, 'metal', '#f2c25c');
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '23503' then raise exception 'FAIL T8: foreign variant accepted (%)', v_state; end if;
  v_state := null;
  begin
    insert into public.studio_gem_appearances (product_id, shape, material, color) values (v_archived, 'hexagon', 'crystal', '#ffffff');
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '23514' then raise exception 'FAIL T8: unknown shape accepted (%)', v_state; end if;
  passed := array_append(passed, 'T8 variant rows match their product; shapes are checked');

  execute 'reset role';
  raise exception 'ALL STUDIO WORKSPACE TESTS PASSED (% groups, rolled back): %',
    cardinality(passed), array_to_string(passed, ' | ');
end;
$$;
