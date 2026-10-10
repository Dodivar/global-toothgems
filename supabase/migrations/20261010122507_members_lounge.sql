-- =============================================================================
-- Members' Lounge (iteration 25): the community chat of `/compte/salons`
--
-- Language lounges (en, fr, de, es) with five channels each, private
-- conversations between two members, replies, mentions, reactions, image
-- attachments, read state, mutes, presence and the inbox of what is addressed
-- to a member. The webapp prototype (`lib/communityChat/`) shaped the model.
--
-- Rules enforced here (the browser decides nothing):
--   - Who may enter: an active account holding an active course entitlement,
--     or an active team member (`private.lounge_can_enter`). Losing it closes
--     the lounge (reads and writes); the member's past messages stay.
--   - Members never read `profiles`: other members are seen through
--     `lounge_directory()` only — a generated handle, the first name and the
--     initial of the last name, country, lounges, presence, completed courses.
--   - Messages are written by `lounge_post_message()` only (author forced to the
--     caller, parts validated, mentions of lounge members only, a reply stays in
--     its room, attachments in the author's folder, 20 messages a minute).
--   - A private conversation is readable by its two members only — not by staff.
--   - Reactions are toggled by `lounge_toggle_reaction()`; the totals live on the
--     message (trigger), so Realtime carries them as an RLS-checked UPDATE.
--     Reactions have a surrogate key: Realtime does not filter DELETE events by
--     RLS, and the table is not published anyway.
--   - Notifications (mention, reply, reaction) are rows of the recipient, written
--     by the functions above; private messages are counted from the read state.
--   - Account deletion cascades: the member, their messages, reactions and
--     conversations go with the profile.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Access
-- -----------------------------------------------------------------------------
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
       ));
$$;
comment on function private.lounge_can_enter(uuid) is
  'Members'' Lounge door: active account with an active course entitlement, or active staff.';

-- -----------------------------------------------------------------------------
-- Channels: the same five rooms in every lounge. Names and topics are product
-- copy written in the lounge's language and live in the webapp
-- (`lib/communityChat/model.ts`); the id is the address key `<lounge>-<key>`.
-- -----------------------------------------------------------------------------
create table public.lounge_channels (
  id         text primary key,
  lounge     text not null check (lounge in ('en', 'fr', 'de', 'es')),
  key        text not null check (key in ('introductions', 'general', 'inspiration', 'techniques', 'business')),
  position   smallint not null default 0,
  is_open    boolean not null default true,
  created_at timestamptz not null default now(),
  constraint lounge_channels_id_matches check (id = lounge || '-' || key),
  constraint lounge_channels_lounge_key_unique unique (lounge, key)
);
comment on table public.lounge_channels is 'Channels of the Members'' Lounge, one row per lounge and channel key.';

insert into public.lounge_channels (id, lounge, key, position)
select l.lounge || '-' || k.key, l.lounge, k.key, k.position
  from (values ('en'), ('fr'), ('de'), ('es')) as l (lounge)
 cross join (values ('introductions', 0), ('general', 1), ('inspiration', 2), ('techniques', 3), ('business', 4)) as k (key, position)
on conflict (id) do nothing;

alter table public.lounge_channels enable row level security;
revoke all on public.lounge_channels from anon, authenticated;
grant select on public.lounge_channels to authenticated;
create policy "lounge members read channels" on public.lounge_channels
  for select to authenticated using ((select private.lounge_can_enter((select auth.uid()))));

-- -----------------------------------------------------------------------------
-- Members: the lounge side of an account, created on first entry.
-- -----------------------------------------------------------------------------
create table public.lounge_members (
  user_id      uuid primary key references public.profiles (id) on delete cascade,
  handle       text not null check (handle ~ '^[a-z0-9][a-z0-9._-]{0,30}[a-z0-9]$'),
  languages    text[] not null default '{}' check (languages <@ array['en', 'fr', 'de', 'es']::text[]),
  presence     text not null default 'online' check (presence in ('online', 'away', 'offline')),
  last_seen_at timestamptz,
  is_mentor    boolean not null default false,
  joined_at    timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint lounge_members_handle_unique unique (handle)
);
comment on table public.lounge_members is
  'Members'' Lounge profile: generated handle, lounges joined, chosen presence (offline = invisible) and heartbeat.';
comment on column public.lounge_members.is_mentor is 'Set by staff (no screen yet); shown as the mentor badge.';

create trigger lounge_members_set_updated_at
  before update on public.lounge_members
  for each row execute function private.set_updated_at();

alter table public.lounge_members enable row level security;
revoke all on public.lounge_members from anon, authenticated;
grant select on public.lounge_members to authenticated;
create policy "lounge members read their own row" on public.lounge_members
  for select to authenticated using (user_id = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- Private conversations: one per pair of members, created by the first message.
-- -----------------------------------------------------------------------------
create table public.lounge_conversations (
  id              uuid primary key default gen_random_uuid(),
  user_a          uuid not null references public.profiles (id) on delete cascade,
  user_b          uuid not null references public.profiles (id) on delete cascade,
  created_at      timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  constraint lounge_conversations_ordered check (user_a < user_b),
  constraint lounge_conversations_pair_unique unique (user_a, user_b)
);
create index lounge_conversations_user_b_idx on public.lounge_conversations (user_b);

create or replace function private.lounge_my_conversation_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select c.id
    from public.lounge_conversations c
   where (select auth.uid()) in (c.user_a, c.user_b);
$$;

alter table public.lounge_conversations enable row level security;
revoke all on public.lounge_conversations from anon, authenticated;
grant select on public.lounge_conversations to authenticated;
create policy "conversation members read their conversations" on public.lounge_conversations
  for select to authenticated
  using ((select private.lounge_can_enter((select auth.uid()))) and (select auth.uid()) in (user_a, user_b));

-- -----------------------------------------------------------------------------
-- Messages
-- -----------------------------------------------------------------------------
create table public.lounge_messages (
  id              uuid primary key default gen_random_uuid(),
  channel_id      text references public.lounge_channels (id),
  conversation_id uuid references public.lounge_conversations (id) on delete cascade,
  author_id       uuid not null references public.profiles (id) on delete cascade,
  -- [{type:'text', text} | {type:'mention', memberId}], validated by lounge_post_message().
  parts           jsonb not null default '[]',
  -- Text parts joined: previews, search, length cap.
  body_text       text not null default '' check (char_length(body_text) <= 4000),
  mention_ids     uuid[] not null default '{}',
  reply_to_id     uuid references public.lounge_messages (id) on delete set null,
  -- Totals per reaction, maintained by trigger from lounge_reactions.
  reactions       jsonb not null default '{}',
  created_at      timestamptz not null default now(),
  constraint lounge_messages_one_room check ((channel_id is null) <> (conversation_id is null)),
  constraint lounge_messages_parts_array check (jsonb_typeof(parts) = 'array')
);
comment on table public.lounge_messages is 'Messages of the Members'' Lounge: a channel or a private conversation.';

create index lounge_messages_channel_idx on public.lounge_messages (channel_id, created_at desc) where channel_id is not null;
create index lounge_messages_conversation_idx on public.lounge_messages (conversation_id, created_at desc) where conversation_id is not null;
create index lounge_messages_author_idx on public.lounge_messages (author_id, created_at desc);
create index lounge_messages_reply_idx on public.lounge_messages (reply_to_id) where reply_to_id is not null;

alter table public.lounge_messages enable row level security;
revoke all on public.lounge_messages from anon, authenticated;
grant select on public.lounge_messages to authenticated;
create policy "lounge members read channel messages and their conversations" on public.lounge_messages
  for select to authenticated
  using (
    (select private.lounge_can_enter((select auth.uid())))
    and (channel_id is not null or conversation_id in (select private.lounge_my_conversation_ids()))
  );

-- -----------------------------------------------------------------------------
-- Attachments: images in the private bucket `lounge-media`, `<user_id>/<file>`.
-- -----------------------------------------------------------------------------
create table public.lounge_message_attachments (
  id           uuid primary key default gen_random_uuid(),
  message_id   uuid not null references public.lounge_messages (id) on delete cascade,
  storage_path text not null check (storage_path ~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]{1,120}$' and storage_path !~ '\.\.'),
  alt_text     text not null default '' check (char_length(alt_text) <= 300),
  position     smallint not null default 0 check (position between 0 and 3),
  created_at   timestamptz not null default now(),
  constraint lounge_message_attachments_path_unique unique (storage_path),
  constraint lounge_message_attachments_position_unique unique (message_id, position)
);

alter table public.lounge_message_attachments enable row level security;
revoke all on public.lounge_message_attachments from anon, authenticated;
grant select on public.lounge_message_attachments to authenticated;
-- The messages policy applies inside the subquery: an attachment is readable with its message.
create policy "attachments are read with their message" on public.lounge_message_attachments
  for select to authenticated
  using (exists (select 1 from public.lounge_messages m where m.id = message_id));

-- -----------------------------------------------------------------------------
-- Reactions
-- -----------------------------------------------------------------------------
create table public.lounge_reactions (
  id         uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.lounge_messages (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  reaction   text not null check (reaction in ('heart', 'clap', 'sparkles', 'laugh', 'fire', 'gem')),
  created_at timestamptz not null default now(),
  constraint lounge_reactions_unique unique (message_id, user_id, reaction)
);
create index lounge_reactions_user_idx on public.lounge_reactions (user_id);

alter table public.lounge_reactions enable row level security;
revoke all on public.lounge_reactions from anon, authenticated;
grant select on public.lounge_reactions to authenticated;
create policy "members read their own reactions" on public.lounge_reactions
  for select to authenticated using (user_id = (select auth.uid()));

create or replace function private.lounge_refresh_reaction_totals()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_message uuid := coalesce(new.message_id, old.message_id);
begin
  update public.lounge_messages m
     set reactions = coalesce((
           select jsonb_object_agg(r.reaction, r.n)
             from (select reaction, count(*)::int as n
                     from public.lounge_reactions
                    where message_id = v_message
                    group by reaction) r), '{}'::jsonb)
   where m.id = v_message;
  return null;
end;
$$;

create trigger lounge_reactions_refresh_totals
  after insert or delete on public.lounge_reactions
  for each row execute function private.lounge_refresh_reaction_totals();

-- -----------------------------------------------------------------------------
-- Read state and mutes: one row per member and room.
-- -----------------------------------------------------------------------------
create table public.lounge_room_states (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles (id) on delete cascade,
  channel_id      text references public.lounge_channels (id) on delete cascade,
  conversation_id uuid references public.lounge_conversations (id) on delete cascade,
  last_read_at    timestamptz,
  muted           boolean not null default false,
  updated_at      timestamptz not null default now(),
  constraint lounge_room_states_one_room check ((channel_id is null) <> (conversation_id is null))
);
create unique index lounge_room_states_channel_unique on public.lounge_room_states (user_id, channel_id) where channel_id is not null;
create unique index lounge_room_states_conversation_unique on public.lounge_room_states (user_id, conversation_id) where conversation_id is not null;
create index lounge_room_states_channel_idx on public.lounge_room_states (channel_id);
create index lounge_room_states_conversation_idx on public.lounge_room_states (conversation_id);

create trigger lounge_room_states_set_updated_at
  before update on public.lounge_room_states
  for each row execute function private.set_updated_at();

alter table public.lounge_room_states enable row level security;
revoke all on public.lounge_room_states from anon, authenticated;
grant select on public.lounge_room_states to authenticated;
create policy "members read their own room state" on public.lounge_room_states
  for select to authenticated using (user_id = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- Notifications: what is addressed to a member in the channels.
-- -----------------------------------------------------------------------------
create table public.lounge_notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  kind       text not null check (kind in ('mention', 'reply', 'reaction')),
  message_id uuid not null references public.lounge_messages (id) on delete cascade,
  actor_id   uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  read_at    timestamptz,
  constraint lounge_notifications_unique unique (user_id, message_id, kind)
);
create index lounge_notifications_user_idx on public.lounge_notifications (user_id, created_at desc);
create index lounge_notifications_message_idx on public.lounge_notifications (message_id);
create index lounge_notifications_actor_idx on public.lounge_notifications (actor_id);

alter table public.lounge_notifications enable row level security;
revoke all on public.lounge_notifications from anon, authenticated;
grant select on public.lounge_notifications to authenticated;
create policy "members read their own notifications" on public.lounge_notifications
  for select to authenticated using (user_id = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------

-- `first.last`, accents removed, lowercase; 'member' when nothing is left.
create or replace function private.lounge_handle_base(p_first text, p_last text)
returns text
language sql
immutable
set search_path = ''
as $$
  select coalesce(nullif(left(regexp_replace(regexp_replace(regexp_replace(
           lower(translate(coalesce(p_first, '') || '.' || coalesce(p_last, ''),
             'àáâãäåçèéêëìíîïñòóôõöøùúûüýÿÀÁÂÃÄÅÇÈÉÊËÌÍÎÏÑÒÓÔÕÖØÙÚÛÜÝß',
             'aaaaaaceeeeiiiinoooooouuuuyyAAAAAACEEEEIIIINOOOOOOUUUUYs')),
           '[^a-z0-9.]+', '', 'g'), '\.{2,}', '.', 'g'), '^\.+|\.+$', '', 'g'), 24), ''), 'member');
$$;

-- Creates the caller's lounge row if missing (unique handle) and returns it.
create or replace function private.lounge_ensure_member(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_base   text;
  v_handle text;
  v_n      int := 1;
  v_locale text;
begin
  if exists (select 1 from public.lounge_members where user_id = p_user) then
    return;
  end if;
  select private.lounge_handle_base(p.first_name, p.last_name),
         case when p.preferred_locale in ('en', 'fr', 'de', 'es') then p.preferred_locale end
    into v_base, v_locale
    from public.profiles p
   where p.id = p_user;
  v_base := regexp_replace(coalesce(v_base, 'member'), '[._-]+$', '');
  if char_length(v_base) < 2 then
    v_base := 'member';
  end if;
  v_handle := v_base;
  while exists (select 1 from public.lounge_members where handle = v_handle) loop
    v_n := v_n + 1;
    v_handle := v_base || v_n::text;
  end loop;
  insert into public.lounge_members (user_id, handle, languages, last_seen_at)
  values (p_user, v_handle, case when v_locale is null then '{}'::text[] else array[v_locale] end, now())
  on conflict (user_id) do nothing;
end;
$$;

create or replace function private.lounge_require_entry()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
begin
  if not private.lounge_can_enter(v_user) then
    raise exception 'lounge: forbidden' using errcode = '42501';
  end if;
  return v_user;
end;
$$;

revoke all on function private.lounge_handle_base(text, text) from public, anon, authenticated;
revoke all on function private.lounge_ensure_member(uuid) from public, anon, authenticated;
revoke all on function private.lounge_require_entry() from public, anon, authenticated;
revoke all on function private.lounge_refresh_reaction_totals() from public, anon, authenticated;
revoke all on function private.lounge_can_enter(uuid) from public, anon;
grant execute on function private.lounge_can_enter(uuid) to authenticated;
revoke all on function private.lounge_my_conversation_ids() from public, anon;
grant execute on function private.lounge_my_conversation_ids() to authenticated;

-- -----------------------------------------------------------------------------
-- RPC: access and membership
-- -----------------------------------------------------------------------------

-- Whether the caller may enter (the member space shows the locked screen otherwise).
create or replace function public.lounge_access()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.lounge_can_enter((select auth.uid()));
$$;

-- Enters the lounge (first time: creates the member), optionally adding a lounge
-- to the member's list, and marks them seen.
create or replace function public.lounge_join(p_lounge text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := private.lounge_require_entry();
begin
  if p_lounge is not null and p_lounge not in ('en', 'fr', 'de', 'es') then
    raise exception 'lounge: unknown lounge' using errcode = '22023';
  end if;
  perform private.lounge_ensure_member(v_user);
  update public.lounge_members m
     set languages = case
                       when p_lounge is null or p_lounge = any (m.languages) then m.languages
                       else m.languages || p_lounge
                     end,
         last_seen_at = now()
   where m.user_id = v_user;
end;
$$;

-- Marks the caller seen; changes their presence when one is given.
create or replace function public.lounge_heartbeat(p_presence text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := private.lounge_require_entry();
begin
  if p_presence is not null and p_presence not in ('online', 'away', 'offline') then
    raise exception 'lounge: invalid presence' using errcode = '22023';
  end if;
  update public.lounge_members
     set last_seen_at = now(),
         presence = coalesce(p_presence, presence)
   where user_id = v_user;
end;
$$;

-- Everyone who ever entered the lounge, as other members see them. `active`
-- is false for a member who can no longer enter (their old messages stay).
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
         (select count(*) from public.lounge_messages x where x.author_id = m.user_id and x.channel_id is not null),
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
-- RPC: overview (unread, mentions, mutes, conversations)
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
                             and x.created_at > coalesce(s.last_read_at, v_joined)),
               'mentions', (select count(*) from public.lounge_messages x
                             where x.channel_id = c.id and x.author_id <> v_user
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
                             and x.created_at > coalesce(s.last_read_at, '-infinity'::timestamptz)),
               'last', (select jsonb_build_object(
                                 'id', x.id, 'author_id', x.author_id, 'parts', x.parts,
                                 'created_at', x.created_at, 'reply_to_id', x.reply_to_id,
                                 'reactions', x.reactions,
                                 'attachments', (select count(*) from public.lounge_message_attachments a where a.message_id = x.id))
                          from public.lounge_messages x
                         where x.conversation_id = cv.id
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

-- -----------------------------------------------------------------------------
-- RPC: read state, mutes, notifications
-- -----------------------------------------------------------------------------
create or replace function public.lounge_mark_read(
  p_channel_ids      text[] default '{}',
  p_conversation_ids uuid[] default '{}'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := private.lounge_require_entry();
begin
  if coalesce(cardinality(p_channel_ids), 0) + coalesce(cardinality(p_conversation_ids), 0) > 50 then
    raise exception 'lounge: too many rooms' using errcode = '22023';
  end if;

  insert into public.lounge_room_states (user_id, channel_id, last_read_at)
  select v_user, c.id, now()
    from public.lounge_channels c
   where c.id = any (coalesce(p_channel_ids, '{}'))
  on conflict (user_id, channel_id) where channel_id is not null
  do update set last_read_at = excluded.last_read_at;

  insert into public.lounge_room_states (user_id, conversation_id, last_read_at)
  select v_user, cv.id, now()
    from public.lounge_conversations cv
   where cv.id = any (coalesce(p_conversation_ids, '{}'))
     and v_user in (cv.user_a, cv.user_b)
  on conflict (user_id, conversation_id) where conversation_id is not null
  do update set last_read_at = excluded.last_read_at;

  -- Reading a channel reads the mentions and replies waiting in it.
  update public.lounge_notifications n
     set read_at = now()
    from public.lounge_messages x
   where n.user_id = v_user
     and n.read_at is null
     and n.kind in ('mention', 'reply')
     and x.id = n.message_id
     and x.channel_id = any (coalesce(p_channel_ids, '{}'));
end;
$$;

create or replace function public.lounge_set_muted(
  p_channel_id      text,
  p_conversation_id uuid,
  p_muted           boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := private.lounge_require_entry();
begin
  if (p_channel_id is null) = (p_conversation_id is null) or p_muted is null then
    raise exception 'lounge: one room expected' using errcode = '22023';
  end if;
  if p_channel_id is not null then
    if not exists (select 1 from public.lounge_channels where id = p_channel_id) then
      raise exception 'lounge: unknown room' using errcode = '22023';
    end if;
    insert into public.lounge_room_states (user_id, channel_id, muted)
    values (v_user, p_channel_id, p_muted)
    on conflict (user_id, channel_id) where channel_id is not null
    do update set muted = excluded.muted;
  else
    if not exists (select 1 from public.lounge_conversations
                    where id = p_conversation_id and v_user in (user_a, user_b)) then
      raise exception 'lounge: unknown room' using errcode = '22023';
    end if;
    insert into public.lounge_room_states (user_id, conversation_id, muted)
    values (v_user, p_conversation_id, p_muted)
    on conflict (user_id, conversation_id) where conversation_id is not null
    do update set muted = excluded.muted;
  end if;
end;
$$;

-- Marks notifications read: the ones given, or all of them when null.
create or replace function public.lounge_read_notifications(p_ids uuid[] default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := private.lounge_require_entry();
begin
  update public.lounge_notifications
     set read_at = now()
   where user_id = v_user
     and read_at is null
     and (p_ids is null or id = any (p_ids));
end;
$$;

-- -----------------------------------------------------------------------------
-- RPC: posting
-- -----------------------------------------------------------------------------
create or replace function public.lounge_post_message(
  p_channel_id   text,
  p_recipient_id uuid,
  p_parts        jsonb,
  p_reply_to_id  uuid default null,
  p_attachments  jsonb default '[]'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user         uuid := private.lounge_require_entry();
  v_conversation uuid;
  v_part         jsonb;
  v_body         text := '';
  v_mentions     uuid[] := '{}';
  v_member       uuid;
  v_message      uuid;
  v_reply_author uuid;
  v_attachment   jsonb;
  v_path         text;
  v_position     int := 0;
  v_attachments  jsonb := coalesce(p_attachments, '[]'::jsonb);
begin
  if (p_channel_id is null) = (p_recipient_id is null) then
    raise exception 'lounge: one room expected' using errcode = '22023';
  end if;

  -- Rate limit: 20 messages a minute per member.
  if (select count(*) from public.lounge_messages
       where author_id = v_user and created_at > now() - interval '1 minute') >= 20 then
    raise exception 'lounge: rate limited' using errcode = 'PT429';
  end if;

  perform private.lounge_ensure_member(v_user);

  -- Room
  if p_channel_id is not null then
    if not exists (select 1 from public.lounge_channels where id = p_channel_id and is_open) then
      raise exception 'lounge: unknown room' using errcode = '22023';
    end if;
  else
    if p_recipient_id = v_user
       or not exists (select 1 from public.lounge_members where user_id = p_recipient_id)
       or not private.lounge_can_enter(p_recipient_id) then
      raise exception 'lounge: unknown recipient' using errcode = '22023';
    end if;
    insert into public.lounge_conversations (user_a, user_b)
    values (least(v_user, p_recipient_id), greatest(v_user, p_recipient_id))
    on conflict (user_a, user_b) do nothing;
    select id into v_conversation
      from public.lounge_conversations
     where user_a = least(v_user, p_recipient_id) and user_b = greatest(v_user, p_recipient_id);
  end if;

  -- Parts
  if p_parts is null or jsonb_typeof(p_parts) <> 'array' or jsonb_array_length(p_parts) > 200 then
    raise exception 'lounge: invalid message' using errcode = '22023';
  end if;
  for v_part in select value from jsonb_array_elements(p_parts) loop
    if jsonb_typeof(v_part) <> 'object' then
      raise exception 'lounge: invalid message' using errcode = '22023';
    end if;
    if v_part ->> 'type' = 'text' and jsonb_typeof(v_part -> 'text') = 'string'
       and (select count(*) from jsonb_object_keys(v_part)) = 2 then
      v_body := v_body || (v_part ->> 'text');
    elsif v_part ->> 'type' = 'mention' and jsonb_typeof(v_part -> 'memberId') = 'string'
          and (select count(*) from jsonb_object_keys(v_part)) = 2
          and (v_part ->> 'memberId') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      v_member := (v_part ->> 'memberId')::uuid;
      if not exists (select 1 from public.lounge_members where user_id = v_member) then
        raise exception 'lounge: unknown mention' using errcode = '22023';
      end if;
      if not v_member = any (v_mentions) then
        v_mentions := v_mentions || v_member;
      end if;
    else
      raise exception 'lounge: invalid message' using errcode = '22023';
    end if;
  end loop;
  if char_length(v_body) > 4000 then
    raise exception 'lounge: message too long' using errcode = '22023';
  end if;

  -- Attachments: up to 4 images already uploaded in the author's folder.
  if jsonb_typeof(v_attachments) <> 'array' or jsonb_array_length(v_attachments) > 4 then
    raise exception 'lounge: invalid attachments' using errcode = '22023';
  end if;
  if btrim(v_body) = '' and cardinality(v_mentions) = 0 and jsonb_array_length(v_attachments) = 0 then
    raise exception 'lounge: empty message' using errcode = '22023';
  end if;

  -- Reply: in the same room.
  if p_reply_to_id is not null then
    select author_id into v_reply_author
      from public.lounge_messages
     where id = p_reply_to_id
       and channel_id is not distinct from p_channel_id
       and conversation_id is not distinct from v_conversation;
    if not found then
      raise exception 'lounge: reply out of room' using errcode = '22023';
    end if;
  end if;

  insert into public.lounge_messages (channel_id, conversation_id, author_id, parts, body_text, mention_ids, reply_to_id)
  values (p_channel_id, v_conversation, v_user, p_parts, v_body, v_mentions, p_reply_to_id)
  returning id into v_message;

  for v_attachment in select value from jsonb_array_elements(v_attachments) loop
    v_path := v_attachment ->> 'path';
    if jsonb_typeof(v_attachment) <> 'object'
       or v_path is null
       or split_part(v_path, '/', 1) <> v_user::text
       or v_path !~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]{1,120}$'
       or v_path ~ '\.\.'
       or char_length(coalesce(v_attachment ->> 'alt', '')) > 300
       or not exists (select 1 from storage.objects o where o.bucket_id = 'lounge-media' and o.name = v_path)
       or exists (select 1 from public.lounge_message_attachments a where a.storage_path = v_path) then
      raise exception 'lounge: invalid attachments' using errcode = '22023';
    end if;
    insert into public.lounge_message_attachments (message_id, storage_path, alt_text, position)
    values (v_message, v_path, coalesce(v_attachment ->> 'alt', ''), v_position);
    v_position := v_position + 1;
  end loop;

  if v_conversation is not null then
    update public.lounge_conversations set last_message_at = now() where id = v_conversation;
  else
    -- Channel notifications: mentions, then replies to someone not mentioned.
    insert into public.lounge_notifications (user_id, kind, message_id, actor_id)
    select u, 'mention', v_message, v_user
      from unnest(v_mentions) as u
     where u <> v_user and private.lounge_can_enter(u)
    on conflict (user_id, message_id, kind) do nothing;
    if v_reply_author is not null and v_reply_author <> v_user and not v_reply_author = any (v_mentions) then
      insert into public.lounge_notifications (user_id, kind, message_id, actor_id)
      values (v_reply_author, 'reply', v_message, v_user)
      on conflict (user_id, message_id, kind) do nothing;
    end if;
  end if;

  -- Writing in a room means having read it.
  if p_channel_id is not null then
    insert into public.lounge_room_states (user_id, channel_id, last_read_at)
    values (v_user, p_channel_id, now())
    on conflict (user_id, channel_id) where channel_id is not null
    do update set last_read_at = excluded.last_read_at;
  else
    insert into public.lounge_room_states (user_id, conversation_id, last_read_at)
    values (v_user, v_conversation, now())
    on conflict (user_id, conversation_id) where conversation_id is not null
    do update set last_read_at = excluded.last_read_at;
  end if;

  return v_message;
end;
$$;

-- -----------------------------------------------------------------------------
-- RPC: reactions
-- -----------------------------------------------------------------------------
create or replace function public.lounge_toggle_reaction(p_message_id uuid, p_reaction text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user   uuid := private.lounge_require_entry();
  v_author uuid;
begin
  if p_reaction is null or p_reaction not in ('heart', 'clap', 'sparkles', 'laugh', 'fire', 'gem') then
    raise exception 'lounge: invalid reaction' using errcode = '22023';
  end if;
  select m.author_id into v_author
    from public.lounge_messages m
   where m.id = p_message_id
     and (m.channel_id is not null
          or exists (select 1 from public.lounge_conversations c
                      where c.id = m.conversation_id and v_user in (c.user_a, c.user_b)));
  if not found then
    raise exception 'lounge: unknown message' using errcode = '22023';
  end if;

  delete from public.lounge_reactions
   where message_id = p_message_id and user_id = v_user and reaction = p_reaction;
  if found then
    return false;
  end if;

  insert into public.lounge_reactions (message_id, user_id, reaction)
  values (p_message_id, v_user, p_reaction);

  if v_author <> v_user and private.lounge_can_enter(v_author) then
    insert into public.lounge_notifications (user_id, kind, message_id, actor_id)
    values (v_author, 'reaction', p_message_id, v_user)
    on conflict (user_id, message_id, kind)
    do update set actor_id = excluded.actor_id, created_at = now(), read_at = null;
  end if;
  return true;
end;
$$;

-- Grants: members only (each function checks the door itself).
revoke all on function public.lounge_access() from public, anon;
revoke all on function public.lounge_join(text) from public, anon;
revoke all on function public.lounge_heartbeat(text) from public, anon;
revoke all on function public.lounge_directory() from public, anon;
revoke all on function public.lounge_overview() from public, anon;
revoke all on function public.lounge_mark_read(text[], uuid[]) from public, anon;
revoke all on function public.lounge_set_muted(text, uuid, boolean) from public, anon;
revoke all on function public.lounge_read_notifications(uuid[]) from public, anon;
revoke all on function public.lounge_post_message(text, uuid, jsonb, uuid, jsonb) from public, anon;
revoke all on function public.lounge_toggle_reaction(uuid, text) from public, anon;
grant execute on function public.lounge_access() to authenticated;
grant execute on function public.lounge_join(text) to authenticated;
grant execute on function public.lounge_heartbeat(text) to authenticated;
grant execute on function public.lounge_directory() to authenticated;
grant execute on function public.lounge_overview() to authenticated;
grant execute on function public.lounge_mark_read(text[], uuid[]) to authenticated;
grant execute on function public.lounge_set_muted(text, uuid, boolean) to authenticated;
grant execute on function public.lounge_read_notifications(uuid[]) to authenticated;
grant execute on function public.lounge_post_message(text, uuid, jsonb, uuid, jsonb) to authenticated;
grant execute on function public.lounge_toggle_reaction(uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- Storage: `lounge-media` (private, 5 MB images), `<user_id>/<file>`
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('lounge-media', 'lounge-media', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do nothing;

create policy "lounge-media: members upload into own folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'lounge-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select private.lounge_can_enter((select auth.uid())))
  );
-- An image is readable by its uploader, and by whoever can read the message it is attached to.
create policy "lounge-media: read with the message"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'lounge-media'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or exists (select 1 from public.lounge_message_attachments a where a.storage_path = storage.objects.name)
    )
  );
create policy "lounge-media: uploaders delete their files"
  on storage.objects for delete to authenticated
  using (bucket_id = 'lounge-media' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- -----------------------------------------------------------------------------
-- Realtime: new and updated messages (reaction totals), the member's notifications.
-- Both are RLS-checked per subscriber; DELETE events are never relied on.
-- -----------------------------------------------------------------------------
alter publication supabase_realtime add table public.lounge_messages;
alter publication supabase_realtime add table public.lounge_notifications;
