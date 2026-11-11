-- =============================================================================
-- Members' Lounge: moderation (decision 132, owner's request of 2026-11-10)
-- =============================================================================
-- Before the lounge opens to customers it needs what a host of members'
-- content must offer (Regulation (EU) 2022/2065 "DSA", art. 16 notice and
-- action, 17 statement of reasons, 20 internal complaint-handling; LCEN art. 6):
--
--   lounge_reports                 a member reports a message (or one of its
--                                  images): reason from a list (unlawful content
--                                  with its category, harassment, spam, personal
--                                  data, other) and an explanation. One report per
--                                  member and message; 10 an hour, 30 a day.
--   lounge_moderation_decisions    every decision of the team, with its reason, its
--                                  ground (terms of use or unlawfulness), the
--                                  statement shown to the member, never automated:
--                                  dismiss | hide | restore | delete (a message),
--                                  mute | ban | lift (a member).
--   lounge_moderation_snapshots    the content a decision is about, kept apart from
--                                  the decision so the audit trail never copies it
--                                  and the purge can drop it on its own.
--   lounge_appeals                 the internal complaint (art. 20): the member a
--                                  decision affects, or a member whose report it
--                                  settled, contests it within 6 months; the team
--                                  answers, the answer is e-mailed.
--   lounge_blocks                  a member hides another member's messages for
--                                  themself (RLS, not a browser filter).
--   lounge_moderation_events       what Realtime carries so a hidden or deleted
--                                  message leaves the other members' screens
--                                  (an UPDATE that RLS no longer lets through is
--                                  simply not delivered). No content.
--
-- Rules enforced here (the browser decides nothing):
--   - New permission `moderate_community` (manager, admin): the lounge's
--     moderation is a separate duty from product reviews (decisions about
--     members, sanctions, unlawful content); the owner can give one without
--     the other. Every moderation function and the moderators' storage read
--     check it.
--   - A hidden message stays in the database, is served to its author only
--     (who sees it was hidden and why) and to moderators through their
--     functions; restoring makes it visible again. Deleting removes the message,
--     its images (queued for the Storage purge), reactions and notifications;
--     the decision keeps a copy of the text for the statement of reasons and
--     the complaint.
--   - A muted member (until a date) reads but cannot write: messages,
--     reactions and image uploads are refused by triggers and the storage
--     policy on every write. An excluded (banned) member no longer enters the
--     lounge (`lounge_can_enter`). Neither touches their courses or account.
--     Team members cannot be muted or excluded.
--   - The affected member and every reporter are e-mailed the decision
--     (`pending_lounge_moderation_emails`, sweep `send-pending-emails`);
--     the appellant the answer to the complaint.
--   - Non-members report unlawful content through the contact form (category
--     `illegal_content`, high priority): the lounge is closed to them.
--   - Personal data: reports, decisions about the member, complaints and the
--     handles they hid are in `my_personal_data()`; an account erasure unlinks
--     them (and drops the content copy, the reporter's explanation once the
--     report is settled, the complaint's text); a nightly purge strips texts
--     after 12 months and deletes the rows after 3 years (to confirm).
-- Private messages stay closed (decision 118); reports, decisions and the
-- events work the same on a private message should they reopen.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Permission
-- -----------------------------------------------------------------------------
insert into public.permissions (key, name, description) values
  ('moderate_community', 'Moderate the members'' lounge',
   'Handle lounge reports and complaints; hide, restore or delete messages; mute or exclude members.')
on conflict (key) do nothing;
insert into public.role_permissions (role_key, permission_key) values
  ('manager', 'moderate_community'), ('admin', 'moderate_community')
on conflict do nothing;

create or replace function private.lounge_require_moderator()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null or not private.has_permission('moderate_community') then
    raise exception 'lounge moderation: moderate_community required' using errcode = '42501';
  end if;
  return v_user;
end;
$$;
revoke all on function private.lounge_require_moderator() from public, anon, authenticated;

-- Reasons and categories, shared by reports and decisions.
create or replace function private.lounge_reason_valid(p_reason text, p_category text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_reason in ('illegal', 'harassment', 'spam', 'personal_data', 'other')
     and ((p_reason = 'illegal') = (p_category is not null))
     and (p_category is null or p_category in (
           'hate_speech', 'violence_threats', 'terrorism', 'child_safety', 'scam_fraud',
           'counterfeit_ip', 'privacy_image', 'defamation', 'illegal_products', 'other_illegal'));
$$;
revoke all on function private.lounge_reason_valid(text, text) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2. Restrictions on members, moderation state of messages
-- -----------------------------------------------------------------------------
alter table public.lounge_members
  add column muted_until timestamptz,
  add column banned_at   timestamptz;
comment on column public.lounge_members.muted_until is 'Muted by the team until then: reads, cannot write (decision 132).';
comment on column public.lounge_members.banned_at is 'Excluded from the lounge by the team since then (decision 132); lifted by a "lift" decision.';

alter table public.lounge_messages
  add column moderation_status text not null default 'visible' check (moderation_status in ('visible', 'hidden')),
  add column hidden_at timestamptz,
  add column hidden_decision_id uuid,
  add constraint lounge_messages_hidden_consistent check ((moderation_status = 'hidden') = (hidden_at is not null));
comment on column public.lounge_messages.moderation_status is
  'visible | hidden (by the team): a hidden message is served to its author only (decision 132).';

-- The door: an excluded member no longer enters.
create or replace function private.lounge_can_enter(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user is not null and exists (
    select 1
      from public.profiles p
     where p.id = p_user
       and p.status = 'active'
       and (
         exists (select 1 from public.roles r where r.key = p.role and r.is_staff)
         or exists (
           select 1
             from public.course_entitlements e
            where e.user_id = p_user
              and e.revoked_at is null
              and e.starts_at <= now()
              and (e.expires_at is null or e.expires_at > now()))
       ))
   and not exists (select 1 from public.lounge_members m where m.user_id = p_user and m.banned_at is not null);
$$;
comment on function private.lounge_can_enter(uuid) is
  'Members'' Lounge door: active account with an active course entitlement, or active staff; never an excluded member.';

-- Writing: entering, and not muted.
create or replace function private.lounge_can_write(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.lounge_can_enter(p_user)
     and not exists (select 1 from public.lounge_members m where m.user_id = p_user and m.muted_until > now());
$$;
revoke all on function private.lounge_can_write(uuid) from public, anon;
grant execute on function private.lounge_can_write(uuid) to authenticated;

-- Every write of a member checks the restrictions (one branch per table: each reads its own columns).
create or replace function private.lounge_guard_restrictions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
begin
  if tg_table_name = 'lounge_messages' then
    v_user := new.author_id;
  elsif tg_table_name = 'lounge_reactions' then
    v_user := new.user_id;
  else
    return new;
  end if;
  if exists (select 1 from public.lounge_members m where m.user_id = v_user and m.banned_at is not null) then
    raise exception 'lounge: forbidden' using errcode = '42501';
  end if;
  if exists (select 1 from public.lounge_members m where m.user_id = v_user and m.muted_until > now()) then
    raise exception 'lounge: muted' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function private.lounge_guard_restrictions() from public, anon, authenticated;

create trigger lounge_messages_restrictions
  before insert on public.lounge_messages
  for each row execute function private.lounge_guard_restrictions();
create trigger lounge_reactions_restrictions
  before insert on public.lounge_reactions
  for each row execute function private.lounge_guard_restrictions();

drop policy "lounge-media: members upload into own folder" on storage.objects;
create policy "lounge-media: members upload into own folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'lounge-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select private.lounge_can_write((select auth.uid())))
  );
-- Moderators see the images of the messages they decide on (signed URLs).
create policy "lounge-media: moderators read"
  on storage.objects for select to authenticated
  using (bucket_id = 'lounge-media' and (select private.has_permission('moderate_community')));

-- -----------------------------------------------------------------------------
-- 3. Blocks between members
-- -----------------------------------------------------------------------------
create table public.lounge_blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint lounge_blocks_not_self check (blocker_id <> blocked_id)
);
comment on table public.lounge_blocks is
  'Members whose messages a member hid for themself (decision 132). Written by lounge_set_blocked() only.';
create index lounge_blocks_blocked_idx on public.lounge_blocks (blocked_id);

alter table public.lounge_blocks enable row level security;
revoke all on public.lounge_blocks from anon, authenticated;
grant select on public.lounge_blocks to authenticated;
create policy "members read their own blocks" on public.lounge_blocks
  for select to authenticated using (blocker_id = (select auth.uid()));

-- Reads: hidden messages reach their author only; blocked members' messages and
-- what they notify are not served (restrictive: added to the existing policies,
-- Realtime follows).
create policy "hidden messages are served to their author only" on public.lounge_messages
  as restrictive for select to authenticated
  using (moderation_status = 'visible' or author_id = (select auth.uid()));
create policy "blocked members' messages are not served" on public.lounge_messages
  as restrictive for select to authenticated
  using (not exists (select 1 from public.lounge_blocks b
                      where b.blocker_id = (select auth.uid()) and b.blocked_id = author_id));
-- A notification follows its message: none for a message the member cannot read.
create policy "notifications follow their message" on public.lounge_notifications
  as restrictive for select to authenticated
  using (exists (select 1 from public.lounge_messages m where m.id = message_id));

-- -----------------------------------------------------------------------------
-- 4. Decisions, content copies, reports, complaints, events
-- -----------------------------------------------------------------------------
create table public.lounge_moderation_decisions (
  id               uuid primary key default gen_random_uuid(),
  action           text not null check (action in ('dismiss', 'hide', 'restore', 'delete', 'mute', 'ban', 'lift')),
  message_id       uuid references public.lounge_messages (id) on delete set null,
  target_user_id   uuid references public.profiles (id) on delete set null,
  reason           text,
  illegal_category text,
  ground           text check (ground in ('terms', 'illegal')),
  statement        text not null check (char_length(btrim(statement)) between 10 and 2000),
  ends_at          timestamptz,
  automated        boolean not null default false check (not automated),
  report_count     integer not null default 0 check (report_count >= 0),
  appeal_id        uuid,
  decided_by       uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now(),
  constraint lounge_decisions_adverse_reason check (
    (action in ('hide', 'delete', 'mute', 'ban')) = (reason is not null)
    and (reason is null) = (ground is null)),
  constraint lounge_decisions_reason_valid check (reason is null or private.lounge_reason_valid(reason, illegal_category)),
  constraint lounge_decisions_ground check (
    reason is null or ((ground = 'illegal') = (illegal_category is not null))),
  constraint lounge_decisions_mute_end check ((action = 'mute') = (ends_at is not null))
);
comment on table public.lounge_moderation_decisions is
  'Decisions of the lounge moderators (decision 132, DSA art. 17): the statement of reasons e-mailed to the member. Written by the moderation functions only.';
comment on column public.lounge_moderation_decisions.ground is 'terms: contrary to the terms of use; illegal: unlawful content (category given).';
comment on column public.lounge_moderation_decisions.appeal_id is 'The complaint this decision answers (a restore or lift after a reversed complaint).';
create index lounge_decisions_message_idx on public.lounge_moderation_decisions (message_id) where message_id is not null;
create index lounge_decisions_target_idx on public.lounge_moderation_decisions (target_user_id, created_at desc) where target_user_id is not null;
create index lounge_decisions_created_idx on public.lounge_moderation_decisions (created_at desc);
create index lounge_decisions_decided_by_idx on public.lounge_moderation_decisions (decided_by) where decided_by is not null;

alter table public.lounge_messages
  add constraint lounge_messages_hidden_decision_fk
  foreign key (hidden_decision_id) references public.lounge_moderation_decisions (id) on delete set null;
create index lounge_messages_hidden_decision_idx on public.lounge_messages (hidden_decision_id) where hidden_decision_id is not null;

create table public.lounge_moderation_snapshots (
  decision_id        uuid primary key references public.lounge_moderation_decisions (id) on delete cascade,
  body_text          text not null default '',
  attachment_count   integer not null default 0 check (attachment_count between 0 and 4),
  channel_id         text,
  message_created_at timestamptz,
  created_at         timestamptz not null default now()
);
comment on table public.lounge_moderation_snapshots is
  'The content a lounge decision is about, as it was (decision 132). Not audited; dropped by an erasure of its author and by the purge.';

create table public.lounge_reports (
  id                uuid primary key default gen_random_uuid(),
  message_id        uuid references public.lounge_messages (id) on delete set null,
  attachment_id     uuid references public.lounge_message_attachments (id) on delete set null,
  reporter_id       uuid references public.profiles (id) on delete set null,
  message_author_id uuid references public.profiles (id) on delete set null,
  reason            text not null,
  illegal_category  text,
  -- Null once the reporter's account is erased (settled reports) or after the purge.
  details           text check (details is null or char_length(btrim(details)) between 10 and 2000),
  status            text not null default 'open' check (status in ('open', 'actioned', 'dismissed')),
  decision_id       uuid references public.lounge_moderation_decisions (id) on delete set null,
  created_at        timestamptz not null default now(),
  resolved_at       timestamptz,
  constraint lounge_reports_reason_valid check (private.lounge_reason_valid(reason, illegal_category)),
  constraint lounge_reports_resolved check ((status = 'open') = (resolved_at is null))
);
comment on table public.lounge_reports is
  'Reports of lounge messages by members (decision 132, DSA art. 16). Written by lounge_report_message() and the moderation functions only.';
create unique index lounge_reports_one_per_member on public.lounge_reports (message_id, reporter_id)
  where message_id is not null and reporter_id is not null;
create index lounge_reports_open_idx on public.lounge_reports (created_at) where status = 'open';
create index lounge_reports_reporter_idx on public.lounge_reports (reporter_id, created_at desc) where reporter_id is not null;
create index lounge_reports_message_idx on public.lounge_reports (message_id) where message_id is not null;
create index lounge_reports_decision_idx on public.lounge_reports (decision_id) where decision_id is not null;
create index lounge_reports_author_idx on public.lounge_reports (message_author_id) where message_author_id is not null;
create index lounge_reports_attachment_idx on public.lounge_reports (attachment_id) where attachment_id is not null;

create table public.lounge_appeals (
  id             uuid primary key default gen_random_uuid(),
  decision_id    uuid not null references public.lounge_moderation_decisions (id) on delete cascade,
  appellant_id   uuid references public.profiles (id) on delete set null,
  appellant_role text not null check (appellant_role in ('target', 'reporter')),
  -- Null once the appellant's account is erased or after the purge.
  body           text check (body is null or char_length(btrim(body)) between 10 and 2000),
  status         text not null default 'open' check (status in ('open', 'upheld', 'reversed')),
  response       text check (response is null or char_length(btrim(response)) between 10 and 2000),
  answered_by    uuid references public.profiles (id) on delete set null,
  answered_at    timestamptz,
  created_at     timestamptz not null default now(),
  constraint lounge_appeals_answered check ((status = 'open') = (answered_at is null) and (answered_at is null) = (response is null))
);
comment on table public.lounge_appeals is
  'Complaints against lounge decisions (decision 132, DSA art. 20), within 6 months. Written by lounge_submit_appeal() and lounge_answer_appeal() only.';
create unique index lounge_appeals_one_per_member on public.lounge_appeals (decision_id, appellant_id) where appellant_id is not null;
create index lounge_appeals_open_idx on public.lounge_appeals (created_at) where status = 'open';
create index lounge_appeals_appellant_idx on public.lounge_appeals (appellant_id) where appellant_id is not null;
create index lounge_appeals_answered_by_idx on public.lounge_appeals (answered_by) where answered_by is not null;

alter table public.lounge_moderation_decisions
  add constraint lounge_decisions_appeal_fk
  foreign key (appeal_id) references public.lounge_appeals (id) on delete set null;
create index lounge_decisions_appeal_idx on public.lounge_moderation_decisions (appeal_id) where appeal_id is not null;

create table public.lounge_moderation_events (
  id              bigint generated always as identity primary key,
  message_id      uuid not null,
  channel_id      text,
  conversation_id uuid,
  kind            text not null check (kind in ('hidden', 'deleted', 'restored')),
  created_at      timestamptz not null default now()
);
comment on table public.lounge_moderation_events is
  'Realtime signal that a lounge message was hidden, deleted or restored (no content); kept a day.';
create index lounge_moderation_events_created_idx on public.lounge_moderation_events (created_at);

-- RLS: members read their own reports and the decisions about them (never who
-- decided); moderators work through their functions.
alter table public.lounge_moderation_decisions enable row level security;
alter table public.lounge_moderation_snapshots enable row level security;
alter table public.lounge_reports enable row level security;
alter table public.lounge_appeals enable row level security;
alter table public.lounge_moderation_events enable row level security;
revoke all on public.lounge_moderation_decisions, public.lounge_moderation_snapshots, public.lounge_reports,
              public.lounge_appeals, public.lounge_moderation_events from anon, authenticated;

grant select (id, action, message_id, target_user_id, reason, illegal_category, ground, statement, ends_at,
              automated, report_count, appeal_id, created_at)
  on public.lounge_moderation_decisions to authenticated;
create policy "members read the decisions about them, moderators all" on public.lounge_moderation_decisions
  for select to authenticated
  using (target_user_id = (select auth.uid()) or (select private.has_permission('moderate_community')));

grant select (id, message_id, attachment_id, reason, illegal_category, details, status, decision_id, created_at, resolved_at)
  on public.lounge_reports to authenticated;
create policy "members read their own reports, moderators all" on public.lounge_reports
  for select to authenticated
  using (reporter_id = (select auth.uid()) or (select private.has_permission('moderate_community')));

grant select (id, decision_id, appellant_role, body, status, response, answered_at, created_at)
  on public.lounge_appeals to authenticated;
create policy "members read their own complaints, moderators all" on public.lounge_appeals
  for select to authenticated
  using (appellant_id = (select auth.uid()) or (select private.has_permission('moderate_community')));

grant select on public.lounge_moderation_events to authenticated;
create policy "lounge members read the moderation events of their rooms" on public.lounge_moderation_events
  for select to authenticated
  using (
    (select private.lounge_can_enter((select auth.uid())))
    and (channel_id is not null or conversation_id in (select private.lounge_my_conversation_ids()))
  );

alter publication supabase_realtime add table public.lounge_moderation_events;

-- Audit: the team's actions. Decisions are logged on insert (no content: the
-- copy lives in the snapshots); report and complaint outcomes, hiding and
-- restrictions on update of the watched columns only.
create trigger lounge_decisions_audit
  after insert or delete on public.lounge_moderation_decisions
  for each row execute function private.audit_changes();
create trigger lounge_reports_audit
  after update of status on public.lounge_reports
  for each row execute function private.audit_changes('status', 'decision_id', 'resolved_at');
create trigger lounge_appeals_audit
  after update of status on public.lounge_appeals
  for each row execute function private.audit_changes('status', 'answered_at', 'answered_by');
create trigger lounge_members_restrictions_audit
  after update of muted_until, banned_at on public.lounge_members
  for each row execute function private.audit_changes('muted_until', 'banned_at');
create trigger lounge_messages_moderation_audit
  after update of moderation_status on public.lounge_messages
  for each row execute function private.audit_changes('moderation_status', 'hidden_decision_id');

-- Erasure (decision 125): the FKs unlink; what was personal goes with the link.
create or replace function private.lounge_moderation_unlinked()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'lounge_moderation_decisions' then
    if old.target_user_id is not null and new.target_user_id is null then
      delete from public.lounge_moderation_snapshots where decision_id = new.id;
    end if;
  elsif tg_table_name = 'lounge_reports' then
    if old.reporter_id is not null and new.reporter_id is null and new.status <> 'open' then
      new.details := null;
    end if;
  elsif tg_table_name = 'lounge_appeals' then
    if old.appellant_id is not null and new.appellant_id is null then
      new.body := null;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.lounge_moderation_unlinked() from public, anon, authenticated;

create trigger lounge_decisions_unlinked
  after update of target_user_id on public.lounge_moderation_decisions
  for each row execute function private.lounge_moderation_unlinked();
create trigger lounge_reports_unlinked
  before update of reporter_id on public.lounge_reports
  for each row execute function private.lounge_moderation_unlinked();
create trigger lounge_appeals_unlinked
  before update of appellant_id on public.lounge_appeals
  for each row execute function private.lounge_moderation_unlinked();

-- Deleting a message empties its images from Storage (nightly purge-storage-objects).
alter table private.storage_purge_queue drop constraint if exists storage_purge_queue_bucket_id_check;
alter table private.storage_purge_queue add constraint storage_purge_queue_bucket_id_check
  check (bucket_id in ('contact-attachments', 'lounge-media'));
alter table private.storage_purge_queue drop constraint if exists storage_purge_queue_reason_check;
alter table private.storage_purge_queue add constraint storage_purge_queue_reason_check
  check (reason in ('contact_request_expired', 'contact_attachment_orphan', 'lounge_message_deleted'));

-- -----------------------------------------------------------------------------
-- 5. Helpers
-- -----------------------------------------------------------------------------
-- A member as other members and moderators see them: id, name shown, handle.
create or replace function private.lounge_member_label(p_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
           'id', p.id,
           'name', nullif(trim(coalesce(nullif(trim(p.first_name), ''), p.display_name, '')
                     || coalesce(' ' || upper(left(nullif(trim(p.last_name), ''), 1)) || '.', '')), ''),
           'handle', m.handle,
           'is_staff', exists (select 1 from public.roles r where r.key = p.role and r.is_staff and p.status = 'active'))
    from public.profiles p
    left join public.lounge_members m on m.user_id = p.id
   where p.id = p_user;
$$;
revoke all on function private.lounge_member_label(uuid) from public, anon, authenticated;

-- A decision as a member reads it (statement of reasons, complaint).
create or replace function private.lounge_decision_json(p_decision uuid, p_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
           'id', d.id,
           'action', d.action,
           'reason', d.reason,
           'illegal_category', d.illegal_category,
           'ground', d.ground,
           'statement', d.statement,
           'ends_at', d.ends_at,
           'automated', d.automated,
           'created_at', d.created_at,
           'message_id', d.message_id,
           'excerpt', left(s.body_text, 280),
           'attachment_count', coalesce(s.attachment_count, 0),
           'appeal_until', d.created_at + interval '6 months',
           'appeal', (select jsonb_build_object('id', a.id, 'status', a.status, 'body', a.body, 'response', a.response,
                                                'created_at', a.created_at, 'answered_at', a.answered_at)
                        from public.lounge_appeals a
                       where a.decision_id = d.id and a.appellant_id = p_user))
    from public.lounge_moderation_decisions d
    left join public.lounge_moderation_snapshots s on s.decision_id = d.id
   where d.id = p_decision;
$$;
revoke all on function private.lounge_decision_json(uuid, uuid) from public, anon, authenticated;

create or replace function private.lounge_check_statement(p_text text, p_what text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_text is null or char_length(btrim(p_text)) not between 10 and 2000 then
    raise exception 'lounge moderation: % must be 10 to 2000 characters', p_what using errcode = '22023';
  end if;
  return btrim(p_text);
end;
$$;
revoke all on function private.lounge_check_statement(text, text) from public, anon, authenticated;

-- Checks a decision's reason and ground (adverse actions only).
create or replace function private.lounge_check_grounds(p_reason text, p_category text, p_ground text)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if not coalesce(private.lounge_reason_valid(p_reason, p_category), false)
     or p_ground is null or p_ground not in ('terms', 'illegal')
     or (p_ground = 'illegal') <> (p_category is not null) then
    raise exception 'lounge moderation: invalid reason or ground' using errcode = '22023';
  end if;
end;
$$;
revoke all on function private.lounge_check_grounds(text, text, text) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 6. Members: report, block, read their moderation file, contest
-- -----------------------------------------------------------------------------
create or replace function public.lounge_report_message(
  p_message_id       uuid,
  p_reason           text,
  p_illegal_category text,
  p_details          text,
  p_attachment_id    uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user    uuid := private.lounge_require_entry();
  v_author  uuid;
  v_report  public.lounge_reports;
begin
  if not coalesce(private.lounge_reason_valid(p_reason, p_illegal_category), false) then
    raise exception 'lounge: invalid report' using errcode = '22023';
  end if;
  if p_details is null or char_length(btrim(p_details)) not between 10 and 2000 then
    raise exception 'lounge: invalid report' using errcode = '22023';
  end if;

  -- A message the member can read: visible, in a channel or one of their
  -- conversations while private messages are open.
  select m.author_id into v_author
    from public.lounge_messages m
   where m.id = p_message_id
     and m.moderation_status = 'visible'
     and (m.channel_id is not null
          or (private.lounge_direct_messages_enabled()
              and m.conversation_id in (select private.lounge_my_conversation_ids())));
  if not found then
    raise exception 'lounge: unknown message' using errcode = '22023';
  end if;
  if v_author = v_user then
    raise exception 'lounge: own message' using errcode = '22023';
  end if;
  if p_attachment_id is not null and not exists (
       select 1 from public.lounge_message_attachments a where a.id = p_attachment_id and a.message_id = p_message_id) then
    raise exception 'lounge: unknown message' using errcode = '22023';
  end if;
  if exists (select 1 from public.lounge_reports r where r.message_id = p_message_id and r.reporter_id = v_user) then
    raise exception 'lounge: already reported' using errcode = '23505';
  end if;
  if (select count(*) from public.lounge_reports r
       where r.reporter_id = v_user and r.created_at > now() - interval '1 hour') >= 10
     or (select count(*) from public.lounge_reports r
          where r.reporter_id = v_user and r.created_at > now() - interval '1 day') >= 30 then
    raise exception 'lounge: rate limited' using errcode = 'PT429';
  end if;

  insert into public.lounge_reports (message_id, attachment_id, reporter_id, message_author_id, reason, illegal_category, details)
  values (p_message_id, p_attachment_id, v_user, v_author, p_reason, p_illegal_category, btrim(p_details))
  returning * into v_report;

  return jsonb_build_object('id', v_report.id, 'created_at', v_report.created_at);
end;
$$;
comment on function public.lounge_report_message(uuid, text, text, text, uuid) is
  'Reports a lounge message (or one of its images): reason, category for unlawful content, explanation. One per member and message, 10 an hour, 30 a day. Returns {id, created_at}: the acknowledgement.';

create or replace function public.lounge_set_blocked(p_member_id uuid, p_blocked boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := private.lounge_require_entry();
begin
  if p_blocked is null or p_member_id is null or p_member_id = v_user
     or not exists (select 1 from public.lounge_members where user_id = p_member_id) then
    raise exception 'lounge: unknown member' using errcode = '22023';
  end if;
  if p_blocked then
    insert into public.lounge_blocks (blocker_id, blocked_id) values (v_user, p_member_id)
    on conflict do nothing;
  else
    delete from public.lounge_blocks where blocker_id = v_user and blocked_id = p_member_id;
  end if;
end;
$$;
comment on function public.lounge_set_blocked(uuid, boolean) is
  'Hides (or shows again) another member''s messages for the caller only.';

-- The caller's moderation file: restrictions, decisions about them, their
-- reports and what became of them, members they hid. Open to any signed-in
-- account (an excluded member reads why and contests from here).
create or replace function public.lounge_my_moderation()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null then
    raise exception 'lounge: sign in first' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'muted_until', (select case when m.muted_until > now() then m.muted_until end
                      from public.lounge_members m where m.user_id = v_user),
    'banned_at', (select m.banned_at from public.lounge_members m where m.user_id = v_user),
    'decisions', coalesce((
      select jsonb_agg(private.lounge_decision_json(d.id, v_user) order by d.created_at desc)
        from public.lounge_moderation_decisions d
       where d.target_user_id = v_user and d.action in ('hide', 'delete', 'mute', 'ban')), '[]'::jsonb),
    'reports', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', r.id, 'message_id', r.message_id, 'reason', r.reason, 'illegal_category', r.illegal_category,
               'status', r.status, 'created_at', r.created_at, 'resolved_at', r.resolved_at,
               -- The statement is written for the member concerned: a reporter reads it for a dismissal only.
               'decision', case when r.decision_id is not null then
                             private.lounge_decision_json(r.decision_id, v_user)
                             || case when (select d.action from public.lounge_moderation_decisions d where d.id = r.decision_id) <> 'dismiss'
                                     then jsonb_build_object('statement', null) else '{}'::jsonb end end)
             order by r.created_at desc)
        from public.lounge_reports r
       where r.reporter_id = v_user), '[]'::jsonb),
    'blocked', coalesce((
      select jsonb_agg(private.lounge_member_label(b.blocked_id) - 'is_staff' order by b.created_at desc)
        from public.lounge_blocks b
       where b.blocker_id = v_user), '[]'::jsonb)
  );
end;
$$;

create or replace function public.lounge_submit_appeal(p_decision_id uuid, p_body text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user     uuid := (select auth.uid());
  v_decision public.lounge_moderation_decisions;
  v_role     text;
  v_appeal   public.lounge_appeals;
begin
  if v_user is null then
    raise exception 'lounge: sign in first' using errcode = '42501';
  end if;
  select * into v_decision from public.lounge_moderation_decisions where id = p_decision_id;
  if v_decision.id is null then
    raise exception 'lounge: unknown decision' using errcode = '22023';
  end if;
  if v_decision.target_user_id = v_user and v_decision.action in ('hide', 'delete', 'mute', 'ban') then
    v_role := 'target';
  elsif exists (select 1 from public.lounge_reports r where r.decision_id = v_decision.id and r.reporter_id = v_user) then
    v_role := 'reporter';
  else
    raise exception 'lounge: unknown decision' using errcode = '22023';
  end if;
  if now() > v_decision.created_at + interval '6 months' then
    raise exception 'lounge: appeal period over' using errcode = '22023';
  end if;
  if p_body is null or char_length(btrim(p_body)) not between 10 and 2000 then
    raise exception 'lounge: invalid appeal' using errcode = '22023';
  end if;
  if exists (select 1 from public.lounge_appeals a where a.decision_id = v_decision.id and a.appellant_id = v_user) then
    raise exception 'lounge: already appealed' using errcode = '23505';
  end if;

  insert into public.lounge_appeals (decision_id, appellant_id, appellant_role, body)
  values (v_decision.id, v_user, v_role, btrim(p_body))
  returning * into v_appeal;
  return jsonb_build_object('id', v_appeal.id, 'created_at', v_appeal.created_at);
end;
$$;
comment on function public.lounge_submit_appeal(uuid, text) is
  'Internal complaint (DSA art. 20) against a lounge decision: by the member it affects or a member whose report it settled, within 6 months, once.';

-- -----------------------------------------------------------------------------
-- 7. Moderators (moderate_community)
-- -----------------------------------------------------------------------------
-- Reported messages, one entry per message with its reports. p_status: 'open'
-- (at least one open report) or 'all'.
create or replace function public.lounge_moderation_queue(p_status text default 'open')
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.lounge_require_moderator();
  if p_status is null or p_status not in ('open', 'all') then
    raise exception 'lounge moderation: invalid filter' using errcode = '22023';
  end if;
  return coalesce((
    select jsonb_agg(g.entry order by g.first_at)
      from (
        select min(r.created_at) as first_at,
               jsonb_build_object(
                 'message_id', m.id,
                 'channel_id', m.channel_id,
                 'conversation_id', m.conversation_id,
                 'author', private.lounge_member_label(m.author_id),
                 'parts', m.parts,
                 'body_text', m.body_text,
                 'created_at', m.created_at,
                 'moderation_status', m.moderation_status,
                 'attachments', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'path', a.storage_path, 'alt', a.alt_text)
                                                           order by a.position)
                                            from public.lounge_message_attachments a where a.message_id = m.id), '[]'::jsonb),
                 'author_muted_until', (select case when lm.muted_until > now() then lm.muted_until end
                                          from public.lounge_members lm where lm.user_id = m.author_id),
                 'author_banned_at', (select lm.banned_at from public.lounge_members lm where lm.user_id = m.author_id),
                 'author_decisions', (select count(*) from public.lounge_moderation_decisions d
                                       where d.target_user_id = m.author_id and d.action in ('hide', 'delete', 'mute', 'ban')),
                 'open_reports', count(*) filter (where r.status = 'open'),
                 'first_reported_at', min(r.created_at),
                 'reports', jsonb_agg(jsonb_build_object(
                              'id', r.id, 'reason', r.reason, 'illegal_category', r.illegal_category,
                              'details', r.details, 'status', r.status, 'created_at', r.created_at,
                              'resolved_at', r.resolved_at, 'attachment_id', r.attachment_id,
                              'reporter', private.lounge_member_label(r.reporter_id))
                            order by r.created_at)) as entry
          from public.lounge_reports r
          join public.lounge_messages m on m.id = r.message_id
         group by m.id
        having p_status = 'all' or count(*) filter (where r.status = 'open') > 0
      ) g), '[]'::jsonb);
end;
$$;

-- The messages around one (same room), hidden ones included and flagged.
create or replace function public.lounge_moderation_context(p_message_id uuid, p_radius integer default 5)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_message public.lounge_messages;
  v_radius  integer := least(greatest(coalesce(p_radius, 5), 1), 20);
begin
  perform private.lounge_require_moderator();
  select * into v_message from public.lounge_messages where id = p_message_id;
  if v_message.id is null then
    raise exception 'lounge moderation: unknown message' using errcode = '22023';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', x.id, 'author', private.lounge_member_label(x.author_id), 'parts', x.parts, 'body_text', x.body_text,
             'created_at', x.created_at, 'moderation_status', x.moderation_status,
             'attachment_count', (select count(*) from public.lounge_message_attachments a where a.message_id = x.id),
             'reply_to_id', x.reply_to_id, 'is_target', x.id = v_message.id)
           order by x.created_at, x.id)
      from (
        (select * from public.lounge_messages b
          where b.channel_id is not distinct from v_message.channel_id
            and b.conversation_id is not distinct from v_message.conversation_id
            and (b.created_at, b.id) < (v_message.created_at, v_message.id)
          order by b.created_at desc, b.id desc limit v_radius)
        union all
        (select * from public.lounge_messages t where t.id = v_message.id)
        union all
        (select * from public.lounge_messages a
          where a.channel_id is not distinct from v_message.channel_id
            and a.conversation_id is not distinct from v_message.conversation_id
            and (a.created_at, a.id) > (v_message.created_at, v_message.id)
          order by a.created_at, a.id limit v_radius)
      ) x), '[]'::jsonb);
end;
$$;

-- dismiss (the open reports) | hide | restore | delete, with a mandatory statement.
create or replace function public.lounge_moderate_message(
  p_message_id       uuid,
  p_action           text,
  p_reason           text,
  p_illegal_category text,
  p_ground           text,
  p_statement        text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_moderator uuid := private.lounge_require_moderator();
  v_message   public.lounge_messages;
  v_statement text := private.lounge_check_statement(p_statement, 'the statement');
  v_open      integer;
  v_decision  uuid;
begin
  if p_action is null or p_action not in ('dismiss', 'hide', 'restore', 'delete') then
    raise exception 'lounge moderation: invalid action' using errcode = '22023';
  end if;
  select * into v_message from public.lounge_messages where id = p_message_id for update;
  if v_message.id is null then
    raise exception 'lounge moderation: unknown message' using errcode = '22023';
  end if;
  if p_action in ('hide', 'delete') then
    perform private.lounge_check_grounds(p_reason, p_illegal_category, p_ground);
  elsif p_reason is not null or p_illegal_category is not null or p_ground is not null then
    raise exception 'lounge moderation: invalid reason or ground' using errcode = '22023';
  end if;
  select count(*) into v_open from public.lounge_reports where message_id = v_message.id and status = 'open';
  if p_action = 'dismiss' and v_open = 0 then
    raise exception 'lounge moderation: nothing to dismiss' using errcode = '22023';
  end if;
  if p_action = 'hide' and v_message.moderation_status <> 'visible' then
    raise exception 'lounge moderation: already hidden' using errcode = '22023';
  end if;
  if p_action = 'restore' and v_message.moderation_status <> 'hidden' then
    raise exception 'lounge moderation: not hidden' using errcode = '22023';
  end if;

  insert into public.lounge_moderation_decisions
    (action, message_id, target_user_id, reason, illegal_category, ground, statement, report_count, decided_by)
  values (p_action, v_message.id, v_message.author_id, p_reason, p_illegal_category, p_ground, v_statement, v_open, v_moderator)
  returning id into v_decision;

  insert into public.lounge_moderation_snapshots (decision_id, body_text, attachment_count, channel_id, message_created_at)
  values (v_decision, v_message.body_text,
          (select count(*) from public.lounge_message_attachments a where a.message_id = v_message.id),
          v_message.channel_id, v_message.created_at);

  if p_action in ('dismiss', 'hide', 'delete') then
    update public.lounge_reports
       set status = case when p_action = 'dismiss' then 'dismissed' else 'actioned' end,
           decision_id = v_decision,
           resolved_at = now()
     where message_id = v_message.id and status = 'open';
  end if;

  if p_action = 'hide' then
    update public.lounge_messages
       set moderation_status = 'hidden', hidden_at = now(), hidden_decision_id = v_decision
     where id = v_message.id;
  elsif p_action = 'restore' then
    update public.lounge_messages
       set moderation_status = 'visible', hidden_at = null, hidden_decision_id = null
     where id = v_message.id;
  elsif p_action = 'delete' then
    insert into private.storage_purge_queue (bucket_id, name, reason)
    select 'lounge-media', a.storage_path, 'lounge_message_deleted'
      from public.lounge_message_attachments a where a.message_id = v_message.id
    on conflict (bucket_id, name) do nothing;
    delete from public.lounge_messages where id = v_message.id;
  end if;

  if p_action <> 'dismiss' then
    insert into public.lounge_moderation_events (message_id, channel_id, conversation_id, kind)
    values (v_message.id, v_message.channel_id, v_message.conversation_id,
            case p_action when 'hide' then 'hidden' when 'delete' then 'deleted' else 'restored' end);
  end if;
  return v_decision;
end;
$$;

-- mute (until a date) | ban | lift, with a mandatory statement; optionally about one message.
create or replace function public.lounge_moderate_member(
  p_user_id          uuid,
  p_action           text,
  p_reason           text,
  p_illegal_category text,
  p_ground           text,
  p_statement        text,
  p_until            timestamptz default null,
  p_message_id       uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_moderator uuid := private.lounge_require_moderator();
  v_member    public.lounge_members;
  v_statement text := private.lounge_check_statement(p_statement, 'the statement');
  v_message   public.lounge_messages;
  v_open      integer := 0;
  v_decision  uuid;
begin
  if p_action is null or p_action not in ('mute', 'ban', 'lift') then
    raise exception 'lounge moderation: invalid action' using errcode = '22023';
  end if;
  select * into v_member from public.lounge_members where user_id = p_user_id for update;
  if v_member.user_id is null then
    raise exception 'lounge moderation: unknown member' using errcode = '22023';
  end if;
  if p_user_id = v_moderator then
    raise exception 'lounge moderation: not on yourself' using errcode = '42501';
  end if;
  if p_action <> 'lift' and exists (
       select 1 from public.profiles p join public.roles r on r.key = p.role
        where p.id = p_user_id and r.is_staff and p.status = 'active') then
    raise exception 'lounge moderation: team member' using errcode = '42501';
  end if;
  if p_action in ('mute', 'ban') then
    perform private.lounge_check_grounds(p_reason, p_illegal_category, p_ground);
  elsif p_reason is not null or p_illegal_category is not null or p_ground is not null then
    raise exception 'lounge moderation: invalid reason or ground' using errcode = '22023';
  end if;
  if p_action = 'mute' then
    if p_until is null or p_until < now() + interval '5 minutes' or p_until > now() + interval '1 year' then
      raise exception 'lounge moderation: invalid duration' using errcode = '22023';
    end if;
    if v_member.banned_at is not null then
      raise exception 'lounge moderation: already excluded' using errcode = '22023';
    end if;
  elsif p_until is not null then
    raise exception 'lounge moderation: invalid duration' using errcode = '22023';
  end if;
  if p_action = 'ban' and v_member.banned_at is not null then
    raise exception 'lounge moderation: already excluded' using errcode = '22023';
  end if;
  if p_action = 'lift' and v_member.banned_at is null and not (v_member.muted_until > now()) then
    raise exception 'lounge moderation: nothing to lift' using errcode = '22023';
  end if;
  if p_message_id is not null then
    select * into v_message from public.lounge_messages where id = p_message_id and author_id = p_user_id;
    if v_message.id is null then
      raise exception 'lounge moderation: unknown message' using errcode = '22023';
    end if;
    if p_action <> 'lift' then
      select count(*) into v_open from public.lounge_reports where message_id = v_message.id and status = 'open';
    end if;
  end if;

  insert into public.lounge_moderation_decisions
    (action, message_id, target_user_id, reason, illegal_category, ground, statement, ends_at, report_count, decided_by)
  values (p_action, v_message.id, p_user_id, p_reason, p_illegal_category, p_ground, v_statement,
          case when p_action = 'mute' then p_until end, v_open, v_moderator)
  returning id into v_decision;

  if v_message.id is not null then
    insert into public.lounge_moderation_snapshots (decision_id, body_text, attachment_count, channel_id, message_created_at)
    values (v_decision, v_message.body_text,
            (select count(*) from public.lounge_message_attachments a where a.message_id = v_message.id),
            v_message.channel_id, v_message.created_at);
    if p_action <> 'lift' then
      update public.lounge_reports
         set status = 'actioned', decision_id = v_decision, resolved_at = now()
       where message_id = v_message.id and status = 'open';
    end if;
  end if;

  update public.lounge_members
     set muted_until = case p_action when 'mute' then p_until else null end,
         banned_at   = case p_action when 'ban' then now() else null end
   where user_id = p_user_id;
  return v_decision;
end;
$$;

-- Every decision, newest first, with who decided, the content concerned and
-- whether the member was told.
create or replace function public.lounge_moderation_history(p_limit integer default 100)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.lounge_require_moderator();
  return coalesce((
    select jsonb_agg(x.entry order by x.created_at desc)
      from (
        select d.created_at,
               jsonb_build_object(
                 'id', d.id, 'action', d.action, 'reason', d.reason, 'illegal_category', d.illegal_category,
                 'ground', d.ground, 'statement', d.statement, 'ends_at', d.ends_at, 'automated', d.automated,
                 'report_count', d.report_count, 'created_at', d.created_at, 'message_id', d.message_id,
                 'target', private.lounge_member_label(d.target_user_id),
                 'decided_by', (select nullif(trim(coalesce(p.display_name, concat_ws(' ', p.first_name, p.last_name))), '')
                                  from public.profiles p where p.id = d.decided_by),
                 'excerpt', left(s.body_text, 280),
                 'appeal_id', d.appeal_id,
                 'appeals', (select count(*) from public.lounge_appeals a where a.decision_id = d.id),
                 'notified', exists (select 1 from public.email_log e
                                      where e.event_key = 'lounge_decision:' || d.id::text
                                        and e.status in ('sent', 'delivered', 'opened')))
                 as entry
          from public.lounge_moderation_decisions d
          left join public.lounge_moderation_snapshots s on s.decision_id = d.id
         order by d.created_at desc
         limit least(greatest(coalesce(p_limit, 100), 1), 500)
      ) x), '[]'::jsonb);
end;
$$;

-- Complaints: p_status 'open' or 'all'.
create or replace function public.lounge_appeals_queue(p_status text default 'open')
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.lounge_require_moderator();
  if p_status is null or p_status not in ('open', 'all') then
    raise exception 'lounge moderation: invalid filter' using errcode = '22023';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', a.id, 'status', a.status, 'body', a.body, 'response', a.response,
             'created_at', a.created_at, 'answered_at', a.answered_at, 'appellant_role', a.appellant_role,
             'appellant', private.lounge_member_label(a.appellant_id),
             'answered_by', (select nullif(trim(coalesce(p.display_name, concat_ws(' ', p.first_name, p.last_name))), '')
                               from public.profiles p where p.id = a.answered_by),
             'decision', jsonb_build_object(
               'id', d.id, 'action', d.action, 'reason', d.reason, 'illegal_category', d.illegal_category,
               'ground', d.ground, 'statement', d.statement, 'ends_at', d.ends_at, 'created_at', d.created_at,
               'message_id', d.message_id, 'excerpt', left(s.body_text, 280),
               'target', private.lounge_member_label(d.target_user_id),
               'decided_by', (select nullif(trim(coalesce(p.display_name, concat_ws(' ', p.first_name, p.last_name))), '')
                                from public.profiles p where p.id = d.decided_by),
               'message_status', (select m.moderation_status from public.lounge_messages m where m.id = d.message_id)))
           order by a.created_at)
      from public.lounge_appeals a
      join public.lounge_moderation_decisions d on d.id = a.decision_id
      left join public.lounge_moderation_snapshots s on s.decision_id = d.id
     where p_status = 'all' or a.status = 'open'), '[]'::jsonb);
end;
$$;

-- Answers a complaint. Reversed: a hidden message is restored and a restriction
-- lifted (new decisions, linked to the complaint); a reporter's complaint puts
-- their report back in the queue. A deleted message cannot come back: the
-- answer says so.
create or replace function public.lounge_answer_appeal(p_appeal_id uuid, p_outcome text, p_response text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_moderator uuid := private.lounge_require_moderator();
  v_appeal    public.lounge_appeals;
  v_decision  public.lounge_moderation_decisions;
  v_response  text := private.lounge_check_statement(p_response, 'the answer');
  v_member    public.lounge_members;
  v_undo      uuid;
begin
  if p_outcome is null or p_outcome not in ('upheld', 'reversed') then
    raise exception 'lounge moderation: invalid outcome' using errcode = '22023';
  end if;
  select * into v_appeal from public.lounge_appeals where id = p_appeal_id for update;
  if v_appeal.id is null then
    raise exception 'lounge moderation: unknown complaint' using errcode = '22023';
  end if;
  if v_appeal.status <> 'open' then
    raise exception 'lounge moderation: already answered' using errcode = '22023';
  end if;
  select * into v_decision from public.lounge_moderation_decisions where id = v_appeal.decision_id;

  update public.lounge_appeals
     set status = p_outcome, response = v_response, answered_by = v_moderator, answered_at = now()
   where id = v_appeal.id;

  if p_outcome = 'reversed' then
    if v_appeal.appellant_role = 'reporter' then
      update public.lounge_reports
         set status = 'open', decision_id = null, resolved_at = null
       where decision_id = v_decision.id and reporter_id = v_appeal.appellant_id and message_id is not null;
    elsif v_decision.action = 'hide' and exists (
            select 1 from public.lounge_messages m
             where m.id = v_decision.message_id and m.moderation_status = 'hidden') then
      insert into public.lounge_moderation_decisions (action, message_id, target_user_id, statement, appeal_id, decided_by)
      values ('restore', v_decision.message_id, v_decision.target_user_id, v_response, v_appeal.id, v_moderator)
      returning id into v_undo;
      update public.lounge_messages
         set moderation_status = 'visible', hidden_at = null, hidden_decision_id = null
       where id = v_decision.message_id;
      insert into public.lounge_moderation_events (message_id, channel_id, conversation_id, kind)
      select m.id, m.channel_id, m.conversation_id, 'restored'
        from public.lounge_messages m where m.id = v_decision.message_id;
    elsif v_decision.action in ('mute', 'ban') then
      select * into v_member from public.lounge_members where user_id = v_decision.target_user_id for update;
      if v_member.user_id is not null
         and ((v_decision.action = 'ban' and v_member.banned_at is not null)
              or (v_decision.action = 'mute' and v_member.muted_until > now())) then
        insert into public.lounge_moderation_decisions (action, target_user_id, statement, appeal_id, decided_by)
        values ('lift', v_decision.target_user_id, v_response, v_appeal.id, v_moderator);
        update public.lounge_members set muted_until = null, banned_at = null where user_id = v_member.user_id;
      end if;
    end if;
  end if;
  return v_appeal.id;
end;
$$;

-- Counters for the transparency report (DSA art. 15/24): reports, notices from
-- non-members, decisions, complaints and their handling times over a period.
create or replace function public.lounge_moderation_stats(p_from timestamptz, p_to timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.lounge_require_moderator();
  if p_from is null or p_to is null or p_to <= p_from then
    raise exception 'lounge moderation: invalid period' using errcode = '22023';
  end if;
  return jsonb_build_object(
    'from', p_from,
    'to', p_to,
    'reports', (select count(*) from public.lounge_reports r where r.created_at >= p_from and r.created_at < p_to),
    'reports_by_reason', coalesce((select jsonb_object_agg(x.reason, x.n) from (
        select r.reason, count(*) as n from public.lounge_reports r
         where r.created_at >= p_from and r.created_at < p_to group by r.reason) x), '{}'::jsonb),
    'reports_by_category', coalesce((select jsonb_object_agg(x.illegal_category, x.n) from (
        select r.illegal_category, count(*) as n from public.lounge_reports r
         where r.created_at >= p_from and r.created_at < p_to and r.illegal_category is not null
         group by r.illegal_category) x), '{}'::jsonb),
    'non_member_notices', (select count(*) from public.contact_requests c
                            where c.category = 'illegal_content' and c.created_at >= p_from and c.created_at < p_to),
    'decisions_by_action', coalesce((select jsonb_object_agg(x.action, x.n) from (
        select d.action, count(*) as n from public.lounge_moderation_decisions d
         where d.created_at >= p_from and d.created_at < p_to group by d.action) x), '{}'::jsonb),
    'decisions_by_ground', coalesce((select jsonb_object_agg(x.ground, x.n) from (
        select d.ground, count(*) as n from public.lounge_moderation_decisions d
         where d.created_at >= p_from and d.created_at < p_to and d.ground is not null group by d.ground) x), '{}'::jsonb),
    'automated_decisions', (select count(*) from public.lounge_moderation_decisions d
                             where d.automated and d.created_at >= p_from and d.created_at < p_to),
    'median_hours_to_decision', (select round((percentile_cont(0.5) within group (
                                    order by extract(epoch from r.resolved_at - r.created_at)) / 3600)::numeric, 1)
                                   from public.lounge_reports r
                                  where r.resolved_at >= p_from and r.resolved_at < p_to),
    'appeals', (select count(*) from public.lounge_appeals a where a.created_at >= p_from and a.created_at < p_to),
    'appeals_by_outcome', coalesce((select jsonb_object_agg(x.status, x.n) from (
        select a.status, count(*) as n from public.lounge_appeals a
         where a.created_at >= p_from and a.created_at < p_to group by a.status) x), '{}'::jsonb),
    'median_hours_to_answer', (select round((percentile_cont(0.5) within group (
                                  order by extract(epoch from a.answered_at - a.created_at)) / 3600)::numeric, 1)
                                 from public.lounge_appeals a
                                where a.answered_at >= p_from and a.answered_at < p_to),
    'open_reports', (select count(*) from public.lounge_reports r where r.status = 'open'),
    'open_appeals', (select count(*) from public.lounge_appeals a where a.status = 'open'),
    'muted_now', (select count(*) from public.lounge_members m where m.muted_until > now()),
    'excluded_now', (select count(*) from public.lounge_members m where m.banned_at is not null)
  );
end;
$$;

revoke all on function public.lounge_report_message(uuid, text, text, text, uuid) from public, anon;
revoke all on function public.lounge_set_blocked(uuid, boolean) from public, anon;
revoke all on function public.lounge_my_moderation() from public, anon;
revoke all on function public.lounge_submit_appeal(uuid, text) from public, anon;
revoke all on function public.lounge_moderation_queue(text) from public, anon;
revoke all on function public.lounge_moderation_context(uuid, integer) from public, anon;
revoke all on function public.lounge_moderate_message(uuid, text, text, text, text, text) from public, anon;
revoke all on function public.lounge_moderate_member(uuid, text, text, text, text, text, timestamptz, uuid) from public, anon;
revoke all on function public.lounge_moderation_history(integer) from public, anon;
revoke all on function public.lounge_appeals_queue(text) from public, anon;
revoke all on function public.lounge_answer_appeal(uuid, text, text) from public, anon;
revoke all on function public.lounge_moderation_stats(timestamptz, timestamptz) from public, anon;
grant execute on function public.lounge_report_message(uuid, text, text, text, uuid) to authenticated;
grant execute on function public.lounge_set_blocked(uuid, boolean) to authenticated;
grant execute on function public.lounge_my_moderation() to authenticated;
grant execute on function public.lounge_submit_appeal(uuid, text) to authenticated;
grant execute on function public.lounge_moderation_queue(text) to authenticated;
grant execute on function public.lounge_moderation_context(uuid, integer) to authenticated;
grant execute on function public.lounge_moderate_message(uuid, text, text, text, text, text) to authenticated;
grant execute on function public.lounge_moderate_member(uuid, text, text, text, text, text, timestamptz, uuid) to authenticated;
grant execute on function public.lounge_moderation_history(integer) to authenticated;
grant execute on function public.lounge_appeals_queue(text) to authenticated;
grant execute on function public.lounge_answer_appeal(uuid, text, text) to authenticated;
grant execute on function public.lounge_moderation_stats(timestamptz, timestamptz) to authenticated;

-- -----------------------------------------------------------------------------
-- 8. Counts: hidden messages and blocked members' messages are not unread
--    (lounge_overview, same body otherwise) and not counted on the profile card.
-- -----------------------------------------------------------------------------
create or replace function public.lounge_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user   uuid := private.lounge_require_entry();
  v_joined timestamptz;
  v_result jsonb;
begin
  select joined_at into v_joined from public.lounge_members where user_id = v_user;
  v_joined := coalesce(v_joined, now());

  select jsonb_build_object(
    'channels', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', c.id,
               'muted', coalesce(s.muted, false),
               'unread', (select count(*) from public.lounge_messages x
                           where x.channel_id = c.id and x.author_id <> v_user
                             and x.moderation_status = 'visible'
                             and not exists (select 1 from public.lounge_blocks b
                                              where b.blocker_id = v_user and b.blocked_id = x.author_id)
                             and x.created_at > coalesce(s.last_read_at, v_joined)),
               'mentions', (select count(*) from public.lounge_messages x
                             where x.channel_id = c.id and x.author_id <> v_user
                               and x.moderation_status = 'visible'
                               and not exists (select 1 from public.lounge_blocks b
                                                where b.blocker_id = v_user and b.blocked_id = x.author_id)
                               and v_user = any (x.mention_ids)
                               and x.created_at > coalesce(s.last_read_at, v_joined)))
             order by c.lounge, c.position)
        from public.lounge_channels c
        left join public.lounge_room_states s on s.user_id = v_user and s.channel_id = c.id), '[]'::jsonb),
    'conversations', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', cv.id,
               'member_id', case when cv.user_a = v_user then cv.user_b else cv.user_a end,
               'muted', coalesce(s.muted, false),
               'unread', (select count(*) from public.lounge_messages x
                           where x.conversation_id = cv.id and x.author_id <> v_user
                             and x.moderation_status = 'visible'
                             and x.created_at > coalesce(s.last_read_at, '-infinity'::timestamptz)),
               'last', (select jsonb_build_object(
                                 'id', x.id, 'author_id', x.author_id, 'parts', x.parts,
                                 'created_at', x.created_at, 'reply_to_id', x.reply_to_id,
                                 'reactions', x.reactions,
                                 'attachments', (select count(*) from public.lounge_message_attachments a where a.message_id = x.id))
                          from public.lounge_messages x
                         where x.conversation_id = cv.id
                           and (x.moderation_status = 'visible' or x.author_id = v_user)
                         order by x.created_at desc
                         limit 1))
             order by cv.last_message_at desc)
        from public.lounge_conversations cv
        left join public.lounge_room_states s on s.user_id = v_user and s.conversation_id = cv.id
       where v_user in (cv.user_a, cv.user_b)), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

create or replace function public.lounge_directory()
returns table (
  user_id       uuid,
  display_name  text,
  handle        text,
  country_code  text,
  languages     text[],
  presence      text,
  role          text,
  joined_at     timestamptz,
  message_count bigint,
  trainings     text[],
  active        boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.lounge_require_entry();
  return query
  select m.user_id,
         nullif(trim(coalesce(nullif(trim(p.first_name), ''), p.display_name, '')
           || coalesce(' ' || upper(left(nullif(trim(p.last_name), ''), 1)) || '.', '')), ''),
         m.handle,
         p.country_code::text,
         m.languages,
         case
           when m.presence = 'offline' or m.last_seen_at is null or m.last_seen_at < now() - interval '3 minutes' then 'offline'
           else m.presence
         end,
         case
           when r.is_staff then 'team'
           when m.is_mentor then 'mentor'
           when m.joined_at > now() - interval '30 days' then 'new'
         end,
         m.joined_at,
         (select count(*) from public.lounge_messages x
           where x.author_id = m.user_id and x.channel_id is not null and x.moderation_status = 'visible'),
         coalesce((
           select array_agg(c.title order by cc.completed_at)
             from public.course_completions cc
             join public.courses c on c.id = cc.course_id
            where cc.user_id = m.user_id), '{}'::text[]),
         private.lounge_can_enter(m.user_id)
    from public.lounge_members m
    join public.profiles p on p.id = m.user_id
    left join public.roles r on r.key = p.role and p.status = 'active';
end;
$$;

-- -----------------------------------------------------------------------------
-- 9. E-mails (sweep send-pending-emails): the statement of reasons to the
--    member a decision affects (lounge_decision:<id>), the outcome to each
--    reporter (lounge_report:<id>), the answer to a complaint (lounge_appeal:<id>).
-- -----------------------------------------------------------------------------
create or replace function public.pending_lounge_moderation_emails(p_limit integer default 25)
returns table (
  event_key text,
  kind      text,
  email     text,
  locale    text,
  payload   jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select e.event_key, e.kind, u.email::text,
         case when p.preferred_locale = 'en' then 'en' else 'fr' end,
         e.payload
    from (
      select 'lounge_decision:' || d.id::text as event_key, 'decision' as kind, d.target_user_id as user_id,
             d.created_at as at,
             jsonb_build_object('decision_id', d.id, 'action', d.action, 'reason', d.reason,
                                'illegal_category', d.illegal_category, 'ground', d.ground,
                                'statement', d.statement, 'ends_at', d.ends_at, 'automated', d.automated,
                                'created_at', d.created_at, 'appeal_until', d.created_at + interval '6 months',
                                'excerpt', left(s.body_text, 280), 'attachment_count', coalesce(s.attachment_count, 0)) as payload
        from public.lounge_moderation_decisions d
        left join public.lounge_moderation_snapshots s on s.decision_id = d.id
       where d.action in ('hide', 'delete', 'mute', 'ban')
         and d.target_user_id is not null
         and d.created_at >= now() - interval '7 days'
      union all
      select 'lounge_report:' || r.id::text, 'report', r.reporter_id, r.resolved_at,
             jsonb_build_object('report_id', r.id, 'decision_id', d.id, 'outcome', r.status, 'action', d.action,
                                'statement', case when d.action = 'dismiss' then d.statement end,
                                'reason', r.reason, 'reported_at', r.created_at, 'decided_at', d.created_at,
                                'appeal_until', d.created_at + interval '6 months',
                                'excerpt', left(s.body_text, 280))
        from public.lounge_reports r
        join public.lounge_moderation_decisions d on d.id = r.decision_id
        left join public.lounge_moderation_snapshots s on s.decision_id = d.id
       where r.status <> 'open'
         and r.reporter_id is not null
         and r.resolved_at >= now() - interval '7 days'
      union all
      select 'lounge_appeal:' || a.id::text, 'appeal', a.appellant_id, a.answered_at,
             jsonb_build_object('appeal_id', a.id, 'decision_id', d.id, 'outcome', a.status, 'response', a.response,
                                'action', d.action, 'appellant_role', a.appellant_role,
                                'submitted_at', a.created_at, 'decided_at', d.created_at,
                                'excerpt', left(s.body_text, 280))
        from public.lounge_appeals a
        join public.lounge_moderation_decisions d on d.id = a.decision_id
        left join public.lounge_moderation_snapshots s on s.decision_id = d.id
       where a.status <> 'open'
         and a.appellant_id is not null
         and a.answered_at >= now() - interval '7 days'
    ) e
    join auth.users u on u.id = e.user_id
    join public.profiles p on p.id = e.user_id
   where u.email is not null
     and private.email_event_open(e.event_key)
   order by e.at
   limit least(greatest(coalesce(p_limit, 25), 1), 100);
$$;
revoke all on function public.pending_lounge_moderation_emails(integer) from public, anon, authenticated;
grant execute on function public.pending_lounge_moderation_emails(integer) to service_role;

insert into public.email_templates (key, name, description, subject, preheader, body, variables, translation_priority) values
  ('lounge_moderation_decision', 'Lounge moderation decision',
   'Statement of reasons (DSA art. 17) sent to a member whose message was hidden or deleted, or who was muted or excluded from the members'' lounge: the decision, the content, the reason, the ground and how to contest',
   'Une décision de modération vous concerne dans les salons des membres',
   'Ce que nous avons décidé, pourquoi, et comment le contester.',
   E'Bonjour,\n\nNotre équipe de modération a pris une décision qui vous concerne dans les salons des membres de Global Toothgems. Vous trouverez ci-dessous la décision, le contenu concerné, son motif et sa base.\n\nCette décision n''affecte ni votre compte ni vos formations. Si vous pensez qu''elle est erronée, vous pouvez la contester pendant 6 mois depuis votre espace : un membre de l''équipe réexaminera votre demande et vous répondra par e-mail.',
   array[]::text[], 'high'),
  ('lounge_report_outcome', 'Lounge report outcome',
   'Sent to a member who reported a message in the members'' lounge once the team has decided (DSA art. 16(5))',
   'Votre signalement dans les salons des membres a été traité',
   'Ce que nous avons décidé à la suite de votre signalement.',
   E'Bonjour,\n\nMerci pour votre signalement. Notre équipe l''a examiné ; vous trouverez ci-dessous ce qui a été décidé.\n\nSi vous n''êtes pas d''accord avec cette décision, vous pouvez la contester pendant 6 mois depuis votre espace.',
   array[]::text[], 'high'),
  ('lounge_appeal_outcome', 'Lounge complaint answered',
   'Sent to a member who contested a moderation decision of the members'' lounge (DSA art. 20): the answer of the team',
   'Réponse à votre contestation d''une décision de modération',
   'Le résultat du réexamen de la décision.',
   E'Bonjour,\n\nNous avons réexaminé la décision que vous avez contestée. Vous trouverez ci-dessous notre réponse.\n\nSi vous restez en désaccord, vous pouvez saisir un organisme de règlement extrajudiciaire des litiges certifié ou les juridictions compétentes.',
   array[]::text[], 'high');

insert into public.email_template_translations (template_id, locale, subject, preheader, body, status)
select t.id, 'en', v.subject, v.preheader, v.body, 'published'
  from (values
    ('lounge_moderation_decision', 'A moderation decision concerns you in the members'' lounges',
     'What we decided, why, and how to contest it.',
     E'Hello,\n\nOur moderation team has taken a decision that concerns you in the Global Toothgems members'' lounges. Below you will find the decision, the content concerned, its reason and its ground.\n\nThis decision does not affect your account or your courses. If you think it is wrong, you can contest it for 6 months from your account: a member of the team will review your request and answer you by e-mail.'),
    ('lounge_report_outcome', 'Your report in the members'' lounges has been handled',
     'What we decided following your report.',
     E'Hello,\n\nThank you for your report. Our team has reviewed it; below you will find what was decided.\n\nIf you disagree with this decision, you can contest it for 6 months from your account.'),
    ('lounge_appeal_outcome', 'Answer to your complaint about a moderation decision',
     'The outcome of the review of the decision.',
     E'Hello,\n\nWe have reviewed the decision you contested. Below you will find our answer.\n\nIf you still disagree, you can turn to a certified out-of-court dispute settlement body or to the competent courts.')
  ) as v(key, subject, preheader, body)
  join public.email_templates t on t.key = v.key;

-- -----------------------------------------------------------------------------
-- 10. Contact form: a category for notices of unlawful content from anyone
--     (non-members included, DSA art. 16), treated with high priority.
-- -----------------------------------------------------------------------------
alter table public.contact_requests drop constraint if exists contact_requests_category_check;
alter table public.contact_requests add constraint contact_requests_category_check
  check (category in ('order', 'delivery', 'returns', 'product', 'training', 'technical', 'privacy',
                      'professional', 'illegal_content', 'other'));

create or replace function private.contact_request_priority()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.category = 'illegal_content' then
    new.priority := 'high';
  end if;
  return new;
end;
$$;
revoke all on function private.contact_request_priority() from public, anon, authenticated;
create trigger contact_requests_illegal_content_priority
  before insert on public.contact_requests
  for each row execute function private.contact_request_priority();

-- -----------------------------------------------------------------------------
-- 11. Personal data: the export (same body as migration 20261109213000, plus
--     the member's reports, the decisions about them, their complaints and the
--     handles they hid). Reports others made about the member are not listed
--     (they would expose the reporters); the decisions they led to are.
-- -----------------------------------------------------------------------------
create or replace function public.my_personal_data()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_user    auth.users;
  v_email   text;
  v_last    timestamptz;
  v_archive jsonb;
begin
  if v_uid is null then
    raise exception 'my_personal_data: sign in first' using errcode = '42501';
  end if;
  select * into v_user from auth.users where id = v_uid;
  if v_user.id is null then
    raise exception 'my_personal_data: unknown account' using errcode = '42501';
  end if;

  select max(r.ready_at) into v_last
    from public.data_export_requests r
   where r.user_id = v_uid and r.status = 'delivered';
  if v_last > now() - interval '5 minutes' then
    return jsonb_build_object('status', 'too_soon', 'retry_at', v_last + interval '5 minutes');
  end if;

  -- Guest orders placed with the account's address belong to the member only
  -- once that address is confirmed.
  v_email := case when v_user.email_confirmed_at is not null then lower(v_user.email) end;

  v_archive := jsonb_build_object(
    'format', 'global-toothgems-personal-data/2',
    'generated_at', now(),
    'account', jsonb_build_object(
      'id', v_user.id,
      'email', v_user.email,
      'email_confirmed_at', v_user.email_confirmed_at,
      'created_at', v_user.created_at,
      'last_sign_in_at', v_user.last_sign_in_at,
      'sign_in_methods', coalesce(v_user.raw_app_meta_data -> 'providers', '[]'::jsonb)),
    'profile', (select private.personal_data_clean(to_jsonb(p)) from public.profiles p where p.id = v_uid),
    'addresses', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(a)) order by a.created_at), '[]')
                    from public.customer_addresses a where a.user_id = v_uid),
    'consents', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(c)) order by c.created_at), '[]')
                   from public.consent_records c where c.user_id = v_uid),
    'newsletter', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(n))), '[]')
                     from public.newsletter_subscriptions n
                    where n.user_id = v_uid or (v_email is not null and lower(n.email) = v_email)),

    'shop', jsonb_build_object(
      'orders', (select coalesce(jsonb_agg(
                   private.personal_data_clean(to_jsonb(o)) || jsonb_build_object(
                     'items', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(i)) order by i.created_at), '[]')
                                 from public.order_items i where i.order_id = o.id),
                     'parcels', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(s)) order by s.created_at), '[]')
                                   from public.shipments s where s.order_id = o.id),
                     'refunds', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(r)) order by r.created_at), '[]')
                                   from public.refunds r where r.order_id = o.id),
                     'withdrawals', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(w)) || jsonb_build_object(
                                       'items', (select coalesce(jsonb_agg(to_jsonb(wi) - 'withdrawal_id'), '[]')
                                                   from public.order_withdrawal_items wi where wi.withdrawal_id = w.id))
                                       order by w.declared_at), '[]')
                                       from public.order_withdrawals w where w.order_id = o.id),
                     'documents', (select coalesce(jsonb_agg(jsonb_build_object(
                                     'number', d.invoice_number, 'kind', d.kind, 'issued_at', d.issued_at,
                                     'total_incl_tax', d.total_incl_tax, 'currency', d.currency, 'buyer', d.buyer)
                                     order by d.issued_at), '[]')
                                     from public.invoices d where d.order_id = o.id))
                   order by o.created_at), '[]')
                   from public.orders o
                  where o.user_id = v_uid
                     or (o.user_id is null and v_email is not null and lower(o.customer_email) = v_email)),
      'gift_cards_bought', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(g)) order by g.created_at), '[]')
                              from public.gift_cards g where g.purchaser_user_id = v_uid),
      'loyalty_cards', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(l))), '[]')
                          from public.loyalty_cards l where l.user_id = v_uid),
      'loyalty_stamps', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(l))), '[]')
                           from public.loyalty_stamps l where l.user_id = v_uid),
      'favourites', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(w))), '[]')
                       from public.wishlist_items w where w.user_id = v_uid),
      'back_in_stock_alerts', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(b)) order by b.created_at), '[]')
                                 from public.back_in_stock_requests b
                                where b.user_id = v_uid or (v_email is not null and lower(b.email) = v_email)),
      'reviews', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(v)) || jsonb_build_object(
                    'photos', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(ph)) order by ph.position), '[]')
                                 from public.review_photos ph where ph.review_id = v.id))
                    order by v.created_at), '[]')
                    from public.reviews v where v.user_id = v_uid),
      'review_votes', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(h))), '[]')
                         from public.review_helpful_votes h where h.user_id = v_uid)),

    'academy', jsonb_build_object(
      'courses', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(e)) || jsonb_build_object('course_title', c.title)), '[]')
                    from public.course_entitlements e join public.courses c on c.id = e.course_id
                   where e.user_id = v_uid),
      'progress', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(lp)) order by lp.completed_at), '[]')
                     from public.lesson_progress lp where lp.user_id = v_uid),
      'quiz_attempts', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(q)) order by q.started_at), '[]')
                          from public.quiz_attempts q where q.user_id = v_uid),
      'certificates', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(cc)) || jsonb_build_object('course_title', c.title)), '[]')
                         from public.course_completions cc join public.courses c on c.id = cc.course_id
                        where cc.user_id = v_uid)),

    'studio', jsonb_build_object(
      'trial', (select private.personal_data_clean(to_jsonb(t)) from public.studio_trials t where t.user_id = v_uid),
      'subscriptions', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(s)) order by s.created_at), '[]')
                          from public.studio_subscriptions s where s.user_id = v_uid),
      'subscription_payments', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(si)) order by si.occurred_at), '[]')
                                  from public.studio_subscription_invoices si where si.user_id = v_uid),
      'withdrawals', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(w)) order by w.requested_at), '[]')
                        from public.studio_withdrawals w where w.user_id = v_uid),
      'documents', (select coalesce(jsonb_agg(jsonb_build_object(
                      'number', d.invoice_number, 'kind', d.kind, 'issued_at', d.issued_at,
                      'total_incl_tax', d.total_incl_tax, 'currency', d.currency, 'buyer', d.buyer)
                      order by d.issued_at), '[]')
                      from public.invoices d
                     where d.studio_invoice_id in (select si.stripe_invoice_id from public.studio_subscription_invoices si where si.user_id = v_uid)
                        or d.studio_withdrawal_id in (select w.id from public.studio_withdrawals w where w.user_id = v_uid)),
      'creations', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(cr)) order by cr.created_at), '[]')
                      from public.creations cr where cr.user_id = v_uid),
      'gem_groups', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(gg))), '[]')
                       from public.gem_groups gg where gg.user_id = v_uid),
      'share_links', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(sh)) order by sh.created_at), '[]')
                        from public.creation_shares sh where sh.user_id = v_uid),
      'collections', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(co))), '[]')
                        from public.studio_collections co where co.user_id = v_uid),
      'collection_entries', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(ce))), '[]')
                               from public.studio_collection_creations ce where ce.user_id = v_uid),
      'preferences', (select private.personal_data_clean(to_jsonb(sp)) from public.studio_preferences sp where sp.user_id = v_uid),
      'share_logo', (select private.personal_data_clean(to_jsonb(sl)) from public.studio_share_logos sl where sl.user_id = v_uid),
      'glowbook', (select private.personal_data_clean(to_jsonb(sc)) from public.studio_showcases sc where sc.user_id = v_uid),
      'glowbook_creations', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(it))), '[]')
                               from public.studio_showcase_items it where it.user_id = v_uid),
      'glowbook_sections', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(se))), '[]')
                              from public.studio_showcase_sections se where se.user_id = v_uid),
      'try_on_requests', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(tr)) order by tr.created_at), '[]')
                            from public.studio_try_on_requests tr where tr.user_id = v_uid),
      'feedback', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(f))), '[]')
                     from public.studio_feedback f where f.user_id = v_uid)),

    'community', jsonb_build_object(
      'lounge_profile', (select private.personal_data_clean(to_jsonb(lm)) from public.lounge_members lm where lm.user_id = v_uid),
      'messages', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(m)) order by m.created_at), '[]')
                     from public.lounge_messages m where m.author_id = v_uid),
      'reactions', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(lr))), '[]')
                      from public.lounge_reactions lr where lr.user_id = v_uid),
      -- Moderation (decision 132): what the member reported, what was decided
      -- about them (with the content concerned), their complaints, whom they hid.
      'reports', (select coalesce(jsonb_agg(jsonb_build_object(
                    'id', r.id, 'message_id', r.message_id, 'reason', r.reason, 'illegal_category', r.illegal_category,
                    'details', r.details, 'status', r.status, 'created_at', r.created_at, 'resolved_at', r.resolved_at)
                    order by r.created_at), '[]')
                    from public.lounge_reports r where r.reporter_id = v_uid),
      'moderation_decisions', (select coalesce(jsonb_agg(jsonb_build_object(
                                 'id', d.id, 'action', d.action, 'reason', d.reason, 'illegal_category', d.illegal_category,
                                 'ground', d.ground, 'statement', d.statement, 'ends_at', d.ends_at,
                                 'automated', d.automated, 'created_at', d.created_at, 'message_id', d.message_id,
                                 'content', s.body_text)
                                 order by d.created_at), '[]')
                                 from public.lounge_moderation_decisions d
                                 left join public.lounge_moderation_snapshots s on s.decision_id = d.id
                                where d.target_user_id = v_uid),
      'complaints', (select coalesce(jsonb_agg(jsonb_build_object(
                       'id', a.id, 'decision_id', a.decision_id, 'as', a.appellant_role, 'body', a.body,
                       'status', a.status, 'response', a.response, 'created_at', a.created_at, 'answered_at', a.answered_at)
                       order by a.created_at), '[]')
                       from public.lounge_appeals a where a.appellant_id = v_uid),
      'hidden_members', (select coalesce(jsonb_agg(jsonb_build_object('handle', m.handle, 'since', b.created_at)
                           order by b.created_at), '[]')
                           from public.lounge_blocks b
                           left join public.lounge_members m on m.user_id = b.blocked_id
                          where b.blocker_id = v_uid)),

    'customer_service', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(cq)) order by cq.created_at), '[]')
                           from public.contact_requests cq
                          where cq.user_id = v_uid or (v_email is not null and lower(cq.email) = v_email)),

    -- What the team recorded about the member: the right of access covers it.
    'customer_file', jsonb_build_object(
      'tags', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(ct))), '[]')
                 from public.customer_tags ct where ct.user_id = v_uid),
      'notes', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(cn)) order by cn.created_at), '[]')
                  from public.customer_notes cn where cn.user_id = v_uid)),

    'files', (select coalesce(jsonb_agg(jsonb_build_object(
                'bucket', o.bucket_id, 'path', o.name,
                'size', (o.metadata ->> 'size')::bigint, 'created_at', o.created_at)
                order by o.bucket_id, o.name), '[]')
                from storage.objects o
               where o.bucket_id = any (private.personal_file_buckets() || array['contact-attachments'])
                 and (storage.foldername(o.name))[1] = v_uid::text)
  );

  insert into public.data_export_requests (user_id, status, requested_at, ready_at)
  values (v_uid, 'delivered', now(), now());

  return jsonb_build_object('status', 'ok', 'archive', v_archive);
end;
$$;

revoke all on function public.my_personal_data() from public, anon;
grant execute on function public.my_personal_data() to authenticated;

comment on function public.my_personal_data() is
  'GDPR access/portability: the signed-in member''s personal data as one JSON archive ({status: ok, archive}), '
  'or {status: too_soon, retry_at} within 5 minutes of the previous one.';

-- -----------------------------------------------------------------------------
-- 12. Retention (decision 127 extended; periods to confirm): a nightly job of
--     its own, so the shared purge function is left as it is.
--     - 12 months after a decision (6 months to contest + 6 months), once no
--       complaint about it is open: the content copy, the reporters'
--       explanations and the complaint texts go;
--     - 3 years after: the settled reports, answered complaints and the
--       decisions themselves (the yearly transparency counts are long done);
--     - moderation events after a day (a Realtime signal only).
--     Open reports and open complaints are never purged.
-- -----------------------------------------------------------------------------
create or replace function private.purge_lounge_moderation_data(p_now timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_snapshots  integer;
  v_details    integer;
  v_bodies     integer;
  v_reports    integer;
  v_appeals    integer;
  v_decisions  integer;
  v_events     integer;
  v_report     jsonb;
begin
  perform set_config('gt.retention_purge', 'on', true);

  delete from public.lounge_moderation_snapshots s
   using public.lounge_moderation_decisions d
   where d.id = s.decision_id
     and d.created_at < p_now - interval '12 months'
     and not exists (select 1 from public.lounge_appeals a where a.decision_id = d.id and a.status = 'open');
  get diagnostics v_snapshots = row_count;

  update public.lounge_reports
     set details = null
   where details is not null and status <> 'open' and resolved_at < p_now - interval '12 months';
  get diagnostics v_details = row_count;

  update public.lounge_appeals
     set body = null
   where body is not null and status <> 'open' and answered_at < p_now - interval '12 months';
  get diagnostics v_bodies = row_count;

  delete from public.lounge_reports
   where status <> 'open' and resolved_at < p_now - interval '3 years';
  get diagnostics v_reports = row_count;

  delete from public.lounge_appeals
   where status <> 'open' and answered_at < p_now - interval '3 years';
  get diagnostics v_appeals = row_count;

  delete from public.lounge_moderation_decisions d
   where d.created_at < p_now - interval '3 years'
     and not exists (select 1 from public.lounge_appeals a where a.decision_id = d.id and a.status = 'open')
     and not exists (select 1 from public.lounge_messages m where m.hidden_decision_id = d.id);
  get diagnostics v_decisions = row_count;

  delete from public.lounge_moderation_events where created_at < p_now - interval '1 day';
  get diagnostics v_events = row_count;

  perform set_config('gt.retention_purge', '', true);

  v_report := jsonb_build_object(
    'lounge_moderation_snapshots', v_snapshots, 'lounge_report_details', v_details,
    'lounge_appeal_bodies', v_bodies, 'lounge_reports', v_reports, 'lounge_appeals', v_appeals,
    'lounge_moderation_decisions', v_decisions);
  if v_snapshots + v_details + v_bodies + v_reports + v_appeals + v_decisions > 0 then
    insert into public.audit_logs (actor_id, actor_role, action, table_name, record_id, changes)
    values (null, 'retention_purge', 'delete', 'retention_purge', 'lounge_moderation:' || p_now::date::text,
            jsonb_build_object('reason', 'retention_purge') || v_report);
  end if;
  return v_report || jsonb_build_object('lounge_moderation_events', v_events);
end;
$$;
revoke all on function private.purge_lounge_moderation_data(timestamptz) from public, anon, authenticated;

select cron.schedule('purge-lounge-moderation', '25 2 * * *',
  $job$select private.purge_lounge_moderation_data()$job$);
