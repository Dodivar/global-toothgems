# Testing and CI

How Global Toothgems is tested, how to run each suite locally, and what the CI quality gate (`.github/workflows/ci.yml`) enforces. The rules (what to test at which level, authorization tests required for every table) live in `global-toothgems-llm-guidelines/07-testing-and-quality.md`; this page is the operating manual.

## Layers

| Layer | Tool | Where | What it proves | Backend |
| --- | --- | --- | --- | --- |
| Unit | Vitest | `webapp/src/**/*.test.ts` | Pure rules: money, cart lines, quotes, promotions, reviews, registration validation, grading, mappings, routes | none |
| Edge Functions | `deno test` | `supabase/functions/**/*_test.ts` | Checkout, Stripe webhook (signatures made by the real Stripe SDK, replays, idempotency), refunds, e-mails, contact form | injected fakes |
| Database integration | SQL suites | `supabase/tests/*_validation.sql`, run by `supabase/tests/run.mjs` | RLS, grants, triggers, `create_order()`, totals, VAT, stock, promotions, gift cards, invoices, refunds, Academy access and grading, staff permissions | local Supabase stack |
| E2E smoke + routes | Playwright | `webapp/e2e/` (`playwright.config.ts`) | Every public route renders without console errors, server rendering + hydration, cart, zones, locale addresses, mock sign-in | mock mode |
| E2E auth plumbing | Playwright | `webapp/e2e/auth-server.spec.ts` | Proxy redirects, `/auth/confirm`, forged cookies refused, per-language slugs | `e2e/support/fake-supabase.mjs` |
| E2E live | Playwright | `webapp/e2e-live/` (`playwright.live.config.ts`) | Catalogue read from Postgres, real sign-in / sign-out / wrong password, registration persisted, customer refused from `/admin` and from staff functions, staff access, another customer's order invisible (UI **and** API) | local Supabase stack |

Money, stock, access and permissions are decided in Postgres, so the SQL suites are where pricing and authorization are proven; the live E2E suite checks that the application wires them together, and re-checks each refusal against the API with the account's own token (a hidden button proves nothing).

## Running the suites

From `webapp/` (Node 24; `npm ci` here **and** at the repository root, whose `@vercel/speed-insights` the app imports):

| Command | Needs |
| --- | --- |
| `npm run lint` · `npm run typecheck` | — |
| `npm test` · `npx vitest run src/lib/promotionRules.test.ts` | — |
| `npm run test:coverage` (report in `webapp/coverage/index.html`) | — |
| `npm run test:e2e:smoke` (public routes, sign-in, cart) | `npx playwright install chromium` once |
| `npm run test:e2e` (every mock and fake-Auth project) | same |
| `npm run test:functions` | [Deno 2](https://deno.com) on the PATH |
| `npm run test:db` · `npm run test:db -- mvp lounge` | Docker + Supabase CLI, `supabase start` |
| `npm run test:e2e:live` | the local stack, the variables of `.env.test.example`, seed_demo_member.sql applied |
| `npm run ci` | lint, type-check, coverage, build and `test:e2e` in a row: the stages of CI that need no Docker |

### Local Supabase stack (database and live suites)

From the repository root, with Docker running:

```bash
supabase start
```

That applies every migration in `supabase/migrations/` to an empty database, then `supabase/seed.sql` (catalogue, shipping, VAT). The live suite also needs the demo member, who owns real orders built through `create_order()`:

```bash
docker exec -i supabase_db_global-toothgems psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/seed_demo_member.sql
```

Then `supabase status -o env` gives the values to export as `E2E_SUPABASE_URL`, `E2E_SUPABASE_PUBLISHABLE_KEY` and `E2E_SUPABASE_SERVICE_KEY` (see `webapp/.env.test.example`). `supabase db reset` starts again from scratch. The stack is local and disposable: never point these suites at the hosted project — `run.mjs` and `e2e-live/env.ts` refuse any host other than localhost.

### Test data

- **SQL suites** create their own users, products and orders inside one transaction that always rolls back (they end by raising `ALL … TESTS PASSED` or `FAIL: …`); the runner adds its own `begin;` and never commits, so nothing persists and the suites are independent of order.
- **Live E2E**: `e2e-live/global-setup.ts` creates `e2e.customer@example.com` and `e2e.staff@example.com` (role `admin`) and gives them and the seeded demo member a password generated for that run, which only travels in the environment. The registration test deletes the account it creates in a `finally`. Re-running against the same stack is safe (accounts are reused, passwords reset).
- **Mock suites** carry their data in the app's mock stores; the demo member session is written to `sessionStorage` before the page loads (`e2e/zones.spec.ts`).

## Debugging a failure

- Playwright keeps a trace for every failed test: `npx playwright show-trace webapp/test-results/<test>/trace.zip` (live suite: `test-results-live/`, plus an HTML report in `playwright-report-live/`). In CI they are uploaded as the `e2e-traces` / `e2e-live-report` artifacts of the run.
- `npx playwright test e2e/cart.spec.ts --headed --debug` steps through one file.
- A smoke test fails on any console error, uncaught exception or failed same-origin request: the assertion message lists them.
- A SQL suite failure prints the last lines psql wrote, starting with the `FAIL Tnn: …` it raised.
- Coverage: `coverage/index.html` shows each file's uncovered lines. The floor is in `webapp/vitest.config.ts`.

## CI (`.github/workflows/ci.yml`)

Runs on every push to `dev` and `main`, every pull request to `main` or `dev`, and on demand (`workflow_dispatch`). A newer push cancels the older run of the same branch.

| Job | Fails when |
| --- | --- |
| Lint and type-check | an oxlint error, a type error (app, e2e, configs), stale generated document copies |
| Unit tests and coverage | a failed test, no test found, a coverage threshold missed |
| Edge Functions (Deno) | a failed `deno test`, a deployed entry point that does not type-check |
| Database (migrations + SQL suites) | a migration that does not apply to an empty database, or any SQL suite without its success marker |
| Production build | `next build` fails |
| E2E (smoke, then full) | any smoke test, then any test of the full suite (after one retry) |
| E2E live (local Supabase stack) | any live test (after one retry); a missing configuration stops it before the first test |
| **CI result** | any job above did not succeed (failed, cancelled **or skipped**) |

Safety: the workflow runs on `pull_request` (never `pull_request_target`) with a read-only token and uses **no repository secret**. Every backend is local to the runner: a Supabase stack started from `supabase/`, whose pg_cron jobs are unscheduled before the tests, the fake Auth server, no Stripe and no e-mail provider. Checkout tests therefore cannot initiate a payment: the Stripe Edge Functions are tested with `deno test` and fakes, and the live suite stops before payment. Actions are pinned to commit SHAs.

Retries: one retry in CI for the Playwright suites only (a test that passes on retry is reported as flaky in the run summary — investigate it, do not raise the count). No retry for unit, Deno or SQL tests.

### Branch protection (repository settings — to be set by the maintainer)

Settings → Rules → Rulesets → New branch ruleset, target `main` (and `dev` if pull requests are used there):

- **Require status checks to pass**: add `CI result` only (it already depends on every job). Tick "Require branches to be up to date before merging".
- **Require a pull request before merging**; **Block force pushes**; **Restrict deletions**.

Until this is set, a red CI does not block a merge.

## Coverage policy

The coverage of `src/lib/**/*.ts` (domain logic; screens and components are covered by Playwright) was 47.7 % of lines / 49.8 % of branches before this work and 49.7 % / 52.9 % after it (2026-10-14). The global thresholds sit just under the measured value; the modules that compute money, cart lines, quotes, course prices and grading have their own, stricter floor. Raise the numbers when tests are added — never lower them to make a run pass. Coverage is a measurement: a critical rule still needs a test asserting its outcome and its refusals.

## Adding tests for a new feature

1. Business rule in TypeScript → a `*.test.ts` beside it (table-driven for limits: just below, at, just above).
2. New table, RLS policy or database function → extend or add a `supabase/tests/<domain>_validation.sql` suite (another user refused, anonymous refused, staff permission checked). It is picked up by the runner automatically.
3. Edge Function → `handler_test.ts` with injected fakes.
4. A journey a customer or staff member depends on → a Playwright test: in `e2e/` when mock mode can show it, in `e2e-live/` when it must go through Auth and RLS.

## Known gaps

- Payment is not exercised end to end: CI has no Stripe test keys and the Edge Functions are not served in the live stack. `create_order()` / `mark_order_paid()` / refunds are proven by the SQL suites, the webhook by `deno test`.
- No live E2E yet for the Academy learner journey (needs a course and an entitlement seeded), the Members' Lounge, or back-office edits (product creation reflected on the storefront).
- Visitor uploads, e-mail delivery and Realtime are not exercised against a running service.
