-- =============================================================================
-- Fix: studio_withdrawals used the designs' updated_at trigger
-- =============================================================================
-- Same mistake as 20261018110209: `private.studio_touch_updated_at()` compares
-- columns only creations and Gem Groups have, so every UPDATE of a withdrawal
-- failed (`record "new" has no field "name"`) — found by
-- tests/studio_withdrawals_validation.sql before any real withdrawal. The table
-- takes the generic trigger.
-- =============================================================================

drop trigger studio_withdrawals_touch_updated_at on public.studio_withdrawals;
create trigger studio_withdrawals_set_updated_at
  before update on public.studio_withdrawals
  for each row execute function private.set_updated_at();
