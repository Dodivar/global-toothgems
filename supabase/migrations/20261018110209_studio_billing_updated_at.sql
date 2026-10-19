-- =============================================================================
-- Fix: subscription tables used the designs' updated_at trigger
-- =============================================================================
-- `private.studio_touch_updated_at()` is the trigger of creations and Gem
-- Groups: it compares `name`, `description`, `tags`... and fails on any table
-- without those columns. Migration 20261017103101 attached it to
-- `studio_subscriptions` (and 20261018102741 to `studio_plan_prices` and
-- `studio_subscription_invoices`), so every UPDATE of those rows failed with
-- `record "new" has no field "name"` — found by the first test-mode
-- subscription (its second webhook event). They take the generic trigger.
-- =============================================================================

drop trigger studio_subscriptions_touch_updated_at on public.studio_subscriptions;
create trigger studio_subscriptions_set_updated_at
  before update on public.studio_subscriptions
  for each row execute function private.set_updated_at();

drop trigger studio_plan_prices_touch_updated_at on public.studio_plan_prices;
create trigger studio_plan_prices_set_updated_at
  before update on public.studio_plan_prices
  for each row execute function private.set_updated_at();

drop trigger studio_subscription_invoices_touch_updated_at on public.studio_subscription_invoices;
create trigger studio_subscription_invoices_set_updated_at
  before update on public.studio_subscription_invoices
  for each row execute function private.set_updated_at();
