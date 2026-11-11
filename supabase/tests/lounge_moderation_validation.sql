-- =============================================================================
-- Members' Lounge moderation validation suite (migration `…_lounge_moderation`,
-- decision 132).
-- =============================================================================
-- Requires all migrations. ONE transaction, ALWAYS rolled back by raising
-- `ALL LOUNGE MODERATION TESTS PASSED` (or `FAIL: ...`).
-- Covers: the permission matrix; reports (acknowledgement, one per member and
-- message, own message, invalid reasons, rate limit) and who reads them;
-- members and staff without `moderate_community` refused; hiding (no longer
-- served to others, the author sees why, Realtime event, reports settled,
-- e-mails pending, audit); muting and excluding enforced on every write, team
-- members protected; complaints (who, once, reversed restores); deletion
-- (images queued for Storage, the copy kept); blocks between members; the
-- export; an erasure unlinking; the non-member notice category; the purge.
-- =============================================================================

do $$
declare
  a     uuid := '00000000-0000-4000-a000-000000320001';  -- holder, author
  b     uuid := '00000000-0000-4000-a000-000000320002';  -- holder, reporter
  c     uuid := '00000000-0000-4000-a000-000000320003';  -- holder, reporter
  d     uuid := '00000000-0000-4000-a000-000000320004';  -- holder
  mdr   uuid := '00000000-0000-4000-a000-000000320005';  -- manager: moderate_community
  vwr   uuid := '00000000-0000-4000-a000-000000320006';  -- viewer: staff without the permission
  crs   uuid := '00000000-0000-4000-a000-0000003200c1';
  m1    uuid;  -- a's message, reported by b and c
  m2    uuid;  -- a's second message
  m3    uuid;  -- d's message with an image
  m4    uuid;  -- c's message
  dec1  uuid;  -- hide m1
  dec2  uuid;
  ap1   uuid;
  v     jsonb;
  v_cnt int;
  v_txt text;
  v_ok  boolean;
  i     int;
  passed text[] := '{}';
begin
  insert into auth.users (id, aud, role, email, created_at, updated_at) values
    (a,   'authenticated', 'authenticated', 'mod32a.test@example.invalid', now(), now()),
    (b,   'authenticated', 'authenticated', 'mod32b.test@example.invalid', now(), now()),
    (c,   'authenticated', 'authenticated', 'mod32c.test@example.invalid', now(), now()),
    (d,   'authenticated', 'authenticated', 'mod32d.test@example.invalid', now(), now()),
    (mdr, 'authenticated', 'authenticated', 'mod32m.test@example.invalid', now(), now()),
    (vwr, 'authenticated', 'authenticated', 'mod32v.test@example.invalid', now(), now());
  update public.profiles set first_name = 'Alice', last_name = 'Author', preferred_locale = 'en' where id = a;
  update public.profiles set first_name = 'Bruno', last_name = 'Reporter' where id = b;
  update public.profiles set first_name = 'Chloé', last_name = 'Second' where id = c;
  update public.profiles set first_name = 'Dina', last_name = 'Image' where id = d;
  update public.profiles set role = 'manager' where id = mdr;
  update public.profiles set role = 'viewer' where id = vwr;

  insert into public.courses (id, slug, title, status, published_at) values (crs, 'moderation-test-32', 'Fondamentaux', 'draft', null);
  insert into public.course_entitlements (user_id, course_id, source, granted_by)
  select u, crs, 'manual_grant', mdr from unnest(array[a, b, c, d]) as u;

  -- R0: the permission matrix ------------------------------------------------------------
  select count(*) into v_cnt from public.role_permissions where permission_key = 'moderate_community' and role_key in ('manager', 'admin');
  if v_cnt <> 2 then raise exception 'FAIL R0: manager and admin hold moderate_community (%)', v_cnt; end if;
  select count(*) into v_cnt from public.role_permissions where permission_key = 'moderate_community' and role_key = 'viewer';
  if v_cnt <> 0 then raise exception 'FAIL R0: viewer holds moderate_community'; end if;
  passed := passed || 'R0'::text;

  -- Everyone enters; messages are posted an hour after joining.
  perform set_config('role', 'authenticated', true);
  foreach v_txt in array array[a::text, b::text, c::text, d::text, mdr::text] loop
    perform set_config('request.jwt.claims', json_build_object('sub', v_txt, 'role', 'authenticated')::text, true);
    perform public.lounge_join('en');
  end loop;
  reset role;
  update public.lounge_members set joined_at = now() - interval '1 hour';
  insert into storage.objects (bucket_id, name) values ('lounge-media', d || '/proof.jpg');
  perform set_config('role', 'authenticated', true);

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  m1 := public.lounge_post_message('en-general', null, '[{"type":"text","text":"Buy cheap gems on my site"}]');
  m2 := public.lounge_post_message('en-general', null, '[{"type":"text","text":"Second message"}]');
  perform set_config('request.jwt.claims', json_build_object('sub', d, 'role', 'authenticated')::text, true);
  m3 := public.lounge_post_message('en-inspiration', null, '[{"type":"text","text":"Look"}]', null,
          jsonb_build_array(jsonb_build_object('path', d || '/proof.jpg', 'alt', 'a smile')));
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  m4 := public.lounge_post_message('en-general', null, '[{"type":"text","text":"Hello"}]');

  -- N1: reporting -------------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  v := public.lounge_report_message(m1, 'spam', null, 'Advertising for another shop.');
  if v ->> 'id' is null or v ->> 'created_at' is null then raise exception 'FAIL N1: no acknowledgement %', v; end if;
  begin
    perform public.lounge_report_message(m1, 'harassment', null, 'Reporting the same message twice.');
    raise exception 'FAIL N1: a second report of the same message';
  exception when unique_violation then null;
  end;
  begin
    perform public.lounge_report_message(m1, 'illegal', null, 'Unlawful content without a category.');
    raise exception 'FAIL N1: unlawful content without its category';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.lounge_report_message(m2, 'spam', 'hate_speech', 'A category on a non-legal reason.');
    raise exception 'FAIL N1: a category on spam';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.lounge_report_message(m2, 'spam', null, 'short');
    raise exception 'FAIL N1: an explanation too short';
  exception when invalid_parameter_value then null;
  end;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  begin
    perform public.lounge_report_message(m1, 'spam', null, 'Reporting my own message.');
    raise exception 'FAIL N1: own message reported';
  exception when invalid_parameter_value then null;
  end;
  begin
    insert into public.lounge_reports (message_id, reporter_id, reason, details) values (m4, a, 'spam', 'Written directly.');
    raise exception 'FAIL N1: a direct insert into lounge_reports';
  exception when insufficient_privilege then null;
  end;
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  perform public.lounge_report_message(m1, 'illegal', 'scam_fraud', 'Looks like a scam to me, please check.');
  passed := passed || 'N1'::text;

  -- N2: the rate limit (10 an hour) ------------------------------------------------------
  reset role;
  insert into public.lounge_reports (message_id, reporter_id, message_author_id, reason, details, status, resolved_at)
  select null, d, a, 'spam', 'Earlier reports of the hour.', 'dismissed', now() from generate_series(1, 10);
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', d, 'role', 'authenticated')::text, true);
  begin
    perform public.lounge_report_message(m2, 'spam', null, 'One report too many this hour.');
    raise exception 'FAIL N2: the eleventh report of the hour';
  exception when sqlstate 'PT429' then null;
  end;
  passed := passed || 'N2'::text;

  -- N3: a member reads their own reports only ---------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  select count(*) into v_cnt from public.lounge_reports;
  if v_cnt <> 1 then raise exception 'FAIL N3: b reads % reports', v_cnt; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  select count(*) into v_cnt from public.lounge_reports;
  if v_cnt <> 0 then raise exception 'FAIL N3: the reported author reads the reports (%)', v_cnt; end if;
  begin
    perform public.lounge_moderation_queue('open');
    raise exception 'FAIL N3: a member reads the queue';
  exception when insufficient_privilege then null;
  end;
  passed := passed || 'N3'::text;

  -- G1: a member cannot hide another member's message --------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  begin
    perform public.lounge_moderate_message(m1, 'hide', 'spam', null, 'terms', 'Hidden by another member.');
    raise exception 'FAIL G1: a member hid a message';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.lounge_messages set moderation_status = 'hidden', hidden_at = now() where id = m1;
    raise exception 'FAIL G1: a direct update';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.lounge_moderate_member(a, 'mute', 'spam', null, 'terms', 'Muted by another member.', now() + interval '1 day');
    raise exception 'FAIL G1: a member muted another';
  exception when insufficient_privilege then null;
  end;
  reset role;
  select moderation_status into v_txt from public.lounge_messages where id = m1;
  if v_txt <> 'visible' then raise exception 'FAIL G1: the message changed'; end if;
  perform set_config('role', 'authenticated', true);
  passed := passed || 'G1'::text;

  -- G2: staff without moderate_community refused ---------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', vwr, 'role', 'authenticated')::text, true);
  foreach v_txt in array array['queue', 'hide', 'history', 'appeals', 'stats', 'context', 'member'] loop
    begin
      case v_txt
        when 'queue' then perform public.lounge_moderation_queue('open');
        when 'hide' then perform public.lounge_moderate_message(m1, 'hide', 'spam', null, 'terms', 'Hidden by a viewer.');
        when 'history' then perform public.lounge_moderation_history(10);
        when 'appeals' then perform public.lounge_appeals_queue('open');
        when 'stats' then perform public.lounge_moderation_stats(now() - interval '1 day', now());
        when 'context' then perform public.lounge_moderation_context(m1, 3);
        else perform public.lounge_moderate_member(a, 'ban', 'spam', null, 'terms', 'Excluded by a viewer.');
      end case;
      raise exception 'FAIL G2: a viewer used %', v_txt;
    exception when insufficient_privilege then null;
    end;
  end loop;
  select count(*) into v_cnt from public.lounge_reports;
  if v_cnt <> 0 then raise exception 'FAIL G2: a viewer reads the reports'; end if;
  passed := passed || 'G2'::text;

  -- H1: the moderator's queue and context ---------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', mdr, 'role', 'authenticated')::text, true);
  v := public.lounge_moderation_queue('open');
  if jsonb_array_length(v) <> 1 or (v -> 0 ->> 'message_id')::uuid <> m1 or (v -> 0 ->> 'open_reports')::int <> 2
     or jsonb_array_length(v -> 0 -> 'reports') <> 2 then
    raise exception 'FAIL H1: queue %', v;
  end if;
  v := public.lounge_moderation_context(m1, 5);
  if jsonb_array_length(v) < 3 or not exists (select 1 from jsonb_array_elements(v) e where (e ->> 'is_target')::boolean and (e ->> 'id')::uuid = m1) then
    raise exception 'FAIL H1: context %', v;
  end if;
  begin
    perform public.lounge_moderate_message(m1, 'hide', null, null, null, 'No reason given.');
    raise exception 'FAIL H1: hiding without a reason';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.lounge_moderate_message(m1, 'hide', 'spam', null, 'terms', 'short');
    raise exception 'FAIL H1: a statement too short';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.lounge_moderate_message(m1, 'hide', 'spam', null, 'illegal', 'Unlawful ground without a category.');
    raise exception 'FAIL H1: an unlawful ground without its category';
  exception when invalid_parameter_value then null;
  end;
  passed := passed || 'H1'::text;

  -- H2: hiding: kept, not served to others, the author sees why --------------------------
  dec1 := public.lounge_moderate_message(m1, 'hide', 'spam', null, 'terms', 'Advertising for another shop is not allowed in the lounges.');
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  select count(*) into v_cnt from public.lounge_messages where id = m1;
  if v_cnt <> 0 then raise exception 'FAIL H2: a hidden message is still read by another member'; end if;
  select count(*) into v_cnt from public.lounge_moderation_events where message_id = m1 and kind = 'hidden';
  if v_cnt <> 1 then raise exception 'FAIL H2: no Realtime event for the other members'; end if;
  select status into v_txt from public.lounge_reports where message_id = m1;
  if v_txt <> 'actioned' then raise exception 'FAIL H2: the report is %', v_txt; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  select moderation_status into v_txt from public.lounge_messages where id = m1;
  if v_txt is distinct from 'hidden' then raise exception 'FAIL H2: the author no longer sees their message (%)', v_txt; end if;
  v := public.lounge_my_moderation();
  if jsonb_array_length(v -> 'decisions') <> 1 or v -> 'decisions' -> 0 ->> 'statement' not like 'Advertising%'
     or (v -> 'decisions' -> 0 ->> 'automated')::boolean or v -> 'decisions' -> 0 ->> 'excerpt' <> 'Buy cheap gems on my site'
     or v -> 'decisions' -> 0 ->> 'appeal_until' is null then
    raise exception 'FAIL H2: the author''s file %', v;
  end if;
  select count(*) into v_cnt from public.lounge_moderation_decisions where id = dec1;
  if v_cnt <> 1 then raise exception 'FAIL H2: the author does not read the decision'; end if;
  begin
    select decided_by::text into v_txt from public.lounge_moderation_decisions where id = dec1;
    raise exception 'FAIL H2: the author reads who decided';
  exception when insufficient_privilege then null;
  end;
  reset role;
  select count(*) into v_cnt from public.lounge_messages where id = m1 and moderation_status = 'hidden' and hidden_decision_id = dec1;
  if v_cnt <> 1 then raise exception 'FAIL H2: the message is not kept hidden'; end if;
  select count(*) into v_cnt from public.audit_logs where table_name = 'lounge_moderation_decisions' and record_id = dec1::text;
  if v_cnt <> 1 then raise exception 'FAIL H2: the decision is not audited'; end if;
  select count(*) into v_cnt from public.audit_logs where table_name = 'lounge_messages' and record_id = m1::text and action = 'update';
  if v_cnt <> 1 then raise exception 'FAIL H2: hiding is not audited'; end if;
  select count(*) into v_cnt from public.audit_logs where table_name = 'lounge_moderation_decisions' and changes::text like '%Buy cheap gems%';
  if v_cnt <> 0 then raise exception 'FAIL H2: the audit copied the content'; end if;
  select count(*) into v_cnt from public.pending_lounge_moderation_emails(100) p
   where p.event_key in ('lounge_decision:' || dec1::text);
  if v_cnt <> 1 then raise exception 'FAIL H2: no statement of reasons pending'; end if;
  select count(*) into v_cnt from public.pending_lounge_moderation_emails(100) p
   where p.kind = 'report' and (p.payload ->> 'decision_id')::uuid = dec1;
  if v_cnt <> 2 then raise exception 'FAIL H2: % report outcomes pending', v_cnt; end if;
  select p.locale into v_txt from public.pending_lounge_moderation_emails(100) p where p.event_key = 'lounge_decision:' || dec1::text;
  if v_txt <> 'en' then raise exception 'FAIL H2: the e-mail locale %', v_txt; end if;
  perform set_config('role', 'authenticated', true);
  passed := passed || 'H2'::text;

  -- U1: mute, enforced on every write; reads stay -------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', mdr, 'role', 'authenticated')::text, true);
  begin
    perform public.lounge_moderate_member(mdr, 'mute', 'spam', null, 'terms', 'Muting myself is refused.', now() + interval '1 day');
    raise exception 'FAIL U1: a moderator muted themself';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.lounge_moderate_member(a, 'mute', 'spam', null, 'terms', 'No end given to the mute.');
    raise exception 'FAIL U1: a mute without an end';
  exception when invalid_parameter_value then null;
  end;
  dec2 := public.lounge_moderate_member(a, 'mute', 'spam', null, 'terms', 'Repeated advertising: muted for a day.', now() + interval '1 day', m2);
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  v_ok := false;
  begin
    perform public.lounge_post_message('en-general', null, '[{"type":"text","text":"Still here"}]');
  exception when insufficient_privilege then v_ok := true;
  end;
  if not v_ok then raise exception 'FAIL U1: a muted member wrote'; end if;
  v_ok := false;
  begin
    perform public.lounge_toggle_reaction(m4, 'heart');
  exception when insufficient_privilege then v_ok := true;
  end;
  if not v_ok then raise exception 'FAIL U1: a muted member reacted'; end if;
  if not public.lounge_access() then raise exception 'FAIL U1: a muted member lost the lounge'; end if;
  select count(*) into v_cnt from public.lounge_messages where id = m4;
  if v_cnt <> 1 then raise exception 'FAIL U1: a muted member no longer reads'; end if;
  if (public.lounge_my_moderation() ->> 'muted_until') is null then raise exception 'FAIL U1: the member is not told'; end if;
  select count(*) into v_cnt from public.course_entitlements where user_id = a and revoked_at is null;
  if v_cnt <> 1 then raise exception 'FAIL U1: the mute touched the courses'; end if;
  reset role;
  select count(*) into v_cnt from public.audit_logs where table_name = 'lounge_members' and record_id = a::text and changes ? 'muted_until';
  if v_cnt <> 1 then raise exception 'FAIL U1: the mute is not audited'; end if;
  perform set_config('role', 'authenticated', true);
  passed := passed || 'U1'::text;

  -- U2: team members are protected; exclusion closes the door -----------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', mdr, 'role', 'authenticated')::text, true);
  begin
    perform public.lounge_moderate_member(vwr, 'ban', 'spam', null, 'terms', 'Excluding a team member.');
    raise exception 'FAIL U2: a team member was sanctioned';
  exception when insufficient_privilege or invalid_parameter_value then null;
  end;
  perform public.lounge_moderate_member(d, 'ban', 'harassment', null, 'terms', 'Repeated harassment of other members.');
  perform set_config('request.jwt.claims', json_build_object('sub', d, 'role', 'authenticated')::text, true);
  if public.lounge_access() then raise exception 'FAIL U2: an excluded member enters'; end if;
  begin
    perform public.lounge_post_message('en-general', null, '[{"type":"text","text":"Excluded"}]');
    raise exception 'FAIL U2: an excluded member wrote';
  exception when insufficient_privilege then null;
  end;
  v := public.lounge_my_moderation();
  if v ->> 'banned_at' is null or jsonb_array_length(v -> 'decisions') <> 1 then raise exception 'FAIL U2: the excluded member''s file %', v; end if;
  select count(*) into v_cnt from public.course_entitlements where user_id = d and revoked_at is null;
  if v_cnt <> 1 then raise exception 'FAIL U2: the exclusion touched the courses'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', mdr, 'role', 'authenticated')::text, true);
  perform public.lounge_moderate_member(d, 'lift', null, null, null, 'Lifted after a conversation with the member.');
  perform set_config('request.jwt.claims', json_build_object('sub', d, 'role', 'authenticated')::text, true);
  if not public.lounge_access() then raise exception 'FAIL U2: lifting did not reopen the door'; end if;
  passed := passed || 'U2'::text;

  -- A1: complaints ---------------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  begin
    perform public.lounge_submit_appeal(dec2, 'I contest a decision that is not about me.');
    raise exception 'FAIL A1: a third party contested';
  exception when invalid_parameter_value then null;
  end;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  begin
    perform public.lounge_submit_appeal(dec1, 'short');
    raise exception 'FAIL A1: a complaint too short';
  exception when invalid_parameter_value then null;
  end;
  ap1 := (public.lounge_submit_appeal(dec1, 'This was a recommendation, not advertising.') ->> 'id')::uuid;
  begin
    perform public.lounge_submit_appeal(dec1, 'A second complaint about the same decision.');
    raise exception 'FAIL A1: two complaints';
  exception when unique_violation then null;
  end;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  select count(*) into v_cnt from public.lounge_appeals;
  if v_cnt <> 0 then raise exception 'FAIL A1: b reads a''s complaint'; end if;
  begin
    perform public.lounge_answer_appeal(ap1, 'reversed', 'A member answering a complaint.');
    raise exception 'FAIL A1: a member answered';
  exception when insufficient_privilege then null;
  end;
  reset role;
  update public.lounge_moderation_decisions set created_at = now() - interval '7 months' where id = dec2;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  begin
    perform public.lounge_submit_appeal(dec2, 'Too late to contest this decision.');
    raise exception 'FAIL A1: a complaint after 6 months';
  exception when invalid_parameter_value then null;
  end;
  reset role;
  update public.lounge_moderation_decisions set created_at = now() where id = dec2;
  perform set_config('role', 'authenticated', true);

  perform set_config('request.jwt.claims', json_build_object('sub', mdr, 'role', 'authenticated')::text, true);
  v := public.lounge_appeals_queue('open');
  if jsonb_array_length(v) <> 1 or (v -> 0 ->> 'id')::uuid <> ap1 then raise exception 'FAIL A1: complaints queue %', v; end if;
  perform public.lounge_answer_appeal(ap1, 'reversed', 'On review, sharing a supplier is allowed: your message is visible again.');
  begin
    perform public.lounge_answer_appeal(ap1, 'upheld', 'Answering the same complaint twice.');
    raise exception 'FAIL A1: answered twice';
  exception when invalid_parameter_value then null;
  end;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  select count(*) into v_cnt from public.lounge_messages where id = m1;
  if v_cnt <> 1 then raise exception 'FAIL A1: a reversed complaint did not restore the message'; end if;
  reset role;
  select count(*) into v_cnt from public.lounge_moderation_decisions where appeal_id = ap1 and action = 'restore';
  if v_cnt <> 1 then raise exception 'FAIL A1: no restore decision linked to the complaint'; end if;
  select count(*) into v_cnt from public.pending_lounge_moderation_emails(100) p where p.event_key = 'lounge_appeal:' || ap1::text;
  if v_cnt <> 1 then raise exception 'FAIL A1: the answer is not pending for e-mail'; end if;
  perform set_config('role', 'authenticated', true);
  passed := passed || 'A1'::text;

  -- A2: a reporter contests a dismissal; reversed, the report is back in the queue ------
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  perform public.lounge_report_message(m4, 'harassment', null, 'This message targets me personally.');
  perform set_config('request.jwt.claims', json_build_object('sub', mdr, 'role', 'authenticated')::text, true);
  dec2 := public.lounge_moderate_message(m4, 'dismiss', null, null, null, 'A greeting is not harassment.');
  begin
    perform public.lounge_moderate_message(m4, 'dismiss', null, null, null, 'Nothing left to dismiss here.');
    raise exception 'FAIL A2: dismissed twice';
  exception when invalid_parameter_value then null;
  end;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  v := public.lounge_my_moderation();
  if not exists (select 1 from jsonb_array_elements(v -> 'reports') r
                  where r -> 'decision' ->> 'action' = 'dismiss' and r -> 'decision' ->> 'statement' like 'A greeting%') then
    raise exception 'FAIL A2: the reporter does not read the dismissal''s explanation %', v -> 'reports';
  end if;
  ap1 := (public.lounge_submit_appeal(dec2, 'There is context you did not see.') ->> 'id')::uuid;
  perform set_config('request.jwt.claims', json_build_object('sub', mdr, 'role', 'authenticated')::text, true);
  perform public.lounge_answer_appeal(ap1, 'reversed', 'We are looking at the message again with that context.');
  v := public.lounge_moderation_queue('open');
  if not exists (select 1 from jsonb_array_elements(v) e where (e ->> 'message_id')::uuid = m4) then
    raise exception 'FAIL A2: the report did not come back %', v;
  end if;
  passed := passed || 'A2'::text;

  -- D1: deletion: the message and its images go, the copy stays ----------------------------
  perform public.lounge_moderate_message(m3, 'delete', 'illegal', 'privacy_image', 'illegal',
                                         'A photo of a person published without their consent.');
  reset role;
  select count(*) into v_cnt from public.lounge_messages where id = m3;
  if v_cnt <> 0 then raise exception 'FAIL D1: the message is still there'; end if;
  select count(*) into v_cnt from public.lounge_message_attachments where storage_path = d || '/proof.jpg';
  if v_cnt <> 0 then raise exception 'FAIL D1: the attachment is still there'; end if;
  select count(*) into v_cnt from private.storage_purge_queue where bucket_id = 'lounge-media' and name = d || '/proof.jpg';
  if v_cnt <> 1 then raise exception 'FAIL D1: the image is not queued for Storage'; end if;
  select count(*) into v_cnt
    from public.lounge_moderation_decisions dd join public.lounge_moderation_snapshots s on s.decision_id = dd.id
   where dd.action = 'delete' and dd.target_user_id = d and s.body_text = 'Look' and s.attachment_count = 1;
  if v_cnt <> 1 then raise exception 'FAIL D1: the copy is not kept'; end if;
  select count(*) into v_cnt from public.lounge_moderation_events where message_id = m3 and kind = 'deleted';
  if v_cnt <> 1 then raise exception 'FAIL D1: no Realtime event'; end if;
  perform set_config('role', 'authenticated', true);
  passed := passed || 'D1'::text;

  -- B1: blocks are the member's own, applied by the database ----------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  begin
    perform public.lounge_set_blocked(b, true);
    raise exception 'FAIL B1: blocking oneself';
  exception when invalid_parameter_value then null;
  end;
  perform public.lounge_set_blocked(c, true);
  select count(*) into v_cnt from public.lounge_messages where author_id = c;
  if v_cnt <> 0 then raise exception 'FAIL B1: a blocked member''s messages are served'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  select count(*) into v_cnt from public.lounge_messages where author_id = c;
  if v_cnt <> 1 then raise exception 'FAIL B1: the block applies to others'; end if;
  select count(*) into v_cnt from public.lounge_blocks;
  if v_cnt <> 0 then raise exception 'FAIL B1: a reads b''s blocks'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  if jsonb_array_length(public.lounge_my_moderation() -> 'blocked') <> 1 then raise exception 'FAIL B1: the list of hidden members'; end if;
  perform public.lounge_set_blocked(c, false);
  select count(*) into v_cnt from public.lounge_messages where author_id = c;
  if v_cnt <> 1 then raise exception 'FAIL B1: unblocking'; end if;
  perform public.lounge_set_blocked(c, true);
  passed := passed || 'B1'::text;

  -- R1: a reporter reads the outcome, not the statement written for the member concerned ------
  v := public.lounge_my_moderation();
  if exists (select 1 from jsonb_array_elements(v -> 'reports') r
              where r -> 'decision' ->> 'action' <> 'dismiss' and r -> 'decision' ->> 'statement' is not null) then
    raise exception 'FAIL R1: a reporter reads the statement of another member''s decision %', v -> 'reports';
  end if;
  passed := passed || 'R1'::text;

  -- E1: the export ----------------------------------------------------------------------------
  v := public.my_personal_data();
  if jsonb_array_length(v -> 'archive' -> 'community' -> 'reports') <> 2
     or jsonb_array_length(v -> 'archive' -> 'community' -> 'hidden_members') <> 1
     or jsonb_array_length(v -> 'archive' -> 'community' -> 'complaints') <> 1 then
    raise exception 'FAIL E1: b''s export %', v -> 'archive' -> 'community';
  end if;
  if (v -> 'archive' -> 'community')::text like '%' || c::text || '%' then raise exception 'FAIL E1: another member''s id in the export'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  v := public.my_personal_data();
  if jsonb_array_length(v -> 'archive' -> 'community' -> 'moderation_decisions') < 2 then
    raise exception 'FAIL E1: a''s decisions %', v -> 'archive' -> 'community' -> 'moderation_decisions';
  end if;
  passed := passed || 'E1'::text;

  -- X1: an erasure unlinks (decision 125): copy, settled explanations, complaint texts --
  reset role;
  delete from auth.users where id = b;
  select count(*) into v_cnt from public.lounge_reports where reporter_id is null and message_id = m1 and details is null and status = 'actioned';
  if v_cnt <> 1 then raise exception 'FAIL X1: the erased reporter''s settled report'; end if;
  select count(*) into v_cnt from public.lounge_appeals where appellant_id is null and body is null;
  if v_cnt <> 1 then raise exception 'FAIL X1: the erased appellant''s complaint'; end if;
  delete from auth.users where id = d;
  select count(*) into v_cnt
    from public.lounge_moderation_decisions dd join public.lounge_moderation_snapshots s on s.decision_id = dd.id
   where dd.action = 'delete' and dd.target_user_id is null and s.body_text = 'Look';
  if v_cnt <> 0 then raise exception 'FAIL X1: the erased author''s content copy stayed'; end if;
  passed := passed || 'X1'::text;

  -- C1: notices from anyone go through the contact form ---------------------------------
  insert into public.contact_requests (name, email, category, subject, message, locale)
  values ('Visitor', 'visitor32.test@example.invalid', 'illegal_content', 'Unlawful content',
          'A message in the lounge shows my photo without consent.', 'fr')
  returning priority into v_txt;
  if v_txt <> 'high' then raise exception 'FAIL C1: priority %', v_txt; end if;
  passed := passed || 'C1'::text;

  -- S1: counters --------------------------------------------------------------------------
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', mdr, 'role', 'authenticated')::text, true);
  v := public.lounge_moderation_stats(now() - interval '1 day', now() + interval '1 minute');
  if (v ->> 'automated_decisions')::int <> 0 or (v ->> 'non_member_notices')::int <> 1
     or (v -> 'decisions_by_action' ->> 'hide')::int <> 1 or (v ->> 'appeals')::int <> 2 then
    raise exception 'FAIL S1: stats %', v;
  end if;
  if jsonb_array_length(public.lounge_moderation_history(50)) < 6 then raise exception 'FAIL S1: history'; end if;
  passed := passed || 'S1'::text;

  -- P1: the purge ---------------------------------------------------------------------------
  reset role;
  update public.lounge_moderation_decisions set created_at = now() - interval '13 months' where id = dec1;
  update public.lounge_reports set resolved_at = now() - interval '13 months', details = 'An old explanation.' where message_id = m1 and status <> 'open';
  v := private.purge_lounge_moderation_data(now());
  select count(*) into v_cnt from public.lounge_moderation_snapshots where decision_id = dec1;
  if v_cnt <> 0 then raise exception 'FAIL P1: the 12-month copy stayed %', v; end if;
  select count(*) into v_cnt from public.lounge_reports where message_id = m1 and details is not null;
  if v_cnt <> 0 then raise exception 'FAIL P1: the 12-month explanations stayed'; end if;
  update public.lounge_reports set resolved_at = now() - interval '4 years' where message_id = m1;
  perform private.purge_lounge_moderation_data(now());
  select count(*) into v_cnt from public.lounge_reports where message_id = m1;
  if v_cnt <> 0 then raise exception 'FAIL P1: the 3-year reports stayed'; end if;
  select count(*) into v_cnt from public.lounge_reports where status = 'open';
  if v_cnt = 0 then raise exception 'FAIL P1: an open report was purged'; end if;
  passed := passed || 'P1'::text;

  reset role;
  raise exception 'ALL LOUNGE MODERATION TESTS PASSED (%)', array_to_string(passed, ', ');
end;
$$;
