-- =============================================================================
-- Newsletter sign-up for visitors: per-address throttle of the Edge Function
-- =============================================================================
-- The storefront's newsletter form calls the Edge Function `newsletter-subscribe`
-- (newsletter_subscribe() is service role only, and the Next.js server must not
-- hold that key). Before doing any work, the function calls this with a hash of
-- the caller's IP: 10 attempts per hour. newsletter_subscribe() keeps its own
-- limit per e-mail (3 per hour) on top, so one address cannot be flooded with
-- confirmation e-mails and one caller cannot sign up a list of strangers.
-- Same shape as contact_ip_allowed() (migration 20261008175722).
-- =============================================================================

create or replace function public.newsletter_ip_allowed(p_ip_hash text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select private.hit_rate_limit('newsletter_ip', p_ip_hash, 10, interval '1 hour');
$$;

comment on function public.newsletter_ip_allowed(text) is
  'Throttle of the visitor newsletter form by caller address (hash): 10 per hour. Service role only.';

revoke all on function public.newsletter_ip_allowed(text) from public, anon, authenticated;
grant execute on function public.newsletter_ip_allowed(text) to service_role;
