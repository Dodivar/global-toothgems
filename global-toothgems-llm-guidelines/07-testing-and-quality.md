---
name: global-toothgems-testing-quality
description: Checks to run, test levels, critical journeys, authorization tests and the definition of done.
---

# Testing & Quality

## Commands

From `webapp/` (run `npm ci` first if `node_modules` is missing):

| Check | Command | When |
| --- | --- | --- |
| Lint | `npm run lint` (oxlint) | every change |
| Unit tests | `npm test` (Vitest) | every change to `lib/` logic; run a single file with `npx vitest run <path>` |
| Type-check + build | `npm run build` | every change before committing |

Database: the `supabase/tests/*_validation.sql` suites run against a Supabase project (MCP `execute_sql`, or the SQL editor). Each is one transaction that ends by raising `ALL … TESTS PASSED` (success) or `FAIL: …` — both roll back. See `09-supabase-workflow.md`.

Not in place yet (build when the matching launch work starts): Playwright end-to-end tests for the critical journeys below, GitHub Actions CI running lint + tests + build, Deno tests for Edge Functions.

## Test levels

- **Unit (Vitest):** pure business rules and mappings — money conversion, row ↔ UI mapping, filters, validation, eligibility. Every `*Mapping.ts` has a `*.test.ts`.
- **Database (SQL suites):** RLS, constraints, triggers and functions — every migration adds or extends one. This is where money, stock, access and permissions are proven.
- **Edge Functions:** signature verification, idempotency, error paths (Stripe test events / fixtures).
- **End-to-end (Playwright):** critical journeys only; do not replace lower levels with E2E.

## Critical journeys

Commerce: browse → product → add to cart → update cart → checkout → payment success (webhook) → payment failure/cancel → order visible in account → refund reflected.

Academy: sign in → purchased course visible → open course → progress recorded → quiz evaluated with feedback → gated step locked until prerequisite → completion persisted → certificate issued.

## Authorization tests (required for every new table or function)

A customer cannot read or modify another customer's orders, progress, reviews drafts, creations, favourites, consents or files; cannot read unpublished content; cannot call staff functions. An anonymous visitor gets only public columns. A `viewer` cannot write. A suspended staff member is refused.

## UI checks

Mobile and desktop, keyboard only, loading / error / empty states, reduced motion, French and English strings present. When a check needs a running app, use the dev server (`npm run dev`) with the Supabase variables set, and say which screens you actually looked at.

## Regression rule

Every bug fix comes with a regression test when practical (unit or SQL suite).

## Definition of done

See `AGENTS.md` §16. In short: works against the real backend, authorization proven, errors handled, responsive, localized, checks run and reported honestly.
