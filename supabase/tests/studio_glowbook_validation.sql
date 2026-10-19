-- =============================================================================
-- 3D Studio Glowbook validation suite
-- (migrations 20261019072230_studio_glowbook, 20261019112411_studio_glowbook_creation,
-- 20261019134715_studio_glowbook_look, decisions 99 and 100)
-- =============================================================================
-- Proves, as the roles that really call them:
--
--   G1  a member without Studio access cannot open a Glowbook; bad handles,
--       reserved handles and a taken handle are refused;
--   G2  a member with access opens one (pending) and adds a creation
--       (pending); not someone else's creation, not an empty one; nothing is
--       public before moderation (page, items, renders);
--   G3  a member cannot approve (neither function nor direct write) nor read
--       the queue; the tables take no direct INSERT / UPDATE;
--   G4  a moderator (moderate_reviews) approves the page: still no item
--       public; approves one item: the page shows it, the pending one stays
--       hidden; anon signs exactly that render and reads exactly that scene
--       in 3D (not through another handle); the decision is audited;
--   G5  later edits of an approved creation are public at once; a new handle
--       sends the page back to moderation; name/bio edits do not;
--   G6  a rejected item stays hidden with its note, comes back pending when
--       re-sent; a moderator takes an approved item down;
--   G7  when the author loses Studio access the page, its renders and its 3D go dark;
--   G8  the owner removes an item and deletes the Glowbook; another member
--       cannot delete or read them;
--   G9  the look: colour, layout, city and spotlight are live; a new picture
--       or link waits (the page keeps the approved one) and is refused when it
--       is not the caller's file, not https or not in the lists; a moderator
--       approves (anon then signs the picture) or rejects with a note;
--       removing is immediate; an approved picture cannot be deleted.
--
-- ONE transaction, ALWAYS rolled back by raising `ALL STUDIO GLOWBOOK TESTS PASSED`
-- (or `FAIL: ...`).
-- =============================================================================

do $$
declare
  artist  uuid := '00000000-0000-4000-a000-000000990001';
  other   uuid := '00000000-0000-4000-a000-000000990002';
  m_none  uuid := '00000000-0000-4000-a000-000000990003';
  modr    uuid := '00000000-0000-4000-a000-000000990004';
  v_piece jsonb := '{"productId":"solitaire","ss":5,"look":{"shape":"round","material":"crystal","color":"#ffffff","effect":"none"},"rotation":0,"at":{"x":0,"y":0,"z":0},"facing":{"x":0,"y":0,"z":1}}';
  v_scene jsonb;
  c_one   uuid;
  c_two   uuid;
  c_empty uuid;
  c_other uuid;
  i_one   uuid;
  i_two   uuid;
  v_sc    public.studio_showcases;
  v_item  public.studio_showcase_items;
  v_page  jsonb;
  v_cnt   int;
  v_state text;
  v_names text[];
  passed  text[] := '{}';
begin
  v_scene := jsonb_build_object('version', 2, 'model', 'dentition', 'lightPreset', 'studio', 'camera', null,
                                'pieces', jsonb_build_array(v_piece, v_piece), 'groups', '[]'::jsonb);

  insert into auth.users (id, aud, role, email, created_at, updated_at) values
    (artist, 'authenticated', 'authenticated', 'gb-artist.test@example.invalid', now(), now()),
    (other,  'authenticated', 'authenticated', 'gb-other.test@example.invalid',  now(), now()),
    (m_none, 'authenticated', 'authenticated', 'gb-none.test@example.invalid',   now(), now()),
    (modr,   'authenticated', 'authenticated', 'gb-mod.test@example.invalid',    now(), now());
  update public.profiles set role = 'manager' where id = modr;
  insert into public.studio_trials (user_id) values (artist), (other);

  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', artist, 'role', 'authenticated')::text, true);
  insert into public.creations (name, description, scene_data, thumbnail_path)
  values ('Aurora smile', 'Two crystals', v_scene, artist || '/one.jpg') returning id into c_one;
  insert into public.creations (name, scene_data, thumbnail_path)
  values ('Second look', v_scene, artist || '/two.jpg') returning id into c_two;
  insert into public.creations (name, scene_data)
  values ('Empty', v_scene || jsonb_build_object('pieces', '[]'::jsonb)) returning id into c_empty;
  perform set_config('request.jwt.claims', json_build_object('sub', other, 'role', 'authenticated')::text, true);
  insert into public.creations (name, scene_data, thumbnail_path)
  values ('Not yours', v_scene, other || '/x.jpg') returning id into c_other;
  execute 'reset role';
  insert into storage.objects (bucket_id, name) values
    ('studio-thumbnails', artist || '/one.jpg'),
    ('studio-thumbnails', artist || '/two.jpg'),
    ('studio-thumbnails', other || '/x.jpg');

  -- G1: no access, bad / reserved / taken handles.
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', m_none, 'role', 'authenticated')::text, true);
  v_state := null;
  begin
    perform public.studio_save_showcase('nobody', 'No body', '', null);
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL G1: opened without access (%)', v_state; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', artist, 'role', 'authenticated')::text, true);
  foreach v_page in array array['"a"'::jsonb, '"bad handle"', '"x..y"', '"-start"', '"admin"', '"glowbook"'] loop
    v_state := null;
    begin
      perform public.studio_save_showcase(v_page #>> '{}', 'Name', '', null);
    exception when others then v_state := sqlstate;
    end;
    if v_state is distinct from '22023' then raise exception 'FAIL G1: handle % accepted (%)', v_page, v_state; end if;
  end loop;
  v_state := null;
  begin
    perform public.studio_save_showcase('lily.gems', 'Lily', '', 'not valid!');
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '22023' then raise exception 'FAIL G1: bad Instagram accepted (%)', v_state; end if;
  passed := passed || 'G1'::text;

  -- G2: open (pending), add (pending), nothing public.
  v_sc := public.studio_save_showcase('  Lily.Gems ', ' Lily Gems ', ' Tooth gem artist ', '@lily.gems');
  if v_sc.handle <> 'lily.gems' or v_sc.display_name <> 'Lily Gems' or v_sc.instagram <> 'lily.gems' or v_sc.status <> 'pending' then
    raise exception 'FAIL G2: showcase %', row_to_json(v_sc);
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', other, 'role', 'authenticated')::text, true);
  v_state := null;
  begin
    perform public.studio_save_showcase('LILY.gems', 'Copycat', '', null);
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '23505' then raise exception 'FAIL G1: handle taken twice (%)', v_state; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', artist, 'role', 'authenticated')::text, true);
  v_item := public.studio_showcase_add(c_one);
  i_one := v_item.id;
  if v_item.status <> 'pending' or v_item.position <> 0 then raise exception 'FAIL G2: item %', row_to_json(v_item); end if;
  i_two := (public.studio_showcase_add(c_two)).id;
  foreach v_page in array array[to_jsonb(c_other), to_jsonb(c_empty)] loop
    v_state := null;
    begin
      perform public.studio_showcase_add((v_page #>> '{}')::uuid);
    exception when others then v_state := sqlstate;
    end;
    if v_state is distinct from 'P0002' then raise exception 'FAIL G2: added % (%)', v_page, v_state; end if;
  end loop;
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  if public.studio_public_showcase('lily.gems') is not null then raise exception 'FAIL G2: pending page public'; end if;
  select count(*) into v_cnt from storage.objects where bucket_id = 'studio-thumbnails' and name like artist || '/%';
  if v_cnt <> 0 then raise exception 'FAIL G2: pending renders readable (%)', v_cnt; end if;
  passed := passed || 'G2'::text;

  -- G3: members cannot moderate nor write directly.
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', artist, 'role', 'authenticated')::text, true);
  v_state := null;
  begin
    perform public.studio_moderate_showcase(artist, 'approved');
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL G3: self-approved page (%)', v_state; end if;
  v_state := null;
  begin
    perform public.studio_moderate_showcase_item(i_one, 'approved');
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL G3: self-approved item (%)', v_state; end if;
  v_state := null;
  begin
    perform 1 from public.studio_showcase_queue();
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL G3: member read the queue (%)', v_state; end if;
  v_state := null;
  begin
    update public.studio_showcase_items set status = 'approved' where id = i_one;
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL G3: direct update (%)', v_state; end if;
  v_state := null;
  begin
    insert into public.studio_showcases (user_id, handle, display_name, status) values (artist, 'forged', 'F', 'approved');
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL G3: direct insert (%)', v_state; end if;
  passed := passed || 'G3'::text;

  -- G4: moderator approves the page, then one item.
  perform set_config('request.jwt.claims', json_build_object('sub', modr, 'role', 'authenticated')::text, true);
  select count(*) into v_cnt from public.studio_showcase_queue() q where q.status = 'pending' and q.user_id = artist;
  if v_cnt <> 3 then raise exception 'FAIL G4: queue has % pending rows', v_cnt; end if;
  select count(*) into v_cnt from storage.objects where bucket_id = 'studio-thumbnails' and name like artist || '/%';
  if v_cnt <> 2 then raise exception 'FAIL G4: moderator reads % submitted renders', v_cnt; end if;
  perform public.studio_moderate_showcase(artist, 'approved');
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  v_page := public.studio_public_showcase('LILY.GEMS');
  if v_page is null or v_page ->> 'display_name' <> 'Lily Gems' or jsonb_array_length(v_page -> 'items') <> 0 then
    raise exception 'FAIL G4: approved page without items %', v_page;
  end if;
  if v_page ? 'user_id' then raise exception 'FAIL G4: owner id leaked'; end if;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', modr, 'role', 'authenticated')::text, true);
  perform public.studio_moderate_showcase_item(i_one, 'approved');
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  v_page := public.studio_public_showcase('lily.gems');
  if jsonb_array_length(v_page -> 'items') <> 1 or v_page #>> '{items,0,name}' <> 'Aurora smile'
     or (v_page #>> '{items,0,element_count}')::int <> 2 then
    raise exception 'FAIL G4: public items %', v_page -> 'items';
  end if;
  select array_agg(name) into v_names from storage.objects where bucket_id = 'studio-thumbnails' and name like artist || '/%';
  if v_names is distinct from array[artist || '/one.jpg'] then raise exception 'FAIL G4: anon reads renders %', v_names; end if;
  -- The 3D viewer reads the approved creation's scene, nothing else (migration 20261019112411).
  v_page := public.studio_public_showcase_creation('lily.gems', i_one);
  if v_page ->> 'name' <> 'Aurora smile' or jsonb_array_length(v_page #> '{scene_data,pieces}') <> 2 or v_page ? 'user_id' then
    raise exception 'FAIL G4: 3D creation %', v_page;
  end if;
  if public.studio_public_showcase_creation('lily.gems', i_two) is not null then raise exception 'FAIL G4: pending creation in 3D'; end if;
  if public.studio_public_showcase_creation('someone.else', i_one) is not null then raise exception 'FAIL G4: creation read through another handle'; end if;
  execute 'reset role';
  select count(*) into v_cnt from public.audit_logs
   where table_name = 'studio_showcase_items' and record_id = i_one::text and action = 'update';
  if v_cnt <> 1 then raise exception 'FAIL G4: decision not audited (%)', v_cnt; end if;
  passed := passed || 'G4'::text;

  -- G5: live edits; a new handle goes back to moderation.
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', artist, 'role', 'authenticated')::text, true);
  update public.creations set name = 'Aurora smile v2' where id = c_one;
  v_sc := public.studio_save_showcase('lily.gems', 'Lily G.', 'New bio', null);
  if v_sc.status <> 'approved' then raise exception 'FAIL G5: name edit sent back to moderation'; end if;
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  v_page := public.studio_public_showcase('lily.gems');
  if v_page #>> '{items,0,name}' <> 'Aurora smile v2' or v_page ->> 'display_name' <> 'Lily G.' then
    raise exception 'FAIL G5: edits not live %', v_page;
  end if;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', artist, 'role', 'authenticated')::text, true);
  v_sc := public.studio_save_showcase('lily.studio', 'Lily G.', 'New bio', null);
  if v_sc.status <> 'pending' then raise exception 'FAIL G5: new handle not moderated'; end if;
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  if public.studio_public_showcase('lily.studio') is not null or public.studio_public_showcase('lily.gems') is not null then
    raise exception 'FAIL G5: unmoderated handle public';
  end if;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', modr, 'role', 'authenticated')::text, true);
  perform public.studio_moderate_showcase(artist, 'approved');
  passed := passed || 'G5'::text;

  -- G6: rejection with a note, re-send, take-down.
  perform public.studio_moderate_showcase_item(i_two, 'rejected', 'Render too dark');
  perform set_config('request.jwt.claims', json_build_object('sub', artist, 'role', 'authenticated')::text, true);
  select * into v_item from public.studio_showcase_items where id = i_two;
  if v_item.status <> 'rejected' or v_item.review_note <> 'Render too dark' then raise exception 'FAIL G6: rejection %', row_to_json(v_item); end if;
  v_item := public.studio_showcase_add(c_two);
  if v_item.status <> 'pending' or v_item.review_note is not null then raise exception 'FAIL G6: re-send %', row_to_json(v_item); end if;
  -- Adding an approved one again changes nothing.
  v_item := public.studio_showcase_add(c_one);
  if v_item.status <> 'approved' then raise exception 'FAIL G6: re-adding reset an approved item'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', modr, 'role', 'authenticated')::text, true);
  perform public.studio_moderate_showcase_item(i_one, 'rejected', 'Taken down');
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  if jsonb_array_length(public.studio_public_showcase('lily.studio') -> 'items') <> 0 then raise exception 'FAIL G6: taken-down item public'; end if;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', modr, 'role', 'authenticated')::text, true);
  perform public.studio_moderate_showcase_item(i_one, 'approved');
  passed := passed || 'G6'::text;

  -- G7: no Studio access, no page.
  execute 'reset role';
  update public.studio_trials
     set trial_started_at = now() - interval '48 hours', trial_expires_at = now()
   where user_id = artist;
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  if public.studio_public_showcase('lily.studio') is not null then raise exception 'FAIL G7: page shown without access'; end if;
  if public.studio_public_showcase_creation('lily.studio', i_one) is not null then raise exception 'FAIL G7: 3D creation without access'; end if;
  select count(*) into v_cnt from storage.objects where bucket_id = 'studio-thumbnails' and name like artist || '/%';
  if v_cnt <> 0 then raise exception 'FAIL G7: renders readable without access (%)', v_cnt; end if;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', artist, 'role', 'authenticated')::text, true);
  v_state := null;
  begin
    perform public.studio_showcase_add(c_two);
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL G7: added without access (%)', v_state; end if;
  passed := passed || 'G7'::text;

  -- G8: others see nothing; the owner removes, then deletes.
  perform set_config('request.jwt.claims', json_build_object('sub', other, 'role', 'authenticated')::text, true);
  select count(*) into v_cnt from public.studio_showcase_items;
  if v_cnt <> 0 then raise exception 'FAIL G8: other member reads items (%)', v_cnt; end if;
  delete from public.studio_showcases where user_id = artist;
  perform set_config('request.jwt.claims', json_build_object('sub', artist, 'role', 'authenticated')::text, true);
  select count(*) into v_cnt from public.studio_showcases;
  if v_cnt <> 1 then raise exception 'FAIL G8: other member deleted the Glowbook'; end if;
  delete from public.studio_showcase_items where id = i_two;
  select count(*) into v_cnt from public.studio_showcase_items;
  if v_cnt <> 1 then raise exception 'FAIL G8: remove (%)', v_cnt; end if;
  delete from public.studio_showcases where user_id = artist;
  select count(*) into v_cnt from public.studio_showcase_items;
  if v_cnt <> 0 then raise exception 'FAIL G8: items outlived the Glowbook (%)', v_cnt; end if;
  select count(*) into v_cnt from public.creations where id in (c_one, c_two);
  if v_cnt <> 2 then raise exception 'FAIL G8: deleting the Glowbook deleted creations'; end if;
  passed := passed || 'G8'::text;

  -- G9: the look (fresh Glowbook for the other member, who still has access).
  perform set_config('request.jwt.claims', json_build_object('sub', other, 'role', 'authenticated')::text, true);
  perform public.studio_save_showcase('nova.gems', 'Nova', '', null);
  i_one := (public.studio_showcase_add(c_other)).id;
  execute 'reset role';
  insert into storage.objects (bucket_id, name) values
    ('glowbook-media', other || '/avatar-1.jpg'), ('glowbook-media', artist || '/stolen.jpg');
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', modr, 'role', 'authenticated')::text, true);
  perform public.studio_moderate_showcase(other, 'approved');
  perform public.studio_moderate_showcase_item(i_one, 'approved');
  perform set_config('request.jwt.claims', json_build_object('sub', other, 'role', 'authenticated')::text, true);
  v_sc := public.studio_save_showcase_look(jsonb_build_object(
    'accent', 'fuchsia', 'layout', 'large', 'location', ' Lyon ', 'featured_item_id', i_one,
    'avatar_path', other || '/avatar-1.jpg', 'booking_url', 'https://book.example.com/nova'));
  if v_sc.accent <> 'fuchsia' or v_sc.location <> 'Lyon' or v_sc.featured_item_id <> i_one or v_sc.avatar_path is not null
     or v_sc.pending_changes ->> 'avatar_path' <> other || '/avatar-1.jpg' then
    raise exception 'FAIL G9: look saved %', row_to_json(v_sc);
  end if;
  foreach v_page in array array[jsonb_build_object('avatar_path', artist || '/stolen.jpg'),
                                jsonb_build_object('website_url', 'http://plain.example.com'),
                                jsonb_build_object('accent', 'neon'),
                                jsonb_build_object('featured_item_id', i_two)] loop
    v_state := null;
    begin
      perform public.studio_save_showcase_look(v_page);
    exception when others then v_state := sqlstate;
    end;
    if v_state is null or v_state not in ('22023', '23514') then raise exception 'FAIL G9: accepted % (%)', v_page, v_state; end if;
  end loop;
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  v_page := public.studio_public_showcase('nova.gems');
  if v_page #>> '{look,accent}' <> 'fuchsia' or v_page #>> '{look,avatar_path}' is not null or v_page #>> '{look,booking_url}' is not null
     or v_page #>> '{look,featured_item_id}' <> i_one::text or v_page ->> 'location' <> 'Lyon' then
    raise exception 'FAIL G9: public look before review %', v_page;
  end if;
  select count(*) into v_cnt from storage.objects where bucket_id = 'glowbook-media';
  if v_cnt <> 0 then raise exception 'FAIL G9: anon reads pending pictures (%)', v_cnt; end if;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', artist, 'role', 'authenticated')::text, true);
  v_state := null;
  begin
    perform public.studio_moderate_showcase_changes(other, 'approved');
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL G9: member approved changes (%)', v_state; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', modr, 'role', 'authenticated')::text, true);
  select count(*) into v_cnt from public.studio_showcase_queue() q where q.kind = 'changes' and q.user_id = other and q.status = 'pending';
  if v_cnt <> 1 then raise exception 'FAIL G9: changes not queued (%)', v_cnt; end if;
  perform public.studio_moderate_showcase_changes(other, 'approved');
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  v_page := public.studio_public_showcase('nova.gems');
  if v_page #>> '{look,avatar_path}' <> other || '/avatar-1.jpg' or v_page #>> '{look,booking_url}' <> 'https://book.example.com/nova' then
    raise exception 'FAIL G9: approved look %', v_page -> 'look';
  end if;
  select array_agg(name) into v_names from storage.objects where bucket_id = 'glowbook-media';
  if v_names is distinct from array[other || '/avatar-1.jpg'] then raise exception 'FAIL G9: anon reads pictures %', v_names; end if;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', other, 'role', 'authenticated')::text, true);
  -- The delete policy refuses files in use (direct SQL deletes are blocked by Storage itself).
  if not private.glowbook_media_in_use(other || '/avatar-1.jpg') then raise exception 'FAIL G9: approved picture deletable'; end if;
  v_sc := public.studio_save_showcase_look(jsonb_build_object('tiktok', '@nova.gems'));
  perform set_config('request.jwt.claims', json_build_object('sub', modr, 'role', 'authenticated')::text, true);
  perform public.studio_moderate_showcase_changes(other, 'rejected', 'Not your account');
  perform set_config('request.jwt.claims', json_build_object('sub', other, 'role', 'authenticated')::text, true);
  select * into v_sc from public.studio_showcases where user_id = other;
  if v_sc.tiktok is not null or v_sc.pending_changes is not null or v_sc.changes_review_note <> 'Not your account' then
    raise exception 'FAIL G9: rejected changes %', row_to_json(v_sc);
  end if;
  v_sc := public.studio_save_showcase_look(jsonb_build_object('avatar_path', null, 'booking_url', ''));
  if v_sc.avatar_path is not null or v_sc.booking_url is not null then raise exception 'FAIL G9: removal not immediate'; end if;
  passed := passed || 'G9'::text;

  raise exception 'ALL STUDIO GLOWBOOK TESTS PASSED (%)', array_to_string(passed, ', ');
end;
$$;
