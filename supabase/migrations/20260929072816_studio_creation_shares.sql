-- =============================================================================
-- Migration — 3D Studio: read-only share links for saved creations
-- =============================================================================
-- A member can send a link (/studio-3d/partage/<token>) that lets anyone who
-- has it look at ONE saved creation in 3D, signed in or not, without being able
-- to change it or reach anything else of the owner's.
--
--   * creation_shares   one row per link: a random 48-hex token pointing at a
--                       creation, revocable. At most one active link per
--                       creation; revoking it and sharing again mints a new one.
--
-- Access model:
--   * Guests never touch a table. Their only door is
--     public.studio_shared_creation(token), a SECURITY DEFINER reader that
--     returns the name, description and scene of the creation behind an active
--     token — never its id, owner, tags, thumbnail or estimate — and nothing at
--     all for an unknown, malformed or revoked token. There is no write path for
--     them: the viewer page runs the editor read-only on a throwaway store.
--   * Owners read their own links (RLS) so the dialog can show the link again,
--     and create / revoke them only through the two RPCs below, which check
--     that the creation is theirs. No direct INSERT or UPDATE is granted, so a
--     link cannot be re-activated or pointed at someone else's design.
--   * The link is live: it always shows the creation's LATEST SAVED version.
--     Deleting the creation (or the account) deletes its links.
--
-- The token is stored in clear: only its owner can read it (RLS), and they
-- need to see it again to copy it. 24 random bytes cannot be guessed.
-- =============================================================================

create table public.creation_shares (
  id           uuid primary key default gen_random_uuid(),
  creation_id  uuid not null references public.creations (id) on delete cascade,
  user_id      uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  token        text not null unique default encode(extensions.gen_random_bytes(24), 'hex')
                 check (token ~ '^[0-9a-f]{48}$'),
  created_at   timestamptz not null default now(),
  revoked_at   timestamptz
);

comment on table public.creation_shares is
  '3D Studio: read-only share links to a saved creation. Owners read theirs (RLS); created and revoked through studio_share_creation / studio_revoke_creation_share; guests read through studio_shared_creation only.';

-- One active link per creation.
create unique index creation_shares_one_active_idx on public.creation_shares (creation_id) where revoked_at is null;
create index creation_shares_creation_idx on public.creation_shares (creation_id);
create index creation_shares_user_idx on public.creation_shares (user_id);

alter table public.creation_shares enable row level security;

revoke all on public.creation_shares from anon, authenticated;
grant select on public.creation_shares to authenticated;

create policy "creation_shares: owners read"
  on public.creation_shares for select to authenticated
  using (user_id = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- Owner: the active link of one of my creations, created on first use.
-- -----------------------------------------------------------------------------
create or replace function public.studio_share_creation(p_creation_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user  uuid := (select auth.uid());
  v_token text;
begin
  if v_user is null then
    raise exception 'studio_share_creation: sign-in required' using errcode = '42501';
  end if;
  if not exists (select 1 from public.creations c where c.id = p_creation_id and c.user_id = v_user) then
    raise exception 'studio_share_creation: creation not found' using errcode = 'P0002';
  end if;

  insert into public.creation_shares (creation_id, user_id)
  values (p_creation_id, v_user)
  on conflict (creation_id) where revoked_at is null do nothing;

  select s.token into v_token
    from public.creation_shares s
   where s.creation_id = p_creation_id and s.user_id = v_user and s.revoked_at is null;
  return v_token;
end;
$$;

-- -----------------------------------------------------------------------------
-- Owner: disable the active link of one of my creations (a no-op if none).
-- -----------------------------------------------------------------------------
create or replace function public.studio_revoke_creation_share(p_creation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null then
    raise exception 'studio_revoke_creation_share: sign-in required' using errcode = '42501';
  end if;
  if not exists (select 1 from public.creations c where c.id = p_creation_id and c.user_id = v_user) then
    raise exception 'studio_revoke_creation_share: creation not found' using errcode = 'P0002';
  end if;

  update public.creation_shares s
     set revoked_at = now()
   where s.creation_id = p_creation_id and s.user_id = v_user and s.revoked_at is null;
end;
$$;

-- -----------------------------------------------------------------------------
-- Anyone with the link: the shared creation, read-only, and only what the
-- viewer draws. The Gem Groups a piece came from are the owner's own library
-- ids, meaningless to a guest: they are blanked.
-- -----------------------------------------------------------------------------
create or replace function public.studio_shared_creation(p_token text)
returns table (name text, description text, scene_data jsonb, updated_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select c.name,
         c.description,
         case
           when jsonb_typeof(c.scene_data -> 'groups') = 'array' then
             jsonb_set(c.scene_data, '{groups}', (
               select coalesce(jsonb_agg(case when jsonb_typeof(g) = 'object'
                                              then g || jsonb_build_object('gemGroupId', null)
                                              else g end), '[]'::jsonb)
                 from jsonb_array_elements(c.scene_data -> 'groups') as g))
           else c.scene_data
         end,
         c.updated_at
    from public.creation_shares s
    join public.creations c on c.id = s.creation_id
   where coalesce(p_token, '') ~ '^[0-9a-f]{48}$'
     and s.token = p_token
     and s.revoked_at is null;
$$;

revoke all on function public.studio_share_creation(uuid),
                       public.studio_revoke_creation_share(uuid),
                       public.studio_shared_creation(text) from public, anon, authenticated;
grant execute on function public.studio_share_creation(uuid), public.studio_revoke_creation_share(uuid)
  to authenticated, service_role;
grant execute on function public.studio_shared_creation(text) to anon, authenticated, service_role;
