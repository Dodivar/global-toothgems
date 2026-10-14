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
| Type-check | `npm run typecheck` (app, then `e2e/` and tool configs) | every change |
| Build | `npm run build` (`next build`, type-checks the app too) | every change before committing |
| Smoke tests (Playwright) | `npm run test:e2e` (`npm run test:e2e:smoke` for the critical subset) | every change to routing, rendering, auth plumbing, layout or build configuration; before and after each Next.js migration step |
| Coverage | `npm run test:coverage` | before pushing a change to `lib/`; CI fails under the floor |
| Edge Functions | `npm run test:functions` (Deno 2) | every change to `supabase/functions/` |
| SQL suites (local) | `npm run test:db` after `supabase start` | every migration; CI runs them all |
| Live E2E | `npm run test:e2e:live` (local stack, `.env.test.example`) | changes to auth, RLS-dependent screens, orders |

Database: the `supabase/tests/*_validation.sql` suites run against a Supabase project (MCP `execute_sql`, or the SQL editor). Each is one transaction that ends by raising `ALL … TESTS PASSED` (success) or `FAIL: …` — both roll back. See `09-supabase-workflow.md`.

The Playwright smoke tests (`webapp/e2e/`) run the app in mock mode (Supabase variables forced empty) and check that every public route renders its heading without console errors, failed same-origin requests or redirects; the cart; mock sign-in and registration; and that `/compte` and `/admin` send a signed-out visitor to their sign-in pages. They are the reference for the Next.js migration (`docs/migration-nextjs.md`): they must pass before and after every step. They start `npm run dev` themselves; `E2E_BASE_URL` points them at an already running server instead. `server-rendering.spec.ts` checks that public pages send their content in the HTML and hydrate without a mismatch, also for a returning visitor with saved choices (React reports a mismatch as a console error, which fails any smoke test). `zones.spec.ts` covers the private zones: every member-space, learner and back-office screen for a signed-in demo session (written to sessionStorage before the page loads), links between pages and zones as client-side navigations (a marker set on `window` survives them), the cart kept across zones, the return to the page asked for after sign-in, `/connexion-b` moved by the server and the Studio's former aliases answering 404, and that public pages do not download the back office's code. `src/lib/privateSegments.test.ts` (Vitest) checks that every page the proxy gates also checks the session in its layout and in the page itself. `locale.spec.ts` covers the language in the address (English pages, `/` negotiation, old addresses, 404 status, `<head>`, sitemap, the FR/EN switch and the back button). A second project, `auth-server` (`e2e/auth-server.spec.ts`), checks the server-side auth plumbing — proxy redirects and the zones' server-side refusals, `/auth/confirm` success and failure paths, a forged cookie refused, the cookie session read by the browser, per-language product slugs (308/404, hreflang, sitemap, server-rendered product page) — against `e2e/support/fake-supabase.mjs`, a local stand-in for the few Supabase Auth endpoints involved, on its own dev server (`E2E_AUTH_BASE_URL` to target another). A third project, `auth-cache` (`e2e/auth-cache.spec.ts`), counts the server's catalogue reads on the fake Supabase; it runs after `auth-server` has finished, since that counter sees every test's reads. Never against a real Supabase project. Chromium: `npx playwright install chromium` locally; cloud sessions use the preinstalled `/opt/pw-browsers/chromium` (picked up automatically, never run `playwright install` there).

Since 2026-10-14 (operating manual: `docs/testing.md`):

- **CI** (`.github/workflows/ci.yml`) runs on every push to `dev`/`main` and every pull request: lint + type-check, unit tests with coverage thresholds (`npm run test:coverage`, floor in `vitest.config.ts`), `deno test` + `deno check` of the Edge Functions, every migration applied to an empty local Supabase stack and every SQL suite (`supabase/tests/run.mjs`), `next build`, the Playwright suites above (smoke first), and the live suite below. The `CI result` job passes only when every job succeeded; it is the one check branch protection should require. No repository secret is used.
- **Live E2E** (`webapp/e2e-live/`, `npm run test:e2e:live`): the app against a local Supabase stack (migrations + `seed.sql` + `seed_demo_member.sql`) — catalogue from Postgres, real sign-in / sign-out, registration persisted, customer refused from `/admin` and from staff functions, another customer's order invisible through the UI and through the API. Refuses to run without the stack's values or against a non-local address.
- Never lower a coverage threshold or delete a test to make CI pass; raise the floor when you add tests.

Not in place yet: paying end to end (no Stripe keys in CI; covered by SQL suites + `deno test`), live journeys for the Academy learner path, the Members' Lounge and back-office edits.

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
