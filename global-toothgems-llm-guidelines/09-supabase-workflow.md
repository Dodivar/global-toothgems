---
name: global-toothgems-supabase-workflow
description: How to change the database and server side — migrations, conventions, SQL validation suites, generated types, advisors, Edge Functions, environments.
---

# Supabase Workflow

## Project and environments

- Project: **Global Toothgems**, ref `abvuyvryerpzlvibttxp`, region `eu-west-3`, Postgres 17. It is the development project today and holds seed and demo data (`seed.sql`, `seed_demo_member.sql`).
- There is no staging or production project yet. Until the user creates one, every migration you apply lands on this single project: apply only migrations that are committed in the same turn, never experiment on it with ad-hoc DDL.
- Before launch (decision for the user): a separate production project with the same migrations, reference seed only (no demo member), its own Auth settings, SMTP, secrets and Stripe live keys.
- No Supabase CLI config is committed (`supabase/config.toml` absent). Agents work through the **Supabase MCP tools** when available; the user can also paste SQL in the dashboard.

## Changing the schema

1. **Inspect first:** the domain's section in `supabase/README.md`, the related migrations, `list_tables` / `execute_sql` (read-only queries) for the live state. Reuse existing functions and helpers (`private.has_permission`, audit triggers, `updated_at` trigger, translation pattern).
2. **Write the migration file** `supabase/migrations/<YYYYMMDDHHMMSS>_<snake_case_name>.sql`: one coherent change, commented header (purpose, rules enforced, decisions), idempotent where reasonable.
3. **Apply it** with MCP `apply_migration` (same name). Then `list_migrations` and make sure the file's version prefix equals the applied version — rename the file if the tool assigned another timestamp. Repository and project must list the same migrations in the same order.
4. **Prove it:** add `supabase/tests/iterationNN_validation.sql` (or extend the suite of the domain) and run it with `execute_sql`; success is the raised `ALL … TESTS PASSED` message, anything else is a failure. Re-run older suites your change could affect.
5. **Check advisors** (`get_advisors`, security and performance). Fix new warnings or record the accepted ones in `supabase/README.md` (decisions).
6. **Regenerate types** (`generate_typescript_types`) into `webapp/src/lib/supabase/database.types.ts`, then `npm run build` in `webapp/`.
7. **Document** in `supabase/README.md`: migrations table row, data model/rules section, decisions to review, and the "Done / Next" lists.

Never modify an already-applied migration; fix forward with a new one (`fix_…`). Never edit production data or schema from the dashboard without a committed migration.

## Conventions (keep them)

- Plural snake_case tables, `uuid` primary keys, `created_at` / `updated_at timestamptz`, `created_by` / `updated_by` where staff edit.
- Statuses as `text` + `CHECK` (no enums). Money `numeric(12,2)` + `currency char(3)`; rates in basis points; weights in grams.
- RLS enabled in the creating migration; explicit `grant`s; `anon` gets column-level grants when some columns are private.
- Functions: `set search_path = ''`, fully qualified names, `SECURITY INVOKER` by default; `SECURITY DEFINER` only with an explicit caller check and a narrow signature; helpers in `private`.
- Errors raised with meaningful SQLSTATEs (`22023` invalid input, `42501` forbidden, `PT429` rate limit) so the webapp can map them to messages.
- Personal data: never store Stripe payloads or card data; think about deletion cascade vs `set null`.

## Edge Functions (to create)

- Location: `supabase/functions/<name>/index.ts` (Deno, TypeScript), shared code in `supabase/functions/_shared/`. Commit the source; deploy with MCP `deploy_edge_function`.
- Planned: `checkout` (create order + Stripe Checkout Session), `stripe-webhook` (signature, dedup, fulfilment), `send-email` / template rendering via `email_template_for()` + Resend, `contact` and `newsletter` for visitors (captcha, IP rate limit), `account-export` and `account-delete` jobs.
- Authenticate callers from the `Authorization` JWT unless the function is a webhook (then verify the provider signature, and disable JWT verification for that function only).
- Secrets via Supabase function secrets (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `RESEND_API_KEY`, …) — never in the repo; document each required secret name in `supabase/README.md`.
- Return generic errors to clients; log details server-side.

## Storage

Buckets and their policies are created by migration. Path convention `<user_id>/…` for private per-user buckets, `products/<slug-or-id>/…` for catalogue media. Private objects are served by signed URLs.

## Scheduled jobs

`expire_stale_orders()` every 5 minutes and export cleanup must be scheduled (pg_cron via migration once the extension is enabled, or a scheduled Edge Function). Not scheduled yet.

## Safety

- Read-only exploration: `execute_sql` with `select` only. Anything that writes goes through a migration or a validation suite that rolls back.
- Never run destructive statements (`drop`, `truncate`, mass `delete`/`update`) on the project without the user's explicit approval in the session.
- Never print keys or tokens returned by tools into commits, docs or messages.
