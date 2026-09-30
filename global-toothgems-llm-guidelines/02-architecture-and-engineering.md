---
name: global-toothgems-architecture-engineering
description: Production architecture, runtime boundaries, the mock-to-live migration pattern, environments, dependencies and engineering standards.
---

# Architecture & Engineering

## Priorities

1. correctness; 2. security; 3. maintainability; 4. accessibility; 5. performance; 6. developer experience.

## Runtime boundaries

| Layer | Owns | Never |
| --- | --- | --- |
| **Browser** (`webapp/`, Vite SPA on Vercel) | presentation, navigation, form UX, optimistic display, calls to Supabase with the user's JWT | holds a secret, decides a price, a permission, a payment or an entitlement |
| **Postgres** (tables, RLS, functions, triggers) | business invariants: prices and totals, stock, discounts, VAT, entitlements, moderation, audit, permissions | trusts a value the client could forge without re-checking it |
| **Edge Functions** (`supabase/functions/`, Deno) | anything needing a secret or the service role: Stripe Checkout sessions, Stripe webhooks, refunds, e-mail sending, visitor forms with captcha/IP limits, GDPR export/deletion jobs | contain business rules that Postgres already enforces (call the function instead) |
| **Stripe** | payment state, card data, subscriptions | is bypassed by a browser redirect |

Rules of thumb:

- If the logic protects money, stock, access or permissions → Postgres function or Edge Function.
- A browser call that writes more than one row, or whose result must be consistent, goes through one RPC (`admin_save_product()` is the model: one transaction, `SECURITY INVOKER` so RLS applies, permission checked inside).
- `SECURITY DEFINER` functions are the exception: they authorize the caller themselves, live behind a narrow signature and are listed in `supabase/README.md` as accepted advisor warnings.
- Scheduled work (order expiry, export cleanup) runs with `pg_cron` or a scheduled Edge Function — never from a browser.

## Front-end structure (`webapp/src/`)

- `pages/` one component per route; `components/<domain>/` presentational pieces; `components/ui/` and `components/admin/` shared primitives.
- `lib/<domain>.tsx` one store/context per domain — the only place a domain's data changes. Screens never import the Supabase client directly.
- `lib/*Mapping.ts` pure row ↔ UI conversions (money to minor units, locale fallback, statuses), unit-tested.
- `lib/supabase/` typed client (`client.ts`), generated `database.types.ts`, storage helpers.
- `data/` legacy mock fixtures and static content — shrinking as domains go live.
- `i18n/locales/` UI strings per namespace (`fr`, `en`).

## Mock → live pattern

Many domains still have two implementations behind one contract (`lib/adminCatalog.tsx` picking `adminCatalogSupabase.tsx` or the mock store; `lib/studioWorkspace/` repositories). When wiring a domain:

1. Read the domain's section in `supabase/README.md`: the schema and functions usually already exist. Do not duplicate their rules in TypeScript.
2. Implement the Supabase store behind the existing contract; map rows in a pure, tested mapping module; use the generated types.
3. Handle loading, empty, error and permission-refused states with localized messages; never fall back to mock data on error.
4. Remove the mock path for that domain (fixtures, prototype controls, demo switches, simulated latency) unless the user asks to keep a design-review mode — and then it must be impossible to reach in a production build.
5. Update `AGENTS.md` §4 domain status, `webapp/README.md` and `supabase/README.md`.

Mock-only code that remains must never look real to a customer: no fake payment success, no fabricated order, no invented figures.

## Environments and configuration

- Browser configuration: only `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` (`webapp/.env.example`, Vercel project settings). Anything else secret is an Edge Function secret.
- Supabase: today a single project, "Global Toothgems" (`abvuyvryerpzlvibttxp`), used for development and holding seed/demo data. Production needs its own project (or an explicit, documented promotion of this one) — see `09-supabase-workflow.md`.
- Stripe: test mode keys everywhere until the owner provides production keys; test and live never mixed in one environment.
- Vercel: root directory `webapp`, SPA rewrite in `webapp/vercel.json`; preview deployments per branch.

## Data model

Explicit relational models, not blobs. Invariants that must always hold:

- money is exact (`numeric(12,2)` + currency in Postgres, integer minor units in TypeScript/Stripe) — never floats;
- order totals are reproducible from the order's own snapshots;
- purchased access (courses, Studio subscription) is an auditable entitlement record;
- progress, review status and publication states are server-side facts.

## Error handling

User-facing errors are understandable, localized and never expose internals (SQL, stack traces, provider messages, internal ids). Log diagnostic context server-side (Edge Function logs, Sentry once installed). Preserve user input on a failed save.

## Performance

Optimize real bottlenecks: product images (sizes, lazy loading), course videos, public page load on mobile networks, checkout. Keep heavy code lazy-loaded (three.js is only loaded by the Studio routes; admin and Academy player bundles should not weigh on the storefront). Query only needed columns; one PostgREST query with embedded relations rather than N round trips.

## Dependencies

Before adding one: can the stack do it? Is it maintained? What is its security and bundle cost? Keep its use narrow. No dependency for trivial helpers. New infrastructure (another backend, database, CMS, auth or commerce engine) needs an explicit user decision.

## Code quality

Small cohesive modules, explicit names, typed interfaces, pure domain functions with tests, predictable control flow. No giant components, duplicated business rules, magic numbers, implicit global state or speculative abstractions. Do not rewrite unrelated areas; improve the smallest surface needed to deliver safely.

Known debt worth fixing when touched: the admin orders screens use their own `components/ui/Dialog.tsx` / `Menu.tsx` instead of the admin workspace primitives (`ConfirmationDialog`, `OverflowMenu`, `useFocusTrap`).
