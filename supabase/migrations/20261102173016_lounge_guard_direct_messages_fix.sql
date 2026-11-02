-- =============================================================================
-- Members' Lounge: fix the private-messages switch trigger (2026-11-02)
-- =============================================================================
-- `private.lounge_guard_direct_messages()` (migration
-- 20261029181630_lounge_direct_messages_closed) tested the three tables in one
-- boolean expression. PL/pgSQL resolves every `new.<field>` of an expression
-- before evaluating it, so on a table without that column the trigger failed
-- with 42703 whatever the branch: while the switch is off, no channel message
-- (`new.message_id`) and no reaction (`new.conversation_id`) could be written,
-- and a new conversation failed with 42703 instead of 42501.
--
-- Same rules, one branch per table, each reading only its own columns.
-- =============================================================================

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
  if tg_table_name = 'lounge_conversations' then
    raise exception 'lounge: private messages closed' using errcode = '42501';
  elsif tg_table_name = 'lounge_messages' then
    if new.conversation_id is not null then
      raise exception 'lounge: private messages closed' using errcode = '42501';
    end if;
  elsif tg_table_name = 'lounge_reactions' then
    if exists (select 1 from public.lounge_messages m
                where m.id = new.message_id and m.conversation_id is not null) then
      raise exception 'lounge: private messages closed' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.lounge_guard_direct_messages() from public, anon, authenticated;
