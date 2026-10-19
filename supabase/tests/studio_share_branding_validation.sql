-- =============================================================================
-- 3D Studio social export branding validation suite
-- (migration 20261019142032_studio_share_branding, decision 101)
-- =============================================================================
--   B1  a visitor gets nothing: no branding, no logo, no upload;
--   B2  the tier: trial = essential, essential / artist / atelier subscriptions
--       give their plan (past_due counts), the highest plan wins, active staff
--       = atelier, an ended trial or subscription = null;
--   B3  an essential (or trial) member may not upload, record or read a logo;
--   B4  an artist uploads into their own folder only, records it, reads it;
--       the path must be a file of their folder (22023);
--   B5  another member reads neither the row nor the file and cannot record it;
--   B6  after the subscription ends: the logo is no longer returned nor
--       readable, the member still removes it (row and file).
-- ONE transaction, ALWAYS rolled back by raising `ALL STUDIO SHARE BRANDING TESTS PASSED`.
-- =============================================================================

do $$
declare
  trial  uuid := '00000000-0000-4000-a000-000000380001';
  ess    uuid := '00000000-0000-4000-a000-000000380002';
  art    uuid := '00000000-0000-4000-a000-000000380003';
  atl    uuid := '00000000-0000-4000-a000-000000380004';
  staff  uuid := '00000000-0000-4000-a000-000000380005';
  gone   uuid := '00000000-0000-4000-a000-000000380006';
  late   uuid := '00000000-0000-4000-a000-000000380007';
  v_json jsonb;
  v_text text;
  v_cnt  int;
  v_state text;
  passed text[] := '{}';
begin
  insert into auth.users (id, aud, role, email, created_at, updated_at) values
    (trial, 'authenticated', 'authenticated', 'brand-1.test@example.invalid', now(), now()),
    (ess,   'authenticated', 'authenticated', 'brand-2.test@example.invalid', now(), now()),
    (art,   'authenticated', 'authenticated', 'brand-3.test@example.invalid', now(), now()),
    (atl,   'authenticated', 'authenticated', 'brand-4.test@example.invalid', now(), now()),
    (staff, 'authenticated', 'authenticated', 'brand-5.test@example.invalid', now(), now()),
    (gone,  'authenticated', 'authenticated', 'brand-6.test@example.invalid', now(), now()),
    (late,  'authenticated', 'authenticated', 'brand-7.test@example.invalid', now(), now());
  update public.profiles set role = 'manager' where id = staff;
  insert into public.studio_trials (user_id) values (trial), (art);
  insert into public.studio_trials (user_id, trial_started_at, trial_expires_at)
  values (gone, now() - interval '48 hours', now());
  insert into public.studio_subscriptions (user_id, plan, status, stripe_subscription_id, current_period_end) values
    (ess, 'essential', 'active',   'sub_brand_ess', now() + interval '1 month'),
    (art, 'artist',    'past_due', 'sub_brand_art', now() + interval '1 month'),
    (atl, 'essential', 'active',   'sub_brand_atl_old', now() + interval '1 month'),
    (atl, 'atelier',   'active',   'sub_brand_atl', now() + interval '1 year'),
    (gone, 'atelier',  'canceled', 'sub_brand_gone', now() - interval '1 day'),
    (late, 'artist',   'active',   'sub_brand_late', now() + interval '1 month');

  -- B2: the tier
  if private.studio_user_tier(trial) is distinct from 'essential' then raise exception 'FAIL B2: trial %', private.studio_user_tier(trial); end if;
  if private.studio_user_tier(ess) is distinct from 'essential' then raise exception 'FAIL B2: essential'; end if;
  if private.studio_user_tier(art) is distinct from 'artist' then raise exception 'FAIL B2: artist (past_due + trial) %', private.studio_user_tier(art); end if;
  if private.studio_user_tier(atl) is distinct from 'atelier' then raise exception 'FAIL B2: highest plan'; end if;
  if private.studio_user_tier(staff) is distinct from 'atelier' then raise exception 'FAIL B2: staff %', private.studio_user_tier(staff); end if;
  if private.studio_user_tier(gone) is not null then raise exception 'FAIL B2: ended access %', private.studio_user_tier(gone); end if;
  if private.studio_user_tier(null) is not null then raise exception 'FAIL B2: null user'; end if;
  passed := passed || 'B2'::text;

  -- B1: visitor
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  v_state := null;
  begin
    perform public.studio_share_branding();
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL B1: visitor read branding (%)', v_state; end if;
  v_state := null;
  begin
    perform public.studio_set_share_logo('x/logo.png');
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL B1: visitor set a logo (%)', v_state; end if;
  v_state := null;
  begin
    perform 1 from public.studio_share_logos;
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL B1: visitor read logos (%)', v_state; end if;
  v_state := null;
  begin
    insert into storage.objects (bucket_id, name) values ('studio-share-logos', art || '/anon.png');
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL B1: visitor uploaded (%)', v_state; end if;
  passed := passed || 'B1'::text;

  -- B3: essential and trial members
  perform set_config('role', 'authenticated', true);
  foreach v_text in array array[trial::text, ess::text] loop
    perform set_config('request.jwt.claims', json_build_object('sub', v_text, 'role', 'authenticated')::text, true);
    v_json := public.studio_share_branding();
    if v_json ->> 'tier' <> 'essential' or v_json ->> 'logo_path' is not null then raise exception 'FAIL B3: branding %', v_json; end if;
    v_state := null;
    begin
      insert into storage.objects (bucket_id, name) values ('studio-share-logos', v_text || '/logo.png');
    exception when others then v_state := sqlstate;
    end;
    if v_state is distinct from '42501' then raise exception 'FAIL B3: essential uploaded (%)', v_state; end if;
    execute 'reset role';
    insert into storage.objects (bucket_id, name) values ('studio-share-logos', v_text || '/planted.png');
    perform set_config('role', 'authenticated', true);
    v_state := null;
    begin
      perform public.studio_set_share_logo(v_text || '/planted.png');
    exception when others then v_state := sqlstate;
    end;
    if v_state is distinct from '42501' then raise exception 'FAIL B3: essential recorded a logo (%)', v_state; end if;
    select count(*) into v_cnt from storage.objects where bucket_id = 'studio-share-logos';
    if v_cnt <> 0 then raise exception 'FAIL B3: essential reads logo files (%)', v_cnt; end if;
  end loop;
  passed := passed || 'B3'::text;

  -- B4: an artist
  perform set_config('request.jwt.claims', json_build_object('sub', art, 'role', 'authenticated')::text, true);
  insert into storage.objects (bucket_id, name) values ('studio-share-logos', art || '/logo-1.png');
  v_state := null;
  begin
    insert into storage.objects (bucket_id, name) values ('studio-share-logos', ess || '/intruder.png');
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL B4: upload into another folder (%)', v_state; end if;
  foreach v_text in array array[art || '/missing.png', ess || '/planted.png', 'logo-1.png'] loop
    v_state := null;
    begin
      perform public.studio_set_share_logo(v_text);
    exception when others then v_state := sqlstate;
    end;
    if v_state is distinct from '22023' then raise exception 'FAIL B4: recorded % (%)', v_text, v_state; end if;
  end loop;
  v_text := public.studio_set_share_logo(art || '/logo-1.png');
  if v_text is not null then raise exception 'FAIL B4: previous path %', v_text; end if;
  v_json := public.studio_share_branding();
  if v_json ->> 'tier' <> 'artist' or v_json ->> 'logo_path' <> art || '/logo-1.png' or (v_json ->> 'has_logo')::boolean is not true then
    raise exception 'FAIL B4: branding %', v_json;
  end if;
  select count(*) into v_cnt from storage.objects where bucket_id = 'studio-share-logos';
  if v_cnt <> 1 then raise exception 'FAIL B4: artist reads % files', v_cnt; end if;
  insert into storage.objects (bucket_id, name) values ('studio-share-logos', art || '/logo-2.png');
  v_text := public.studio_set_share_logo(art || '/logo-2.png');
  if v_text is distinct from art || '/logo-1.png' then raise exception 'FAIL B4: replacing returned %', v_text; end if;
  v_state := null;
  begin
    insert into public.studio_share_logos (user_id, logo_path) values (art, art || '/direct.png');
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL B4: direct write (%)', v_state; end if;
  passed := passed || 'B4'::text;

  -- B5: another member (an atelier one)
  perform set_config('request.jwt.claims', json_build_object('sub', atl, 'role', 'authenticated')::text, true);
  v_json := public.studio_share_branding();
  if v_json ->> 'tier' <> 'atelier' or v_json ->> 'logo_path' is not null or (v_json ->> 'has_logo')::boolean then
    raise exception 'FAIL B5: branding %', v_json;
  end if;
  select count(*) into v_cnt from public.studio_share_logos;
  if v_cnt <> 0 then raise exception 'FAIL B5: reads another member''s logo row'; end if;
  select count(*) into v_cnt from storage.objects where bucket_id = 'studio-share-logos';
  if v_cnt <> 0 then raise exception 'FAIL B5: reads another member''s files (%)', v_cnt; end if;
  v_state := null;
  begin
    perform public.studio_set_share_logo(art || '/logo-2.png');
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '22023' then raise exception 'FAIL B5: recorded another member''s file (%)', v_state; end if;
  passed := passed || 'B5'::text;

  -- B6: the artist's subscription ends (late: an artist without a trial)
  perform set_config('request.jwt.claims', json_build_object('sub', late, 'role', 'authenticated')::text, true);
  insert into storage.objects (bucket_id, name) values ('studio-share-logos', late || '/logo.png');
  perform public.studio_set_share_logo(late || '/logo.png');
  execute 'reset role';
  update public.studio_subscriptions set status = 'canceled', current_period_end = now() - interval '1 minute' where user_id = late;
  perform set_config('role', 'authenticated', true);
  v_json := public.studio_share_branding();
  if v_json ->> 'tier' is not null or v_json ->> 'logo_path' is not null or (v_json ->> 'has_logo')::boolean is not true then
    raise exception 'FAIL B6: branding after the end %', v_json;
  end if;
  select count(*) into v_cnt from storage.objects where bucket_id = 'studio-share-logos';
  if v_cnt <> 0 then raise exception 'FAIL B6: logo still readable (%)', v_cnt; end if;
  v_text := public.studio_set_share_logo(null);
  if v_text is distinct from late || '/logo.png' then raise exception 'FAIL B6: removal returned %', v_text; end if;
  select count(*) into v_cnt from public.studio_share_logos;
  if v_cnt <> 0 then raise exception 'FAIL B6: row kept'; end if;
  execute 'reset role';
  select count(*) into v_cnt from pg_policies
   where schemaname = 'storage' and tablename = 'objects' and cmd = 'DELETE'
     and policyname = 'studio-share-logos: owners delete' and qual not like '%studio_share_logo_allowed%';
  if v_cnt <> 1 then raise exception 'FAIL B6: deleting own files must not need the plan'; end if;
  passed := passed || 'B6'::text;

  raise exception 'ALL STUDIO SHARE BRANDING TESTS PASSED (%)', array_to_string(passed, ', ');
end;
$$;
