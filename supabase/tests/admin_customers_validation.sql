-- =============================================================================
-- Admin customers validation suite (migration `…_admin_customers`).
-- =============================================================================
-- Requires all migrations. ONE transaction, ALWAYS rolled back by raising
-- `ALL ADMIN CUSTOMERS TESTS PASSED` (or `FAIL: ...`).
-- Covers what /admin/clients reads and writes: customers refused the staff
-- reads, read-only staff refused every write, a manager's writes (status,
-- names, tags, notes) with the guard's read-only columns, notes editable by
-- their author only, the status history, and course progress by the
-- learner's rule (revoked seats left out).
-- =============================================================================

do $$
declare
  mgr  uuid := '00000000-0000-4000-a000-0000000c0001';  -- manager: manage_customers, manage_training
  mg2  uuid := '00000000-0000-4000-a000-0000000c0002';  -- another manager
  vwr  uuid := '00000000-0000-4000-a000-0000000c0003';  -- viewer: reads only
  cst  uuid := '00000000-0000-4000-a000-0000000c0004';  -- the customer
  oth  uuid := '00000000-0000-4000-a000-0000000c0005';  -- another customer
  c1   uuid := '00000000-0000-4000-a000-0000000c00c1';
  c2   uuid := '00000000-0000-4000-a000-0000000c00c2';
  m1   uuid := '00000000-0000-4000-a000-0000000c00a1';
  s1   uuid := '00000000-0000-4000-a000-0000000c00b1';
  s2   uuid := '00000000-0000-4000-a000-0000000c00b2';
  qz1  uuid := '00000000-0000-4000-a000-0000000c00e1';
  q1   uuid := '00000000-0000-4000-a000-0000000c00f1';
  v_note uuid;
  v_cnt  int;
  v_txt  text;
  v_state text;
  r record;
  passed text[] := '{}';
begin
  insert into auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at) values
    (mgr, 'authenticated', 'authenticated', 'cust.mgr.test@example.invalid', '{"first_name":"Mia"}', now(), now()),
    (mg2, 'authenticated', 'authenticated', 'cust.mg2.test@example.invalid', '{"first_name":"Max"}', now(), now()),
    (vwr, 'authenticated', 'authenticated', 'cust.vwr.test@example.invalid', '{"first_name":"Val"}', now(), now()),
    (cst, 'authenticated', 'authenticated', 'cust.cst.test@example.invalid', '{"first_name":"Cleo"}', now(), now()),
    (oth, 'authenticated', 'authenticated', 'cust.oth.test@example.invalid', '{"first_name":"Otto"}', now(), now());
  update public.profiles set role = 'manager' where id in (mgr, mg2);
  update public.profiles set role = 'viewer'  where id = vwr;
  update public.profiles set first_name = 'Mia', last_name = 'Test' where id = mgr;

  perform set_config('role', 'authenticated', true);

  -- ===========================================================================
  -- R1 customers cannot call the staff reads, nor read the CRM tables
  -- ===========================================================================
  perform set_config('request.jwt.claims', json_build_object('sub', cst, 'role', 'authenticated')::text, true);
  foreach v_txt in array array['history', 'courses'] loop
    v_state := null;
    begin
      if v_txt = 'history' then perform * from public.admin_customer_status_history(cst);
      else perform * from public.admin_customer_courses(null); end if;
    exception when others then v_state := sqlstate;
    end;
    if v_state is distinct from '42501' then raise exception 'FAIL R1: customer called % (%)', v_txt, v_state; end if;
  end loop;
  select count(*) into v_cnt from public.profiles where id <> cst;
  if v_cnt <> 0 then raise exception 'FAIL R1: a customer reads other profiles'; end if;
  passed := array_append(passed, 'R1 customers refused the staff reads and other profiles');

  -- ===========================================================================
  -- W1 read-only staff read the base but write nothing
  -- ===========================================================================
  perform set_config('request.jwt.claims', json_build_object('sub', vwr, 'role', 'authenticated')::text, true);
  select count(*) into v_cnt from public.profiles where id in (cst, oth);
  if v_cnt <> 2 then raise exception 'FAIL W1: viewer cannot read customers (%)', v_cnt; end if;
  perform * from public.admin_customer_status_history(cst);
  perform * from public.admin_customer_courses(null);
  v_state := null;
  begin
    insert into public.customer_tags (user_id, tag) values (cst, 'vip');
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL W1: viewer tagged a customer (%)', v_state; end if;
  v_state := null;
  begin
    insert into public.customer_notes (user_id, body) values (cst, 'Note');
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL W1: viewer wrote a note (%)', v_state; end if;
  update public.profiles set status = 'suspended' where id = cst;
  get diagnostics v_cnt = row_count;
  if v_cnt <> 0 then raise exception 'FAIL W1: viewer suspended a customer'; end if;
  passed := array_append(passed, 'W1 read-only staff read customers, cannot tag, note or change status');

  -- ===========================================================================
  -- W2 a manager edits the profile; email and marketing consent stay read-only
  -- ===========================================================================
  perform set_config('request.jwt.claims', json_build_object('sub', mgr, 'role', 'authenticated')::text, true);
  update public.profiles set first_name = 'Cléo', last_name = 'Martin', phone = '+33 6 00 00 00 00',
                             country_code = 'BE', birth_date = '1990-05-01', status = 'suspended'
   where id = cst;
  get diagnostics v_cnt = row_count;
  if v_cnt <> 1 then raise exception 'FAIL W2: manager could not edit the customer'; end if;
  foreach v_txt in array array['email', 'marketing'] loop
    v_state := null;
    begin
      if v_txt = 'email' then update public.profiles set email = 'x@example.invalid' where id = cst;
      else update public.profiles set marketing_opt_in = true where id = cst; end if;
    exception when others then v_state := sqlstate;
    end;
    if v_state is distinct from '42501' then raise exception 'FAIL W2: manager changed % (%)', v_txt, v_state; end if;
  end loop;
  update public.profiles set status = 'active' where id = cst;
  passed := array_append(passed, 'W2 manager edits names, phone, country, birth date and status; email and consent refused');

  -- ===========================================================================
  -- H1 the status history: both changes, in order, with who made them
  -- ===========================================================================
  select count(*), string_agg(old_status || '>' || new_status || ':' || actor_name, ',' order by changed_at)
    into v_cnt, v_txt from public.admin_customer_status_history(cst);
  if v_cnt <> 2 or v_txt <> 'active>suspended:Mia Test,suspended>active:Mia Test' then
    raise exception 'FAIL H1: history %', v_txt;
  end if;
  select count(*) into v_cnt from public.admin_customer_status_history(oth);
  if v_cnt <> 0 then raise exception 'FAIL H1: history of another account leaks'; end if;
  passed := array_append(passed, 'H1 status history: old, new, actor, one account only');

  -- ===========================================================================
  -- H2 the history of a team member is not readable here
  -- ===========================================================================
  execute 'reset role';
  update public.profiles set status = 'suspended' where id = mg2;
  update public.profiles set status = 'active' where id = mg2;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', vwr, 'role', 'authenticated')::text, true);
  select count(*) into v_cnt from public.admin_customer_status_history(mg2);
  if v_cnt <> 0 then raise exception 'FAIL H2: a team member''s history is readable (% rows)', v_cnt; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', mgr, 'role', 'authenticated')::text, true);
  passed := array_append(passed, 'H2 status history of team accounts: no rows');

  -- ===========================================================================
  -- T1 tags and notes; a note is edited by its author only
  -- ===========================================================================
  insert into public.customer_tags (user_id, tag) values (cst, 'vip');
  v_state := null;
  begin
    insert into public.customer_tags (user_id, tag) values (cst, 'vip');
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '23505' then raise exception 'FAIL T1: duplicate tag (%)', v_state; end if;
  insert into public.customer_notes (user_id, body) values (cst, 'Première note') returning id into v_note;
  perform set_config('request.jwt.claims', json_build_object('sub', mg2, 'role', 'authenticated')::text, true);
  update public.customer_notes set body = 'Réécrite' where id = v_note;
  get diagnostics v_cnt = row_count;
  if v_cnt <> 0 then raise exception 'FAIL T1: another manager rewrote a note'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', mgr, 'role', 'authenticated')::text, true);
  update public.customer_notes set body = 'Corrigée' where id = v_note;
  get diagnostics v_cnt = row_count;
  if v_cnt <> 1 then raise exception 'FAIL T1: author could not edit the note'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', cst, 'role', 'authenticated')::text, true);
  select count(*) into v_cnt from public.customer_notes;
  select v_cnt + count(*) into v_cnt from public.customer_tags;
  if v_cnt <> 0 then raise exception 'FAIL T1: the customer reads the CRM'; end if;
  passed := array_append(passed, 'T1 tags unique, notes edited by their author only, CRM hidden from the customer');

  -- ===========================================================================
  -- C1 course progress: steps + checks, revoked seats left out
  -- ===========================================================================
  perform set_config('request.jwt.claims', json_build_object('sub', mgr, 'role', 'authenticated')::text, true);
  perform public.admin_save_course(jsonb_build_object(
    'id', c1, 'slug', 'clients-test-c1', 'title', 'Cours test', 'category', 'technique', 'level', 'beginner',
    'price', '100.00', 'min_score', 70,
    'modules', jsonb_build_array(
      jsonb_build_object('id', m1, 'title', 'Module', 'steps', jsonb_build_array(
          jsonb_build_object('id', s1, 'title', 'Un', 'duration_minutes', 5),
          jsonb_build_object('id', s2, 'title', 'Deux', 'duration_minutes', 5)),
        'quiz', jsonb_build_object('id', qz1, 'title', 'Contrôle', 'passing_score', 50,
          'questions', jsonb_build_array(jsonb_build_object('id', q1, 'text', 'Q', 'answers', jsonb_build_array(
            jsonb_build_object('id', gen_random_uuid(), 'text', 'Oui', 'is_correct', true),
            jsonb_build_object('id', gen_random_uuid(), 'text', 'Non', 'is_correct', false)))))))));
  perform public.admin_save_course(jsonb_build_object(
    'id', c2, 'slug', 'clients-test-c2', 'title', 'Cours retiré', 'category', 'technique', 'level', 'beginner',
    'price', '100.00', 'min_score', 70, 'modules', '[]'::jsonb));
  execute 'reset role';
  insert into public.course_entitlements (user_id, course_id, source, granted_by) values
    (cst, c1, 'manual_grant', mgr);
  insert into public.course_entitlements (user_id, course_id, source, granted_by, revoked_at, revoked_by) values
    (cst, c2, 'manual_grant', mgr, now(), mgr);
  insert into public.lesson_progress (user_id, course_id, step_id, completed_at) values (cst, c1, s1, now());
  insert into public.quiz_attempts (user_id, course_id, module_id, quiz_id, status, answers, question_count,
                                    correct_count, score, passing_score, passed, started_at, submitted_at)
  values (cst, c1, m1, qz1, 'submitted', '{}'::jsonb, 1, 1, 100, 50, true, now(), now());
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', vwr, 'role', 'authenticated')::text, true);
  select count(*) into v_cnt from public.admin_customer_courses(cst);
  if v_cnt <> 1 then raise exception 'FAIL C1: % seats (revoked one included?)', v_cnt; end if;
  select * into r from public.admin_customer_courses(cst);
  if r.course_id <> c1 or r.nodes_total <> 3 or r.nodes_done <> 2 or r.last_activity is null or r.title <> 'Cours test' then
    raise exception 'FAIL C1: %', row_to_json(r);
  end if;
  select count(*) into v_cnt from public.admin_customer_courses(null) where user_id = cst;
  if v_cnt <> 1 then raise exception 'FAIL C1: the whole-base read misses the seat'; end if;
  passed := array_append(passed, 'C1 course progress = steps validated + checks passed over steps + checks; revoked seats hidden');

  execute 'reset role';
  execute 'set constraints all immediate';
  raise exception 'ALL ADMIN CUSTOMERS TESTS PASSED (% groups, rolled back): %',
    cardinality(passed), array_to_string(passed, ' | ');
end;
$$;
