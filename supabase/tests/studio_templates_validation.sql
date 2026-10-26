-- =============================================================================
-- 3D Studio templates validation suite
-- (migrations 20261018224657_studio_templates, 20261026190000_studio_templates_collections_artist,
--  decisions 97 and 113 (b))
-- =============================================================================
-- Proves, as the roles that really call them:
--
--   T1  a visitor reads no template;
--   T2  a member without Studio access is refused the library and the copy;
--   T3  a manage_content team member publishes their own creation; the first
--       publication date is kept when published again; the change is audited
--       (the flag only, not the scene);
--   T4  a member on the Artist plan reads the published templates, newest
--       first, without their Gem Group references — and neither the template
--       rows nor the author's unpublished design through the table;
--   T5  a member cannot flag: not through the function, not by writing the
--       column of their own design (update or insert);
--   T6  a viewer (staff without manage_content) cannot publish; a manager
--       cannot publish someone else's design;
--   T7  "use this template" creates a design owned by the caller, unpublished,
--       without thumbnail or Gem Group references; the template is unchanged;
--       an unpublished design cannot be copied;
--   T8  template renders: readable with Studio access, the author's other
--       renders are not, and nothing without access;
--   T9  another manage_content member unpublishes the template: it leaves the
--       library, the member's copy stays theirs.
--   T10 below the Artist plan (a trial, an Essential subscription, an
--       Artist subscription that ended) the library, the copy and the renders
--       are refused; an Atelier subscription has them (decision 113 (b)).
--
-- ONE transaction, ALWAYS rolled back by raising `ALL STUDIO TEMPLATE TESTS PASSED`
-- (or `FAIL: ...`).
-- =============================================================================

do $$
declare
  author  uuid := '00000000-0000-4000-a000-000000970001';
  manager uuid := '00000000-0000-4000-a000-000000970002';
  viewer  uuid := '00000000-0000-4000-a000-000000970003';
  m_trial uuid := '00000000-0000-4000-a000-000000970004';
  m_none  uuid := '00000000-0000-4000-a000-000000970005';
  m_trial2 uuid := '00000000-0000-4000-a000-000000970006';
  m_ess   uuid := '00000000-0000-4000-a000-000000970007';
  m_atl   uuid := '00000000-0000-4000-a000-000000970008';
  v_piece jsonb := '{"productId":"solitaire","ss":5,"look":{"shape":"round","material":"crystal","color":"#ffffff","effect":"none"},"rotation":0,"at":{"x":0,"y":0,"z":0},"facing":{"x":0,"y":0,"z":1}}';
  v_scene jsonb;
  t_old   uuid;
  t_new   uuid;
  draft   uuid;
  own     uuid;
  v_copy  public.creations;
  v_at    timestamptz;
  v_at2   timestamptz;
  v_upd   timestamptz;
  v_cnt   int;
  v_state text;
  v_names text[];
  r       jsonb;
  passed  text[] := '{}';
begin
  v_scene := jsonb_build_object(
    'version', 2, 'model', 'dentition', 'lightPreset', 'studio', 'camera', null,
    'pieces', jsonb_build_array(v_piece, v_piece, v_piece),
    'groups', jsonb_build_array(jsonb_build_object('id', 'g1', 'gemGroupId', gen_random_uuid(), 'name', 'Author group', 'pieceIds', '[]'::jsonb)));

  insert into auth.users (id, aud, role, email, created_at, updated_at) values
    (author,  'authenticated', 'authenticated', 'tpl-author.test@example.invalid',  now(), now()),
    (manager, 'authenticated', 'authenticated', 'tpl-manager.test@example.invalid', now(), now()),
    (viewer,  'authenticated', 'authenticated', 'tpl-viewer.test@example.invalid',  now(), now()),
    (m_trial, 'authenticated', 'authenticated', 'tpl-member.test@example.invalid',  now(), now()),
    (m_none,  'authenticated', 'authenticated', 'tpl-none.test@example.invalid',    now(), now()),
    (m_trial2, 'authenticated', 'authenticated', 'tpl-trial.test@example.invalid',  now(), now()),
    (m_ess,   'authenticated', 'authenticated', 'tpl-essential.test@example.invalid', now(), now()),
    (m_atl,   'authenticated', 'authenticated', 'tpl-atelier.test@example.invalid', now(), now());
  update public.profiles set role = 'manager' where id in (author, manager);
  update public.profiles set role = 'viewer' where id = viewer;
  -- `m_trial` is the member who browses and copies: on the Artist plan since decision 113 (b).
  insert into public.studio_subscriptions (user_id, plan, status, stripe_subscription_id, current_period_end) values
    (m_trial, 'artist',    'active', 'sub_tpl_artist',    now() + interval '1 month'),
    (m_ess,   'essential', 'active', 'sub_tpl_essential', now() + interval '1 month'),
    (m_atl,   'atelier',   'active', 'sub_tpl_atelier',   now() + interval '1 month');
  insert into public.studio_trials (user_id) values (m_trial2);

  -- The author's designs (staff have Studio access): two to publish, one kept private.
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', author, 'role', 'authenticated')::text, true);
  insert into public.creations (name, description, tags, scene_data, estimated_price_minor, is_favorite, thumbnail_path)
  values ('Old template', 'First one', '{classic}', v_scene, 4500, true, author || '/old.jpg') returning id into t_old;
  insert into public.creations (name, scene_data, thumbnail_path)
  values ('New template', v_scene, author || '/new.jpg') returning id into t_new;
  insert into public.creations (name, scene_data, thumbnail_path)
  values ('Private draft', v_scene, author || '/draft.jpg') returning id into draft;
  execute 'reset role';
  insert into storage.objects (bucket_id, name) values
    ('studio-thumbnails', author || '/old.jpg'),
    ('studio-thumbnails', author || '/new.jpg'),
    ('studio-thumbnails', author || '/draft.jpg');

  -- T1: a visitor reads no template.
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  v_state := null;
  begin
    perform public.studio_templates();
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL T1: visitor read templates (%)', v_state; end if;
  passed := passed || 'T1'::text;

  -- T3: the author publishes; again keeps the first date; audited, flag only.
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', author, 'role', 'authenticated')::text, true);
  v_at := public.studio_set_template(t_old, true);
  if v_at is null then raise exception 'FAIL T3: no publication date'; end if;
  perform public.studio_set_template(t_new, true);
  execute 'reset role';
  -- Back-date the first template so the order and the "kept" date are observable.
  update public.creations set template_published_at = now() - interval '40 days' where id = t_old;
  select template_published_at into v_at from public.creations where id = t_old;
  select updated_at into v_upd from public.creations where id = t_old;
  select count(*) into v_cnt from public.audit_logs
   where table_name = 'creations' and record_id = t_new::text
     and changes ? 'template_published_at' and not changes ? 'scene_data';
  if v_cnt <> 1 then raise exception 'FAIL T3: publication not audited as the flag alone (%)', v_cnt; end if;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', author, 'role', 'authenticated')::text, true);
  v_at2 := public.studio_set_template(t_old, true);
  if v_at2 is distinct from v_at then raise exception 'FAIL T3: republishing moved the date % → %', v_at, v_at2; end if;
  passed := passed || 'T3'::text;

  -- T2: a member without access is refused the library and the copy.
  perform set_config('request.jwt.claims', json_build_object('sub', m_none, 'role', 'authenticated')::text, true);
  v_state := null;
  begin
    perform public.studio_templates();
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL T2: read without access (%)', v_state; end if;
  v_state := null;
  begin
    perform public.studio_use_template(t_old);
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL T2: copied without access (%)', v_state; end if;
  passed := passed || 'T2'::text;

  -- T4: a member with access reads the templates, newest first, nothing else.
  perform set_config('request.jwt.claims', json_build_object('sub', m_trial, 'role', 'authenticated')::text, true);
  select array_agg(name order by ord) into v_names
    from (select name, row_number() over () as ord from public.studio_templates()) s;
  if v_names is distinct from array['New template', 'Old template'] then
    raise exception 'FAIL T4: library %', v_names;
  end if;
  select count(*) into v_cnt from public.studio_templates() t
   where jsonb_array_length(t.scene_data -> 'groups') <> 0 or t.element_count <> 3;
  if v_cnt <> 0 then raise exception 'FAIL T4: Gem Group references or count leaked'; end if;
  select count(*) into v_cnt from public.creations where id in (t_old, t_new, draft);
  if v_cnt <> 0 then raise exception 'FAIL T4: member reads staff design rows (%)', v_cnt; end if;
  passed := passed || 'T4'::text;

  -- T5: a member cannot flag.
  insert into public.creations (name, scene_data) values ('Mine', v_scene) returning id into own;
  v_state := null;
  begin
    perform public.studio_set_template(own, true);
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL T5: member published (%)', v_state; end if;
  v_state := null;
  begin
    update public.creations set template_published_at = now() where id = own;
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL T5: member wrote the flag (%)', v_state; end if;
  v_state := null;
  begin
    insert into public.creations (name, scene_data, template_published_at) values ('Forged', v_scene, now());
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL T5: member inserted a template (%)', v_state; end if;
  v_state := null;
  begin
    perform public.studio_set_template(t_old, false);
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL T5: member unpublished (%)', v_state; end if;
  passed := passed || 'T5'::text;

  -- T6: a viewer cannot publish; a manager cannot publish another's design.
  perform set_config('request.jwt.claims', json_build_object('sub', viewer, 'role', 'authenticated')::text, true);
  v_state := null;
  begin
    perform public.studio_set_template(draft, true);
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL T6: viewer published (%)', v_state; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', manager, 'role', 'authenticated')::text, true);
  v_state := null;
  begin
    perform public.studio_set_template(draft, true);
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from 'P0002' then raise exception 'FAIL T6: published another''s design (%)', v_state; end if;
  v_state := null;
  begin
    perform public.studio_set_template(own, false);
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from 'P0002' then raise exception 'FAIL T6: "unpublished" a member''s design (%)', v_state; end if;
  passed := passed || 'T6'::text;

  -- T7: the copy is the caller's; the template is unchanged.
  perform set_config('request.jwt.claims', json_build_object('sub', m_trial, 'role', 'authenticated')::text, true);
  v_copy := public.studio_use_template(t_old);
  if v_copy.user_id <> m_trial or v_copy.id = t_old or v_copy.template_published_at is not null
     or v_copy.thumbnail_path is not null or v_copy.is_favorite or v_copy.element_count <> 3
     or v_copy.name <> 'Old template' or v_copy.description <> 'First one' or v_copy.tags <> '{classic}'
     or v_copy.estimated_price_minor <> 4500 or jsonb_array_length(v_copy.scene_data -> 'groups') <> 0 then
    raise exception 'FAIL T7: copy %', to_jsonb(v_copy) - 'scene_data';
  end if;
  select count(*) into v_cnt from public.creations where id = v_copy.id;
  if v_cnt <> 1 then raise exception 'FAIL T7: member cannot read their copy'; end if;
  update public.creations set name = 'My version' where id = v_copy.id;
  v_state := null;
  begin
    perform public.studio_use_template(draft);
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from 'P0002' then raise exception 'FAIL T7: copied an unpublished design (%)', v_state; end if;
  update public.creations set name = 'Hijacked' where id = t_old;
  get diagnostics v_cnt = row_count;
  if v_cnt <> 0 then raise exception 'FAIL T7: member edited the template'; end if;
  execute 'reset role';
  select count(*) into v_cnt from public.creations
   where id = t_old and name = 'Old template' and user_id = author and updated_at = v_upd
     and template_published_at = v_at and jsonb_array_length(scene_data -> 'groups') = 1;
  if v_cnt <> 1 then raise exception 'FAIL T7: the template changed'; end if;
  passed := passed || 'T7'::text;

  -- T8: template renders only, and only with access.
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', m_trial, 'role', 'authenticated')::text, true);
  select array_agg(name order by name) into v_names from storage.objects
   where bucket_id = 'studio-thumbnails' and name like author || '/%';
  if v_names is distinct from array[author || '/new.jpg', author || '/old.jpg'] then
    raise exception 'FAIL T8: member reads renders %', v_names;
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', m_none, 'role', 'authenticated')::text, true);
  select count(*) into v_cnt from storage.objects where bucket_id = 'studio-thumbnails' and name like author || '/%';
  if v_cnt <> 0 then raise exception 'FAIL T8: renders read without access (%)', v_cnt; end if;
  passed := passed || 'T8'::text;

  -- T9: another manage_content member unpublishes; the copy stays.
  perform set_config('request.jwt.claims', json_build_object('sub', manager, 'role', 'authenticated')::text, true);
  if public.studio_set_template(t_old, false) is not null then raise exception 'FAIL T9: unpublish returned a date'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', m_trial, 'role', 'authenticated')::text, true);
  select array_agg(name) into v_names from public.studio_templates();
  if v_names is distinct from array['New template'] then raise exception 'FAIL T9: library after unpublish %', v_names; end if;
  select count(*) into v_cnt from public.creations where id = v_copy.id and user_id = m_trial;
  if v_cnt <> 1 then raise exception 'FAIL T9: the copy went with the template'; end if;
  v_state := null;
  begin
    perform public.studio_use_template(t_old);
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from 'P0002' then raise exception 'FAIL T9: copied an unpublished template (%)', v_state; end if;
  passed := passed || 'T9'::text;

  -- T10: the Artist plan and above only (decision 113 (b)).
  -- (t_new is still published: T9 took t_old down.)
  perform set_config('role', 'authenticated', true);
  foreach r in array array[to_jsonb(m_trial2), to_jsonb(m_ess)] loop
    perform set_config('request.jwt.claims', json_build_object('sub', r #>> '{}', 'role', 'authenticated')::text, true);
    v_state := null;
    begin
      perform public.studio_templates();
    exception when others then v_state := sqlstate;
    end;
    if v_state is distinct from '42501' then raise exception 'FAIL T10: % read the templates (%)', r, v_state; end if;
    v_state := null;
    begin
      perform public.studio_use_template(t_new);
    exception when others then v_state := sqlstate;
    end;
    if v_state is distinct from '42501' then raise exception 'FAIL T10: % copied a template (%)', r, v_state; end if;
    select count(*) into v_cnt from storage.objects where bucket_id = 'studio-thumbnails' and name like author || '/%';
    if v_cnt <> 0 then raise exception 'FAIL T10: % read template renders (%)', r, v_cnt; end if;
    select count(*) into v_cnt from public.creations where user_id = (r #>> '{}')::uuid;
    if v_cnt <> 0 then raise exception 'FAIL T10: % got a copy (%)', r, v_cnt; end if;
  end loop;
  perform set_config('request.jwt.claims', json_build_object('sub', m_atl, 'role', 'authenticated')::text, true);
  if not exists (select 1 from public.studio_templates() x where x.id = t_new) then raise exception 'FAIL T10: Atelier refused the library'; end if;
  v_copy := public.studio_use_template(t_new);
  if v_copy.user_id <> m_atl then raise exception 'FAIL T10: Atelier copy not theirs'; end if;
  execute 'reset role';
  update public.studio_subscriptions set status = 'canceled', current_period_end = now() - interval '1 second' where user_id = m_trial;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', m_trial, 'role', 'authenticated')::text, true);
  v_state := null;
  begin
    perform public.studio_templates();
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL T10: ended Artist subscription read the templates (%)', v_state; end if;
  passed := passed || 'T10'::text;

  raise exception 'ALL STUDIO TEMPLATE TESTS PASSED (%)', array_to_string(passed, ', ');
end;
$$;
