-- =============================================================================
-- Migration 020 — fix: consent records ordered by wall-clock time
-- =============================================================================
-- now() is the transaction start time: two decisions recorded in the same
-- transaction (sign-up + a later change in one backend call) tied, and
-- member_consents picked the "latest" one at random. clock_timestamp() gives
-- every record its own instant. Caught by the iteration 5 suite (M3).
-- =============================================================================

alter table public.consent_records alter column created_at set default clock_timestamp();

create or replace function private.prepare_consent_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if private.is_trusted_backend() then
    new.created_at := coalesce(new.created_at, clock_timestamp());
    return new;
  end if;
  if new.user_id is distinct from auth.uid() then
    raise exception 'consent_records: you can only record your own consent' using errcode = '42501';
  end if;
  if new.source not in ('account', 'cookie_banner', 'checkout') then
    raise exception 'consent_records: source not allowed' using errcode = '42501';
  end if;
  new.created_at := clock_timestamp();
  return new;
end;
$$;
