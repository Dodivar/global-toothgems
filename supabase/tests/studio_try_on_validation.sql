-- =============================================================================
-- 3D Studio smile try-on validation suite
-- (migration 20261025135203_studio_smile_try_on, decision 111)
-- =============================================================================
--   T1  the plan switch follows the OWNER's Studio access (trial, subscription,
--       staff), not the requester's;
--   T2  the public readers carry the flag: an approved Glowbook creation and
--       an active share link say try_on = true while the owner has access,
--       false once it is gone (share link), never the owner's id;
--   T3  studio_try_on_creation(): one reference exactly; the requester's own
--       creation, never someone else's by id; a share token, not a revoked
--       one; a Glowbook item only once approved; the scene comes back with
--       `allowed` from the owner's switch;
--   T4  the function and the switch are service-role only (anon and
--       authenticated get 42501);
--   T5  requests: a member reads only their own rows and writes none; the
--       reference bucket is private and has no policy for members or anon.
-- ONE transaction, ALWAYS rolled back by raising `ALL STUDIO TRY-ON TESTS PASSED`.
-- =============================================================================

do $$
declare
  artist uuid := '00000000-0000-4000-a000-000000410001';
  lapsed uuid := '00000000-0000-4000-a000-000000410002';
  client uuid := '00000000-0000-4000-a000-000000410003';
  v_scene jsonb := jsonb_build_object('version', 2, 'model', 'dentition', 'lightPreset', 'studio', 'camera', null,
                                      'pieces', '[]'::jsonb, 'groups', '[]'::jsonb);
  c_art uuid;
  c_pending uuid;
  c_lapsed uuid;
  i_art uuid;
  i_pending uuid;
  v_token text;
  v_lapsed_token text;
  v_json jsonb;
  v_flag boolean;
  v_cnt int;
  v_state text;
  passed text[] := '{}';
begin
  insert into auth.users (id, aud, role, email, created_at, updated_at) values
    (artist, 'authenticated', 'authenticated', 'tryon-1.test@example.invalid', now(), now()),
    (lapsed, 'authenticated', 'authenticated', 'tryon-2.test@example.invalid', now(), now()),
    (client, 'authenticated', 'authenticated', 'tryon-3.test@example.invalid', now(), now());
  insert into public.studio_trials (user_id) values (artist);
  insert into public.studio_trials (user_id, trial_started_at, trial_expires_at)
  values (lapsed, now() - interval '48 hours', now());

  insert into public.creations (user_id, name, scene_data) values (artist, 'Aurora smile', v_scene) returning id into c_art;
  insert into public.creations (user_id, name, scene_data) values (artist, 'Not yet approved', v_scene) returning id into c_pending;
  insert into public.creations (user_id, name, scene_data) values (lapsed, 'Old look', v_scene) returning id into c_lapsed;
  insert into public.creation_shares (creation_id, user_id) values (c_art, artist) returning token into v_token;
  insert into public.creation_shares (creation_id, user_id) values (c_lapsed, lapsed) returning token into v_lapsed_token;
  insert into public.studio_showcases (user_id, handle, display_name, status) values (artist, 'tryon.artist', 'Aurora', 'approved');
  insert into public.studio_showcase_items (user_id, creation_id, status) values (artist, c_art, 'approved') returning id into i_art;
  insert into public.studio_showcase_items (user_id, creation_id, status) values (artist, c_pending, 'pending') returning id into i_pending;

  -- T1: the owner's access decides
  if not private.studio_try_on_allowed(artist) then raise exception 'FAIL T1: artist on trial refused'; end if;
  if private.studio_try_on_allowed(lapsed) then raise exception 'FAIL T1: ended trial allowed'; end if;
  if private.studio_try_on_allowed(client) then raise exception 'FAIL T1: member without access allowed'; end if;
  if private.studio_try_on_allowed(null) then raise exception 'FAIL T1: null allowed'; end if;
  passed := passed || 'T1'::text;

  -- T2: the flag on the public readers, as a visitor
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  v_json := public.studio_public_showcase_creation('tryon.artist', i_art);
  if v_json is null or (v_json ->> 'try_on')::boolean is distinct from true then raise exception 'FAIL T2: Glowbook flag %', v_json -> 'try_on'; end if;
  if v_json ? 'user_id' or v_json::text like '%' || artist || '%' then raise exception 'FAIL T2: owner id exposed'; end if;
  select s.try_on into v_flag from public.studio_shared_creation(v_token) s;
  if v_flag is distinct from true then raise exception 'FAIL T2: share flag %', v_flag; end if;
  select s.try_on into v_flag from public.studio_shared_creation(v_lapsed_token) s;
  if v_flag is distinct from false then raise exception 'FAIL T2: lapsed owner share flag %', v_flag; end if;
  execute 'reset role';
  passed := passed || 'T2'::text;

  -- T3: the function's door
  if public.studio_try_on_creation(client) is not null then raise exception 'FAIL T3: no reference answered'; end if;
  if public.studio_try_on_creation(client, c_art, v_token) is not null then raise exception 'FAIL T3: two references answered'; end if;
  if public.studio_try_on_creation(null, c_art) is not null then raise exception 'FAIL T3: no requester answered'; end if;
  v_json := public.studio_try_on_creation(artist, c_art);
  if v_json ->> 'source' is distinct from 'own' or (v_json ->> 'allowed')::boolean is distinct from true
     or v_json -> 'scene_data' ->> 'version' is distinct from '2' then
    raise exception 'FAIL T3: own creation %', v_json;
  end if;
  if public.studio_try_on_creation(client, c_art) is not null then raise exception 'FAIL T3: someone else''s creation by id'; end if;
  v_json := public.studio_try_on_creation(client, p_token => v_token);
  if v_json ->> 'source' is distinct from 'share' or (v_json ->> 'allowed')::boolean is distinct from true then raise exception 'FAIL T3: share %', v_json; end if;
  v_json := public.studio_try_on_creation(client, p_token => v_lapsed_token);
  if (v_json ->> 'allowed')::boolean is distinct from false then raise exception 'FAIL T3: lapsed owner allowed %', v_json; end if;
  if public.studio_try_on_creation(client, p_token => 'nope') is not null then raise exception 'FAIL T3: bad token answered'; end if;
  v_json := public.studio_try_on_creation(client, p_handle => 'TryOn.Artist ', p_item_id => i_art);
  if v_json ->> 'source' is distinct from 'glowbook' or (v_json ->> 'creation_id')::uuid is distinct from c_art then raise exception 'FAIL T3: Glowbook %', v_json; end if;
  if public.studio_try_on_creation(client, p_handle => 'tryon.artist', p_item_id => i_pending) is not null then raise exception 'FAIL T3: pending item answered'; end if;
  if public.studio_try_on_creation(client, p_handle => 'tryon.artist') is not null then raise exception 'FAIL T3: handle without item answered'; end if;
  update public.creation_shares set revoked_at = now() where token = v_token;
  if public.studio_try_on_creation(client, p_token => v_token) is not null then raise exception 'FAIL T3: revoked token answered'; end if;
  passed := passed || 'T3'::text;

  -- T4: service role only
  foreach v_state in array array['anon', 'authenticated'] loop
    perform set_config('role', v_state, true);
    perform set_config('request.jwt.claims', json_build_object('sub', client, 'role', v_state)::text, true);
    begin
      perform public.studio_try_on_creation(client, c_lapsed);
      raise exception 'FAIL T4: % calls studio_try_on_creation', v_state;
    exception when insufficient_privilege then null;
    end;
    begin
      perform private.studio_try_on_allowed(artist);
      raise exception 'FAIL T4: % calls the switch', v_state;
    exception when insufficient_privilege then null;
    end;
    execute 'reset role';
  end loop;
  passed := passed || 'T4'::text;

  -- T5: requests and the reference bucket
  insert into public.studio_try_on_requests (user_id, creation_id, source) values (artist, c_art, 'own'), (client, c_art, 'glowbook');
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', client, 'role', 'authenticated')::text, true);
  select count(*) into v_cnt from public.studio_try_on_requests;
  if v_cnt <> 1 then raise exception 'FAIL T5: member reads % rows', v_cnt; end if;
  v_state := null;
  begin
    insert into public.studio_try_on_requests (user_id, source) values (client, 'own');
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL T5: member inserts a request (%)', v_state; end if;
  execute 'reset role';
  if (select public from storage.buckets where id = 'studio-try-on-references') is distinct from false then
    raise exception 'FAIL T5: reference bucket missing or public';
  end if;
  select count(*) into v_cnt from pg_policies
   where schemaname = 'storage' and tablename = 'objects' and (qual like '%studio-try-on-references%' or with_check like '%studio-try-on-references%');
  if v_cnt <> 0 then raise exception 'FAIL T5: % storage policies on the reference bucket', v_cnt; end if;
  passed := passed || 'T5'::text;

  raise exception 'ALL STUDIO TRY-ON TESTS PASSED (%)', array_to_string(passed, ', ');
end;
$$;
