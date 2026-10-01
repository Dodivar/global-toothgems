# Migration of `webapp/` from Vite + React Router to Next.js (App Router)

Living document. **Every session that works on this migration reads it first and updates it in the same commit** (phase status, route checklist, log, open decisions). The decision itself and its rationale are recorded in `AGENTS.md` §4 and `global-toothgems-llm-guidelines/02-architecture-and-engineering.md`.

## Decision in one paragraph

`webapp/` moves from a Vite single-page application to Next.js App Router, deployed on Vercel, in place (same `webapp/` folder). Reasons: server-rendered, indexable and shareable public pages (SEO, social previews, real 404s) and server-side route protection. Supabase (schema, RLS, the 35+ migrations, Auth already in production), the Edge Functions planned for Stripe and e-mail, react-i18next, Tailwind v4 and Vitest stay. Out of scope for the whole migration unless decided separately: new features, visual changes, SQL schema changes, Stripe work, a move to next-intl.

## Rules for every phase

1. **No visible change.** No route, text or style changes unless the user asks. The Playwright smoke tests (`webapp/e2e/`, `npm run test:e2e`) are the reference: they must pass before and after each step.
2. Exit criteria of every phase: `npx tsc -b` (phase 0) / `npm run typecheck` (from phase 1), `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e` — all run and green, results written in the log below.
3. Ask the user, never decide alone. Decided so far: e-mail links land on `/auth/confirm`; locale URLs are `/fr/…` and `/en/…`. Still the user's: the Vercel project and the Supabase dashboard settings (they do both; applied on 2026-09-30), and the open points listed under "Open decisions".
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
| 2 | Auth on the server | `@supabase/ssr`: browser client + server client, session in cookies (existing `localStorage` sessions carried over), `proxy.ts` (Next.js 16 name of middleware) refreshing the session and redirecting signed-out visitors away from `/compte/*`, `/academy/mes-formations/*`, `/academy/lecon` and `/admin/*` (client guards stay as a second layer); e-mail links through `/auth/confirm` (token hash or PKCE code); Supabase dashboard settings updated **by the user** | done (2026-09-30); live since the user applied the Supabase settings and switched Vercel the same day |
| 3.1 | Language in the address + SEO head | `/fr/…` and `/en/…` with English segments for public pages, `/` negotiated, old addresses moved (308), localized history for the React Router app, server `<head>` per page (title, description, canonical, hreflang, Open Graph, noindex for private areas), real 404 status, `sitemap.xml`, `robots.txt` | done (2026-09-30) |
| 3.2 | Public pages rendered on the server | Home, shop, shapes, colours, product, gift card, loyalty, Studio and Academy sales pages, help and legal pages as App Router segments whose content is rendered on the server (data read with the publishable key); product and course titles/descriptions and structured data (Product, Course); 404 for unknown product/course slugs; per-locale product slugs (`product_translations`); products and courses in the sitemap; `window`/`localStorage` code behind client boundaries | **done except the course pages' own head** (2026-09-30): every public page's content is rendered on the server and hydrated; product pages have per-language slugs, 404/308, their own head, Product structured data and sitemap entries. Course titles, Course structured data, 404 for unknown courses and courses in the sitemap wait for a decision (Academy is mock data, see Open decisions) |
| 4 | Account, back office, Studio | `/compte/*`, community, learner pages, `/admin/*`, Studio editor/share as App Router segments (mostly client components under server-protected layouts); Studio stays client-only | **done** (2026-09-30): one segment per zone, each mounting a React Router app reduced to its screens (see "Phase 4"); public pages download 29 % less JavaScript (992 → 709 kB gzip) |
| 5 | Cleanup | Remove the catch-all shell, react-router-dom, SPA-only helpers (`ScrollToTop`, `DocumentLanguage`…), dead Vite leftovers; update READMEs | **done** (2026-09-30 → 10-01): every screen its own segment, React Router removed, links are client-side navigations across the whole site, each page downloads its own screen (public pages 726 → 589–624 kB gzip, `/admin` 1 007 → 625 kB; see "Phase 5") |

A route leaves the catch-all shell only when its App Router page exists, its smoke test (added if missing) passes, and every link to it still works from the shell (a full page load between the two worlds is acceptable during phases 3–4).

## Phase 1 — how the shell works

Historical: since phase 3.2 public pages are rendered on the server (see "Phase 3.2"); what follows still describes the browser-only path of the other areas.

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
- **`proxy.ts`**: runs on page requests (static files excluded by the matcher). Without an auth cookie it calls nothing. Otherwise `getClaims()` validates the access token (JWKS, or Auth for a shared-secret project) and refreshes it when expired, writing the new cookies to the request and the response. Signed-out visitor on a gated path → 307 to `/connexion?suite=<path+query>` (member space, learner pages) or `/admin/connexion?suite=…` (back office); `Login` and `AdminLogin` read `?suite=` besides the history state they already read. The staff role was not checked here until 2026-10-01; since then a signed-in account that is not an active staff member is sent to `/admin/connexion?suite=…` too (see "Phase 5"). Mock mode: the proxy does nothing, the client guards decide as before.
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
| Payment return (noindex, Stripe's return address) | `/fr/panier/confirmation` | `/en/cart/confirmation` |
| Loyalty, gift card | `/fr/fidelite`, `/fr/carte-cadeau` | `/en/loyalty`, `/en/gift-card` |
| Studio 3D sales, subscription | `/fr/studio-3d`, `/fr/studio-3d/abonnement` | `/en/3d-studio`, `/en/3d-studio/subscribe` |
| Academy, course sales page | `/fr/academy`, `/fr/academy/formation/:id` | `/en/academy`, `/en/academy/course/:id` |
| Help, FAQ, contact, about | `/fr/aide`, `/fr/aide/faq`, `/fr/contact`, `/fr/a-propos` | `/en/help`, `/en/help/faq`, `/en/contact`, `/en/about` |
| Legal notice, terms, privacy, cookies, shipping, returns | `/fr/mentions-legales`, `/fr/conditions-generales`, `/fr/confidentialite`, `/fr/cookies`, `/fr/livraison`, `/fr/retours-remboursements` | `/en/legal-notice`, `/en/terms-of-sale`, `/en/privacy-policy`, `/en/cookie-policy`, `/en/shipping`, `/en/returns` |

The English segments reuse the English aliases the app already had where there was one; the others were proposals, confirmed by the user on 2026-09-30. Not prefixed (the member area in the broad sense, `noindex`): sign-in, registration, recovery and e-mail landing pages, `/compte/*`, learner pages (`/academy/lecon`, `/academy/mes-formations/*`), the Studio editor and share viewer, `/admin/*`, `/erreur`, `/maintenance`. Their language is the saved choice, else the browser's, else English.

How it works:
- **One table**, `src/lib/localeRoutes.ts` (pure, unit-tested, including a check that every route of `App.tsx` is known to the server): public routes in both languages, parsing and writing addresses, old addresses, language negotiation, the paths that exist.
- **Proxy**: `/` → 307 to `/fr` or `/en` (cookie `gt-lang`, else `Accept-Language`, else English; `Vary: Cookie, Accept-Language`, not cached); old unprefixed public addresses and the former English aliases → 308 to their new address (`/boutique` → `/fr/boutique`, `/help` → `/en/help`), query kept; sets `x-gt-locale` for `<html lang>`. Runs in mock mode too; the auth part still only with Supabase configured.
- **React Router app unchanged in its routes and links**: it keeps its French paths internally; `src/lib/localizedHistory.ts` (via `unstable_HistoryRouter`) translates at the edge, so every `<Link to="/boutique">` renders `href="/en/shop"` in English, the language follows the address (back button included), and the FR/EN switch rewrites the address of a public page to its other language.
- **Saved choice**: only the four FR/EN switches save it (`src/i18n/preference.ts`: localStorage `gt-lang` as before, plus a cookie of the same name the proxy reads; an existing localStorage choice is copied to the cookie once). Opening an English link does not overwrite a saved French choice. i18next no longer caches what it detects; detection order: localStorage, cookie, browser, then English (was: localStorage, then French).
- **Server `<head>`** (`app/[[...slug]]/page.tsx`, `src/lib/pageMeta.ts`): title and description from text the pages already show (heading and introduction; legal pages from `data/legal/`), canonical, `hreflang` fr/en/x-default (x-default: `/` for the home, else the English page), Open Graph; private areas `noindex`. The same table sets the tab title during client navigation (`DocumentTitle` in `App.tsx`), so pages that used to show "Global Toothgems" now show their own title. Product and course pages keep "Global Toothgems" until 3.2.
- **404**: an address with no screen answers HTTP 404 (`notFound()`); `app/not-found.tsx` renders the app, which shows its usual 404 page. The member space and back office keep answering 200 for their unknown sub-addresses (their 404 screen lives inside their shell).
- **`sitemap.xml`** (static public pages, both languages with alternates) and **`robots.txt`** (private areas disallowed). Absolute URLs from `SITE_URL` (optional, server-only), else Vercel's production domain, else localhost.

Known limits, accepted: internal links still point to the unprefixed French path in the code, translated at render (search engines see the localized `href`); the first page load on a public address renders client-side as before (content SSR is 3.2, since done); `/fr/boutique/<unknown>` answers 200 with the app's "product not found" state until 3.2 (since done: 404).

## Phase 3.2 — public pages rendered on the server

Historical where it names React Router, `ServerApp` or the catch-all page: since phase 5 each public page is its own segment (see "Phase 5"); the catalogue seed, slugs, cache and hydration rules below still hold.

Decided by the product owner (2026-09-30): **product slugs per language**, `/fr/boutique/<French slug>` and `/en/shop/<English slug>`, from `product_translations.slug` (`products.slug` is the French one); hreflang, canonical, sitemap and the FR/EN switch point to the other language's slug; another language's slug or an old identifier moves (308) to the right address; an unknown slug is a 404. No schema change was needed: every product of the Supabase project already has a published English slug (90 active products checked on 2026-09-30). Mock fixtures have no English slug: both languages use their id, as before.

How it works:
- **The content is the React Router app rendered on the server.** Public addresses (`/fr/…`, `/en/…`) render `ServerRendered` (`app/[[...slug]]/client.tsx`): on the server, `ServerApp` (`src/ClientApp.tsx`) renders the whole app — header, page, footer — at the requested address with a server history (`createServerLocalizedHistory`: fixed location, links written exactly as the browser history writes them) and an i18next instance fixed to the address's language; in the browser, `ClientApp` hydrates the same markup. Member space, sign-in, back office and Studio workspace still render in the browser only (`ClientOnly`, `dynamic(..., { ssr: false })`). Deviation from the plan's wording ("App Router segments"): except the product pages, the public pages are not separate segments yet; the React Router screens are rendered by the catch-all page until phase 5 removes React Router, which is when each screen becomes its own segment. No screen was rewritten, so no text or style changed.
- **Catalogue on the server** (`src/lib/catalog/serverCatalog.ts`, `src/lib/supabase/publicServer.ts`): read with the publishable key and no session (anonymous RLS), per request (React `cache`). Pages showing products (home, shop, product, shapes, colours, cart) get the whole catalogue (products, colours, taxonomy) as a seed for `CatalogProvider`, the others the taxonomy (header menu); the browser starts from the seed and does not ask again for what it got. A part that fails on the server is left to the browser, as before. Mock mode: no seed, the fixtures are in the bundle.
- **Catalogue cache** (added after 3.2, same day): every Supabase read of `serverCatalog.ts` (catalogue, colours, taxonomy, product by key, sitemap slugs) goes through `unstable_cache` — the Next.js data cache, persistent and shared by all instances on Vercel — for 60 s (`CATALOGUE_TTL_SECONDS`), tagged `catalog`. Anonymous reads are identical for every visitor, so one read serves all renders. A back-office change reaches server-rendered pages within 60 s (a browser keeps what its page was rendered with until it reloads); displayed prices are indicative, checkout recomputes them in the database. Failed reads are not cached. Chosen over `use cache`, which needs `cacheComponents` (a change of rendering model for the whole app) and whose default in-memory store does not persist between serverless invocations. Follow-up: invalidate on demand (`revalidateTag("catalog")`) from a server route called after a back-office save, authorized by the staff session. Covered by `auth-server.spec.ts` ("reads the catalogue once for many page renders", counting server reads on the fake Supabase).
- **Product pages** have their own segments, `app/fr/boutique/[slug]` and `app/en/shop/[slug]` (`app/_public/productPage.tsx`): the product is found by any of its keys (`fetchProductByKey`: French slug, published slug of another language, row id), then 404 (`notFound()`), 308 (`permanentRedirect`, query kept) or the page with its title (`<name> · Global Toothgems`), description (its description as plain text, else the line the page shows without one, cut at 160 characters), hreflang to the other language's slug, Open Graph image and `application/ld+json` schema.org `Product` (price from minor units, currency, availability, rating when reviewed) — `src/lib/catalog/productMeta.ts`, unit-tested. The tab title follows client navigation (`DocumentTitle` in `App.tsx`).
- **Slugs in addresses** (`src/lib/catalog/productSlugs.ts`, pure, unit-tested): `localeRoutes.ts` takes an optional parameter translator; the browser's comes from the loaded catalogue (`productSlugRegistry.ts`, filled by `CatalogProvider` before links render), the server's from the page's own seed (a shared registry would mix requests). Unknown slugs are left as written; the server moves them.
- **Sitemap**: every product in both languages with its alternates (`listPublicProductSlugs`), rendered per request.
- **Browser state and hydration**: state the server cannot see is read once hydrated (`src/lib/useHydrated.ts`): the cookie choice (the banner waits for it rather than flashing at visitors who already chose), the legal review notes toggle, the launch checklist ticks; the Academy count-up starts at 0 on both sides. React 19 reports any mismatch as a console error, which fails the smoke tests; `server-rendering.spec.ts` covers a returning visitor with saved choices and reduced motion (checked to fail with the old consent reading).
- **Metadata is not streamed** (`htmlLimitedBots: /.*/` in `next.config.ts`): with streaming, a page hydrated quickly could switch language before its `<title>` arrived and have it overwritten (seen once in the smoke tests). Every response now has its whole `<head>` up front; the pages await the same data anyway.

Known limits, accepted for now:
- ~~Prices and dates are formatted with the shared i18next instance (`lib/format.ts`)~~ — done in phase 5: `useFormat()` uses the rendering tree's language.
- Catalogue pages carry the whole catalogue in their payload (measure on the production site: 90 products). Server reads are cached across requests since the catalogue-cache step below.
- The cookie banner is not in the server HTML: it appears once the page is hydrated (as it did before, when everything rendered in the browser). The legal review notes show by default on the server and disappear after hydration for a reviewer who turned them off.
- Course pages are rendered on the server from the mock fixtures, as the browser rendered them; their head, 404 and sitemap entries wait for the Academy decision.

## Phase 4 — zones

Historical since phase 5 (zones are still the site's areas, but no longer React Router apps; see "Phase 5").

Decided by the user (2026-09-30): one catch-all segment per zone mounting a React Router app reduced to that zone's routes and providers, under a server-protected layout (native segments for each screen come with phase 5, when React Router is removed); the cart kept for the browser tab in sessionStorage; the mock member session kept for the tab; sign-in, registration and recovery stay in the public zone; `/erreur` and `/maintenance` stay there too (`error.tsx` in phase 5); the Studio aliases stay browser redirects; the other mock stores reset between zones (accepted).

| Zone | Addresses | Segment | Server check | Rendering |
| --- | --- | --- | --- | --- |
| public | public pages (`/fr/…`, `/en/…`), sign-in, registration, recovery, e-mail landings, `/erreur`, `/maintenance`, legacy aliases, 404 | `app/[[...slug]]` (+ product segments) | none | server + hydration for public pages, browser only for the rest |
| account | `/compte`, `/compte/*` (member space, community) | `app/compte/[[...slug]]` | session (layout + page) | browser only |
| learn | `/academy/lecon`, `/academy/mes-formations/*` | `app/academy/(learner)/lecon`, `…/mes-formations/[...slug]` | session (layout + page) | browser only |
| admin | `/admin/connexion` (open), `/admin`, `/admin/*` | `app/admin/connexion`, `app/admin/(staff)/[[...slug]]` | session (layout + page), not the staff role | browser only |
| studio | `/studio-3d/atelier/*`, `/studio-3d/partage/*` | `app/studio-3d/atelier/[[...slug]]`, `app/studio-3d/partage/[[...slug]]` | none (open during the preview) | browser only (three.js still a lazy chunk inside the zone) |

How it works:
- **One table**, `src/lib/appZones.ts` (`zoneOf`, pure, unit-tested — including that every route a zone app declares belongs to that zone and that each private zone has its segment).
- **`src/AppShell.tsx`** is what every zone shares: all the stores in the order their comments justify, the skip link, cookie banner and dialog, header/footer (public), `DocumentTitle`/`DocumentLanguage`/`ScrollToTop`. Each zone passes its `<Routes>`: `src/App.tsx` (public), `src/zones/AccountApp.tsx`, `LearnApp.tsx`, `AdminApp.tsx`, `StudioApp.tsx`; `src/AppRoot.tsx` wraps them in i18n and the localized browser history. Every zone keeps every store for now (no behaviour change inside a zone); dropping the stores a zone does not use is a later optimisation.
- **Moving between zones**: each zone app's `*` route is `ZoneExit` (`src/zones/ZoneExit.tsx`). An address of another zone reloads the page (React Router has already put it in the address bar; the history entry keeps its state across the reload, e.g. the page to return to after sign-in); an address no zone owns is the 404 screen as before. Loop guard: the address being reloaded is noted in sessionStorage; if the page comes back to the same wrong zone at that address, it shows the 404 screen; the owning zone clears the note (`ZoneArrival`). The back button across zones loads the earlier page.
- **Server check**: `app/_zones/guard.ts` — `getClaims()` with the server client (`createServerSupabase`, the visitor's cookies, never the service role), once per request (React `cache`), then `redirect()` (307) to `signInRedirect(gateFor(path))`, the proxy's own rule. The layouts (`app/compte/layout.tsx`, `app/academy/(learner)/layout.tsx`, `app/admin/(staff)/layout.tsx`) are not given the address: the proxy passes it in the `x-gt-path` request header (always overwritten). The pages check again with their own address (Next.js docs: a layout does not stop its page from rendering), and answer 404 for addresses the zone has no screen for, with the same `<head>` as before (`app/_zones/zonePage.tsx`: site name, `noindex`). Mock mode: no check, the client guards decide. The staff role is not checked on the server: RLS and the back office do it.
- **Cart and demo sessions kept for the tab**: `src/lib/cartStorage.ts` (sessionStorage `gt-cart`, every line validated when read back, unit-tested) read once hydrated in `CartProvider`; the mock member (`gt-demo-session`) and staff (`gt-demo-admin-session`) sessions likewise, so a demo sign-in reaches the member space and the back office. Consequence on server-rendered pages in mock mode: the demo auth is `restoring` until hydrated, as a Supabase session always was.

Bundle sizes (production build in mock mode, JavaScript actually downloaded by Chromium per page after the network is idle, lazy chunks included; throwaway measuring script):

| Page | Before (45e02f1) raw / gzip | After raw / gzip |
| --- | --- | --- |
| `/fr`, `/fr/boutique`, product page, `/fr/academy` | 3 854 / 992 kB | 2 501 / 709 kB |
| `/connexion` | 3 855 / 992 kB | 2 502 / 709 kB |
| `/compte` (signed in), `/compte/communaute` | 3 855 / 992 kB | 2 688 / 751 kB |
| `/academy/mes-formations/fondation` | 3 855 / 992 kB | 2 595 / 735 kB |
| `/admin` (signed in) | 3 855 / 992 kB | 3 738 / 983 kB |
| `/studio-3d/atelier` | 4 865 / 1 258 kB | 3 539 / 984 kB |
| `/studio-3d/partage` | 4 596 / 1 189 kB | 3 255 / 910 kB |

(Before, `/compte`, `/admin` and the learner pages were measured signed out, i.e. redirected to a sign-in page, which loaded the same single bundle.) What remains shared by every zone: the stores and their mock fixtures, both locale files, the header and footer. Known limits, accepted: the mock stores other than the cart and the demo sessions (orders placed by the demo checkout, learning progress, promotions, training, community, in-memory reviews) reset when the visitor changes zone; a cart line keeps the image address it was added with (after a deployment a mock photo's hashed address may change until the tab is closed); `/studio-3d/editor/*` and `/studio-3d/share/*` still redirect in the browser (one extra load).

## Phase 5 — one segment per screen, React Router removed

Decided by the user (2026-09-30): the plan below, in this order (zone by zone: Studio, learner pages, member space, back office, then the public zone); **option A** for the state a navigation hands to the page it opens; `/erreur` keeps its address (and `error.tsx` shows the same screen); the Studio aliases are moved by the server (308, the default the plan proposed — the user asked why, answered in the session report).

How it works:
- **Segments**: every screen is its own App Router segment and imports its own `"use client"` module from `src/screens/`, so a page downloads its screen plus the shared code (stores, fixtures, translations, chrome). Public pages: `app/(public)/fr/…` and `app/(public)/en/…`, one segment per page and language, built from `PUBLIC_ROUTES` (`app/_public/publicPage.tsx`: `<head>` from `pageMeta`, as before); product pages `app/(public)/{fr/boutique,en/shop}/[slug]` (`productPage.tsx`, unchanged 404/308/JSON-LD); sign-in, registration, recovery, e-mail landings, `/erreur`, `/maintenance` under `app/(public)/<address>`, still rendered in the browser only (`src/zones/BrowserOnly.tsx`). Private zones: `app/compte` (`MemberShell`, then `(space)` with `AccountLayout` and `communaute` with `CommunityLayout`), `app/academy/(learner)`, `app/admin` (`(staff)` with `RequireAdmin` + `AdminLayout`, whose outlet context became a React context), `app/studio-3d`; rendered in the browser only (`ZoneChrome`), each page checking the session with its own address (`app/_zones/zonePage.tsx`, `zoneScreen`) under the layouts' check (`guardRequest`), as in phase 4. `src/lib/privateSegments.test.ts` fails if a gated page or layout loses its check (checked by removing one).
- **Navigation** (`src/lib/navigation`): `Link`, `NavLink`, `Navigate`, `useNavigate`, `useLocation`, `useParams`, `useSearchParams` with React Router's names and shapes, on `next/link` and `next/navigation`; ~160 files only changed their import. Screens write internal French paths; `href.ts` writes the address in the page's language (the address's, else the UI's) with the product slug of that language from the catalogue the page holds (`useSlugTranslator`, the same seed on the server and on the first browser render). Search-parameter updates use the history API (no server round trip). Next.js's own scrolling and prefetching are off: `ScrollToTop` keeps "every new page starts at the top", and pages are rendered per request.
- **State handed to a page** (option A, `state.ts`): kept for the tab in sessionStorage with the address it is for; the page at that exact address (path and query) reads it, also after a reload; every other navigation clears it. Addresses never change. Known limit: back/forward to an earlier page does not bring back what that page was given.
- **Stores** in the root layout (`src/AppProviders.tsx`, same order and comments as before), so they outlive navigations between pages and zones — the phase-4 limit "other mock stores reset between zones" is gone. The catalogue seed is read by the root layout for the address the proxy saw (`x-gt-path`); a later client-side navigation keeps what the stores hold and they load the rest. The cart and the demo sessions stay in sessionStorage (decided in phase 4), for reloads. The favourites account dialog moved from its provider into the chrome (`FavoriteAccountDialogHost`).
- **Language**: a public page speaks the language of its address with that language's i18next instance (`src/i18n/instances.ts`), on the server and in the browser, so `/fr/…` → `/en/…` renders in English at once and concurrent server renders never share an instance; the main instance (other pages) follows the last public page shown, as before. The FR/EN switches (`useLanguageSwitch`) save the choice and, on a public page, replace the address with the other language's (slug, query and fragment kept). Prices and dates are formatted in the rendering tree's language (`useFormat()` in `lib/format.ts`, 72 files), not the shared instance's. `DocumentLanguage` stays: the root layout's `<html lang>` is not rendered again by a client-side navigation.
- **Kept on purpose**: `ScrollToTop` (above), `DocumentLanguage` (above), screens' own `useDocumentTitle`. Removed: `DocumentTitle` (the metadata of each segment titles the tab on every navigation), `ZoneExit`/`ZoneArrival`, `localizedHistory`, `AppRoot`, `ClientApp`/`ServerApp`, the zone apps, `appZones.ts`, `productSlugRegistry.ts`, `isKnownPath` (unknown addresses are 404 because no segment exists), `react-router-dom`. `vite` stays: it is Vitest's peer dependency (`^6.4.0 || ^7.0.0 || ^8.0.0`, checked in `node_modules/vitest/package.json`).
- **404 "back" action**: React Router numbered its history entries; `NotFound` now offers "back" when another page of the site was shown in this tab, or the page was opened from the site (`history.ts`).
- **Redirects**: `/connexion-b` is moved by the proxy (308, `legacyAddress`). The Studio's former English aliases `/studio-3d/editor/*` and `/studio-3d/share(/<token>)` were moved (308) during the phase, then dropped on the user's decision (2026-10-01: the project is in development, no old link to keep): they answer 404.
- **Back office refused to non-staff on the server** (decided by the user, 2026-10-01): the proxy reads the signed-in account's own profile (RLS, `src/lib/staffProfile.ts`, the rule `adminAuth.tsx` also uses) and sends an account that is not an active staff member to `/admin/connexion?suite=…` (307), as `RequireAdmin` does in the browser; the back office's layout and pages check again (`app/_zones/guard.ts`; their redirect reaches the browser within the streamed page). A profile that cannot be read counts as not staff. Navigation only: RLS remains the authority. Tested in `auth-server.spec.ts` (a member refused, a staff member let in, against a staff account added to the fake Supabase).

Bundle sizes (production build in mock mode, JavaScript downloaded by Chromium after `networkidle` + 1.5 s, gzip via zlib; same throwaway script before and after):

| Page | Before (1be0eb5) raw / gzip | After raw / gzip |
| --- | --- | --- |
| `/fr` | 2 562 / 726 kB | 2 095 / 624 kB |
| `/fr/boutique` | 2 562 / 726 kB | 2 021 / 606 kB |
| `/fr/academy` | 2 562 / 726 kB | 1 961 / 589 kB |
| `/connexion` | 2 562 / 726 kB | 1 966 / 591 kB |
| `/compte` (demo member) | 2 753 / 769 kB | 2 009 / 599 kB |
| `/compte/communaute` | 2 753 / 769 kB | 2 003 / 596 kB |
| `/academy/mes-formations/fondation` | 2 658 / 752 kB | 1 961 / 587 kB |
| `/admin` (demo staff) | 3 828 / 1 007 kB | 2 086 / 625 kB |
| `/studio-3d/atelier` | 3 624 / 1 008 kB | 2 985 / 858 kB |
| `/studio-3d/partage` | 3 333 / 932 kB | 2 693 / 782 kB |

What every page still shares: the stores and their mock fixtures, both locale files, the chrome. A client-side navigation then downloads only the next screen's chunk.

Known limits, accepted (to check on the first preview):
- A client-side navigation asks the server for the next segment (RSC request) — also between two sections of one screen (Studio editor sections, back-office detail pages); it used to be immediate in the browser. In headless Chromium, which draws WebGL in software, a navigation away from a moving 3D stage waits seconds for the main thread (React transition); on a real GPU it should not — to verify on a phone.
- The member space, learner pages, back office and Studio send no content in their HTML (as before); the storefront chrome of sign-in, recovery and system pages is now in the server HTML, their content still appears once hydrated.
- `error.tsx` was not exercised by a test (no page fails on purpose); `/erreur` is.
- Once, on a dev server, Turbopack aborted with an internal panic after dozens of segments were deleted and created (`turbo-tasks … inner_of_upper_lost_follower`); not reproduced after clearing `.next`. A dev-only tool bug.

## Route checklist

Legend (phase 1 done: every route below was served by the catch-all shell; phase 2 done: "account" and "staff" routes are also turned away server-side by `proxy.ts`; phase 3.2: public pages rendered on the server; phase 4: private zones had their own segments; phase 5 done: every screen is its own App Router segment and the catch-all shell is gone — **Native** below is the segment serving the route) — **Access**: open / account (`RequireAccount` + proxy + zone layout/page) / staff (`RequireAdmin` + proxy + zone layout/page) / studio (`RequireStudioAccess`) / redirect (308 from the proxy since phase 5). **P1**: was served by the catch-all shell in phase 1. **Smoke**: covered by `webapp/e2e/`. **Native**: App Router segment exists. **SSR**: "head" = server `<head>` done (3.1), "body" = content rendered on the server (3.2). Public routes now live at `/fr/…` / `/en/…` (table in phase 3.1); the address in the first column is the internal one and, when unprefixed, redirects (308). Target phase in the last column.

### Storefront

| Route | Access | P1 | Smoke | Native | SSR | Target |
| --- | --- | --- | --- | --- | --- | --- |
| `/` | open | ✅ | ✅ | ✅ `app/(public)/fr/…`, `app/(public)/en/…` | head ✅ body ✅ | done (5) |
| `/accueil-b` → `/` | redirect | ✅ | ✅ | — | — | server redirect ✅ (3.1) |
| `/boutique` | open | ✅ | ✅ (+ distinct product photos) | ✅ `app/(public)/fr/…`, `app/(public)/en/…` | head ✅ body ✅ | done (5) |
| `/boutique-b` → `/boutique` | redirect | ✅ | ✅ | — | — | server redirect ✅ (3.1) |
| `/boutique/:id` (`/fr/boutique/<French slug>`, `/en/shop/<English slug>`) | open | ✅ | ✅ (+ 404, 308, head, JSON-LD, slugs in `auth-server`) | ✅ `app/(public)/fr/boutique/[slug]`, `app/(public)/en/shop/[slug]` | head ✅ (product) body ✅ | done (3.2) |
| `/formes` | open | ✅ | ✅ | ✅ `app/(public)/fr/…`, `app/(public)/en/…` | head ✅ body ✅ | done (5) |
| `/couleurs` | open | ✅ | ✅ | ✅ `app/(public)/fr/…`, `app/(public)/en/…` | head ✅ body ✅ | done (5) |
| `/panier` | open | ✅ | ✅ (cart flow) | ✅ `app/(public)/fr/…`, `app/(public)/en/…` | head ✅ (noindex) body ✅ | done (5) |
| `/panier/confirmation` (Stripe return, added with the checkout) | open | ✅ | ✅ (`cart.spec`) | ✅ `app/(public)/fr/panier/confirmation`, `…/en/cart/confirmation` | head ✅ (noindex) body ✅ (state read once hydrated) | done (5) |
| `/fidelite` | open | ✅ | ✅ | ✅ `app/(public)/fr/…`, `app/(public)/en/…` | head ✅ body ✅ | done (5) |
| `/carte-cadeau` | open | ✅ | ✅ | ✅ `app/(public)/fr/…`, `app/(public)/en/…` | head ✅ body ✅ | done (5) |
| `/gift-card` (alias) | redirect | ✅ | ✅ (`locale.spec.ts`) | — | — | server redirect to `/en/gift-card` ✅ (3.1) |

### Sign-in, registration, recovery

| Route | Access | P1 | Smoke | Native | SSR | Target |
| --- | --- | --- | --- | --- | --- | --- |
| `/connexion` | open | ✅ | ✅ (mock sign-in; return to the page asked for, `zones.spec.ts`) | ✅ `app/(public)/<address>` (browser only) | — | done (5) |
| `/connexion-b` → `/connexion` | redirect | ✅ | ✅ | ✅ `app/(public)/<address>` (browser only) | — | done (5) |
| `/inscription` | open | ✅ | ✅ (mock registration) | ✅ `app/(public)/<address>` (browser only) | — | done (5) |
| `/mot-de-passe-oublie`, `/forgot-password` | open | ✅ | ✅ (FR) | ✅ `app/(public)/<address>` (browser only) | — | done (5) |
| `/reinitialiser-mot-de-passe`, `/reset-password` | open (e-mail link) | ✅ | ✅ (FR) | ✅ `app/(public)/<address>` (browser only) | — | done (5) |
| `/verifier-email`, `/verify-email` | open (e-mail link) | ✅ | ✅ (FR) | ✅ `app/(public)/<address>` (browser only) | — | done (5) |
| `/confirmation-compte` | open (after `/auth/confirm`) | ✅ | ✅ | ✅ `app/(public)/<address>` (browser only) | — | done (5) |
| `/auth/confirm` (route handler, phase 2) | open (e-mail links) | — | ✅ (`auth-server`) | ✅ | — | done |

### Studio 3D

| Route | Access | P1 | Smoke | Native | SSR | Target |
| --- | --- | --- | --- | --- | --- | --- |
| `/studio-3d` | open | ✅ | ✅ | ✅ `app/(public)/fr/…`, `app/(public)/en/…` | head ✅ body ✅ | done (5) |
| `/studio-3d/abonnement` | open | ✅ | ✅ | ✅ `app/(public)/fr/…`, `app/(public)/en/…` | head ✅ body ✅ | done (5) |
| `/studio-3d/subscribe` → `/en/3d-studio/subscribe` | redirect | ✅ | ✅ | — | — | server redirect ✅ (3.1) |
| `/studio-3d/atelier/*` (editor, lazy three.js) | studio | ✅ | ✅ (canvas renders) | ✅ `app/studio-3d/atelier/[[...slug]]` | — (client only) | done (5): one segment per screen |
| `/studio-3d/editor/*` (former alias) | — | ✅ | ✅ 404 (`zones.spec.ts`) | — | — | dropped (decided 2026-10-01): 404 |
| `/studio-3d/partage`, `/studio-3d/partage/:token` | open (lazy three.js) | ✅ | ✅ (no token; open on the server) | ✅ `app/studio-3d/partage/[[...slug]]` | — (client only) | done (5): one segment per screen |
| `/studio-3d/share`, `/studio-3d/share/:token` (former alias) | — | ✅ | ✅ 404 (`zones.spec.ts`) | — | — | dropped (decided 2026-10-01): 404 |

### Academy

| Route | Access | P1 | Smoke | Native | SSR | Target |
| --- | --- | --- | --- | --- | --- | --- |
| `/academy` | open | ✅ | ✅ | ✅ `app/(public)/fr/…`, `app/(public)/en/…` | head ✅ body ✅ | done (5) |
| `/academy/formation/:id` | open | ✅ | ✅ | ✅ `app/(public)/fr/academy/formation/[id]`, `…/en/academy/course/[id]` | head: generic (site name) body ✅ (fixtures) | course title, Course JSON-LD, 404, sitemap: **decision needed** (Academy mock) |
| `/academy/lecon` | account | ✅ | ✅ (proxy redirect; forwards to the course, `zones.spec.ts`) | ✅ `app/academy/(learner)` | — | done (5): one segment per screen |
| `/academy/mes-formations/:courseId` | account | ✅ | ✅ | ✅ `app/academy/(learner)` | — | done (5): one segment per screen |
| `/academy/mes-formations/:courseId/lecon/:nodeKey` | account | ✅ | ✅ (proxy redirect) | ✅ `app/academy/(learner)` | — | done (5): one segment per screen |
| `/academy/mes-formations/:courseId/terminee` | account | ✅ | ✅ (+ server refusal) | ✅ `app/academy/(learner)` | — | done (5): one segment per screen |

### Member area (`MemberShell`, account)

| Route | Access | P1 | Smoke | Native | SSR | Target |
| --- | --- | --- | --- | --- | --- | --- |
| `/compte` | account | ✅ | ✅ (redirect + mock sign-in; proxy redirect and cookie session in `auth-server`) | ✅ `app/compte/…` | — | done (5): one segment per screen |
| `/compte/attestations` | account | ✅ | ✅ (`zones.spec.ts`) | ✅ `app/compte/…` | — | done (5): one segment per screen |
| `/compte/commandes` | account | ✅ | ✅ (redirect, `zones.spec.ts`) | ✅ `app/compte/…` | — | done (5): one segment per screen |
| `/compte/commandes/:reference` | account | ✅ | ✅ (`orders.spec.ts`; proxy redirect in `auth-server`) | ✅ `app/compte/…` | — | done (5) — added 2026-09-30 (order detail, zone route in `AccountApp`) |
| `/compte/profil` | account | ✅ | ✅ (`zones.spec.ts`) | ✅ `app/compte/…` | — | done (5): one segment per screen |
| `/compte/securite` | account | ✅ | ✅ (`zones.spec.ts`) | ✅ `app/compte/…` | — | done (5): one segment per screen |
| `/compte/fidelite` | account | ✅ | ✅ (`zones.spec.ts`) | ✅ `app/compte/…` | — | done (5): one segment per screen |
| `/compte/avis` | account | ✅ | ✅ (`zones.spec.ts`) | ✅ `app/compte/…` | — | done (5): one segment per screen |
| `/compte/*` (404 inside the shell) | account | ✅ | ✅ (`zones.spec.ts`) | ✅ `app/compte/…` | — | done (5): one segment per screen |
| `/compte/communaute` | account | ✅ | ✅ (`zones.spec.ts`) | ✅ `app/compte/…` | — | done (5): one segment per screen |
| `/compte/communaute/canal/:channelId` | account | ✅ | ✅ (client-side navigation, `zones.spec.ts`) | ✅ `app/compte/…` | — | done (5): one segment per screen |
| `/compte/communaute/discussion/:discussionId` | account | ✅ | ✅ (client-side navigation, `zones.spec.ts`) | ✅ `app/compte/…` | — | done (5): one segment per screen |
| `/compte/communaute/activite/:view` | account | ✅ | ✅ (client-side navigation, `zones.spec.ts`) | ✅ `app/compte/…` | — | done (5): one segment per screen |
| `/compte/communaute/membres` | account | ✅ | ✅ (`zones.spec.ts`) | ✅ `app/compte/…` | — | done (5): one segment per screen |
| `/compte/communaute/charte` | account | ✅ | ✅ (`zones.spec.ts`) | ✅ `app/compte/…` | — | done (5): one segment per screen |
| `/compte/communaute/*` (404) | account | ✅ | ✅ (`zones.spec.ts`) | ✅ `app/compte/…` | — | done (5): one segment per screen |

### Back office (`AdminLayout`, staff)

| Route | Access | P1 | Smoke | Native | SSR | Target |
| --- | --- | --- | --- | --- | --- | --- |
| `/admin/connexion` | open | ✅ | ✅ | ✅ `app/admin/connexion` | — | done (5): one segment per screen |
| `/admin` | staff | ✅ | ✅ (client and proxy redirects) | ✅ `app/admin/(staff)/…` | — | done (5): one segment per screen |
| `/admin/commandes`, `/admin/commandes/:reference` | staff | ✅ | ✅ list only (`zones.spec.ts`) | ✅ `app/admin/(staff)/…` | — | done (5): one segment per screen |
| `/admin/clients`, `/admin/clients/:id` | staff | ✅ | ✅ list only (`zones.spec.ts`) | ✅ `app/admin/(staff)/…` | — | done (5): one segment per screen |
| `/admin/utilisateurs` | staff | ✅ | ✅ (`zones.spec.ts`) | ✅ `app/admin/(staff)/…` | — | done (5): one segment per screen |
| `/admin/statistiques` | staff | ✅ | ✅ (`zones.spec.ts`) | ✅ `app/admin/(staff)/…` | — | done (5): one segment per screen |
| `/admin/produits` | staff | ✅ | ✅ (redirect, sign-in return, `zones.spec.ts`) | ✅ `app/admin/(staff)/…` | — | done (5): one segment per screen |
| `/admin/produits/nouveau`, `/admin/produits/:id`, `/admin/produits/:id/recommandations` | staff | ✅ | ✅ `/nouveau` (`zones.spec.ts`) | ✅ `app/admin/(staff)/…` | — | done (5): one segment per screen |
| `/admin/categories` | staff | ✅ | ✅ (`zones.spec.ts`) | ✅ `app/admin/(staff)/…` | — | done (5): one segment per screen |
| `/admin/promotions`, `/nouvelle`, `/apercu`, `/:id`, `/:id/modifier` | staff | ✅ | ✅ list only (`zones.spec.ts`) | ✅ `app/admin/(staff)/…` | — | done (5): one segment per screen |
| `/admin/promotions/cartes-cadeaux/configuration`, `/cartes-cadeaux/:code` | staff | ✅ | ✅ `/configuration` (`zones.spec.ts`) | ✅ `app/admin/(staff)/…` | — | done (5): one segment per screen |
| `/admin/promotions/campagnes/nouvelle`, `/:id`, `/:id/modifier` | staff | ✅ | ✅ `/nouvelle` (`zones.spec.ts`) | ✅ `app/admin/(staff)/…` | — | done (5): one segment per screen |
| `/admin/avis` | staff | ✅ | ✅ (`zones.spec.ts`) | ✅ `app/admin/(staff)/…` | — | done (5): one segment per screen |
| `/admin/parametres` | staff | ✅ | ✅ (`zones.spec.ts`) | ✅ `app/admin/(staff)/…` | — | done (5): one segment per screen |
| `/admin/formations`, `/nouvelle`, `/medias`, `/:id`, `/:id/apercu`, `/:id/publication` | staff | ✅ | ✅ list only (`zones.spec.ts`) | ✅ `app/admin/(staff)/…` | — | done (5): one segment per screen |

### Help centre and legal pages

| Route | Access | P1 | Smoke | Native | SSR | Target |
| --- | --- | --- | --- | --- | --- | --- |
| `/aide` | open | ✅ | ✅ | ✅ `app/(public)/fr/…`, `app/(public)/en/…` | head ✅ body ✅ | done (5) |
| `/aide/faq` | open | ✅ | ✅ | ✅ `app/(public)/fr/…`, `app/(public)/en/…` | head ✅ body ✅ | done (5) |
| `/contact` | open | ✅ | ✅ | ✅ `app/(public)/fr/…`, `app/(public)/en/…` | head ✅ body ✅ | done (5) |
| `/a-propos` | open | ✅ | ✅ | ✅ `app/(public)/fr/…`, `app/(public)/en/…` | head ✅ body ✅ | done (5) |
| `/mentions-legales` | open | ✅ | ✅ | ✅ `app/(public)/fr/…`, `app/(public)/en/…` | head ✅ body ✅ | done (5) |
| `/conditions-generales` | open | ✅ | ✅ | ✅ `app/(public)/fr/…`, `app/(public)/en/…` | head ✅ body ✅ | done (5) |
| `/confidentialite` | open | ✅ | ✅ | ✅ `app/(public)/fr/…`, `app/(public)/en/…` | head ✅ body ✅ | done (5) |
| `/cookies` | open | ✅ | ✅ | ✅ `app/(public)/fr/…`, `app/(public)/en/…` | head ✅ body ✅ | done (5) |
| `/livraison` | open | ✅ | ✅ | ✅ `app/(public)/fr/…`, `app/(public)/en/…` | head ✅ body ✅ | done (5) |
| `/retours-remboursements` | open | ✅ | ✅ | ✅ `app/(public)/fr/…`, `app/(public)/en/…` | head ✅ body ✅ | done (5) |
| English aliases `/help`, `/faq`, `/shipping`, `/returns`, `/legal-notice`, `/terms-of-sale`, `/privacy-policy`, `/cookie-policy`, `/about` | redirect | ✅ | ✅ (`/help`, `/privacy-policy`, `/terms-of-sale`) | — | — | server redirects to `/en/…` ✅ (3.1) |

### System pages

| Route | Access | P1 | Smoke | Native | SSR | Target |
| --- | --- | --- | --- | --- | --- | --- |
| `/erreur` | open | ✅ | ✅ | ✅ `app/(public)/erreur` (browser only) | — | done (5): address kept (decided); `error.tsx` shows the same screen for a page that fails |
| `/maintenance` | open | ✅ | ✅ | ✅ `app/(public)/maintenance` (browser only) | — | done (5) |
| `*` (404) | open | ✅ | ✅ (status 404) | `not-found.tsx` ✅ | — | real 404 status ✅ (3.1) |

## Open decisions (ask the user)

| Decision | Needed by | Status |
| --- | --- | --- |
| Where Supabase e-mail links land | phase 2 | **decided**: `/auth/confirm` |
| Locale URL format | phase 3 | **decided**: `/fr/…` and `/en/…`, hreflang between them, today's paths redirected |
| English path segments | phase 3 | **decided**: translated (`/en/shop`); the English words of the table in "Phase 3.1" confirmed by the user (2026-09-30), British spelling included (`/en/3d-studio`, `/en/colours`, `/en/academy/course/:id`) |
| What `/` does | phase 3 | **decided**: saved choice, else browser language, else English |
| Prefix for the member space and back office | phase 3 | **decided**: no, public pages only. Assumed in this session (reversible): sign-in, registration and recovery pages count as member area (unprefixed); the cart counts as public (prefixed, noindex) |
| Per-locale product slugs (`product_translations`) in `/en/shop/:slug` | phase 3.2 | **decided** (2026-09-30): one slug per language, other keys moved (308), unknown slug 404 — built in 3.2 |
| Course pages' head, Course structured data, 404 for unknown courses, courses in the sitemap | when the Academy goes live | **postponed** by the user (2026-09-30): nothing to do while the Academy is mock data; course pages keep the generic head |
| Product `meta_title` / `meta_description` (columns exist on `products` and `product_translations`, empty, not editable in the back office) | when the back office edits them | open — proposed: use them before the name/description once they can be edited |
| Server-side catalogue caching | before launch traffic | **done** (2026-09-30): Next.js data cache, 60 s, tag `catalog` (see "Phase 3.2"); the 60 s delay is a reversible default to confirm; on-demand invalidation from the back office is a follow-up |
| Supabase dashboard: redirect allow-list and the three e-mail templates (`supabase/README.md`, "Member sign-up") | the phase 2 release | **done** by the user (2026-09-30) |
| Vercel project switch to the Next.js framework preset; optional `SITE_URL` (custom domain) | before the first Next.js deployment | **done** by the user (2026-09-30) |
| Phase 4 shape: one catch-all segment per zone vs native segments now | phase 4 | **decided** (2026-09-30): one per zone, native segments in phase 5 |
| Cart lost when changing zone (it lived in memory only) | phase 4 | **decided** (2026-09-30): kept for the tab in sessionStorage until the real cart/checkout; demo (mock) sessions kept the same way; other mock stores reset between zones (accepted) |
| Where sign-in, registration, recovery, `/erreur`, `/maintenance` live | phase 4 | **decided** (2026-09-30): public zone; Studio aliases stay browser redirects |
| Phase 5 shape (order, navigation helper, providers, history state, commits) | phase 5 | **decided** (2026-09-30): zone by zone; navigation module with React Router's API over next/link + next/navigation; providers in the root layout; history state handed over in sessionStorage (option A); `/erreur` kept beside `error.tsx` |
| Studio aliases (`/studio-3d/editor/*`, `/studio-3d/share/*`) | phase 5 | **decided** (2026-10-01): dropped, they answer 404 (the project is in development, no old link to keep) |
| Refusing a signed-in non-staff visitor on the server for `/admin` | if wanted | **decided** (2026-10-01) and built: proxy (307 to `/admin/connexion?suite=…`) + layout + page; RLS remains the authority |

## Log

Newest first. For each session: what changed, the commands run and their real results.

### 2026-10-01 — After phase 5: Studio aliases dropped, back office refused to non-staff

- User decisions: the Studio's former aliases answer 404; a signed-in account that is not an active staff member is refused on the server for `/admin`.
- Changed: `legacyAddress` without the Studio aliases (`STUDIO_EDITOR_ALIAS`, `STUDIO_SHARE_ALIAS` removed); `src/lib/staffProfile.ts` (+ test), used by `adminAuth.tsx`, `proxySession.ts` (`checkStaff`) and `app/_zones/guard.ts`; `e2e/support/fake-supabase.mjs` serves a staff account (`token_hash=valid-staff…`, profiles filtered by `id`).
- Results: `npm run typecheck` OK; `npm run lint` 0 errors, 96 warnings; `npm test` 35 files / 351 tests passed; `npm run build` OK (mock and `.next-e2e-auth` builds); `npm run test:e2e` 155 passed on the dev servers and 155 on the production builds (4 alias-redirect tests replaced by one 404 test, one staff test added). Checked by hand against the fake Supabase: a member gets 307 to `/admin/connexion?suite=%2Fadmin%2Fproduits`, the staff account 200; with the proxy's check absent, the page's own check still redirects (inside the streamed page, status 200, nothing of the back office sent).

### 2026-09-30 → 10-01 — Phase 5 (one segment per screen, React Router removed)

- User decisions: plan validated (zone by zone; option A for history state; `/erreur` kept); Studio aliases 308 applied as proposed (see Open decisions).
- Commits (each with typecheck, unit tests and dev smoke tests green; production builds at the end): navigation module + imports; `useFormat`; stores in the root layout; Studio; learner pages; member space; back office; public zone; React Router removal and one chunk per screen; this documentation. Two rebases on other sessions' work (orders detail, Stripe checkout) on the way, re-checked before pushing.
- Tests added: `src/lib/navigation/navigation.test.ts` (addresses, active links, handed-over state), `src/lib/privateSegments.test.ts` (every gated page and layout checks the session; checked to fail by removing one page's check), Studio alias redirects (308, section, fragment), `/connexion-b` (308), client-side navigation within and across zones (a marker on `window` survives: learner pages, member space and community channel/discussion/activity pages, back office lists and details, public → member space and back, language switch), six back-office screens without a smoke test, the community's 404; the public-route segments are checked against `PUBLIC_ROUTES` (unit). Changed: the bundle test now compares `/fr` with four back-office pages (the access screen alone no longer carries the back office); the cache test moved to its own project `auth-cache`, run after `auth-server` (the fake Supabase's read counter saw the other tests' reads: 1 failure in each full run before, at 1be0eb5 too).
- Results at the end: `npm run typecheck` OK; `npm run lint` 0 errors, 96 warnings (95 before; +1 `only-export-components` for the `useSlugTranslator` hook beside `useCatalog`); `npm test` 34 files / 349 tests passed; `npm run build` OK (mock build and `NEXT_DIST_DIR=.next-e2e-auth` build against the fake Supabase); `npm run test:e2e` 157 passed on the dev servers and 157 passed on the production builds (`next start -p 5199` and `-p 5198`, `E2E_BASE_URL` / `E2E_AUTH_BASE_URL`).
- Bundle sizes before/after: table in "Phase 5".
- Not verified here: the site against the real Supabase project and on Vercel (to check on the first preview: an English product page and its language switch, signing in from a member page, the back office's lists, the Studio on a phone).

### 2026-09-30 — Phase 5: baseline before any change

- No code changed. Plan proposed to the user (order by zone, localized navigation module over `next/link` / `next/navigation`, providers in the root layout, history state, commit split), then validated (see the entry above).
- Results on `dev` at 1be0eb5 (fresh `npm ci`): `npm run typecheck` OK; `npm run lint` 0 errors, 95 warnings; `npm test` 30 files / 312 tests passed; `npm run test:e2e` (dev servers) 136 passed, 1 failed: `auth-server` "the server reads the catalogue once for many page renders (cache)" — passed when run again alone (15.8 s). Likely cause, not yet proven: the 60 s cache entry filled by an earlier test more than a minute before is served stale and revalidated in the background during the loop, counting a read. Pre-existing, unrelated to phase 5; to fix in the test if it recurs.
- Bundle baseline (mock production build, `next start`, JavaScript bodies received by Chromium after `networkidle` + 1.5 s, gzip via zlib; throwaway script rewritten this session, hence slightly higher than the phase 4 table): `/fr`, `/fr/boutique`, `/fr/academy` 2 562 / 726 kB; `/connexion` 2 562 / 726 kB; `/compte`, `/compte/communaute` (demo member) 2 753 / 769 kB; `/academy/mes-formations/fondation` 2 658 / 752 kB; `/admin` (demo staff) 3 828 / 1 007 kB; `/studio-3d/atelier` 3 624 / 1 008 kB; `/studio-3d/partage` 3 333 / 932 kB (raw / gzip). The after-measure will use the same script.

### 2026-09-30 — Phase 4 (zones)

- User decisions: the zone approach (one catch-all segment per zone), cart kept in sessionStorage, mock session kept for the tab, sign-in pages and system pages in the public zone, Studio aliases as browser redirects, other mock stores reset between zones (see "Phase 4").
- Added: `src/lib/appZones.ts` (+ test), `src/AppShell.tsx`, `src/AppRoot.tsx`, `src/zones/` (`AccountApp`, `LearnApp`, `AdminApp`, `StudioApp`, `ZoneExit`), `src/lib/cartStorage.ts` (+ test), `app/_zones/` (guard, zone page, zone clients), segments `app/compte`, `app/academy/(learner)`, `app/admin`, `app/studio-3d`, `e2e/zones.spec.ts`; `App.tsx` reduced to the public zone; proxy passes `x-gt-path`; `CartProvider`, `DemoAuthProvider`, `DemoAdminAuthProvider` keep their state for the tab. No text, style or address changed.
- Results before any change: `npm run test:e2e` 100 passed (dev servers). After: `npm run typecheck` OK; `npm run lint` 0 errors, 95 warnings (unchanged); `npm test` 30 files / 312 tests passed (6 new: `appZones.test.ts`, `cartStorage.test.ts`; the `localeRoutes` route check now reads every zone app); `npm run build` OK (new: `ƒ /compte/[[...slug]]`, `ƒ /academy/lecon`, `ƒ /academy/mes-formations/[...slug]`, `ƒ /admin/connexion`, `ƒ /admin/[[...slug]]`, `ƒ /studio-3d/atelier/[[...slug]]`, `ƒ /studio-3d/partage/[[...slug]]`); `npm run test:e2e` 137 passed on the dev servers and 137 passed on production builds (`next start` of a mock build and of a `NEXT_DIST_DIR=.next-e2e-auth` build pointed at the fake Supabase). New tests: 32 in `zones.spec.ts`, 5 in `auth-server.spec.ts` (server refusals for the community, a learner page and a back-office page with query; the Studio zone open; a signed-in member let into every private zone).
- Layered server check verified by hand (not committed): with the proxy's redirect disabled, the 11 refusal/forged-cookie/member tests of `auth-server` passed with layout + page checks, with the layout alone and with the page alone, and 10 failed with all three disabled.
- Bundle sizes before/after: table in "Phase 4".
- Not verified here: the zones against the real Supabase project and on Vercel (to check on the first preview: signing in from `/compte`, the back office, a learner page, and the header's cart count after visiting the member space).

### 2026-09-30 — Catalogue cache, decisions

- User: Vercel switched and Supabase dashboard settings applied; English addresses of phase 3.1 confirmed as they are; course pages' SEO postponed until the Academy is live; catalogue cache requested (built, see "Phase 3.2").
- `e2e/support/fake-supabase.mjs` counts the server's reads (`/__server-reads`); the auth-server product-link test now waits for the network before leaving a page (leaving `/fr/boutique` while its reviews still loaded logged a cancelled fetch: 1 failure in 3 runs once the cache made the server faster; then 100/100 with `--repeat-each 4`).
- Results: `npm run typecheck` OK; `npm run lint` 0 errors, 95 warnings (unchanged); `npm test` 28 files / 306 tests passed; `npm run build` OK; `npm run test:e2e` 100 passed on the dev servers and 100 passed on production builds (mock + fake Supabase). The new cache test was checked to fail with the cache bypassed (7 catalogue reads instead of 2). Note: the data cache persists in the build folder between runs, so the test counts reads during its own renders only.

### 2026-09-30 — Phase 3.2 (all public pages rendered on the server; course head pending)

- User decision: product slugs per language (see "Phase 3.2"). Checked read-only on the Supabase project: all 90 active products have a published English slug; no SQL change, nothing written to the database.
- Added: `app/fr/boutique/[slug]`, `app/en/shop/[slug]`, `app/_public/` (product page, shared metadata, query string), `src/lib/catalog/productSlugs.ts`, `productSlugRegistry.ts`, `productMeta.ts`, `serverCatalog.ts`, `src/lib/supabase/publicServer.ts`, `src/lib/useHydrated.ts`, `e2e/server-rendering.spec.ts`; `ServerApp` / `ClientApp` in `src/ClientApp.tsx`; the catch-all renders public pages on the server; `CatalogProvider` accepts a seed; catalogue queries take a client (`api.ts`, `productMediaUrl`); product `currency` and `slugs` in the storefront model; `next.config.ts` `htmlLimitedBots`; the fake Supabase of the tests sells one product with two slugs.
- Visible changes, all required by the phase: product pages' tab title is the product name; the cookie banner shows once the page is hydrated; the Academy figures count up from 0 as before (their server HTML shows 0).
- Tests changed: `/en/shop/aurora-heart` now expects its product title; "each product card shows its own photo" reads `img.src` instead of `currentSrc` (in server HTML, `currentSrc` depends on when the browser picks the image: it failed once on a full run, passed 44/44 twice alone).
- Results: before any change `npm run test:e2e` 92 passed. After: `npm run typecheck` OK; `npm run lint` 0 errors, 95 warnings (unchanged); `npm test` 28 files / 306 tests passed (14 new: `productSlugs.test.ts`, `productMeta.test.ts`, mapping); `npm run build` OK (`ƒ /fr/boutique/[slug]`, `ƒ /en/shop/[slug]`, `ƒ /sitemap.xml`); `npm run test:e2e` 99 passed on the dev servers, and 99 passed on production builds (`next start` of a mock build and of a build pointed at the fake Supabase). Earlier full runs on the way: 98/99 once (the streamed-title race, fixed by `htmlLimitedBots`, then 90/90 with `--repeat-each 2` on the locale and auth specs), 95/96 once (the photo test above).
- Not verified here: the pages against the real Supabase project (no test points at it) — to check on the first preview: an English product address, a 308 from a French slug under `/en/shop`, the sitemap, and the weight of the catalogue pages.

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
