# Migration of `webapp/` from Vite + React Router to Next.js (App Router)

Living document. **Every session that works on this migration reads it first and updates it in the same commit** (phase status, route checklist, log, open decisions). The decision itself and its rationale are recorded in `AGENTS.md` §4 and `global-toothgems-llm-guidelines/02-architecture-and-engineering.md`.

## Decision in one paragraph

`webapp/` moves from a Vite single-page application to Next.js App Router, deployed on Vercel, in place (same `webapp/` folder). Reasons: server-rendered, indexable and shareable public pages (SEO, social previews, real 404s) and server-side route protection. Supabase (schema, RLS, the 35+ migrations, Auth already in production), the Edge Functions planned for Stripe and e-mail, react-i18next, Tailwind v4 and Vitest stay. Out of scope for the whole migration unless decided separately: new features, visual changes, SQL schema changes, Stripe work, a move to next-intl.

## Rules for every phase

1. **No visible change.** No route, text or style changes unless the user asks. The Playwright smoke tests (`webapp/e2e/`, `npm run test:e2e`) are the reference: they must pass before and after each step.
2. Exit criteria of every phase: `npx tsc -b` (phase 0) / `npm run typecheck` (from phase 1), `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e` — all run and green, results written in the log below.
3. Ask the user, never decide alone. Decided so far: e-mail links land on `/auth/confirm`; locale URLs are `/fr/…` and `/en/…`. Still the user's: the Vercel project switch and the Supabase dashboard settings (they do both), and the open points listed under "Open decisions".
4. Only the publishable key is public (`NEXT_PUBLIC_*`). The service-role key and provider secrets never reach Next.js code.
5. Business rules stay in Postgres / Edge Functions. A server-side route guard is navigation, not authorization: RLS is.

## Inventory (measured on `dev` at 82864d0, 2026-09-30)

The brief quoted 96 routes, 152 files importing react-router and ~75 files touching browser globals; `dev` moved since. Measured with `grep` on `webapp/src`:

| Item | Count | Why it matters |
| --- | --- | --- |
| `<Route>` elements in `src/App.tsx` | 99 (104 addressable patterns once the mapped legal aliases and Studio share paths are expanded) | every one must keep working in the catch-all shell, then be moved to an App Router segment |
| Files importing `react-router-dom` | 158 | `Link`, `NavLink`, `Navigate`, `useNavigate`, `useLocation`, `useParams`, `useSearchParams` (97 files use the hooks) — replaced by `next/link` / `next/navigation` when their route is migrated, removed in phase 5 |
| Files using `window` | 75 | cannot run during server rendering; each needs `useEffect`, a client component boundary or a guard before its page is server-rendered |
| Files using `document.` | 52 | same |
| Files using `localStorage` / `sessionStorage` | 11 | same; includes the i18n language detector (`gt-lang`), cookie consent, favourites, Studio stores |
| Union of the above | 117 files | the real SSR work in phases 3–4 |

Other facts that shape the plan:

- **Studio 3D (three.js, three-mesh-bvh):** the editor and the share viewer are lazy chunks (`React.lazy`) loading `src/assets/studio3d/dentition.glb`. WebGL only exists in the browser: these routes stay client-only (`dynamic(..., { ssr: false })` or a client component that mounts the engine in an effect) even after phase 4.
- **Supabase Auth (before phase 2):** `src/lib/supabase/client.ts` created one browser client with `persistSession`, `autoRefreshToken` and `detectSessionInUrl: true` — the session lives in `localStorage` and e-mail links use the implicit flow (tokens in the URL fragment, read by `authLinkErrorFromUrl` and the confirmation/reset pages). A server never sees a fragment nor `localStorage`: phase 2 moves the session to cookies (`@supabase/ssr`) and e-mail links to the PKCE flow (`?code=` exchanged by a route handler), which changes the redirect URLs configured in Supabase Auth.
- **Redirect URLs are built from `window.location.origin`** (`authRedirect.ts`, `passwordRecovery.ts`, `accountCredentials.ts`, `studioWorkspace/share.ts`): local development must keep port 5173 or the Supabase allow-list must change.
- **Route guards are client components:** `RequireAccount` (→ `/connexion`), `RequireAdmin` (→ `/admin/connexion`), `RequireStudioAccess` (lets everyone in during the preview).
- **i18n:** react-i18next with `i18next-browser-languagedetector`, language cached in `localStorage` (`gt-lang`), French default; `DocumentLanguage` sets `<html lang>` after mount. The server cannot know the language today — this ties SSR to the locale URL decision.
- **Vite-only code:** `import.meta.env.VITE_*` (Supabase client), `import.meta.glob` (`lib/images.ts`), `new URL(\`../assets/photos/${name}\`, import.meta.url)` (six `data/*.ts` fixtures), `?url` import of the `.glb`, image imports used as strings (20 files). All handled in phase 1 (see below).
- **Bundle:** the Vite build ships a 3.2 MB (830 kB gzip) main chunk: every page is in it except the Studio editor/share chunks. Code-splitting per route is a phase 3–4 benefit, not a phase 1 goal.
- **Status codes:** the SPA (and the phase 1 shell) answer HTTP 200 for every path, including unknown ones rendered as the 404 page. Real 404s come with phase 3.

## Strategy

| Phase | Goal | Content | Status |
| --- | --- | --- | --- |
| 0 | Framing | Decision recorded (AGENTS.md §4, guidelines 02/08), this file, Playwright smoke tests passing on the Vite app | done (2026-09-30) |
| 1 | Next.js shell | Next.js 16.3 installed in `webapp/`; the existing app runs unchanged from `app/[[...slug]]/page.tsx` through `dynamic(() => import(App), { ssr: false })` with `BrowserRouter` (official guide "Migrating from Vite"); Tailwind v4 via PostCSS; `VITE_*` → `NEXT_PUBLIC_*`; `vercel.json` removed; Vitest kept | done (2026-09-30) |
| 2 | Auth on the server | `@supabase/ssr`: browser client + server client, session in cookies (existing `localStorage` sessions carried over), `proxy.ts` (Next.js 16 name of middleware) refreshing the session and redirecting signed-out visitors away from `/compte/*`, `/academy/mes-formations/*`, `/academy/lecon` and `/admin/*` (client guards stay as a second layer); e-mail links through `/auth/confirm` (token hash or PKCE code); Supabase dashboard settings updated **by the user** | done in code (2026-09-30); live once the user applies the Supabase settings and switches Vercel |
| 3.1 | Language in the address + SEO head | `/fr/…` and `/en/…` with English segments for public pages, `/` negotiated, old addresses moved (308), localized history for the React Router app, server `<head>` per page (title, description, canonical, hreflang, Open Graph, noindex for private areas), real 404 status, `sitemap.xml`, `robots.txt` | done (2026-09-30) |
| 3.2 | Public pages rendered on the server | Home, shop, shapes, colours, product, gift card, loyalty, Studio and Academy sales pages, help and legal pages as App Router segments whose content is rendered on the server (data read with the publishable key); product and course titles/descriptions and structured data (Product, Course); 404 for unknown product/course slugs; per-locale product slugs (`product_translations`); products and courses in the sitemap; `window`/`localStorage` code behind client boundaries | not started |
| 4 | Account, back office, Studio | `/compte/*`, community, learner pages, `/admin/*`, Studio editor/share as App Router segments (mostly client components under server-protected layouts); Studio stays client-only | not started |
| 5 | Cleanup | Remove the catch-all shell, react-router-dom, SPA-only helpers (`ScrollToTop`, `DocumentLanguage`…), dead Vite leftovers; update READMEs | not started |

A route leaves the catch-all shell only when its App Router page exists, its smoke test (added if missing) passes, and every link to it still works from the shell (a full page load between the two worlds is acceptable during phases 3–4).

## Phase 1 — how the shell works

- `webapp/app/layout.tsx` — root layout: `<html lang="fr">`, the Google Fonts `<link>`s and the title/favicon formerly in `index.html` (title and icon through the `metadata` export), the global stylesheet `src/index.css`, and the `<div id="root">` wrapper kept from `index.html`.
- `webapp/app/[[...slug]]/page.tsx` — the only page. It renders `ClientOnly` (`client.tsx`), which loads `src/ClientApp.tsx` (former `main.tsx`: i18n init, `StrictMode`, `BrowserRouter`, `App`) with `dynamic(..., { ssr: false })`: nothing from `src/` runs on the server. `generateStaticParams` prerenders only `/`; every other path is rendered on demand by the same page (HTTP 200, like the SPA).
- No `output: "export"` (unlike the guide): the app is deployed as a normal Next.js app so that phase 2 can add `proxy.ts` and phase 3 server rendering without changing the deployment again. Hence no `vercel.json`: the catch-all answers every path.
- Environment: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (the publishable key only). Empty = mock mode, as before; `npm run dev:mock` forces them empty.
- `npm run dev` goes through `scripts/dev.mjs`: `next dev` on port 5173 (the Vite port, known to the Supabase Auth redirect allow-list); `PORT` still overrides it.
- Tailwind v4 through `@tailwindcss/postcss` (`postcss.config.mjs`). Vitest runs from `vitest.config.ts`; `vite` stays only as Vitest's peer dependency; `@vitejs/plugin-react` and `@tailwindcss/vite` are removed.

Deviations from the official guide, and the Vite-only code, with the reason for each:

| Change | Why |
| --- | --- |
| `app/` at the root of `webapp/`, not `src/app/` as in the guide | keeps `app/` next to `public/` and the configs; either works once `src/pages/` is gone |
| `src/pages/` renamed `src/screens/` (only `App.tsx` imported from it) | Next.js reads any `pages/` or `src/pages/` directory as a Pages Router and refuses to build when it sits in another folder than `app/` |
| `tsconfig.json` is the single app config (plus `tsconfig.e2e.json` for `e2e/` and the tool configs); `"strict": true` written out | TypeScript 6 is strict by default; `next build` inserts `"strict": false` when the key is missing, which weakened the checks the Vite config had |
| Image imports: `src={logo.src}` (20 files); `lib/images.ts` reads `.src` | Next.js resolves an image import to `{ src, width, height }`; Vitest gets the same shape through a small plugin in `vitest.config.ts` |
| `lib/images.ts`: `import.meta.glob(["./*.jpg", "./*.png"], { base: "../assets/photos", eager: true, import: "default" })` | Turbopack returned an empty object for `../assets/photos/*.{jpg,png}` (no brace expansion, no parent-relative pattern) |
| The six `data/*.ts` fixtures use `photo(name)` instead of a dynamic `new URL(..., import.meta.url)` | Turbopack resolved the dynamic `new URL` to one single file: every product card showed the same photo. Caught by the visual comparison; now guarded by the smoke test "each product card shows its own photo" |
| `dentition.glb`: static `new URL("../../assets/studio3d/dentition.glb", import.meta.url).href` | Turbopack has no loader for `?url` on `.glb` |
| `process.env.NEXT_PUBLIC_*` in `lib/supabase/client.ts` | `import.meta.env.VITE_*` does not exist in Next.js |
| oxlint: `react/only-export-components` off for `app/**` | `metadata` and `generateStaticParams` are required Next.js exports; the rule is about Vite fast refresh |
| `webapp/AGENTS.md` + `webapp/CLAUDE.md` committed | `next dev` writes them whenever an AI agent runs it; committed (with a pointer to the root `AGENTS.md`) so they stop reappearing as uncommitted changes |

Known and accepted: the CSS minifier (Lightning CSS in Turbopack) writes `(width>=40rem)` as `(min-width:40rem)`, `rotate:0deg` as `rotate:none` (`hover:rotate-0` on the two gift-card visuals) and the pill radius `2147483647px` as `3.40282e38px`; the set of rules is otherwise identical to the Vite build, and full-page screenshots of every public route (desktop 1280 px and mobile 390 px, plus the hovered gift card) are pixel-identical between the two builds.

## Phase 2 — sessions on the server

- **Clients** (`src/lib/supabase/`): `env.ts` (the two public values), `client.ts` (`createBrowserClient`, cookies), `server.ts` (route handlers and server components: the visitor's session, publishable key, RLS applies), `proxySession.ts` (the proxy's). No service-role key anywhere in Next.js.
- **Existing sessions:** before, supabase-js kept the session in `localStorage` under `sb-<ref>-auth-token`, the name the cookies now use. `client.ts` carries it over once into cookies (`setSession`) and removes the old entry; `AuthProvider` and `AdminAuthProvider` wait for it (`sessionReady`) before reading the session, so nobody is signed out by the release. Limit: a member whose first visit after the release is a direct load of a protected URL is sent once to `/connexion?suite=…` by the proxy (it cannot see `localStorage`); the page then shows them signed in.
- **`proxy.ts`**: runs on page requests (static files excluded by the matcher). Without an auth cookie it calls nothing. Otherwise `getClaims()` validates the access token (JWKS, or Auth for a shared-secret project) and refreshes it when expired, writing the new cookies to the request and the response. Signed-out visitor on a gated path → 307 to `/connexion?suite=<path+query>` (member space, learner pages) or `/admin/connexion?suite=…` (back office); `Login` and `AdminLogin` read `?suite=` besides the history state they already read. The staff role is not checked here (the back office does it, RLS enforces it). Mock mode: the proxy does nothing, the client guards decide as before.
- **`/auth/confirm`** (`app/auth/confirm/route.ts`): `?token_hash=&type=` → `verifyOtp` (any device), `?code=` → `exchangeCodeForSession` (browser that asked only), Supabase's own `?error=` forwarded. Accepted kinds: `signup`, `email`, `recovery`, `email_change` (others refused). Success → 303 to the safe `next` or the page for the kind (`/confirmation-compte`, `/reinitialiser-mot-de-passe`, `/verifier-email?type=changement`); the first half of a secure e-mail change → `&message=confirm_other_address`; failure → same page with `error=access_denied&error_code=…`, which the existing pages already turn into their "expired" / "invalid" states. No page changed.
- **Redirects given to Supabase**: `authConfirmUrl(next)` in `confirmationRedirect` (sign-up, resend), `sendPasswordReset`, `emailChangeRedirect`.
- **Rules in one place**: `src/lib/authRoutes.ts` (gated paths, sign-in redirect, `?suite=`, `isSafeNext` — now also refusing control characters and `\` anywhere —, link kinds and landing pages), unit-tested; `authRedirect.ts` and `accountSecurity.ts` re-use it.
- **Tests**: `src/lib/authRoutes.test.ts`; Playwright project `auth-server` against `e2e/support/fake-supabase.mjs` (see guideline 07). The legacy-session test was checked to fail with the carry-over disabled.
- **`npm run typecheck`** now starts with `next typegen`, so it works on a fresh clone (it needed a prior `next dev`/`build` for `next-env.d.ts`). `tsconfig.json` lists `.next-e2e-auth/` types: Next.js adds them when the auth test server runs (`NEXT_DIST_DIR`), so they are committed to keep the tree stable.

Known limits, accepted:
- E-mail links sent **before** the release use the implicit flow (`#access_token=…`), which the cookie client no longer reads: opened after the release, they show "invalid" and the member asks for a new one (Supabase links expire within 24 h anyway).
- Until the three e-mail templates are changed to the token-hash link, links work only in the browser that asked for them (PKCE). An account confirmation opened elsewhere is still confirmed by Supabase but the page says the link is invalid — which is why the template change is part of the release.
- An e-mail sent from the Supabase dashboard (not by the app) has the Site URL as `.RedirectTo`, so the token-hash link is malformed; send confirmations and resets from the app.

## Phase 3.1 — language in the address

Decided by the user (2026-09-30): public pages are prefixed `/fr/…` and `/en/…`, English pages have English segments, `/` goes to the saved choice, else the browser's language, else English; the member space and the back office are not prefixed.

| Page | French address | English address |
| --- | --- | --- |
| Home | `/fr` | `/en` |
| Shop, product | `/fr/boutique`, `/fr/boutique/:id` | `/en/shop`, `/en/shop/:id` |
| Shapes, colours | `/fr/formes`, `/fr/couleurs` | `/en/shapes`, `/en/colours` |
| Cart (noindex) | `/fr/panier` | `/en/cart` |
| Loyalty, gift card | `/fr/fidelite`, `/fr/carte-cadeau` | `/en/loyalty`, `/en/gift-card` |
| Studio 3D sales, subscription | `/fr/studio-3d`, `/fr/studio-3d/abonnement` | `/en/3d-studio`, `/en/3d-studio/subscribe` |
| Academy, course sales page | `/fr/academy`, `/fr/academy/formation/:id` | `/en/academy`, `/en/academy/course/:id` |
| Help, FAQ, contact, about | `/fr/aide`, `/fr/aide/faq`, `/fr/contact`, `/fr/a-propos` | `/en/help`, `/en/help/faq`, `/en/contact`, `/en/about` |
| Legal notice, terms, privacy, cookies, shipping, returns | `/fr/mentions-legales`, `/fr/conditions-generales`, `/fr/confidentialite`, `/fr/cookies`, `/fr/livraison`, `/fr/retours-remboursements` | `/en/legal-notice`, `/en/terms-of-sale`, `/en/privacy-policy`, `/en/cookie-policy`, `/en/shipping`, `/en/returns` |

The English segments reuse the English aliases the app already had where there was one; the others are proposals made in this session (to confirm, see Open decisions). Not prefixed (the member area in the broad sense, `noindex`): sign-in, registration, recovery and e-mail landing pages, `/compte/*`, learner pages (`/academy/lecon`, `/academy/mes-formations/*`), the Studio editor and share viewer, `/admin/*`, `/erreur`, `/maintenance`. Their language is the saved choice, else the browser's, else English.

How it works:
- **One table**, `src/lib/localeRoutes.ts` (pure, unit-tested, including a check that every route of `App.tsx` is known to the server): public routes in both languages, parsing and writing addresses, old addresses, language negotiation, the paths that exist.
- **Proxy**: `/` → 307 to `/fr` or `/en` (cookie `gt-lang`, else `Accept-Language`, else English; `Vary: Cookie, Accept-Language`, not cached); old unprefixed public addresses and the former English aliases → 308 to their new address (`/boutique` → `/fr/boutique`, `/help` → `/en/help`), query kept; sets `x-gt-locale` for `<html lang>`. Runs in mock mode too; the auth part still only with Supabase configured.
- **React Router app unchanged in its routes and links**: it keeps its French paths internally; `src/lib/localizedHistory.ts` (via `unstable_HistoryRouter`) translates at the edge, so every `<Link to="/boutique">` renders `href="/en/shop"` in English, the language follows the address (back button included), and the FR/EN switch rewrites the address of a public page to its other language.
- **Saved choice**: only the four FR/EN switches save it (`src/i18n/preference.ts`: localStorage `gt-lang` as before, plus a cookie of the same name the proxy reads; an existing localStorage choice is copied to the cookie once). Opening an English link does not overwrite a saved French choice. i18next no longer caches what it detects; detection order: localStorage, cookie, browser, then English (was: localStorage, then French).
- **Server `<head>`** (`app/[[...slug]]/page.tsx`, `src/lib/pageMeta.ts`): title and description from text the pages already show (heading and introduction; legal pages from `data/legal/`), canonical, `hreflang` fr/en/x-default (x-default: `/` for the home, else the English page), Open Graph; private areas `noindex`. The same table sets the tab title during client navigation (`DocumentTitle` in `App.tsx`), so pages that used to show "Global Toothgems" now show their own title. Product and course pages keep "Global Toothgems" until 3.2.
- **404**: an address with no screen answers HTTP 404 (`notFound()`); `app/not-found.tsx` renders the app, which shows its usual 404 page. The member space and back office keep answering 200 for their unknown sub-addresses (their 404 screen lives inside their shell).
- **`sitemap.xml`** (static public pages, both languages with alternates) and **`robots.txt`** (private areas disallowed). Absolute URLs from `SITE_URL` (optional, server-only), else Vercel's production domain, else localhost.

Known limits, accepted: internal links still point to the unprefixed French path in the code, translated at render (search engines see the localized `href`); the first page load on a public address renders client-side as before (content SSR is 3.2); `/fr/boutique/<unknown>` answers 200 with the app's "product not found" state until 3.2.

## Route checklist

Legend (phase 1 done: every route below is served by the catch-all shell; phase 2 done: "account" and "staff" routes are also turned away server-side by `proxy.ts`) — **Access**: open / account (`RequireAccount` + proxy) / staff (`RequireAdmin` + proxy) / studio (`RequireStudioAccess`) / redirect (client-side `Navigate`). **P1**: served by the catch-all shell. **Smoke**: covered by `webapp/e2e/`. **Native**: App Router segment exists. **SSR**: "head" = server `<head>` done (3.1), "body" = content rendered on the server (3.2). Public routes now live at `/fr/…` / `/en/…` (table in phase 3.1); the address in the first column is the internal one and, when unprefixed, redirects (308). Target phase in the last column.

### Storefront

| Route | Access | P1 | Smoke | Native | SSR | Target |
| --- | --- | --- | --- | --- | --- | --- |
| `/` | open | ✅ | ✅ | ⬜ | head ✅ body ⬜ | 3.2 |
| `/accueil-b` → `/` | redirect | ✅ | ✅ | ⬜ | — | server redirect ✅ (3.1) |
| `/boutique` | open | ✅ | ✅ (+ distinct product photos) | ⬜ | head ✅ body ⬜ | 3.2 |
| `/boutique-b` → `/boutique` | redirect | ✅ | ✅ | ⬜ | — | server redirect ✅ (3.1) |
| `/boutique/:id` | open | ✅ | ✅ | ⬜ | head ✅ body ⬜ | 3.2 |
| `/formes` | open | ✅ | ✅ | ⬜ | head ✅ body ⬜ | 3.2 |
| `/couleurs` | open | ✅ | ✅ | ⬜ | head ✅ body ⬜ | 3.2 |
| `/panier` | open | ✅ | ✅ (cart flow) | ⬜ | head ✅ (noindex), client | 3.2 |
| `/fidelite` | open | ✅ | ✅ | ⬜ | head ✅ body ⬜ | 3.2 |
| `/carte-cadeau` | open | ✅ | ✅ | ⬜ | head ✅ body ⬜ | 3.2 |
| `/gift-card` (alias) | redirect | ✅ | ✅ (`locale.spec.ts`) | ⬜ | — | server redirect to `/en/gift-card` ✅ (3.1) |

### Sign-in, registration, recovery

| Route | Access | P1 | Smoke | Native | SSR | Target |
| --- | --- | --- | --- | --- | --- | --- |
| `/connexion` | open | ✅ | ✅ (mock sign-in) | ⬜ | — | 4 |
| `/connexion-b` → `/connexion` | redirect | ✅ | ✅ | ⬜ | — | 4 |
| `/inscription` | open | ✅ | ✅ (mock registration) | ⬜ | — | 4 |
| `/mot-de-passe-oublie`, `/forgot-password` | open | ✅ | ✅ (FR) | ⬜ | — | 4 |
| `/reinitialiser-mot-de-passe`, `/reset-password` | open (e-mail link) | ✅ | ✅ (FR) | ⬜ | — | 4 |
| `/verifier-email`, `/verify-email` | open (e-mail link) | ✅ | ✅ (FR) | ⬜ | — | 4 |
| `/confirmation-compte` | open (after `/auth/confirm`) | ✅ | ✅ | ⬜ | — | 4 |
| `/auth/confirm` (route handler, phase 2) | open (e-mail links) | — | ✅ (`auth-server`) | ✅ | — | done |

### Studio 3D

| Route | Access | P1 | Smoke | Native | SSR | Target |
| --- | --- | --- | --- | --- | --- | --- |
| `/studio-3d` | open | ✅ | ✅ | ⬜ | head ✅ body ⬜ | 3.2 |
| `/studio-3d/abonnement` | open | ✅ | ✅ | ⬜ | head ✅ body ⬜ | 3.2 |
| `/studio-3d/subscribe` → `/en/3d-studio/subscribe` | redirect | ✅ | ✅ | ⬜ | — | server redirect ✅ (3.1) |
| `/studio-3d/atelier/*` (editor, lazy three.js) | studio | ✅ | ✅ (canvas renders) | ⬜ | — (client only) | 4 |
| `/studio-3d/editor/*` → `/studio-3d/atelier/*` | redirect | ✅ | ⬜ | ⬜ | — | 4 |
| `/studio-3d/partage`, `/studio-3d/partage/:token` | open (lazy three.js) | ✅ | ✅ (no token) | ⬜ | — (client only) | 4 |
| `/studio-3d/share`, `/studio-3d/share/:token` → `partage` | redirect | ✅ | ⬜ | ⬜ | — | 4 |

### Academy

| Route | Access | P1 | Smoke | Native | SSR | Target |
| --- | --- | --- | --- | --- | --- | --- |
| `/academy` | open | ✅ | ✅ | ⬜ | head ✅ body ⬜ | 3.2 |
| `/academy/formation/:id` | open | ✅ | ✅ | ⬜ | head ✅ body ⬜ | 3.2 |
| `/academy/lecon` | account | ✅ | ✅ (proxy redirect) | ⬜ | — | 4 |
| `/academy/mes-formations/:courseId` | account | ✅ | ⬜ | ⬜ | — | 4 |
| `/academy/mes-formations/:courseId/lecon/:nodeKey` | account | ✅ | ✅ (proxy redirect) | ⬜ | — | 4 |
| `/academy/mes-formations/:courseId/terminee` | account | ✅ | ⬜ | ⬜ | — | 4 |

### Member area (`MemberShell`, account)

| Route | Access | P1 | Smoke | Native | SSR | Target |
| --- | --- | --- | --- | --- | --- | --- |
| `/compte` | account | ✅ | ✅ (redirect + mock sign-in; proxy redirect and cookie session in `auth-server`) | ⬜ | — | 4 |
| `/compte/attestations` | account | ✅ | ⬜ | ⬜ | — | 4 |
| `/compte/commandes` | account | ✅ | ✅ (redirect) | ⬜ | — | 4 |
| `/compte/profil` | account | ✅ | ⬜ | ⬜ | — | 4 |
| `/compte/securite` | account | ✅ | ⬜ | ⬜ | — | 4 |
| `/compte/fidelite` | account | ✅ | ⬜ | ⬜ | — | 4 |
| `/compte/avis` | account | ✅ | ⬜ | ⬜ | — | 4 |
| `/compte/*` (404 inside the shell) | account | ✅ | ⬜ | ⬜ | — | 4 |
| `/compte/communaute` | account | ✅ | ⬜ | ⬜ | — | 4 |
| `/compte/communaute/canal/:channelId` | account | ✅ | ⬜ | ⬜ | — | 4 |
| `/compte/communaute/discussion/:discussionId` | account | ✅ | ⬜ | ⬜ | — | 4 |
| `/compte/communaute/activite/:view` | account | ✅ | ⬜ | ⬜ | — | 4 |
| `/compte/communaute/membres` | account | ✅ | ⬜ | ⬜ | — | 4 |
| `/compte/communaute/charte` | account | ✅ | ⬜ | ⬜ | — | 4 |
| `/compte/communaute/*` (404) | account | ✅ | ⬜ | ⬜ | — | 4 |

### Back office (`AdminLayout`, staff)

| Route | Access | P1 | Smoke | Native | SSR | Target |
| --- | --- | --- | --- | --- | --- | --- |
| `/admin/connexion` | open | ✅ | ✅ | ⬜ | — | 4 |
| `/admin` | staff | ✅ | ✅ (client and proxy redirects) | ⬜ | — | 4 |
| `/admin/commandes`, `/admin/commandes/:reference` | staff | ✅ | ⬜ | ⬜ | — | 4 |
| `/admin/clients`, `/admin/clients/:id` | staff | ✅ | ⬜ | ⬜ | — | 4 |
| `/admin/utilisateurs` | staff | ✅ | ⬜ | ⬜ | — | 4 |
| `/admin/statistiques` | staff | ✅ | ⬜ | ⬜ | — | 4 |
| `/admin/produits` | staff | ✅ | ✅ (redirect) | ⬜ | — | 4 |
| `/admin/produits/nouveau`, `/admin/produits/:id`, `/admin/produits/:id/recommandations` | staff | ✅ | ⬜ | ⬜ | — | 4 |
| `/admin/categories` | staff | ✅ | ⬜ | ⬜ | — | 4 |
| `/admin/promotions`, `/nouvelle`, `/apercu`, `/:id`, `/:id/modifier` | staff | ✅ | ⬜ | ⬜ | — | 4 |
| `/admin/promotions/cartes-cadeaux/configuration`, `/cartes-cadeaux/:code` | staff | ✅ | ⬜ | ⬜ | — | 4 |
| `/admin/promotions/campagnes/nouvelle`, `/:id`, `/:id/modifier` | staff | ✅ | ⬜ | ⬜ | — | 4 |
| `/admin/avis` | staff | ✅ | ⬜ | ⬜ | — | 4 |
| `/admin/parametres` | staff | ✅ | ⬜ | ⬜ | — | 4 |
| `/admin/formations`, `/nouvelle`, `/:id`, `/:id/apercu`, `/:id/publication` | staff | ✅ | ⬜ | ⬜ | — | 4 |

### Help centre and legal pages

| Route | Access | P1 | Smoke | Native | SSR | Target |
| --- | --- | --- | --- | --- | --- | --- |
| `/aide` | open | ✅ | ✅ | ⬜ | head ✅ body ⬜ | 3.2 |
| `/aide/faq` | open | ✅ | ✅ | ⬜ | head ✅ body ⬜ | 3.2 |
| `/contact` | open | ✅ | ✅ | ⬜ | head ✅ body ⬜ | 3.2 |
| `/a-propos` | open | ✅ | ✅ | ⬜ | head ✅ body ⬜ | 3.2 |
| `/mentions-legales` | open | ✅ | ✅ | ⬜ | head ✅ body ⬜ | 3.2 |
| `/conditions-generales` | open | ✅ | ✅ | ⬜ | head ✅ body ⬜ | 3.2 |
| `/confidentialite` | open | ✅ | ✅ | ⬜ | head ✅ body ⬜ | 3.2 |
| `/cookies` | open | ✅ | ✅ | ⬜ | head ✅ body ⬜ | 3.2 |
| `/livraison` | open | ✅ | ✅ | ⬜ | head ✅ body ⬜ | 3.2 |
| `/retours-remboursements` | open | ✅ | ✅ | ⬜ | head ✅ body ⬜ | 3.2 |
| English aliases `/help`, `/faq`, `/shipping`, `/returns`, `/legal-notice`, `/terms-of-sale`, `/privacy-policy`, `/cookie-policy`, `/about` | redirect | ✅ | ✅ (`/help`, `/privacy-policy`, `/terms-of-sale`) | ⬜ | — | server redirects to `/en/…` ✅ (3.1) |

### System pages

| Route | Access | P1 | Smoke | Native | SSR | Target |
| --- | --- | --- | --- | --- | --- | --- |
| `/erreur` | open | ✅ | ✅ | ⬜ | — | 4 (becomes `error.tsx`) |
| `/maintenance` | open | ✅ | ✅ | ⬜ | — | 4 |
| `*` (404) | open | ✅ | ✅ (status 404) | `not-found.tsx` ✅ | — | real 404 status ✅ (3.1) |

## Open decisions (ask the user)

| Decision | Needed by | Status |
| --- | --- | --- |
| Where Supabase e-mail links land | phase 2 | **decided**: `/auth/confirm` |
| Locale URL format | phase 3 | **decided**: `/fr/…` and `/en/…`, hreflang between them, today's paths redirected |
| English path segments | phase 3 | **decided**: translated (`/en/shop`); the exact English words of the table in "Phase 3.1" are proposals to confirm (notably `/en/3d-studio`, `/en/colours` in British spelling, `/en/academy/course/:id`) |
| What `/` does | phase 3 | **decided**: saved choice, else browser language, else English |
| Prefix for the member space and back office | phase 3 | **decided**: no, public pages only. Assumed in this session (reversible): sign-in, registration and recovery pages count as member area (unprefixed); the cart counts as public (prefixed, noindex) |
| Per-locale product slugs (`product_translations`) in `/en/shop/:slug` | phase 3.2 | open — today the same id/slug in both languages |
| Supabase dashboard: redirect allow-list and the three e-mail templates (`supabase/README.md`, "Member sign-up") | the phase 2 release | the user does it |
| Vercel project switch to the Next.js framework preset; optional `SITE_URL` (custom domain) | before the first Next.js deployment | the user does it (later) |

## Log

Newest first. For each session: what changed, the commands run and their real results.

### 2026-09-30 — Phase 3.1

- User decisions: translated English segments; `/` by saved choice, then browser language, fallback English; only public pages prefixed. Phase 3 split into 3.1 (addresses and `<head>`, done) and 3.2 (content rendered on the server).
- Added `src/lib/localeRoutes.ts`, `localizedHistory.ts`, `pageMeta.ts`, `siteUrl.ts`, `localeHeader.ts`, `src/i18n/resources.ts` and `preference.ts`, `app/not-found.tsx`, `app/sitemap.ts`, `app/robots.ts`; proxy locale redirects; `ClientApp` on the localized history; `DocumentTitle` in `App.tsx`; the four FR/EN switches save the choice explicitly. No screen, text or style changed apart from the addresses and the tab titles of public pages.
- Results: `npm run typecheck` OK; `npm run lint` 0 errors, 95 warnings (unchanged); `npm test` 26 files / 292 tests passed (12 new in `localeRoutes.test.ts`); `npm run build` OK; `npm run test:e2e` 92 passed twice in a row on the dev servers and 92 passed on production builds (`next start`, mock build + build pointed at the fake Supabase) (smoke tests moved to `/fr/…`, new `locale.spec.ts`, `auth-server` updated). One earlier full run failed on the Studio editor test waiting 5 s for its lazy three.js chunk under load (passed alone twice); that wait now has an explicit 30 s timeout.

### 2026-09-30 — Phase 2

- User decisions: e-mail links land on `/auth/confirm`; locale URLs `/fr/…` and `/en/…` (recorded for phase 3 in AGENTS.md §4, guidelines 02 and 08; three details left open, see Open decisions).
- `@supabase/ssr` 0.12.7 and `server-only` added; sessions in cookies with the one-time carry-over of `localStorage` sessions; `proxy.ts`; `app/auth/confirm/route.ts`; `src/lib/authRoutes.ts`; sign-in pages read `?suite=`; the redirects given to Supabase point at `/auth/confirm`; `supabase/templates/confirm-signup.html` uses the token-hash link; Supabase dashboard steps in `supabase/README.md`.
- Results: `npm run typecheck` OK (also from a clean tree, thanks to `next typegen`); `npm run lint` 0 errors, 95 warnings (unchanged); `npm test` 25 files / 280 tests passed (9 new); `npm run build` OK (`ƒ Proxy (Middleware)`, `ƒ /auth/confirm`); `npm run test:e2e` 71 passed on the dev servers (49 smoke in mock mode + 22 `auth-server`) and 71 passed on production builds (`next start` of the mock build and of a build pointed at the fake Supabase). The legacy-session test failed as expected with the carry-over disabled, then passed with it restored.
- Not verified here: the flow against the real Supabase project (no test ever points at it) — to check on the first preview after the user applies the dashboard settings: sign-up confirmation, password reset, e-mail change, and an existing session surviving the release.

### 2026-09-30 — Phase 1

- Next.js 16.3.7 shell as described in "Phase 1 — how the shell works"; `index.html`, `main.tsx`, `vite-env.d.ts`, `vite.config.ts`, `tsconfig.app.json`, `tsconfig.node.json` and `vercel.json` removed; `src/pages/` → `src/screens/`; `.claude/launch.json` uses `npm run dev:mock` instead of Vite's `--mode mock`.
- New smoke test: every product card on `/boutique` shows its own photo (49 tests in total).
- Results (mock mode): `npm run typecheck` OK; `npm run lint` 0 errors, 95 warnings (same count as `dev` before the migration); `npm test` 24 files / 271 tests passed; `npm run build` OK (`/` prerendered, the other paths on demand); `npm run test:e2e` 49 passed on `next dev` (the two runs before the last test was added passed 48/48; earlier, the registration test failed twice under load on a fragile click on its visually hidden terms checkbox, fixed in the test) and 49 passed on `next build` + `next start`; `npm run dev:mock` answers on port 5173.
- Visual check (throwaway script, not committed): full-page screenshots of the 33 public routes at 1280 px and 390 px, plus the hovered gift card, taken from the Vite build of the phase 0 commit (stable: 68/68 identical on two runs) and from the Next.js production build: 68/68 identical with a zero-pixel tolerance, after the fixture-photo fix above (before it, 12 captures differed).
- The generated CSS was compared rule by rule with the Vite build: identical apart from the minifier rewrites listed above.

### 2026-09-30 — Phase 0

- Decision recorded in `AGENTS.md` §3–§5, guidelines 02, 07 and 08; this file created.
- Playwright 1.63 added (`playwright.config.ts`, `e2e/`, `npm run test:e2e`, `tsconfig.e2e.json`); Vitest limited to `src/**/*.test.{ts,tsx}`.
- Results on the Vite app (mock mode): `npx tsc -b` OK; `npm test` 24 files / 271 tests passed; `npm run build` OK; `npm run test:e2e` 48 passed. Correction made in phase 1: `npm run lint` was reported here as clean, but the phase 0 commit had one lint error in `e2e/fixtures.ts` (Playwright's `use` fixture parameter read as a React hook); fixed in phase 1 by renaming the parameter.
