-- =============================================================================
-- 3D Studio workspace validation suite (Gem Group renders,
-- migration `…_studio_gem_group_thumbnails`).
-- =============================================================================
-- Requires all migrations. ONE transaction, ALWAYS rolled back by raising
-- `ALL STUDIO WORKSPACE TESTS PASSED` (or `FAIL: ...`).
-- Covers: an owner creates a group with its render path and updates it; a
-- path outside the owner's folder is refused; another member neither sees
-- nor changes the group; a visitor reads nothing.
-- =============================================================================

do $$
declare
  ma   uuid := '00000000-0000-4000-a000-0000000e0001';
  mb   uuid := '00000000-0000-4000-a000-0000000e0002';
  v_id    uuid;
  v_cnt   int;
  v_txt   text;
  v_state text;
  v_data  jsonb := '{"version":1,"anchorToothId":"11","pieces":[{"jewelryTypeId":"crystal-round","color":"crystal","scale":1,"rotation":0,"at":{"x":0,"y":0,"z":0},"facing":{"x":0,"y":0,"z":1}},{"jewelryTypeId":"crystal-round","color":"crystal","scale":1,"rotation":0,"at":{"x":2,"y":0,"z":0},"facing":{"x":0,"y":0,"z":1}}]}';
  passed  text[] := '{}';
begin
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

  execute 'reset role';
  raise exception 'ALL STUDIO WORKSPACE TESTS PASSED (% groups, rolled back): %',
    cardinality(passed), array_to_string(passed, ' | ');
end;
$$;
