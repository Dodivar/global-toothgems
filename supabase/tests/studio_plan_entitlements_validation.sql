-- =============================================================================
-- 3D Studio plan entitlements validation suite
-- (migration 20261026170231_studio_plan_entitlements, decision 113)
-- =============================================================================
--   P1  the numbers: essential 15 creations / 3 Gem Groups, artist 150 / 30,
--       atelier and no tier unlimited (null);
--   P2  a trial member (essential) saves up to 15 creations and 3 Gem Groups
--       as themselves; the next one is refused with GTL01; editing and
--       deleting are not limited, and once under the limit a save passes;
--   P3  an Artist member saves beyond Essential's numbers; an Atelier member
--       and active staff are never limited;
--   P4  after a downgrade the member keeps every row (read and edit) but
--       saves no new one over the new limit;
--   P5  the Glowbook is the Atelier plan's: an Artist or trial member cannot
--       open one (42501); an Atelier member can; once the author drops to
--       Artist the page, its 3D creation and its renders are hidden, and come
--       back on an upgrade; the owner may still delete it;
--   P6  studio_access_state() returns the tier, the Glowbook flag, the limits
--       and the usage of the caller only.
-- ONE transaction, ALWAYS rolled back by raising `ALL STUDIO PLAN TESTS PASSED`.
-- =============================================================================

do $$
declare
  trialist uuid := '00000000-0000-4000-a000-000000420001';
  artistm  uuid := '00000000-0000-4000-a000-000000420002';
  atelierm uuid := '00000000-0000-4000-a000-000000420003';
  staffer  uuid := '00000000-0000-4000-a000-000000420004';
  modr     uuid := '00000000-0000-4000-a000-000000420005';
  v_piece jsonb := '{"productId":"solitaire","ss":5,"look":{"shape":"round","material":"crystal","color":"#ffffff","effect":"none"},"rotation":0,"at":{"x":0,"y":0,"z":0},"facing":{"x":0,"y":0,"z":1}}';
  v_scene jsonb;
  v_group jsonb;
  v_state text;
  v_cnt   int;
  v_json  jsonb;
  c_first uuid;
  c_show  uuid;
  i_show  uuid;
  passed  text[] := '{}';
begin
  v_scene := jsonb_build_object('version', 2, 'model', 'dentition', 'lightPreset', 'studio', 'camera', null,
                                'pieces', jsonb_build_array(v_piece), 'groups', '[]'::jsonb);
  v_group := jsonb_build_object('version', 1, 'pieces', jsonb_build_array(v_piece, v_piece));

  insert into auth.users (id, aud, role, email, created_at, updated_at) values
    (trialist, 'authenticated', 'authenticated', 'plan-1.test@example.invalid', now(), now()),
    (artistm,  'authenticated', 'authenticated', 'plan-2.test@example.invalid', now(), now()),
    (atelierm, 'authenticated', 'authenticated', 'plan-3.test@example.invalid', now(), now()),
    (staffer,  'authenticated', 'authenticated', 'plan-4.test@example.invalid', now(), now()),
    (modr,     'authenticated', 'authenticated', 'plan-5.test@example.invalid', now(), now());
  insert into public.studio_trials (user_id) values (trialist);
  insert into public.studio_subscriptions (user_id, plan, status, stripe_subscription_id, current_period_end) values
    (artistm,  'artist',  'active', 'sub_plan_art', now() + interval '1 month'),
    (atelierm, 'atelier', 'active', 'sub_plan_atl', now() + interval '1 month');
  update public.profiles set role = 'admin', status = 'active' where id = staffer;
  update public.profiles set role = 'manager' where id = modr;

  -- P1: the numbers
  if private.studio_plan_limit('essential', 'creations') <> 15 or private.studio_plan_limit('essential', 'gem_groups') <> 3
     or private.studio_plan_limit('artist', 'creations') <> 150 or private.studio_plan_limit('artist', 'gem_groups') <> 30
     or private.studio_plan_limit('atelier', 'creations') is not null or private.studio_plan_limit(null, 'creations') is not null then
    raise exception 'FAIL P1: plan numbers';
  end if;
  passed := passed || 'P1'::text;

  -- P2: the trial member, as themselves
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', trialist, 'role', 'authenticated')::text, true);
  for n in 1..15 loop
    insert into public.creations (name, scene_data) values ('Look ' || n, v_scene) returning id into c_show;
    if n = 1 then c_first := c_show; end if;
  end loop;
  v_state := null;
  begin
    insert into public.creations (name, scene_data) values ('One too many', v_scene);
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from 'GTL01' then raise exception 'FAIL P2: 16th creation (%)', v_state; end if;
  for n in 1..3 loop
    insert into public.gem_groups (name, group_data) values ('Group ' || n, v_group);
  end loop;
  v_state := null;
  begin
    insert into public.gem_groups (name, group_data) values ('Group 4', v_group);
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from 'GTL01' then raise exception 'FAIL P2: 4th Gem Group (%)', v_state; end if;
  update public.creations set name = 'Renamed at the limit' where id = c_first;
  get diagnostics v_cnt = row_count;
  if v_cnt <> 1 then raise exception 'FAIL P2: edit at the limit refused'; end if;
  delete from public.creations where id = c_first;
  insert into public.creations (name, scene_data) values ('Back under', v_scene);
  passed := passed || 'P2'::text;

  -- P3: Artist beyond Essential; Atelier and staff unlimited
  perform set_config('request.jwt.claims', json_build_object('sub', artistm, 'role', 'authenticated')::text, true);
  for n in 1..20 loop
    insert into public.creations (name, scene_data) values ('Art ' || n, v_scene);
  end loop;
  for n in 1..5 loop
    insert into public.gem_groups (name, group_data) values ('Art group ' || n, v_group);
  end loop;
  perform set_config('request.jwt.claims', json_build_object('sub', atelierm, 'role', 'authenticated')::text, true);
  for n in 1..160 loop
    insert into public.creations (name, scene_data) values ('Atl ' || n, v_scene) returning id into c_show;
  end loop;
  for n in 1..35 loop
    insert into public.gem_groups (name, group_data) values ('Atl group ' || n, v_group);
  end loop;
  perform set_config('request.jwt.claims', json_build_object('sub', staffer, 'role', 'authenticated')::text, true);
  for n in 1..20 loop
    insert into public.gem_groups (name, group_data) values ('Staff group ' || n, v_group);
  end loop;
  passed := passed || 'P3'::text;

  -- P4: Artist drops to Essential (subscription switched): keeps 20, saves none
  execute 'reset role';
  update public.studio_subscriptions set plan = 'essential' where user_id = artistm;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', artistm, 'role', 'authenticated')::text, true);
  select count(*) into v_cnt from public.creations;
  if v_cnt <> 20 then raise exception 'FAIL P4: rows after downgrade (%)', v_cnt; end if;
  update public.creations set description = 'Still editable' where name = 'Art 1';
  get diagnostics v_cnt = row_count;
  if v_cnt <> 1 then raise exception 'FAIL P4: edit after downgrade refused'; end if;
  v_state := null;
  begin
    insert into public.creations (name, scene_data) values ('Over the new limit', v_scene);
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from 'GTL01' then raise exception 'FAIL P4: save over the new limit (%)', v_state; end if;
  execute 'reset role';
  update public.studio_subscriptions set plan = 'artist' where user_id = artistm;
  passed := passed || 'P4'::text;

  -- P5: the Glowbook is Atelier's
  perform set_config('role', 'authenticated', true);
  foreach v_json in array array[to_jsonb(artistm), to_jsonb(trialist)] loop
    perform set_config('request.jwt.claims', json_build_object('sub', v_json #>> '{}', 'role', 'authenticated')::text, true);
    v_state := null;
    begin
      perform public.studio_save_showcase('plan.' || substr(v_json #>> '{}', 33), 'Below Atelier', '', null);
    exception when others then v_state := sqlstate;
    end;
    if v_state is distinct from '42501' then raise exception 'FAIL P5: Glowbook below Atelier (%)', v_state; end if;
  end loop;
  perform set_config('request.jwt.claims', json_build_object('sub', atelierm, 'role', 'authenticated')::text, true);
  perform public.studio_save_showcase('plan.atelier', 'Atelier', '', null);
  update public.creations set thumbnail_path = atelierm || '/show.jpg' where id = c_show;
  i_show := (public.studio_showcase_add(c_show)).id;
  execute 'reset role';
  insert into storage.objects (bucket_id, name) values ('studio-thumbnails', atelierm || '/show.jpg');
  update public.studio_showcases set status = 'approved' where user_id = atelierm;
  update public.studio_showcase_items set status = 'approved' where id = i_show;

  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  if public.studio_public_showcase('plan.atelier') is null then raise exception 'FAIL P5: Atelier page hidden'; end if;
  if public.studio_public_showcase_creation('plan.atelier', i_show) is null then raise exception 'FAIL P5: Atelier 3D hidden'; end if;
  select count(*) into v_cnt from storage.objects where bucket_id = 'studio-thumbnails' and name = atelierm || '/show.jpg';
  if v_cnt <> 1 then raise exception 'FAIL P5: Atelier render not readable'; end if;

  execute 'reset role';
  update public.studio_subscriptions set plan = 'artist' where user_id = atelierm;
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  if public.studio_public_showcase('plan.atelier') is not null then raise exception 'FAIL P5: page shown after downgrade'; end if;
  if public.studio_public_showcase_creation('plan.atelier', i_show) is not null then raise exception 'FAIL P5: 3D shown after downgrade'; end if;
  select count(*) into v_cnt from storage.objects where bucket_id = 'studio-thumbnails' and name = atelierm || '/show.jpg';
  if v_cnt <> 0 then raise exception 'FAIL P5: render readable after downgrade'; end if;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', atelierm, 'role', 'authenticated')::text, true);
  v_state := null;
  begin
    perform public.studio_showcase_reorder(array[c_show]);
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL P5: reorder after downgrade (%)', v_state; end if;

  execute 'reset role';
  update public.studio_subscriptions set plan = 'atelier' where user_id = atelierm;
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  if public.studio_public_showcase('plan.atelier') is null then raise exception 'FAIL P5: page not back after upgrade'; end if;
  execute 'reset role';
  update public.studio_subscriptions set plan = 'artist' where user_id = atelierm;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', atelierm, 'role', 'authenticated')::text, true);
  delete from public.studio_showcases where user_id = atelierm;
  get diagnostics v_cnt = row_count;
  if v_cnt <> 1 then raise exception 'FAIL P5: owner could not delete after downgrade'; end if;
  passed := passed || 'P5'::text;

  -- P6: what the browser is told (the trial member: 15 creations, 3 groups)
  perform set_config('request.jwt.claims', json_build_object('sub', trialist, 'role', 'authenticated')::text, true);
  v_json := public.studio_access_state();
  if v_json ->> 'tier' <> 'essential' or (v_json ->> 'glowbook')::boolean
     or (v_json #>> '{limits,creations}')::int <> 15 or (v_json #>> '{limits,gem_groups}')::int <> 3
     or (v_json #>> '{usage,creations}')::int <> 15 or (v_json #>> '{usage,gem_groups}')::int <> 3 then
    raise exception 'FAIL P6: trial state %', v_json;
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', staffer, 'role', 'authenticated')::text, true);
  v_json := public.studio_access_state();
  if v_json ->> 'tier' <> 'atelier' or not (v_json ->> 'glowbook')::boolean
     or v_json #> '{limits,creations}' <> 'null'::jsonb or (v_json #>> '{usage,gem_groups}')::int <> 20 then
    raise exception 'FAIL P6: staff state %', v_json;
  end if;
  passed := passed || 'P6'::text;

  raise exception 'ALL STUDIO PLAN TESTS PASSED (%)', array_to_string(passed, ', ');
end;
$$;
