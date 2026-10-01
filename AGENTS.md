# Global Toothgems — AI Agent Instructions

Root operating contract for AI coding agents working in this repository. It is loaded into every session: keep it short, factual and current. Detail lives in `global-toothgems-llm-guidelines/` and the two READMEs, read on demand (§3).

## 1. Mission and current phase

Global Toothgems is a premium but approachable e-commerce and online-training platform for tooth gems and professional education (FR/EN, EU customers, one account for shop and Academy).

**Phase: industrialisation towards the first production launch.** The storefront, member area and back office already exist as a React application; the database is real (Supabase, 35+ migrations). The job now is to replace every remaining mock/in-memory behaviour with the real Supabase-backed one, add the missing server side (Stripe, e-mails, jobs), and make the whole thing operable in production.

Consequences for every task:

- Build production software. Never produce a mockup, a "visual prototype", simulated data or a fake success path as the deliverable, unless the user explicitly asks for a throwaway mockup in this session.
- When you touch a screen that still runs on mock data (§4, "Domain status"), the expected direction is to connect it to Supabase, not to extend the mock.
- A feature is not finished because it renders; it is finished when it works against the real database with real authorization (§16).

## 2. Instruction hierarchy

1. Explicit instructions from the user for the current task.
2. This `AGENTS.md`.
3. `global-toothgems-llm-guidelines/` (detailed rules per domain).
4. `supabase/README.md` and `webapp/README.md` (what exists and why — descriptive, not normative).
5. Existing code conventions, then general best practice.

If two sources conflict, prefer the more specific and more recent documented decision, say which one you followed, and flag it to the user. Do not silently pick one.

## 3. Where to read (context routing)

Read only what the task needs (`guidelines/` below = `global-toothgems-llm-guidelines/`). The READMEs are long (~600–800 lines): open them by section (`grep -n '^##' <file>`), not in full.

| Task touches | Read first |
| --- | --- |
| Anything non-trivial | this file, then `global-toothgems-llm-guidelines/README.md` (index) |
| Scope ("should this exist / is it launch-critical?") | `guidelines/01-scope-and-launch.md` |
| Architecture, runtime boundaries, mock → live | `guidelines/02-architecture-and-engineering.md` |
| Routing, rendering, auth plumbing, build config (Next.js migration) | `docs/migration-nextjs.md`, then `guidelines/02` |
| Visual design, components, accessibility | `guidelines/03-ui-ux-design-system.md`, `webapp/src/index.css` tokens |
| Catalogue, cart, checkout, Stripe, orders, promotions, gift cards | `guidelines/04-ecommerce-rules.md`, `supabase/README.md` (Checkout flow, Promotions, Gift cards) |
| Academy, courses, progress, quizzes | `guidelines/05-learning-platform-rules.md` |
| Auth, roles, RLS, uploads, personal data | `guidelines/06-security-privacy.md`, `supabase/README.md` (Security, roles) |
| Tests and checks | `guidelines/07-testing-and-quality.md` |
| Translations, copy, SEO | `guidelines/08-content-and-localization.md` |
| Schema, migrations, RPC, Storage, Edge Functions | `guidelines/09-supabase-workflow.md`, `supabase/README.md` (Migrations, Data model, Deliberate decisions) |
| How to plan, report, commit | `guidelines/10-agent-workflow.md`, §14 below |
| A given screen or store | the matching `webapp/README.md` section, then the code |

## 4. Production architecture (decided)

```
Browser + Vercel  webapp/  Next.js (App Router) + React 19 + TypeScript, deployed on Vercel
   │  supabase-js with the PUBLISHABLE key only; every read/write authorised by RLS
   ▼
Supabase (project "Global Toothgems", eu-west-3) — unchanged by the Next.js migration
   ├─ Postgres: tables + RLS + SECURITY INVOKER/DEFINER functions = the business logic
   ├─ Auth: the only identity system (customers and staff)
   ├─ Storage: public product-media; private buckets for everything personal or paid
   └─ Edge Functions (Deno): the server code holding secrets — Stripe Checkout, Stripe
      webhooks, transactional e-mail, visitor forms (captcha/IP limit), service-role jobs
Stripe  payment source of truth; fulfilment only from verified, idempotent webhooks
```

**Decision (2026-09-30): `webapp/` moves from Vite + React Router to Next.js App Router on Vercel.** It replaces the earlier "Vite SPA, no Next.js" decision. Why: public pages (home, shop, products, Academy sales pages, legal, help) need server rendering and per-route metadata for search engines and social previews, and member/back-office routes need server-side protection (middleware + `@supabase/ssr`) instead of client-only guards. What does not change: Supabase (schema, RLS, migrations, Auth), Stripe and e-mail server code in Edge Functions, react-i18next for UI strings during the migration (next-intl is not decided).

- **The migration ran in five phases, recorded in [`docs/migration-nextjs.md`](docs/migration-nextjs.md) (done on 2026-09-30; React Router is gone).** Read it before touching routing, rendering, auth plumbing or build configuration in `webapp/`. Every screen is its own App Router segment importing its own `"use client"` screen module (`webapp/src/screens/`): public pages under `app/(public)/fr/…` and `app/(public)/en/…` (`publicScreen`), rendered on the server and hydrated; sign-in, recovery and system pages under `app/(public)`, rendered in the browser; the member space (`app/compte`), learner pages (`app/academy/(learner)`), back office (`app/admin`) and Studio workspace (`app/studio-3d`) in the browser only, under server layouts that turn signed-out visitors away and pages that check again (`zoneScreen`). The stores live in the root layout (`src/AppProviders.tsx`); links go through `src/lib/navigation` (next/link + next/navigation, internal French paths), so moving between pages keeps them.
- Next.js server code (Server Components, middleware, Route Handlers) renders pages, refreshes the Supabase session cookie, protects routes and reads public data with the publishable key. It never holds the service-role key or a provider secret and does not take over what Edge Functions own (payments, webhooks, e-mail, service-role jobs) without an explicit user decision. No other backend framework, database, auth provider, CMS, LMS or commerce engine without an explicit user decision.
- Business rules that protect money, stock, access or permissions live in Postgres (functions, constraints, triggers, RLS) or in Edge Functions — never only in the browser or in a page. Front-end and middleware checks are UX and navigation; RLS is the authority.
- The service-role key and every provider secret exist only in Edge Function secrets / Supabase — never in `NEXT_PUBLIC_*` variables (Next.js inlines them into the public bundle).
- Decided by the user (2026-09-30): e-mail links land on `/auth/confirm` (server route opening the session, phase 2); public pages are prefixed `/fr/…` and `/en/…` with English segments (`/fr/boutique` ↔ `/en/shop`), `/` goes to the saved choice, else the browser's language, else English; the member space, sign-in and the back office are not prefixed (phase 3.1, done). The address table is `webapp/src/lib/localeRoutes.ts`: add every new public page there, in both languages, with its segment in each language. Screens keep writing French paths internally (`src/lib/navigation` writes the address). Decided by the owner (2026-09-30): product slugs per language (`/fr/boutique/<products.slug>`, `/en/shop/<product_translations.slug>`), other keys moved (308), unknown slugs 404 (phase 3.2, done).
- Sessions live in cookies (`@supabase/ssr`); `webapp/proxy.ts` refreshes them and turns signed-out visitors away from `/compte`, the learner pages and `/admin` before anything is sent, and, for `/admin`, a signed-in account that is not an active staff member too (decided 2026-10-01; `webapp/src/lib/staffProfile.ts`).
- Still the user's call, never improvise: Vercel project settings and the Supabase Auth dashboard settings (redirect allow-list, e-mail templates; both set by the user on 2026-09-30), the English wording of new public addresses, and the open points of `docs/migration-nextjs.md`.

### Domain status (update this table when a domain goes live)

| Domain | UI | Database | State |
| --- | --- | --- | --- |
| Catalogue, categories/families, gem colours, variants, recommendations | storefront + back office | yes | **Live** |
| Customer & staff auth (sign-up, sign-in, recovery, email/password change) | yes | yes | **Live** (Google sign-in, data export and account deletion not wired). Next.js side (cookie sessions, proxy, `/auth/confirm`) live since 2026-09-30 (Vercel switched, Supabase dashboard settings applied by the user) |
| Favourites, reviews + moderation, member & admin order reading | yes | yes | **Live** |
| Studio 3D workspace (creations, Gem Groups, share links) | yes | yes | **Live** (subscription/paywall not built: preview access) |
| Cart, checkout, payment, order creation | yes | `create_order`, `mark_order_paid`, webhook log, `checkout_session_status` | **Built, not deployed** — Edge Functions `create-checkout-session` + `stripe-webhook`, cart in minor units, Stripe return page; migration `20260930200000` and functions await the user's go-ahead (test mode). Codes / gift cards not in the cart UI, no confirmation e-mail |
| Promotions, gift cards, loyalty | yes | yes | **Mock UI** over a ready schema |
| Admin users & roles (`/admin/utilisateurs`: team, invitations, role, suspension, permission matrix) | yes | yes (`staff_directory()`, `my_permissions()`, Edge Function `invite-staff-member`) | **Built** (2026-10-01): screen on Supabase, no mock; the function awaits the user's deployment + Auth "Invite user" template. Staff deletion, mandatory 2FA, single owner role: decisions to confirm |
| Admin customers, statistics, settings, translations | yes | mostly yes | **Mock UI** over a ready schema |
| Contact form, newsletter, transactional e-mails | yes | yes | **Mock** — needs Edge Functions + Resend |
| Academy authoring (admin courses, content, quizzes, training media library, course price and promotions) | yes | yes (`academy_authoring`) | **Live** (2026-10-01): builder, `/admin/formations/medias`, price and course promotions on Supabase. Courses are not products; see `guidelines/05` decisions |
| Academy public pages (catalogue, course sales pages, home band, header/footer entries) | yes | yes (`academy_public_pages`) | **Live** (2026-10-01, phase B): published courses, outline, cover, current price, per-language slugs, 404/308, head + Course JSON-LD, sitemap. No purchase yet: a course page says enrolment opens soon |
| Academy learner access, progress, quizzes, certificates, course sales | yes | no (no entitlements/progress tables yet) | **Mock** — phases C (learner), D (checkout) |
| Artist community | yes | no | **Mock**, post-launch |
| Legal pages | yes | `content_pages` ready | Placeholders awaiting business/legal review |

The switch between mock and live stores is `isSupabaseConfigured` (`webapp/src/lib/supabase/client.ts`). Target: a production build never falls back to mock data; mock stores, "Prototype controls" panels and demo accounts are removed domain by domain as each goes live (see `guidelines/02`).

## 5. Technology baseline

In use: Next.js 16 (App Router, Turbopack), React 19, TypeScript 6 (`strict`), Tailwind CSS v4 via PostCSS with the design tokens in `webapp/src/index.css`, react-i18next (FR default, EN), lucide-react, three.js (Studio 3D only, lazy-loaded), supabase-js, Vitest, Playwright (smoke tests), oxlint. Supabase (Postgres 17, Auth, Storage, Edge Functions), Stripe, Vercel.

Stripe Checkout + webhooks are Edge Functions (`supabase/functions/`, `npm:stripe` pinned, tested with `deno test`). Planned, when the matching work starts: Resend (+ React Email if useful) for e-mail, Sentry for monitoring, Playwright for the critical journeys against a real project, GitHub Actions CI. Optional only with a concrete need: Mux (serious video), Cloudflare, PostHog, Algolia/Typesense.

Not used and not to introduce: shadcn/ui (the project has its own component set), next-intl (not decided: react-i18next stays during the Next.js migration), Shopify/WooCommerce, Firebase, MongoDB, microservices. A new dependency needs a concrete justification (§12).

## 6. Architecture principles

Keep these domains logically separated in code and data: catalogue/products; customers/accounts; cart/checkout; orders/fulfilment; payments; reviews; marketing/consent; promotions/gift cards/loyalty; courses, lessons, quizzes, learning progress, certificates; Studio 3D; administration.

One application contains them, but boundaries stay explicit: one store/context per domain (`webapp/src/lib/`), pure mapping modules for row ↔ UI shapes (`*Mapping.ts`, unit-tested), and a single persistence boundary per domain so screens never call Supabase directly.

Customer identity is shared across commerce, learning and Studio; the functional domains stay separate. Administration is a separate workspace (`/admin`) on the same identity, gated by staff roles.

## 7. Security rules

- Never trust client-calculated prices, discounts, totals, permissions, payment states, entitlements or completion states.
- Authorization is enforced by RLS and database functions (`private.has_permission()`, `private.is_staff()`) or in Edge Functions — deny by default. Route guards (`RequireAdmin`, `RequireAccount`) and the proxy's redirects (`webapp/proxy.ts`) are navigation only.
- Validate all untrusted input server-side (function arguments, webhook payloads, uploads, sign-up metadata).
- Never put secrets in source, client bundles, logs or commits. Only the publishable key is public.
- Paid training media and personal files stay in private buckets, served by signed URLs.
- Sensitive administrative actions are audited (`audit_logs` triggers); new sensitive tables get the audit trigger.
- Never expose stack traces, SQL errors, provider errors or unnecessary internal identifiers to users; map errors to localized messages.

## 8. Payments, orders and money

- Stripe is the payment source of truth; Supabase is the business-data source of truth.
- Paid access, stock sale, loyalty stamps and gift-card activation are granted only by a verified Stripe webhook (signature checked, event id deduplicated in `stripe_webhook_events`, processing idempotent), never by the browser reaching a success URL.
- Orders are created only by `create_order()` with the service role; totals are computed in the database; historical orders keep their snapshotted prices, discounts, VAT, shipping and currency.
- **Money representation (decided):** Postgres stores `numeric(12,2)` + an ISO-4217 `currency` column (exact decimal). TypeScript and Stripe use **integer minor units** (cents) + currency. Convert only at the boundaries (mapping modules, Edge Functions) with the existing helpers (`webapp/src/lib/catalog/money.ts`). Never use floating-point arithmetic on money, never parse a price with `parseFloat` for computation.

## 9. Internationalization

- **Launch languages: French (default and reference) and English.** German is enabled in the database and planned, but not launch-blocking; do not add partial German UI strings.
- Customer-facing UI text goes through react-i18next (`webapp/src/i18n/locales/*.json`) — never hard-coded. Every new key exists in both `fr` and `en`.
- UI language: on public pages, the one in the address (`/fr`, `/en`); elsewhere the saved choice (`gt-lang`, written only by the FR/EN switches), else the browser's, else English.
- Content (products, categories, e-mails, pages) uses translation tables (`*_translations`): base columns hold French, other locales are rows with a draft/published status. Never add `name_en`-style columns.
- Language, country, currency, tax regime and shipping zone are separate dimensions.

## 10. Database and Supabase rules

- Every schema change is a versioned migration committed in `supabase/migrations/`, whose version and name match what is applied to the Supabase project. No undocumented dashboard changes.
- Explicit relational models, foreign keys, useful `CHECK`s, statuses as `text` + `CHECK`, `uuid` keys, `timestamptz` `created_at`/`updated_at`, RLS enabled in the same migration that creates a table, `set search_path = ''` on functions, security-definer helpers in the `private` schema. JSONB only for genuinely flexible data.
- After a migration: add/extend a validation suite in `supabase/tests/`, regenerate `webapp/src/lib/supabase/database.types.ts`, check the Supabase security/performance advisors, and document the change in `supabase/README.md`.
- Full procedure (MCP tools, environments, Edge Functions): `guidelines/09-supabase-workflow.md`.

## 11. Frontend and UX

Responsive and mobile-first where behaviour demands it (checkout, lessons, Studio on phones). Always handle keyboard navigation, visible focus, contrast, loading/empty/error states, layout shift and `prefers-reduced-motion`. Never hide essential information behind hover only. Never convey state by colour alone.

Follow the established visual direction (`guidelines/03`, tokens in `webapp/src/index.css`) and reuse the existing components (`webapp/src/components/ui/`, `components/admin/`) before creating new ones.

Public pages are rendered on the server, then hydrated: any component they use must render the same markup on the server and on its first browser render. Never read `window`, `document`, `localStorage`, media queries, the time or randomness during render or in a `useState` initializer — do it in an effect, or read browser state once hydrated (`webapp/src/lib/useHydrated.ts`). A hydration mismatch is a console error, which fails the smoke tests. Server-only code (`server-only`, `app/`, `src/lib/supabase/server.ts`, `publicServer.ts`) never reaches a client component.

## 12. Code quality

Prefer small cohesive modules, explicit names, typed interfaces (generated `Database` types for Supabase rows), domain-oriented pure functions with tests, predictable control flow. Avoid giant components, duplicated business rules, magic numbers, unnecessary global state and speculative abstractions.

Before adding a dependency, check whether the stack already solves the need. When you replace a mock by a live implementation, delete the dead mock code and fixtures instead of leaving both paths.

## 13. Testing and validation

From `webapp/`: `npm run typecheck`, `npm run lint`, `npm test` (Vitest), `npm run build` (`next build`, includes a type-check), `npm run test:e2e` (Playwright smoke tests, mock mode — required for routing, rendering and build changes). Database: the relevant `supabase/tests/*_validation.sql` suite(s), run on the Supabase project (they roll back). Choose checks by risk; critical flows are authentication, checkout, webhook handling, fulfilment, course access, progress and admin authorization.

Never claim a check passed unless it was run in this session. If a check cannot run (no `node_modules`, no database access), say so.

## 14. Git workflow

### Branch model

- `main` is the release branch. Nothing is committed or pushed to `main` directly.
- `dev` is the integration branch. All agent work lands here.
- The `dev` -> `main` pull request is the only pull request in the workflow. An agent may open it when the user asks; only the human maintainer reviews and merges it.

### Agent commit and push policy

This section deliberately overrides the default agent behaviour of committing and pushing only when explicitly asked.

When the session runs on `dev`:

1. At the end of each turn, commit your work **yourself** with a clear English message (imperative subject ≤ 72 characters, e.g. `Checkout: create Stripe session from create_order()`; body for the why when useful).
2. Push to `origin dev` immediately after committing (`git pull --rebase origin dev` first if the push is rejected).
3. Never push to `main`, never force-push, never rewrite pushed history.
4. Open the `dev` -> `main` pull request only when the user asks for it (`gh pr create --base main --head dev`, or the GitHub tools), not as a draft unless asked, and never merge it. If one is already open, push to `dev` and reuse it.

The `Stop` hook in `.claude/settings.json` commits and pushes whatever is left, using the first line of your last message as the subject — which produces poor commit messages, hence rule 1. The hooks are PowerShell scripts: where PowerShell is not available (Linux / cloud sessions) they do not run, and committing and pushing yourself is mandatory. A `SessionStart` hook switches a clean main checkout to `dev`.

If the session runs on a branch other than `dev` (for example a `claude/*` worktree created by the desktop app), the `Stop` hook commits there, merges `origin/dev` into it and pushes `HEAD` directly to `origin/dev`. Do not push the worktree branch itself and do not open a pull request targeting `dev`. If that merge conflicts, resolve it and push `HEAD:dev` yourself.

### Quality bar

Keep changes focused and reviewable. Do not modify unrelated files. A turn that ends with unrelated files modified ships them to `dev`. Before the `dev` -> `main` pull request, review the accumulated diff for secrets, unrelated changes, broken imports, incomplete migrations, missing tests and documentation drift.

## 15. AI agent behaviour

- Be explicit about uncertainty. Do not claim to have inspected, tested, deployed or applied something you did not.
- Never silently invent a business rule that affects money, taxes, permissions, legal/consent behaviour, customer access or data retention: propose the safest interpretation, implement it only if it is reversible, and list it under "Decisions to confirm" in your report (and in `supabase/README.md` "Deliberate decisions" when it is a data rule).
- When a task is ambiguous but safe, state the assumption and continue rather than blocking.
- Document decisions with long-term consequences where the next agent will look (this file for cross-cutting ones, the guidelines for domain rules, the READMEs for implementation facts).
- Keep the context current: when your change makes a statement in this file, a guideline or a README false (e.g. a domain goes live in §4), update it in the same commit.
- Reply to the user in their language (French by default); code, comments, commit messages and repository docs stay in English.

## 16. Definition of done

- requirements satisfied against the real backend (no mock path left for the delivered behaviour);
- authorization enforced by RLS / server functions, with a test that another user is refused;
- untrusted input validated server-side;
- money safe (§8), i18n not bypassed (§9);
- migration committed and applied, types regenerated, SQL suite added or extended;
- lint, tests and build run and passing (or the reason they could not run stated);
- documentation updated (domain status, READMEs, guidelines) where behaviour or architecture changed;
- no secrets or personal data introduced; the diff contains only intended changes.

## 17. When in doubt

Prefer the solution that is **simpler → safer → more explicit → easier to test → easier to maintain → easier to internationalize**. Optimize for a reliable product that the next developer or agent can understand.
