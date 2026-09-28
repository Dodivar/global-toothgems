-- =============================================================================
-- Iteration 13 validation suite — gem colours managed from the back office.
-- =============================================================================
-- Requires all migrations + seed.sql. ONE transaction, ALWAYS rolled back by
-- raising `ALL ITERATION 13 TESTS PASSED` (or `FAIL: ...`).
-- =============================================================================

do $$
declare
  mgr   uuid := '00000000-0000-4000-a000-000000130002';
  vwr   uuid := '00000000-0000-4000-a000-000000130003';
  p_star uuid;
  v_multi uuid; v_crystal uuid; v_new uuid; v_ids uuid[];
  res jsonb; v_state text; v_cnt int;
  passed text[] := '{}';
begin
  -- Fixtures -------------------------------------------------------------------
  insert into auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at) values
    (mgr, 'authenticated', 'authenticated', 'mgr13.test@example.invalid', '{"first_name":"Mia"}', now(), now()),
    (vwr, 'authenticated', 'authenticated', 'vwr13.test@example.invalid', '{"first_name":"Vic"}', now(), now());
  update public.profiles set role = 'manager' where id = mgr;
  update public.profiles set role = 'viewer'  where id = vwr;
  select id into p_star from public.products where slug = 'etoile-cristal';
  select id into v_multi from public.gem_colors where is_multicolor;
  select id into v_crystal from public.gem_colors where slug = 'crystal';

  -- C1: seed — ten colours + the multicolour entry, all with an English name ---
  if (select count(*) from public.gem_colors) <> 11 or v_multi is null then
    raise exception 'FAIL C1: seed incomplete';
  end if;
  if exists (select 1 from public.gem_colors c where not exists (
       select 1 from public.gem_color_translations t
        where t.gem_color_id = c.id and t.locale = 'en' and t.status = 'published')) then
    raise exception 'FAIL C1: colour without English name';
  end if;
  passed := array_append(passed, 'C1 seed: 10 colours + multicolour, translated');

  -- C2: one exact shade per colour; one multicolour entry at most --------------
  v_state := null;
  begin
    insert into public.gem_colors (slug, name, hex) values ('bicolor', 'Bicolore', '#ff0000,#00ff00');
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '23514' then raise exception 'FAIL C2: two-tone hex accepted (%)', v_state; end if;
  v_state := null;
  begin
    insert into public.gem_colors (slug, name, hex, is_multicolor) values ('multi-2', 'Multi 2', null, true);
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '23505' then raise exception 'FAIL C2: second multicolour accepted (%)', v_state; end if;
  passed := array_append(passed, 'C2 single hex per colour, single multicolour entry');

  -- C3: visitors see active colours and published names only -------------------
  update public.gem_colors set is_active = false where slug = 'gold';
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  select count(*) into v_cnt from public.gem_colors;
  if v_cnt <> 10 then raise exception 'FAIL C3: anon sees % colours', v_cnt; end if;
  v_state := null;
  begin
    insert into public.gem_colors (slug, name, hex) values ('rouge', 'Rouge', '#ff0000');
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL C3: anon inserted (%)', v_state; end if;
  v_state := null;
  begin
    perform public.admin_save_gem_color('{"slug":"rouge","name":"Rouge","name_en":"Red","hex":"#ff0000"}');
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL C3: anon saved (%)', v_state; end if;
  execute 'reset role';
  passed := array_append(passed, 'C3 anon reads active colours only and cannot write');

  -- C4: a read-only staff member reads everything and writes nothing ----------
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', vwr, 'role', 'authenticated')::text, true);
  if (select count(*) from public.gem_colors) <> 11 then raise exception 'FAIL C4: viewer misses hidden colours'; end if;
  v_state := null;
  begin
    perform public.admin_save_gem_color('{"slug":"rouge","name":"Rouge","name_en":"Red","hex":"#ff0000"}');
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL C4: viewer saved (%)', v_state; end if;
  execute 'reset role';
  passed := array_append(passed, 'C4 viewer reads all, cannot write');

  -- C5: a manager creates a colour: slug made unique, hex normalised, EN published
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', mgr, 'role', 'authenticated')::text, true);
  res := public.admin_save_gem_color('{"slug":"crystal","name":"Cristal fumé","name_en":"Smoked crystal","hex":"#A0A4AB"}');
  v_new := (res ->> 'id')::uuid;
  if res ->> 'slug' <> 'crystal-2' then raise exception 'FAIL C5: slug not made unique: %', res; end if;
  if (select hex from public.gem_colors where id = v_new) <> '#a0a4ab' then raise exception 'FAIL C5: hex not normalised'; end if;
  if (select position from public.gem_colors where id = v_new) <> 11 then raise exception 'FAIL C5: not appended'; end if;
  if not exists (select 1 from public.gem_color_translations
                  where gem_color_id = v_new and locale = 'en' and name = 'Smoked crystal' and status = 'published') then
    raise exception 'FAIL C5: English name not saved';
  end if;
  passed := array_append(passed, 'C5 create: unique slug, lowercase hex, EN published, appended');

  -- C6: names required in both languages; invalid shades refused -------------
  foreach res in array array[
    '{"slug":"rouge","name":"Rouge","name_en":"","hex":"#ff0000"}'::jsonb,
    '{"slug":"rouge","name":" ","name_en":"Red","hex":"#ff0000"}'::jsonb,
    '{"slug":"rouge","name":"Rouge","name_en":"Red","hex":"red"}'::jsonb,
    '{"slug":"rouge","name":"Rouge","name_en":"Red"}'::jsonb,
    '{"slug":"Rouge vif","name":"Rouge","name_en":"Red","hex":"#ff0000"}'::jsonb]
  loop
    v_state := null;
    begin
      perform public.admin_save_gem_color(res);
    exception when others then v_state := sqlstate;
    end;
    if v_state is distinct from '22023' then raise exception 'FAIL C6: % accepted (%)', res, v_state; end if;
  end loop;
  passed := array_append(passed, 'C6 FR + EN names required, hex and slug validated');

  -- C7: update keeps the slug; the multicolour entry takes no hex -------------
  perform public.admin_save_gem_color(jsonb_build_object(
    'id', v_crystal, 'slug', 'renamed', 'name', 'Cristal', 'name_en', 'Crystal', 'hex', '#e0e8f2'));
  if (select slug from public.gem_colors where id = v_crystal) <> 'crystal' then raise exception 'FAIL C7: slug changed'; end if;
  if (select name from public.gem_colors where id = v_crystal) <> 'Cristal' then raise exception 'FAIL C7: name not saved'; end if;
  v_state := null;
  begin
    perform public.admin_save_gem_color(jsonb_build_object(
      'id', v_multi, 'name', 'Multicolore', 'name_en', 'Multicolour', 'hex', '#ff00ff'));
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '22023' then raise exception 'FAIL C7: multicolour got a hex (%)', v_state; end if;
  perform public.admin_save_gem_color(jsonb_build_object(
    'id', v_multi, 'name', 'Reflets & multicolore', 'name_en', 'Multicolour & special effects'));
  v_state := null;
  begin
    update public.gem_colors set slug = 'other' where id = v_crystal;
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '22023' then raise exception 'FAIL C7: direct slug update allowed (%)', v_state; end if;
  passed := array_append(passed, 'C7 slug immutable, multicolour renamed without a hex');

  -- C8: products may only point at a known colour ----------------------------
  update public.products set metadata = metadata || '{"color":"multicolor"}' where id = p_star;
  v_state := null;
  begin
    update public.products set metadata = metadata || '{"color":"no-such-colour"}' where id = p_star;
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '23503' then raise exception 'FAIL C8: unknown colour accepted (%)', v_state; end if;
  passed := array_append(passed, 'C8 product colour must exist');

  -- C9: delete — refused while used and for the multicolour entry ------------
  update public.products set metadata = metadata || '{"color":"crystal-2"}' where id = p_star;
  v_state := null;
  begin
    perform public.admin_delete_gem_color(v_new);
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '23503' then raise exception 'FAIL C9: used colour deleted (%)', v_state; end if;
  v_state := null;
  begin
    perform public.admin_delete_gem_color(v_multi);
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '23503' then raise exception 'FAIL C9: multicolour deleted (%)', v_state; end if;
  update public.products set metadata = metadata - 'color' where id = p_star;
  perform public.admin_delete_gem_color(v_new);
  if exists (select 1 from public.gem_colors where id = v_new)
     or exists (select 1 from public.gem_color_translations where gem_color_id = v_new) then
    raise exception 'FAIL C9: unused colour not deleted';
  end if;
  passed := array_append(passed, 'C9 delete refused while used / multicolour, allowed otherwise');

  -- C10: reorder needs the complete list -------------------------------------
  select array_agg(id order by position desc) into v_ids from public.gem_colors;
  perform public.admin_reorder_gem_colors(v_ids);
  if (select position from public.gem_colors where id = v_multi) <> 0 then raise exception 'FAIL C10: not reordered'; end if;
  v_state := null;
  begin
    perform public.admin_reorder_gem_colors(v_ids[1:3]);
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '22023' then raise exception 'FAIL C10: partial list accepted (%)', v_state; end if;
  v_state := null;
  begin
    perform public.admin_reorder_gem_colors(v_ids[1:10] || v_ids[1]);
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '22023' then raise exception 'FAIL C10: duplicate id accepted (%)', v_state; end if;
  execute 'reset role';
  passed := array_append(passed, 'C10 reorder of the complete list only');

  -- C11: changes are audited -------------------------------------------------
  if not exists (select 1 from public.audit_logs where table_name = 'gem_colors' and action = 'delete'
                    and record_id = v_new::text) then
    raise exception 'FAIL C11: deletion not audited';
  end if;
  passed := array_append(passed, 'C11 audit trail');

  perform set_config('request.jwt.claims', '', true);
  raise exception 'ALL ITERATION 13 TESTS PASSED (% groups, rolled back): %',
    cardinality(passed), array_to_string(passed, ' | ');
end;
$$;
