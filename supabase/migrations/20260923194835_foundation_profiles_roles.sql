-- =============================================================================
-- Migration 001 — Foundation: shared helpers, roles, profiles
-- =============================================================================
-- Responsibility:
--   * `private` schema for helpers that must never be exposed through the API
--   * generic triggers (updated_at, created_by/updated_by)
--   * `roles` lookup table (extensible without restructuring)
--   * `profiles` table linked 1:1 to `auth.users` (Supabase Auth stays the only
--     authentication system; profiles hold application data only)
--   * automatic profile creation on sign-up + email sync
--   * `private.is_admin()` used by every RLS policy that grants staff access
--
-- Conventions for the whole schema:
--   * tables: plural snake_case; columns: snake_case
--   * primary keys: uuid (gen_random_uuid()), except natural keys for lookups
--   * statuses: text + CHECK constraint (easier to evolve than enum types)
--   * every mutable table has created_at / updated_at (timestamptz)
-- =============================================================================

-- Helpers live outside `public` so PostgREST never exposes them as RPC.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Generic trigger: keep updated_at current
-- -----------------------------------------------------------------------------
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Generic trigger: updated_at + created_by / updated_by for staff-edited tables.
-- auth.uid() is null for service-role / SQL-editor writes, which is expected.
-- -----------------------------------------------------------------------------
create or replace function private.set_audit_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(new.created_by, auth.uid());
    new.updated_by := coalesce(new.updated_by, auth.uid());
  else
    new.created_by := old.created_by;   -- creator is immutable
    new.updated_by := auth.uid();
    new.updated_at := now();
  end if;
  return new;
end;
$$;

-- True when the current database role is a trusted backend role
-- (service-role key, migrations, SQL editor) rather than an API end user.
create or replace function private.is_trusted_backend()
returns boolean
language sql
stable
set search_path = ''
as $$
  select current_user in ('postgres', 'service_role', 'supabase_admin');
$$;

-- -----------------------------------------------------------------------------
-- Roles: a lookup table rather than an enum, so new roles (support,
-- content_manager, instructor, ...) are an INSERT, not a type migration.
-- -----------------------------------------------------------------------------
create table public.roles (
  key         text primary key check (key ~ '^[a-z][a-z0-9_]*$'),
  name        text not null,
  description text,
  is_staff    boolean not null default false,
  created_at  timestamptz not null default now()
);

comment on table public.roles is
  'Application roles. Authorization is enforced by RLS, never by the frontend.';

insert into public.roles (key, name, description, is_staff) values
  ('customer', 'Customer', 'Default role for every new account.', false),
  ('admin',    'Administrator', 'Full access to catalogue, orders and customers.', true);

alter table public.roles enable row level security;

-- -----------------------------------------------------------------------------
-- Profiles
-- -----------------------------------------------------------------------------
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  email        text,                       -- copy of auth.users.email, kept in sync by trigger
  first_name   text check (char_length(first_name) <= 100),
  last_name    text check (char_length(last_name) <= 100),
  display_name text check (char_length(display_name) <= 100),
  avatar_path  text,                       -- Supabase Storage object path, never binary data
  phone        text check (phone ~ '^\+?[0-9 ().-]{6,20}$'),
  role         text not null default 'customer' references public.roles (key) on update cascade,
  status       text not null default 'active'
               check (status in ('active', 'suspended', 'deactivated')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table public.profiles is
  'Application profile for each auth user. Auth concerns stay in auth.users.';
comment on column public.profiles.email is
  'Read-only mirror of auth.users.email for admin listing/search. Source of truth is auth.users.';

create index profiles_role_idx on public.profiles (role);
create index profiles_email_idx on public.profiles (lower(email));

alter table public.profiles enable row level security;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- Admin check used by RLS policies.
-- SECURITY DEFINER so policies on `profiles` itself do not recurse.
-- -----------------------------------------------------------------------------
create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'admin'
      and p.status = 'active'
  );
$$;

revoke all on function private.is_admin() from public;
grant execute on function private.is_admin() to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Guard: customers may edit their own name/phone/avatar, but never their
-- role, status or email mirror. Only admins or trusted backends may.
-- -----------------------------------------------------------------------------
create or replace function private.guard_profile_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if private.is_trusted_backend() then
    return new;
  end if;

  if new.id is distinct from old.id
     or new.email is distinct from old.email
     or new.created_at is distinct from old.created_at then
    raise exception 'profiles: id, email and created_at are read-only'
      using errcode = '42501';
  end if;

  if (new.role is distinct from old.role or new.status is distinct from old.status)
     and not private.is_admin() then
    raise exception 'profiles: only administrators can change role or status'
      using errcode = '42501';
  end if;

  -- An admin cannot lock themselves out by demoting/suspending their own account.
  if new.id = auth.uid()
     and (new.role is distinct from old.role or new.status is distinct from old.status) then
    raise exception 'profiles: administrators cannot change their own role or status'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger profiles_guard_update
  before update on public.profiles
  for each row execute function private.guard_profile_update();

-- -----------------------------------------------------------------------------
-- Create a profile automatically for each new auth user.
-- Role is ALWAYS the default ('customer'): user-supplied metadata is never
-- trusted for authorization.
-- -----------------------------------------------------------------------------
create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  insert into public.profiles (id, email, first_name, last_name, display_name)
  values (
    new.id,
    new.email,
    left(nullif(trim(meta ->> 'first_name'), ''), 100),
    left(nullif(trim(meta ->> 'last_name'), ''), 100),
    left(nullif(trim(meta ->> 'display_name'), ''), 100)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_auth_user();

-- Keep the email mirror in sync when a user confirms a new address.
create or replace function private.sync_auth_user_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row
  when (new.email is distinct from old.email)
  execute function private.sync_auth_user_email();

revoke all on function private.handle_new_auth_user() from public;
revoke all on function private.sync_auth_user_email() from public;
