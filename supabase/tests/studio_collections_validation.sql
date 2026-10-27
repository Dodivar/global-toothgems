-- =============================================================================
-- 3D Studio collections validation suite
-- (migrations 20261018224456_studio_collections, 20261018224648_studio_collections_fk_index,
--  20261026190000_studio_templates_collections_artist, decision 113 (b))
-- =============================================================================
-- Proves, as the roles that really call them:
--
--   C1  a visitor reads and writes no collection or membership;
--   C2  a member without Studio access cannot create a collection (42501);
--   C3  on the Artist plan: create, rename, colour, add creations; a name
--       taken again ignoring case is refused (23505); a bad colour or an
--       empty / padded / too long name is refused (23514); the owner, id and
--       timestamps are not writable; a membership cannot be re-pointed;
--   C4  another member reads none of it, cannot rename, delete or empty it,
--       cannot add their creation to it, cannot add the owner's creation to
--       their own collection, and cannot forge the owner;
--   C5  deleting a collection keeps its creations; deleting a creation
--       removes its memberships;
--   C6  once the subscription has ended: collections and memberships are no
--       longer read nor written (creating and adding refused with 42501, a
--       rename touches nothing); nothing is deleted, the creations stay
--       readable, and everything is back with the plan;
--   C7  active staff have access (support), without reading members' collections.
--   C8  below the Artist plan (a trial, an Essential subscription) no folder
--       is read, created or filled — not even one kept from a higher plan;
--       Atelier creates them (decision 113 (b)).
--
-- ONE transaction, ALWAYS rolled back by raising `ALL STUDIO COLLECTIONS TESTS PASSED`
-- (or `FAIL: ...`).
-- =============================================================================

do $$
declare
  m1     uuid := '00000000-0000-4000-a000-000000360001';
  m2     uuid := '00000000-0000-4000-a000-000000360002';
  m3     uuid := '00000000-0000-4000-a000-000000360003';
  staff  uuid := '00000000-0000-4000-a000-000000360004';
  m_trial uuid := '00000000-0000-4000-a000-000000360005';
  m_ess  uuid := '00000000-0000-4000-a000-000000360006';
  m_atl  uuid := '00000000-0000-4000-a000-000000360007';
  c_ess  uuid;
  k_ess  uuid;
  r      jsonb;
  v_scene jsonb := '{"version": 2, "pieces": []}';
  c1a    uuid;   -- m1's creations
  c1b    uuid;
  c2a    uuid;   -- m2's creation
  k1     uuid;   -- m1's collections
  k1b    uuid;
  k2     uuid;   -- m2's collection
  v_cnt  int;
  v_state text;
  v_ok   boolean;
  passed text[] := '{}';
begin
  insert into auth.users (id, aud, role, email, created_at, updated_at) values
    (m1, 'authenticated', 'authenticated', 'collections-1.test@example.invalid', now(), now()),
    (m2, 'authenticated', 'authenticated', 'collections-2.test@example.invalid', now(), now()),
    (m3, 'authenticated', 'authenticated', 'collections-3.test@example.invalid', now(), now()),
    (staff, 'authenticated', 'authenticated', 'collections-staff.test@example.invalid', now(), now()),
    (m_trial, 'authenticated', 'authenticated', 'collections-5.test@example.invalid', now(), now()),
    (m_ess, 'authenticated', 'authenticated', 'collections-6.test@example.invalid', now(), now()),
    (m_atl, 'authenticated', 'authenticated', 'collections-7.test@example.invalid', now(), now());
  update public.profiles set role = 'viewer' where id = staff;
  -- m1 and m2 are on the Artist plan (folders need it, decision 113 (b)); m3 has no access.
  insert into public.studio_subscriptions (user_id, plan, status, stripe_subscription_id, current_period_end) values
    (m1,    'artist',    'active', 'sub_col_m1',  now() + interval '1 month'),
    (m2,    'artist',    'active', 'sub_col_m2',  now() + interval '1 month'),
    (m_ess, 'essential', 'active', 'sub_col_ess', now() + interval '1 month'),
    (m_atl, 'atelier',   'active', 'sub_col_atl', now() + interval '1 month');
  insert into public.studio_trials (user_id) values (m_trial);

  -- C1: a visitor reads and writes nothing.
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  v_ok := false;
  begin
    perform 1 from public.studio_collections;
  exception when insufficient_privilege then v_ok := true;
  end;
  if not v_ok then raise exception 'FAIL C1: a visitor read the collections'; end if;
  v_ok := false;
  begin
    perform 1 from public.studio_collection_creations;
  exception when insufficient_privilege then v_ok := true;
  end;
  if not v_ok then raise exception 'FAIL C1: a visitor read the memberships'; end if;
  v_ok := false;
  begin
    insert into public.studio_collections (name) values ('Visiteur');
  exception when insufficient_privilege then v_ok := true;
  end;
  if not v_ok then raise exception 'FAIL C1: a visitor created a collection'; end if;
  passed := passed || 'C1'::text;

  -- C2: no Studio access, no collection.
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', m3, 'role', 'authenticated')::text, true);
  v_state := null;
  begin
    insert into public.studio_collections (name) values ('Sans accès');
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL C2: created without access (%)', v_state; end if;
  passed := passed || 'C2'::text;

  -- C3: with access, the owner organises their creations.
  perform set_config('request.jwt.claims', json_build_object('sub', m2, 'role', 'authenticated')::text, true);
  insert into public.creations (name, scene_data) values ('Création de m2', v_scene) returning id into c2a;
  insert into public.studio_collections (name) values ('Mariages') returning id into k2;

  perform set_config('request.jwt.claims', json_build_object('sub', m1, 'role', 'authenticated')::text, true);
  insert into public.creations (name, scene_data) values ('Création A', v_scene) returning id into c1a;
  insert into public.creations (name, scene_data) values ('Création B', v_scene) returning id into c1b;
  insert into public.studio_collections (name, color) values ('Mariages', 'fuchsia') returning id into k1;
  insert into public.studio_collections (name) values ('Clientes') returning id into k1b;
  select count(*) into v_cnt from public.studio_collections where id = k1 and user_id = m1 and color = 'fuchsia';
  if v_cnt <> 1 then raise exception 'FAIL C3: collection not owned by its creator'; end if;
  insert into public.studio_collection_creations (collection_id, creation_id) values (k1, c1a), (k1, c1b), (k1b, c1a);
  select count(*) into v_cnt from public.studio_collection_creations where creation_id = c1a;
  if v_cnt <> 2 then raise exception 'FAIL C3: a creation in two collections (% rows)', v_cnt; end if;
  -- Adding again, as the webapp does (upsert, ignore duplicates): no error, still one row.
  insert into public.studio_collection_creations (collection_id, creation_id) values (k1, c1a)
    on conflict (collection_id, creation_id) do nothing;
  select count(*) into v_cnt from public.studio_collection_creations where collection_id = k1 and creation_id = c1a;
  if v_cnt <> 1 then raise exception 'FAIL C3: adding twice made % rows', v_cnt; end if;
  update public.studio_collections set name = 'Mariages 2027', color = 'blue' where id = k1;
  select count(*) into v_cnt from public.studio_collections where id = k1 and name = 'Mariages 2027' and color = 'blue';
  if v_cnt <> 1 then raise exception 'FAIL C3: rename not applied'; end if;

  v_state := null;
  begin
    insert into public.studio_collections (name) values ('CLIENTES');
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '23505' then raise exception 'FAIL C3: duplicate name accepted (%)', v_state; end if;
  v_state := null;
  begin
    insert into public.studio_collections (name, color) values ('Couleur', '#ff00ff');
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '23514' then raise exception 'FAIL C3: free colour accepted (%)', v_state; end if;
  v_state := null;
  begin
    insert into public.studio_collections (name) values ('   ');
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '23514' then raise exception 'FAIL C3: empty name accepted (%)', v_state; end if;
  v_state := null;
  begin
    insert into public.studio_collections (name) values (' Espaces ');
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '23514' then raise exception 'FAIL C3: padded name accepted (%)', v_state; end if;
  v_state := null;
  begin
    insert into public.studio_collections (name) values (repeat('x', 41));
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '23514' then raise exception 'FAIL C3: 41-character name accepted (%)', v_state; end if;
  v_ok := false;
  begin
    update public.studio_collections set user_id = m2 where id = k1;
  exception when insufficient_privilege then v_ok := true;
  end;
  if not v_ok then raise exception 'FAIL C3: owner rewritten'; end if;
  v_ok := false;
  begin
    update public.studio_collections set created_at = now() - interval '1 year' where id = k1;
  exception when insufficient_privilege then v_ok := true;
  end;
  if not v_ok then raise exception 'FAIL C3: timestamp rewritten'; end if;
  v_ok := false;
  begin
    update public.studio_collection_creations set collection_id = k1b where collection_id = k1 and creation_id = c1b;
  exception when insufficient_privilege then v_ok := true;
  end;
  if not v_ok then raise exception 'FAIL C3: membership re-pointed'; end if;
  passed := passed || 'C3'::text;

  -- C4: another member is refused, reading and writing.
  perform set_config('request.jwt.claims', json_build_object('sub', m2, 'role', 'authenticated')::text, true);
  select count(*) into v_cnt from public.studio_collections where user_id = m1;
  if v_cnt <> 0 then raise exception 'FAIL C4: another member reads % collection(s)', v_cnt; end if;
  select count(*) into v_cnt from public.studio_collection_creations where user_id = m1;
  if v_cnt <> 0 then raise exception 'FAIL C4: another member reads % membership(s)', v_cnt; end if;
  update public.studio_collections set name = 'Volée' where id = k1;
  delete from public.studio_collections where id = k1b;
  delete from public.studio_collection_creations where collection_id = k1;
  -- Their creation into m1's collection (the collection is not theirs).
  v_state := null;
  begin
    insert into public.studio_collection_creations (collection_id, creation_id) values (k1, c2a);
  exception when others then v_state := sqlstate;
  end;
  if v_state is null then raise exception 'FAIL C4: linked into another member''s collection'; end if;
  -- m1's creation into their own collection (the creation is not theirs).
  v_state := null;
  begin
    insert into public.studio_collection_creations (collection_id, creation_id) values (k2, c1a);
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL C4: linked another member''s creation (%)', v_state; end if;
  -- Forging the owner of a membership or a collection.
  v_ok := false;
  begin
    insert into public.studio_collection_creations (collection_id, creation_id, user_id) values (k1, c1b, m1);
  exception when insufficient_privilege then v_ok := true;
  end;
  if not v_ok then raise exception 'FAIL C4: forged membership owner'; end if;
  v_ok := false;
  begin
    insert into public.studio_collections (name, user_id) values ('Forgée', m1);
  exception when insufficient_privilege then v_ok := true;
  end;
  if not v_ok then raise exception 'FAIL C4: forged collection owner'; end if;
  execute 'reset role';
  select count(*) into v_cnt from public.studio_collections where user_id = m1 and name in ('Mariages 2027', 'Clientes');
  if v_cnt <> 2 then raise exception 'FAIL C4: another member changed m1''s collections'; end if;
  select count(*) into v_cnt from public.studio_collection_creations where user_id = m1;
  if v_cnt <> 3 then raise exception 'FAIL C4: another member removed m1''s memberships (% left)', v_cnt; end if;
  select count(*) into v_cnt from public.studio_collection_creations where creation_id = c2a or collection_id = k2;
  if v_cnt <> 0 then raise exception 'FAIL C4: a cross-owner membership exists'; end if;
  passed := passed || 'C4'::text;

  -- C5: deleting a collection keeps the creations; deleting a creation removes its memberships.
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', m1, 'role', 'authenticated')::text, true);
  delete from public.studio_collections where id = k1b;
  select count(*) into v_cnt from public.creations where id in (c1a, c1b);
  if v_cnt <> 2 then raise exception 'FAIL C5: deleting a collection deleted creations'; end if;
  select count(*) into v_cnt from public.studio_collection_creations where collection_id = k1b;
  if v_cnt <> 0 then raise exception 'FAIL C5: memberships outlived their collection'; end if;
  delete from public.creations where id = c1b;
  select count(*) into v_cnt from public.studio_collection_creations where creation_id = c1b;
  if v_cnt <> 0 then raise exception 'FAIL C5: memberships outlived their creation'; end if;
  select count(*) into v_cnt from public.studio_collection_creations where collection_id = k1;
  if v_cnt <> 1 then raise exception 'FAIL C5: collection lost other memberships (% left)', v_cnt; end if;
  passed := passed || 'C5'::text;

  -- C6: access over — the folders are neither read nor written; nothing is deleted,
  -- and they come back as they were with the plan (decision 113 (b)).
  insert into public.creations (name, scene_data) values ('Création C', v_scene) returning id into c1b;
  insert into public.studio_collections (name) values ('À garder') returning id into k1b;
  execute 'reset role';
  update public.studio_subscriptions
     set status = 'canceled', current_period_end = now() - interval '1 second'
   where user_id = m1;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', m1, 'role', 'authenticated')::text, true);
  select count(*) into v_cnt from public.studio_collections;
  if v_cnt <> 0 then raise exception 'FAIL C6: % collection(s) readable after access', v_cnt; end if;
  select count(*) into v_cnt from public.studio_collection_creations;
  if v_cnt <> 0 then raise exception 'FAIL C6: % membership(s) readable after access', v_cnt; end if;
  select count(*) into v_cnt from public.creations where id in (c1a, c1b);
  if v_cnt <> 2 then raise exception 'FAIL C6: creations hidden with the folders (%)', v_cnt; end if;
  v_state := null;
  begin
    insert into public.studio_collections (name) values ('Après essai');
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL C6: created after access (%)', v_state; end if;
  update public.studio_collections set name = 'Renommée' where id = k1;
  get diagnostics v_cnt = row_count;
  if v_cnt <> 0 then raise exception 'FAIL C6: renamed after access'; end if;
  v_state := null;
  begin
    insert into public.studio_collection_creations (collection_id, creation_id) values (k1, c1b);
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL C6: added after access (%)', v_state; end if;
  execute 'reset role';
  select count(*) into v_cnt from public.studio_collections where user_id = m1;
  if v_cnt <> 2 then raise exception 'FAIL C6: folders lost after access (%)', v_cnt; end if;
  if (select name from public.studio_collections where id = k1) = 'Renommée' then raise exception 'FAIL C6: rename went through'; end if;
  -- Back on the Artist plan: everything is there again.
  update public.studio_subscriptions
     set status = 'active', current_period_end = now() + interval '1 month'
   where user_id = m1;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', m1, 'role', 'authenticated')::text, true);
  select count(*) into v_cnt from public.studio_collections;
  if v_cnt <> 2 then raise exception 'FAIL C6: folders not back with the plan (%)', v_cnt; end if;
  select count(*) into v_cnt from public.studio_collection_creations where collection_id = k1;
  if v_cnt <> 1 then raise exception 'FAIL C6: memberships not back with the plan (%)', v_cnt; end if;
  passed := passed || 'C6'::text;

  -- C7: active staff have access to organise their own work, not to read members'.
  perform set_config('request.jwt.claims', json_build_object('sub', staff, 'role', 'authenticated')::text, true);
  insert into public.studio_collections (name) values ('Équipe');
  select count(*) into v_cnt from public.studio_collections where user_id in (m1, m2);
  if v_cnt <> 0 then raise exception 'FAIL C7: staff read % member collection(s)', v_cnt; end if;
  passed := passed || 'C7'::text;

  -- C8: the Artist plan and above only (decision 113 (b)).
  -- The Essential member kept a folder from a former Artist plan (written as the database).
  execute 'reset role';
  insert into public.creations (user_id, name, scene_data) values (m_ess, 'Essentiel', v_scene) returning id into c_ess;
  insert into public.studio_collections (user_id, name) values (m_ess, 'Gardé') returning id into k_ess;
  insert into public.studio_collection_creations (user_id, collection_id, creation_id) values (m_ess, k_ess, c_ess);
  perform set_config('role', 'authenticated', true);
  foreach r in array array[to_jsonb(m_trial), to_jsonb(m_ess)] loop
    perform set_config('request.jwt.claims', json_build_object('sub', r #>> '{}', 'role', 'authenticated')::text, true);
    v_state := null;
    begin
      insert into public.studio_collections (name) values ('Nouveau dossier');
    exception when others then v_state := sqlstate;
    end;
    if v_state is distinct from '42501' then raise exception 'FAIL C8: % created a folder (%)', r, v_state; end if;
  end loop;
  perform set_config('request.jwt.claims', json_build_object('sub', m_ess, 'role', 'authenticated')::text, true);
  select count(*) into v_cnt from public.studio_collections;
  if v_cnt <> 0 then raise exception 'FAIL C8: Essential reads % folder(s)', v_cnt; end if;
  select count(*) into v_cnt from public.studio_collection_creations;
  if v_cnt <> 0 then raise exception 'FAIL C8: Essential reads % filing(s)', v_cnt; end if;
  select count(*) into v_cnt from public.creations where id = c_ess;
  if v_cnt <> 1 then raise exception 'FAIL C8: Essential lost the creation'; end if;
  v_state := null;
  begin
    insert into public.studio_collection_creations (collection_id, creation_id) values (k_ess, c_ess);
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL C8: Essential filed a creation (%)', v_state; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', m_atl, 'role', 'authenticated')::text, true);
  insert into public.creations (name, scene_data) values ('Atelier', v_scene) returning id into c_ess;
  insert into public.studio_collections (name) values ('Atelier') returning id into k_ess;
  insert into public.studio_collection_creations (collection_id, creation_id) values (k_ess, c_ess);
  passed := passed || 'C8'::text;

  raise exception 'ALL STUDIO COLLECTIONS TESTS PASSED (%)', array_to_string(passed, ', ');
end;
$$;
