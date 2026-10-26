-- =============================================================================
-- 3D Studio Glowbook validation suite
-- (migrations 20261019072230_studio_glowbook, 20261019112411_studio_glowbook_creation,
-- 20261019134715_studio_glowbook_look, 20261019142050_studio_glowbook_sections_certification,
-- 20261021174016_studio_glowbook_spotlight_video, 20261021190830_studio_glowbook_spotlight_sweep,
-- 20261022111758_studio_glowbook_place, 20261026170231_studio_plan_entitlements,
-- decisions 99, 100, 102, 103, 105, 108 and 113)
-- =============================================================================
-- Proves, as the roles that really call them:
--
--   G1  a member without Studio access cannot open a Glowbook; bad handles,
--       reserved handles and a taken handle are refused;
--   G2  a member on the Atelier plan opens one (pending) and adds a creation
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
--   G10 sections: the owner creates, renames, orders, files and deletes
--       them (bad / duplicate names refused); the public page shows only the
--       sections holding an approved creation (id and name only) and the
--       creations without a section; another member, a member without
--       access and anon cannot write them, nor read them (moderators aside);
--   G11 the certified badge: derived from completions with a certificate,
--       public as course titles only (no code, no id), hidden by its owner only;
--   G12 the plan switch closed: sections cannot be written and the page
--       shows none (its creations still shown); the badge stays; no
--       spotlight video is recorded.
--   G13 the spotlight video (5-second front sweep only): only its owner records it, for their current
--       spotlight, from a file of their folder, with the creation unchanged
--       since it was drawn; anon then reads exactly that file; an edit of the
--       design or a new spotlight hides it again; a file in use cannot be
--       deleted.
--   G14 the place (decision 108): live; an area is rounded to 2 decimals
--       (~1 km) before it is stored, a salon to 5; a partial place, a bad
--       mode, a non-number or out-of-range coordinate and a short label are
--       refused, by the function and by the table's CHECKs; another member
--       cannot write it; anon reads it inside the look; removing it is
--       immediate; with the plan switch closed (G12) it is not public.
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
  v_sec   public.studio_showcase_sections;
  v_case  text;
  s_one   uuid;
  s_two   uuid;
  s_three uuid;
  c_o2    uuid;
  c_o3    uuid;
  c_mod   uuid;
  i_o2    uuid;
  i_o3    uuid;
  i_mod   uuid;
  v_course  uuid;
  v_course2 uuid;
  v_at    timestamptz;
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
  -- The Glowbook is the Atelier plan's (decision 113).
  insert into public.studio_subscriptions (user_id, plan, status, stripe_subscription_id, current_period_end) values
    (artist, 'atelier', 'active', 'sub_gb_artist', now() + interval '1 month'),
    (other,  'atelier', 'active', 'sub_gb_other',  now() + interval '1 month');

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
  update public.studio_subscriptions
     set status = 'canceled', current_period_end = now() - interval '1 second'
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
  select count(*) into v_cnt from storage.objects where bucket_id = 'glowbook-media' and (storage.foldername(name))[1] in (artist::text, other::text);
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
  select array_agg(name) into v_names from storage.objects where bucket_id = 'glowbook-media' and (storage.foldername(name))[1] in (artist::text, other::text);
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

  -- G10: sections (the other member's approved page nova.gems, i_one approved).
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', other, 'role', 'authenticated')::text, true);
  insert into public.creations (name, scene_data) values ('Loose one', v_scene) returning id into c_o2;
  insert into public.creations (name, scene_data) values ('Still pending', v_scene) returning id into c_o3;
  i_o2 := (public.studio_showcase_add(c_o2)).id;
  i_o3 := (public.studio_showcase_add(c_o3)).id;
  v_sec := public.studio_save_showcase_section(null, '  Mariage  ');
  s_one := v_sec.id;
  if v_sec.name <> 'Mariage' or v_sec.position <> 0 or v_sec.user_id <> other then raise exception 'FAIL G10: section %', row_to_json(v_sec); end if;
  s_two := (public.studio_save_showcase_section(null, 'Minimal')).id;
  foreach v_page in array array['" mariage "'::jsonb, '""', '"   "', to_jsonb(repeat('x', 41))] loop
    v_state := null;
    begin
      perform public.studio_save_showcase_section(null, v_page #>> '{}');
    exception when others then v_state := sqlstate;
    end;
    if v_state is null or v_state not in ('22023', '23505') then raise exception 'FAIL G10: section name % accepted (%)', v_page, v_state; end if;
  end loop;
  v_sec := public.studio_save_showcase_section(s_two, 'Minimaliste');
  if v_sec.name <> 'Minimaliste' or v_sec.id <> s_two then raise exception 'FAIL G10: rename %', row_to_json(v_sec); end if;
  perform public.studio_set_showcase_item_section(i_one, s_one);
  perform public.studio_set_showcase_item_section(i_o3, s_two);
  s_three := (public.studio_save_showcase_section(null, 'Fêtes')).id;
  perform public.studio_reorder_showcase_sections(array[s_three, s_one, s_two]);
  select array_agg(name order by position) into v_names from public.studio_showcase_sections where user_id = other;
  if v_names is distinct from array['Fêtes', 'Mariage', 'Minimaliste'] then raise exception 'FAIL G10: order %', v_names; end if;
  -- Moderation: i_o2 approved (no section), i_o3 stays pending (its section stays hidden).
  perform set_config('request.jwt.claims', json_build_object('sub', modr, 'role', 'authenticated')::text, true);
  perform public.studio_moderate_showcase_item(i_o2, 'approved');
  select q.details -> 'sections' into v_page from public.studio_showcase_queue() q where q.kind = 'showcase' and q.user_id = other;
  if v_page is distinct from '["Fêtes", "Mariage", "Minimaliste"]'::jsonb then raise exception 'FAIL G10: queue sections %', v_page; end if;
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  v_page := public.studio_public_showcase('nova.gems');
  if v_page -> 'sections' is distinct from jsonb_build_array(jsonb_build_object('id', s_one, 'name', 'Mariage')) then
    raise exception 'FAIL G10: public sections %', v_page -> 'sections';
  end if;
  if jsonb_array_length(v_page -> 'items') <> 2
     or (select i ->> 'section_id' from jsonb_array_elements(v_page -> 'items') i where i ->> 'id' = i_one::text) <> s_one::text
     or (select i -> 'section_id' from jsonb_array_elements(v_page -> 'items') i where i ->> 'id' = i_o2::text) <> 'null'::jsonb then
    raise exception 'FAIL G10: public items %', v_page -> 'items';
  end if;
  v_state := null;
  begin
    perform public.studio_save_showcase_section(null, 'Anon');
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL G10: anon wrote a section (%)', v_state; end if;
  -- A member without access: refused, reads nothing.
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', m_none, 'role', 'authenticated')::text, true);
  select count(*) into v_cnt from public.studio_showcase_sections where user_id = other;
  if v_cnt <> 0 then raise exception 'FAIL G10: other member reads sections (%)', v_cnt; end if;
  v_state := null;
  begin
    perform public.studio_save_showcase_section(null, 'Mine');
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL G10: written without access (%)', v_state; end if;
  delete from public.studio_showcase_sections where id = s_one;
  -- Another member WITH access (staff) and their own Glowbook: nothing on someone else's.
  perform set_config('request.jwt.claims', json_build_object('sub', modr, 'role', 'authenticated')::text, true);
  perform public.studio_save_showcase('mod.page', 'Mod', '', null);
  insert into public.creations (name, scene_data) values ('Mod look', v_scene) returning id into c_mod;
  i_mod := (public.studio_showcase_add(c_mod)).id;
  foreach v_case in array array['rename', 'file-mine', 'file-theirs'] loop
    v_state := null;
    begin
      case v_case
        when 'rename' then perform public.studio_save_showcase_section(s_one, 'Hijacked');
        when 'file-mine' then perform public.studio_set_showcase_item_section(i_mod, s_one);
        else perform public.studio_set_showcase_item_section(i_one, null);
      end case;
    exception when others then v_state := sqlstate;
    end;
    if v_state is distinct from 'P0002' then raise exception 'FAIL G10: % on another''s section (%)', v_case, v_state; end if;
  end loop;
  v_state := null;
  begin
    update public.studio_showcase_items set section_id = s_one where id = i_mod;
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL G10: direct filing (%)', v_state; end if;
  v_state := null;
  begin
    insert into public.studio_showcase_sections (user_id, name) values (modr, 'Direct');
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL G10: direct section insert (%)', v_state; end if;
  delete from public.studio_showcase_sections where id = s_one;
  execute 'reset role';
  select count(*) into v_cnt from public.studio_showcase_sections where user_id = other;
  if v_cnt <> 3 then raise exception 'FAIL G10: another member deleted a section (%)', v_cnt; end if;
  -- The owner deletes a section: its creations stay, without a section.
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', other, 'role', 'authenticated')::text, true);
  delete from public.studio_showcase_sections where id = s_one;
  select * into v_item from public.studio_showcase_items where id = i_one;
  if v_item.id is null or v_item.section_id is not null or v_item.user_id <> other then raise exception 'FAIL G10: delete section %', row_to_json(v_item); end if;
  perform public.studio_set_showcase_item_section(i_one, s_three);
  passed := passed || 'G10'::text;

  -- G11: the certified badge.
  execute 'reset role';
  insert into public.courses (slug, title) values ('gb-test-cert-course-990001', 'Pose experte GB test') returning id into v_course;
  insert into public.course_translations (course_id, locale, title, status) values (v_course, 'en', 'Expert placement GB test', 'published');
  insert into public.courses (slug, title) values ('gb-test-nocert-course-990001', 'Sans certificat GB test') returning id into v_course2;
  insert into public.course_completions (user_id, course_id, min_score, certificate_code) values
    (other, v_course, 70, 'GTC-99AA-99BB-99CC'),
    (other, v_course2, 70, null);
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  v_page := public.studio_public_showcase('nova.gems');
  if v_page -> 'certification' is distinct from
     jsonb_build_object('courses', jsonb_build_array(jsonb_build_object('fr', 'Pose experte GB test', 'en', 'Expert placement GB test'))) then
    raise exception 'FAIL G11: public badge %', v_page -> 'certification';
  end if;
  if v_page::text like '%GTC-%' or v_page::text like '%' || v_course::text || '%' then
    raise exception 'FAIL G11: the page leaks a certificate code or a course id';
  end if;
  v_state := null;
  begin
    perform public.studio_set_showcase_certification(false);
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL G11: anon hid a badge (%)', v_state; end if;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', m_none, 'role', 'authenticated')::text, true);
  if public.studio_my_certification() <> '[]'::jsonb then raise exception 'FAIL G11: badge without a certificate'; end if;
  v_state := null;
  begin
    perform public.studio_set_showcase_certification(false);
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from 'P0002' then raise exception 'FAIL G11: hid without a Glowbook (%)', v_state; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', modr, 'role', 'authenticated')::text, true);
  perform public.studio_set_showcase_certification(false);
  perform set_config('request.jwt.claims', json_build_object('sub', other, 'role', 'authenticated')::text, true);
  if public.studio_my_certification() <> jsonb_build_array(jsonb_build_object('fr', 'Pose experte GB test', 'en', 'Expert placement GB test')) then
    raise exception 'FAIL G11: own badge %', public.studio_my_certification();
  end if;
  select * into v_sc from public.studio_showcases where user_id = other;
  if not v_sc.show_certification then raise exception 'FAIL G11: another member hid the badge'; end if;
  v_sc := public.studio_set_showcase_certification(false);
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  if public.studio_public_showcase('nova.gems') -> 'certification' <> 'null'::jsonb then raise exception 'FAIL G11: hidden badge shown'; end if;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', other, 'role', 'authenticated')::text, true);
  v_sc := public.studio_set_showcase_certification(true);
  passed := passed || 'G11'::text;

  -- G13: the spotlight video (the other member's approved page nova.gems, i_one and i_o2 approved).
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', other, 'role', 'authenticated')::text, true);
  v_sc := public.studio_save_showcase_look(jsonb_build_object('featured_item_id', i_one));
  execute 'reset role';
  insert into storage.objects (bucket_id, name) values
    ('glowbook-videos', other || '/spot-1.mp4'),
    ('glowbook-videos', artist || '/spot-x.mp4');
  select c.updated_at into v_at from public.creations c join public.studio_showcase_items i on i.creation_id = c.id where i.id = i_one;
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  if public.studio_public_showcase('nova.gems') #> '{look,spotlight_video}' <> 'null'::jsonb then
    raise exception 'FAIL G13: a video before any was recorded';
  end if;
  v_state := null;
  begin
    perform public.studio_set_spotlight_video(i_one, other || '/spot-1.mp4', 'video/mp4', 5, v_at);
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL G13: anon recorded (%)', v_state; end if;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', m_none, 'role', 'authenticated')::text, true);
  v_state := null;
  begin
    perform public.studio_set_spotlight_video(i_one, other || '/spot-1.mp4', 'video/mp4', 5, v_at);
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL G13: recorded without access (%)', v_state; end if;
  if public.studio_spotlight_video_state() is not null then raise exception 'FAIL G13: state of someone else'; end if;
  -- A member with access, on someone else's spotlight.
  perform set_config('request.jwt.claims', json_build_object('sub', modr, 'role', 'authenticated')::text, true);
  v_state := null;
  begin
    perform public.studio_set_spotlight_video(i_one, other || '/spot-1.mp4', 'video/mp4', 5, v_at);
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '22023' then raise exception 'FAIL G13: recorded on another page (%)', v_state; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', other, 'role', 'authenticated')::text, true);
  foreach v_case in array array['not-spotlight', 'their-file', 'no-file', 'type', 'seconds', 'changed'] loop
    v_state := null;
    begin
      case v_case
        when 'not-spotlight' then perform public.studio_set_spotlight_video(i_o2, other || '/spot-1.mp4', 'video/mp4', 5, v_at);
        when 'their-file' then perform public.studio_set_spotlight_video(i_one, artist || '/spot-x.mp4', 'video/mp4', 5, v_at);
        when 'no-file' then perform public.studio_set_spotlight_video(i_one, other || '/nothing.mp4', 'video/mp4', 5, v_at);
        when 'type' then perform public.studio_set_spotlight_video(i_one, other || '/spot-1.mp4', 'video/quicktime', 5, v_at);
        when 'seconds' then perform public.studio_set_spotlight_video(i_one, other || '/spot-1.mp4', 'video/mp4', 4, v_at);
        else perform public.studio_set_spotlight_video(i_one, other || '/spot-1.mp4', 'video/mp4', 5, v_at - interval '1 second');
      end case;
    exception when others then v_state := sqlstate;
    end;
    if v_state is distinct from (case v_case when 'changed' then '40001' else '22023' end) then
      raise exception 'FAIL G13: % accepted (%)', v_case, v_state;
    end if;
  end loop;
  v_page := public.studio_set_spotlight_video(i_one, other || '/spot-1.mp4', 'video/mp4', 5, v_at);
  if (v_page ->> 'current')::boolean is not true or v_page ->> 'path' <> other || '/spot-1.mp4' or (v_page ->> 'seconds')::int <> 5 then
    raise exception 'FAIL G13: state %', v_page;
  end if;
  -- The delete policy refuses a file in use (direct SQL deletes are blocked by Storage itself).
  if not private.glowbook_video_in_use(other || '/spot-1.mp4') or private.glowbook_video_in_use(other || '/spot-2.mp4') then
    raise exception 'FAIL G13: video in use not protected';
  end if;
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  v_page := public.studio_public_showcase('nova.gems');
  if v_page #> '{look,spotlight_video}' is distinct from jsonb_build_object('path', other || '/spot-1.mp4', 'type', 'video/mp4', 'seconds', 5) then
    raise exception 'FAIL G13: public video %', v_page #> '{look,spotlight_video}';
  end if;
  select array_agg(name) into v_names from storage.objects where bucket_id = 'glowbook-videos' and (storage.foldername(name))[1] in (artist::text, other::text);
  if v_names is distinct from array[other || '/spot-1.mp4'] then raise exception 'FAIL G13: anon reads %', v_names; end if;
  -- A full turn of decision 103 (4 s) is no longer current: only the 5-second front sweep is (decision 105).
  execute 'reset role';
  update public.studio_showcases set spotlight_video_seconds = 4 where user_id = other;
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  if public.studio_public_showcase('nova.gems') #> '{look,spotlight_video}' <> 'null'::jsonb then
    raise exception 'FAIL G13: a former full-turn video shown';
  end if;
  execute 'reset role';
  update public.studio_showcases set spotlight_video_seconds = 5 where user_id = other;
  -- The design changes: the still render comes back until a new turn is recorded.
  update public.creations c set scene_data = c.scene_data || '{"lightPreset":"warm"}'::jsonb
   where c.id = (select creation_id from public.studio_showcase_items where id = i_one);
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  if public.studio_public_showcase('nova.gems') #> '{look,spotlight_video}' <> 'null'::jsonb then
    raise exception 'FAIL G13: video of an older design shown';
  end if;
  select count(*) into v_cnt from storage.objects where bucket_id = 'glowbook-videos' and (storage.foldername(name))[1] in (artist::text, other::text);
  if v_cnt <> 0 then raise exception 'FAIL G13: anon reads a stale video'; end if;
  execute 'reset role';
  update public.creations c set scene_data = c.scene_data || '{"lightPreset":"studio"}'::jsonb
   where c.id = (select creation_id from public.studio_showcase_items where id = i_one);
  -- Another spotlight: hidden too.
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', other, 'role', 'authenticated')::text, true);
  if (public.studio_spotlight_video_state() ->> 'current')::boolean is not true then raise exception 'FAIL G13: restored design not current'; end if;
  v_sc := public.studio_save_showcase_look(jsonb_build_object('featured_item_id', i_o2));
  if (public.studio_spotlight_video_state() ->> 'current')::boolean then raise exception 'FAIL G13: video of the former spotlight current'; end if;
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  if public.studio_public_showcase('nova.gems') #> '{look,spotlight_video}' <> 'null'::jsonb then
    raise exception 'FAIL G13: video of the former spotlight shown';
  end if;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', other, 'role', 'authenticated')::text, true);
  v_sc := public.studio_save_showcase_look(jsonb_build_object('featured_item_id', i_one));
  passed := passed || 'G13'::text;

  -- G14: the place (decision 108) on nova.gems — live, all or nothing, an area rounded to ~1 km.
  v_sc := public.studio_save_showcase_look(jsonb_build_object('place', jsonb_build_object(
    'mode', 'area', 'label', ' Lyon 7e ', 'lat', 45.748312, 'lng', 4.842687)));
  if v_sc.place_mode <> 'area' or v_sc.place_label <> 'Lyon 7e' or v_sc.place_lat <> 45.75 or v_sc.place_lng <> 4.84 then
    raise exception 'FAIL G14: area not rounded %', row_to_json(v_sc);
  end if;
  v_sc := public.studio_save_showcase_look(jsonb_build_object('place', jsonb_build_object(
    'mode', 'exact', 'label', '12 rue de la Paix, Lyon', 'lat', 45.7483123, 'lng', 4.8426871)));
  if v_sc.place_mode <> 'exact' or v_sc.place_lat <> 45.74831 or v_sc.place_lng <> 4.84269 then
    raise exception 'FAIL G14: salon %', row_to_json(v_sc);
  end if;
  foreach v_page in array array[jsonb_build_object('place', jsonb_build_object('mode', 'exact', 'label', 'X', 'lat', 45, 'lng', 4)),
                                jsonb_build_object('place', jsonb_build_object('mode', 'exact', 'label', 'Lyon', 'lat', 95, 'lng', 4)),
                                jsonb_build_object('place', jsonb_build_object('mode', 'exact', 'label', 'Lyon', 'lat', 45, 'lng', -181)),
                                jsonb_build_object('place', jsonb_build_object('mode', 'exact', 'label', 'Lyon', 'lat', '45', 'lng', 4)),
                                jsonb_build_object('place', jsonb_build_object('mode', 'home', 'label', 'Lyon', 'lat', 45, 'lng', 4)),
                                jsonb_build_object('place', jsonb_build_object('mode', 'area', 'lat', 45, 'lng', 4)),
                                jsonb_build_object('place', '"Lyon"'::jsonb)] loop
    v_state := null;
    begin
      perform public.studio_save_showcase_look(v_page);
    exception when others then v_state := sqlstate;
    end;
    if v_state is distinct from '22023' then raise exception 'FAIL G14: accepted % (%)', v_page, v_state; end if;
  end loop;
  -- Neither a partial row nor a precise area, whoever writes it.
  execute 'reset role';
  v_state := null;
  begin
    update public.studio_showcases set place_label = null where user_id = other;
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '23514' then raise exception 'FAIL G14: partial place stored (%)', v_state; end if;
  v_state := null;
  begin
    update public.studio_showcases set place_mode = 'area' where user_id = other;
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '23514' then raise exception 'FAIL G14: precise area stored (%)', v_state; end if;
  -- Another member cannot write it (no direct UPDATE; the function only writes the caller's row).
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', artist, 'role', 'authenticated')::text, true);
  v_state := null;
  begin
    update public.studio_showcases set place_label = 'Hijacked' where user_id = other;
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL G14: another member wrote the place (%)', v_state; end if;
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  v_page := public.studio_public_showcase('nova.gems');
  if v_page #> '{look,place}' <> jsonb_build_object('mode', 'exact', 'label', '12 rue de la Paix, Lyon', 'lat', 45.74831, 'lng', 4.84269) then
    raise exception 'FAIL G14: public place %', v_page #> '{look,place}';
  end if;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', other, 'role', 'authenticated')::text, true);
  v_sc := public.studio_save_showcase_look(jsonb_build_object('place', null));
  if v_sc.place_mode is not null or v_sc.place_label is not null or v_sc.place_lat is not null then
    raise exception 'FAIL G14: place not removed';
  end if;
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  if public.studio_public_showcase('nova.gems') #> '{look,place}' <> 'null'::jsonb then raise exception 'FAIL G14: removed place shown'; end if;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', other, 'role', 'authenticated')::text, true);
  v_sc := public.studio_save_showcase_look(jsonb_build_object('place', jsonb_build_object(
    'mode', 'area', 'label', 'Lyon', 'lat', 45.75, 'lng', 4.84)));
  passed := passed || 'G14'::text;

  -- G12: the plan switch closed (rolled back with the rest).
  execute 'reset role';
  execute $f$create or replace function private.glowbook_customization_allowed(p_user uuid)
    returns boolean language sql stable security definer set search_path = '' as $b$ select false $b$ $f$;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', other, 'role', 'authenticated')::text, true);
  v_state := null;
  begin
    perform public.studio_save_showcase_section(null, 'Closed');
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL G12: section written without the plan (%)', v_state; end if;
  v_state := null;
  begin
    perform public.studio_set_showcase_item_section(i_one, null);
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL G12: filed without the plan (%)', v_state; end if;
  v_state := null;
  begin
    perform public.studio_set_spotlight_video(i_one, other || '/spot-1.mp4', 'video/mp4', 5, v_at);
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL G12: video recorded without the plan (%)', v_state; end if;
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  v_page := public.studio_public_showcase('nova.gems');
  if v_page is null or v_page -> 'sections' <> '[]'::jsonb or jsonb_array_length(v_page -> 'items') <> 2
     or exists (select 1 from jsonb_array_elements(v_page -> 'items') i where i -> 'section_id' <> 'null'::jsonb)
     or v_page -> 'certification' = 'null'::jsonb or v_page -> 'look' <> 'null'::jsonb then
    raise exception 'FAIL G12: page without the plan %', v_page;
  end if;
  passed := passed || 'G12'::text;

  raise exception 'ALL STUDIO GLOWBOOK TESTS PASSED (%)', array_to_string(passed, ', ');
end;
$$;
