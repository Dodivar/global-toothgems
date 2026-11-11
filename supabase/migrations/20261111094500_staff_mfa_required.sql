-- =============================================================================
-- Staff rights need the second factor (decided by the owner, 2026-11-11)
-- =============================================================================
-- Every staff right goes through two helpers: private.is_staff() (back-office
-- reads) and private.has_permission() (back-office writes, staff RPCs, the
-- Edge Functions that call my_permissions() with the caller's JWT). Both now
-- also require the session to have passed its second factor: Supabase Auth
-- MFA (TOTP), which raises the access token's `aal` claim to 'aal2'.
--
-- A stolen staff password alone therefore opens nothing in the back office:
-- the browser shows the second-factor screen (webapp
-- components/admin/StaffSecondFactor.tsx) and the database refuses every
-- staff read and write until it is passed. A token without the claim counts
-- as aal1 (refused), never as aal2.
--
-- Also affected, accepted: the Studio's staff access and tier
-- (private.has_studio_access() and the tier/state helpers call is_staff()),
-- so a staff member uses the Studio as staff only once past the second
-- factor (before that, as the member they are). Unchanged: the Members'
-- Lounge, Glowbook and share-branding checks join roles.is_staff directly;
-- the service role and private.is_trusted_backend() paths do not depend on
-- a user JWT.
-- private.caller_rank() is only ever used next to has_permission().
-- =============================================================================

create or replace function private.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.jwt() ->> 'aal') is not distinct from 'aal2'
     and exists (
       select 1
         from public.profiles p
         join public.roles r on r.key = p.role
        where p.id = (select auth.uid())
          and p.status = 'active'
          and r.is_staff
     );
$$;

create or replace function private.has_permission(p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.jwt() ->> 'aal') is not distinct from 'aal2'
     and exists (
       select 1
         from public.profiles p
         join public.roles r on r.key = p.role and r.is_staff
         join public.role_permissions rp on rp.role_key = p.role
        where p.id = (select auth.uid())
          and p.status = 'active'
          and rp.permission_key = p_permission
     );
$$;

comment on function private.is_staff() is
  'Active staff member whose session passed the second factor (aal2). Back-office reads.';
comment on function private.has_permission(text) is
  'Active staff member holding the permission, with a session at aal2. Back-office writes.';
