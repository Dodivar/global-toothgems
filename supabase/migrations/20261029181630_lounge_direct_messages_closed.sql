-- =============================================================================
-- Members' Lounge: private messages closed (owner's request, 2026-10-29)
-- =============================================================================
-- The owner does not want the lounge's private conversations reachable for now,
-- by anyone (members and staff alike). The logic stays in place, dormant, behind
-- one switch:
--
--   private.lounge_settings.direct_messages_enabled (one row, false)
--
-- While it is off:
--   - no conversation, private message or reaction to a private message can be
--     written (insert triggers; `lounge_post_message()` with a recipient fails
--     with 42501 and leaves nothing behind);
--   - private conversations and their messages are not readable (restrictive
--     select policies, so Realtime and attachments, which read through the
--     message, follow).
-- Existing rows are kept untouched. Reopening = a migration setting the switch
-- to true (and the web app's `LOUNGE_DIRECT_MESSAGES_ENABLED` flag).
-- =============================================================================

create table private.lounge_settings (
  id                      boolean primary key default true check (id),
  direct_messages_enabled boolean not null default false,
  updated_at              timestamptz not null default now()
);
comment on table private.lounge_settings is 'Members'' Lounge switches (one row). direct_messages_enabled: private conversations open or closed.';
insert into private.lounge_settings (id, direct_messages_enabled) values (true, false);
revoke all on private.lounge_settings from public, anon, authenticated;

create or replace function private.lounge_direct_messages_enabled()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select s.direct_messages_enabled from private.lounge_settings s where s.id), false);
$$;
revoke all on function private.lounge_direct_messages_enabled() from public, anon;
grant execute on function private.lounge_direct_messages_enabled() to authenticated;

-- Writes ----------------------------------------------------------------------
create or replace function private.lounge_guard_direct_messages()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.lounge_direct_messages_enabled() then
    return new;
  end if;
  if tg_table_name = 'lounge_conversations'
     or (tg_table_name = 'lounge_messages' and new.conversation_id is not null)
     or (tg_table_name = 'lounge_reactions'
         and exists (select 1 from public.lounge_messages m
                      where m.id = new.message_id and m.conversation_id is not null)) then
    raise exception 'lounge: private messages closed' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function private.lounge_guard_direct_messages() from public, anon, authenticated;

create trigger lounge_conversations_direct_switch
  before insert on public.lounge_conversations
  for each row execute function private.lounge_guard_direct_messages();
create trigger lounge_messages_direct_switch
  before insert on public.lounge_messages
  for each row execute function private.lounge_guard_direct_messages();
create trigger lounge_reactions_direct_switch
  before insert on public.lounge_reactions
  for each row execute function private.lounge_guard_direct_messages();

-- Reads -----------------------------------------------------------------------
create policy "private conversations closed by the switch" on public.lounge_conversations
  as restrictive for select to authenticated
  using ((select private.lounge_direct_messages_enabled()));

create policy "private messages closed by the switch" on public.lounge_messages
  as restrictive for select to authenticated
  using (channel_id is not null or (select private.lounge_direct_messages_enabled()));
