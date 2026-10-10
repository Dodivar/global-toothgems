-- =============================================================================
-- Members' Lounge: no full last name anywhere (decision 88 b)
--
-- The generated handle was `first.last`, shown on profiles and in every
-- @mention: it carried the full last name the directory hides. It becomes
-- `first.l` (initial of the last name; a number when taken). The name shown no
-- longer falls back to `profiles.display_name` (which can be a full name): a
-- member without a first name is shown under the webapp's generic label.
-- No lounge member existed when this was applied, so no handle is rewritten.
-- =============================================================================

create or replace function private.lounge_handle_base(p_first text, p_last text)
returns text
language sql
immutable
set search_path = ''
as $$
  select coalesce(nullif(left(regexp_replace(regexp_replace(regexp_replace(
           lower(translate(coalesce(p_first, '') || '.' || left(coalesce(nullif(trim(p_last), ''), ''), 1),
             'àáâãäåçèéêëìíîïñòóôõöøùúûüýÿÀÁÂÃÄÅÇÈÉÊËÌÍÎÏÑÒÓÔÕÖØÙÚÛÜÝß',
             'aaaaaaceeeeiiiinoooooouuuuyyAAAAAACEEEEIIIINOOOOOOUUUUYs')),
           '[^a-z0-9.]+', '', 'g'), '\.{2,}', '.', 'g'), '^\.+|\.+$', '', 'g'), 24), ''), 'member');
$$;
revoke all on function private.lounge_handle_base(text, text) from public, anon, authenticated;

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
         case
           when nullif(trim(p.first_name), '') is null then null
           else trim(p.first_name) || coalesce(' ' || upper(left(nullif(trim(p.last_name), ''), 1)) || '.', '')
         end,
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
revoke all on function public.lounge_directory() from public, anon;
grant execute on function public.lounge_directory() to authenticated;
