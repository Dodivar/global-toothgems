---
name: global-toothgems-architecture-engineering
description: Production architecture, runtime boundaries, the mock-to-live migration pattern, environments, dependencies and engineering standards.
---

# Architecture & Engineering

## Priorities

1. correctness; 2. security; 3. maintainability; 4. accessibility; 5. performance; 6. developer experience.

## Framework decision (2026-09-30)

`webapp/` is migrating from Vite + React Router to **Next.js App Router, deployed on Vercel**. This replaces the "Vite SPA, no Next.js" decision introduced by commit `1c73d35`.

- **Why:** public pages (home, shop, product, Academy sales pages, legal, help) need server rendering, per-route metadata, canonical/Open Graph tags and real HTTP status codes for search engines and social previews; member and back-office routes need protection on the server (middleware — `proxy.ts` since Next.js 16 — refreshing the Supabase session with `@supabase/ssr`) rather than only client-side guards.
- **Unchanged:** Supabase (schema, RLS, the migrations, Auth and its users), Edge Functions for Stripe, e-mail and service-role jobs, react-i18next for UI strings while the migration runs (moving to next-intl is a separate, undecided step), Tailwind v4 and the design tokens, Vitest.
- **How:** phases tracked in `docs/migration-nextjs.md` — (1) the existing app runs unchanged in a catch-all client page, (2) auth with `@supabase/ssr` + middleware, (3) public pages as server-rendered App Router routes with SEO, (4) account, back office and Studio as App Router routes, (5) removal of React Router and SPA-only code. Every session touching `webapp/` routing or rendering reads that file first and updates its checklist.
- **Open decisions (ask the user):** locale URL format, Supabase Auth redirect URLs when the auth flow changes, the Vercel project switch (done by the user).

## Runtime boundaries

| Layer | Owns | Never |
| --- | --- | --- |
| **Browser** (`webapp/` client components) | presentation, navigation, form UX, optimistic display, calls to Supabase with the user's JWT | holds a secret, decides a price, a permission, a payment or an entitlement |
| **Next.js server** (`webapp/app/` Server Components, middleware, Route Handlers on Vercel) | rendering and metadata of pages, session-cookie refresh and route protection (`@supabase/ssr`), reads with the publishable key under the visitor's RLS | holds the service-role key or a provider secret; takes over Stripe, webhooks, e-mail or service-role jobs from Edge Functions without an explicit decision; is treated as the authorization layer (RLS is) |
| **Postgres** (tables, RLS, functions, triggers) | business invariants: prices and totals, stock, discounts, VAT, entitlements, moderation, audit, permissions | trusts a value the client could forge without re-checking it |
| **Edge Functions** (`supabase/functions/`, Deno) | anything needing a secret or the service role: Stripe Checkout sessions, Stripe webhooks, refunds, e-mail sending, visitor forms with captcha/IP limits, GDPR export/deletion jobs | contain business rules that Postgres already enforces (call the function instead) |
| **Stripe** | payment state, card data, subscriptions | is bypassed by a browser redirect |

Rules of thumb:

- If the logic protects money, stock, access or permissions → Postgres function or Edge Function.
- A browser call that writes more than one row, or whose result must be consistent, goes through one RPC (`admin_save_product()` is the model: one transaction, `SECURITY INVOKER` so RLS applies, permission checked inside).
- `SECURITY DEFINER` functions are the exception: they authorize the caller themselves, live behind a narrow signature and are listed in `supabase/README.md` as accepted advisor warnings.
- Scheduled work (order expiry, export cleanup) runs with `pg_cron` or a scheduled Edge Function — never from a browser.

## Front-end structure (`webapp/`)

- `app/` Next.js App Router: the root layout and, during the migration, the catch-all client page `app/[[...slug]]` that runs the React Router app; migrated routes get their own App Router segments here.

- `src/pages/` one component per route (React Router screens, moved to `app/` route by route); `components/<domain>/` presentational pieces; `components/ui/` and `components/admin/` shared primitives.
- `src/lib/<domain>.tsx` one store/context per domain — the only place a domain's data changes. Screens never import the Supabase client directly.
- `src/lib/*Mapping.ts` pure row ↔ UI conversions (money to minor units, locale fallback, statuses), unit-tested.
- `src/lib/supabase/` typed client (`client.ts`), generated `database.types.ts`, storage helpers.
- `src/data/` legacy mock fixtures and static content — shrinking as domains go live.
- `src/i18n/locales/` UI strings per namespace (`fr`, `en`).

## Mock → live pattern

Many domains still have two implementations behind one contract (`lib/adminCatalog.tsx` picking `adminCatalogSupabase.tsx` or the mock store; `lib/studioWorkspace/` repositories). When wiring a domain:

1. Read the domain's section in `supabase/README.md`: the schema and functions usually already exist. Do not duplicate their rules in TypeScript.
2. Implement the Supabase store behind the existing contract; map rows in a pure, tested mapping module; use the generated types.
3. Handle loading, empty, error and permission-refused states with localized messages; never fall back to mock data on error.
4. Remove the mock path for that domain (fixtures, prototype controls, demo switches, simulated latency) unless the user asks to keep a design-review mode — and then it must be impossible to reach in a production build.
5. Update `AGENTS.md` §4 domain status, `webapp/README.md` and `supabase/README.md`.

Mock-only code that remains must never look real to a customer: no fake payment success, no fabricated order, no invented figures.

## Environments and configuration

- Browser configuration: only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (`webapp/.env.example`, Vercel project settings). `NEXT_PUBLIC_*` values are inlined into the client bundle: never a secret there. Anything else secret is an Edge Function secret.
- Supabase: today a single project, "Global Toothgems" (`abvuyvryerpzlvibttxp`), used for development and holding seed/demo data. Production needs its own project (or an explicit, documented promotion of this one) — see `09-supabase-workflow.md`.
- Stripe: test mode keys everywhere until the owner provides production keys; test and live never mixed in one environment.
- Vercel: root directory `webapp`, framework preset Next.js (no rewrite file: the catch-all route serves every path); preview deployments per branch.

## Data model

Explicit relational models, not blobs. Invariants that must always hold:

- money is exact (`numeric(12,2)` + currency in Postgres, integer minor units in TypeScript/Stripe) — never floats;
- order totals are reproducible from the order's own snapshots;
- purchased access (courses, Studio subscription) is an auditable entitlement record;
- progress, review status and publication states are server-side facts.

## Error handling

User-facing errors are understandable, localized and never expose internals (SQL, stack traces, provider messages, internal ids). Log diagnostic context server-side (Edge Function logs, Sentry once installed). Preserve user input on a failed save.

## Performance

Optimize real bottlenecks: product images (sizes, lazy loading), course videos, public page load on mobile networks, checkout. Keep heavy code lazy-loaded and client-only (three.js is only loaded by the Studio routes and never rendered on the server; admin and Academy player bundles should not weigh on the storefront). Query only needed columns; one PostgREST query with embedded relations rather than N round trips.

## Dependencies

Before adding one: can the stack do it? Is it maintained? What is its security and bundle cost? Keep its use narrow. No dependency for trivial helpers. New infrastructure (another backend, database, CMS, auth or commerce engine) needs an explicit user decision.

## Code quality

Small cohesive modules, explicit names, typed interfaces, pure domain functions with tests, predictable control flow. No giant components, duplicated business rules, magic numbers, implicit global state or speculative abstractions. Do not rewrite unrelated areas; improve the smallest surface needed to deliver safely.

Known debt worth fixing when touched: the admin orders screens use their own `components/ui/Dialog.tsx` / `Menu.tsx` instead of the admin workspace primitives (`ConfirmationDialog`, `OverflowMenu`, `useFocusTrap`).
