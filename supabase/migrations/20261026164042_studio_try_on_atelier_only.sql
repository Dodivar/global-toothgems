-- =============================================================================
-- 3D Studio smile try-on: reserved to the creations of Atelier artists
-- (decision 111 (a), owner's request 2026-10-26)
-- =============================================================================
-- "A client must be signed in and use the feature on the creations of someone
-- who has the highest Studio plan." The plan switch planned by decision 111
-- is turned: only the creations of an owner whose Studio tier is `atelier`
-- (an active Atelier subscription, or active staff — private.studio_user_tier)
-- may be tried on. Essential, Artist and trial owners no longer offer it: the
-- public readers say try_on = false and the Edge Function answers not_allowed.
-- The requester's sign-in is already enforced by the function.
-- =============================================================================

create or replace function private.studio_try_on_allowed(p_owner uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.studio_user_tier(p_owner) = 'atelier', false);
$$;

comment on function private.studio_try_on_allowed(uuid) is
  '3D Studio smile try-on (decision 111 (a)): whether the creations of this owner may be tried on a photo — the highest plan only (Atelier subscription or active staff).';

revoke all on function private.studio_try_on_allowed(uuid) from public;
grant execute on function private.studio_try_on_allowed(uuid) to service_role;
