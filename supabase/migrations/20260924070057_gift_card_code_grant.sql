-- =============================================================================
-- Migration 017 — Grant the gift card code generator to the service role
-- =============================================================================
-- create_order() runs with the caller's rights (service role) and generates
-- the code of each purchased card. Migration 016 revoked the generator from
-- PUBLIC without granting it back. Caught by the iteration 4 validation suite.
-- The function stays unreachable from browsers (private schema, no grant to
-- anon/authenticated).
-- =============================================================================

grant execute on function private.generate_gift_card_code() to service_role;
